import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lte, or, sql, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { employeeStatuses, employees, fiscalYears, notifications, operationTypes, reviewActivityLog, reviewerStatuses, reviews, statusTransitions } from "../../drizzle/schema";
import { getDb } from "../db";
import { PERMISSIONS, requireFiscalYearAccess, requirePermission, userHasPermission } from "../rbac";
import { completedAtForTransition } from "../reviewRules";
import { protectedProcedure, router } from "../_core/trpc";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const priority = z.enum(["normal", "urgent", "critical"]);

const reviewInput = z.object({
  fiscalYearId: z.number().int().positive(),
  operationTypeId: z.number().int().positive(),
  reviewerStatusId: z.number().int().positive(),
  employeeStatusId: z.number().int().positive(),
  assignedEmployeeId: z.number().int().positive().nullable().optional(),
  voucherNumber: z.string().trim().max(100).nullable().optional(),
  title: z.string().trim().min(3).max(220),
  description: z.string().trim().max(10000).nullable().optional(),
  problem: z.string().trim().max(10000).nullable().optional(),
  requiredAction: z.string().trim().max(10000).nullable().optional(),
  priority: priority.default("normal"),
  dueDate: dateString.nullable().optional(),
});

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  return db;
}

async function getEmployeeForUser(userId: number) {
  const db = await database();
  const [employee] = await db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
  return employee;
}

export async function enforceReviewVisibility(user: Parameters<typeof requirePermission>[0], review: typeof reviews.$inferSelect) {
  await requireFiscalYearAccess(user, review.fiscalYearId, false);
  if (await userHasPermission(user, PERMISSIONS.REVIEWS_VIEW_ALL)) return;
  if (!(await userHasPermission(user, PERMISSIONS.REVIEWS_VIEW_ASSIGNED))) throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك حق عرض هذه المراجعة." });
  const employee = await getEmployeeForUser(user.id);
  if (!employee || review.assignedEmployeeId !== employee.id) throw new TRPCError({ code: "FORBIDDEN", message: "يمكنك الوصول إلى المراجعات المكلف بها فقط." });
}

async function validateReferences(input: z.infer<typeof reviewInput>) {
  const db = await database();
  const [operationType, reviewerStatus, employeeStatus] = await Promise.all([
    db.select({ id: operationTypes.id }).from(operationTypes).where(and(eq(operationTypes.id, input.operationTypeId), eq(operationTypes.isActive, true))).limit(1),
    db.select({ id: reviewerStatuses.id }).from(reviewerStatuses).where(and(eq(reviewerStatuses.id, input.reviewerStatusId), eq(reviewerStatuses.isActive, true))).limit(1),
    db.select({ id: employeeStatuses.id }).from(employeeStatuses).where(and(eq(employeeStatuses.id, input.employeeStatusId), eq(employeeStatuses.isActive, true))).limit(1),
  ]);
  if (!operationType.length || !reviewerStatus.length || !employeeStatus.length) throw new TRPCError({ code: "BAD_REQUEST", message: "نوع العملية أو إحدى الحالات غير صالحة أو معطلة." });
  if (input.assignedEmployeeId) {
    const [employee] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.assignedEmployeeId), eq(employees.isActive, true))).limit(1);
    if (!employee) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف المكلف غير صالح أو معطل." });
  }
}

function toDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

async function createActivity(reviewId: number, actorUserId: number, action: string, field?: string, beforeValue?: unknown, afterValue?: unknown) {
  const db = await database();
  await db.insert(reviewActivityLog).values({
    reviewId,
    actorUserId,
    action,
    field,
    beforeValue: beforeValue ?? null,
    afterValue: afterValue ?? null,
  });
}

async function notifyAssignedEmployee(reviewId: number, internalRef: string, title: string, employeeId: number | null | undefined, actorUserId: number) {
  if (!employeeId) return;
  const db = await database();
  const [employee] = await db.select({ userId: employees.userId }).from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee?.userId || employee.userId === actorUserId) return;
  await db.insert(notifications).values({ userId: employee.userId, type: "review.assigned", title: "تم تكليفك بمراجعة", body: `${internalRef} — ${title}`, link: `/reviews/${reviewId}` });
}

export const reviewListInput = z.object({
  fiscalYearId: z.number().int().positive(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(20),
  query: z.string().trim().max(160).optional(),
  operationTypeIds: z.array(z.number().int().positive()).max(30).optional(),
  reviewerStatusIds: z.array(z.number().int().positive()).max(30).optional(),
  employeeStatusIds: z.array(z.number().int().positive()).max(30).optional(),
  priorities: z.array(priority).max(3).optional(),
  assignedEmployeeId: z.number().int().positive().optional(),
  dueFrom: dateString.optional(),
  dueTo: dateString.optional(),
  archiveScope: z.enum(["active", "archived"]).default("active"),
  sortBy: z.enum(["createdAt", "dueDate", "internalRef", "priority"]).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

/** تُنشئ الخطة الموحدة التي يستخدمها مسار القائمة قبل ترجمتها إلى شروط Drizzle. */
export function buildReviewListPlan(input: z.infer<typeof reviewListInput>) {
  return {
    fiscalYearId: input.fiscalYearId,
    page: input.page,
    pageSize: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
    queryTerm: input.query ? `%${input.query.replace(/[\\%_]/g, "\\$&")}%` : undefined,
    operationTypeIds: input.operationTypeIds,
    reviewerStatusIds: input.reviewerStatusIds,
    employeeStatusIds: input.employeeStatusIds,
    priorities: input.priorities,
    assignedEmployeeId: input.assignedEmployeeId,
    dueFrom: toDate(input.dueFrom),
    dueTo: toDate(input.dueTo),
    archiveScope: input.archiveScope,
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
  };
}

export const reviewsRouter = router({
  availableTransitions: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await database();
    const [review] = await db.select().from(reviews).where(and(eq(reviews.id, input.id), isNull(reviews.deletedAt))).limit(1);
    if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "المراجعة غير موجودة." });
    await enforceReviewVisibility(ctx.user, review);
    if (review.archivedAt) return { reviewer: [], employee: [] };
    const [reviewerTransitions, employeeTransitions] = await Promise.all([
      db.select({ id: statusTransitions.id, toStatusId: reviewerStatuses.id, name: reviewerStatuses.name, color: reviewerStatuses.color, isTerminal: reviewerStatuses.isTerminal, requiredPermission: statusTransitions.requiredPermission })
        .from(statusTransitions).innerJoin(reviewerStatuses, eq(statusTransitions.toReviewerStatusId, reviewerStatuses.id))
        .where(and(eq(statusTransitions.side, "reviewer"), eq(statusTransitions.fromReviewerStatusId, review.reviewerStatusId), eq(statusTransitions.isActive, true), eq(reviewerStatuses.isActive, true))),
      db.select({ id: statusTransitions.id, toStatusId: employeeStatuses.id, name: employeeStatuses.name, color: employeeStatuses.color, isTerminal: employeeStatuses.isTerminal, requiredPermission: statusTransitions.requiredPermission })
        .from(statusTransitions).innerJoin(employeeStatuses, eq(statusTransitions.toEmployeeStatusId, employeeStatuses.id))
        .where(and(eq(statusTransitions.side, "employee"), eq(statusTransitions.fromEmployeeStatusId, review.employeeStatusId), eq(statusTransitions.isActive, true), eq(employeeStatuses.isActive, true))),
    ]);
    const reviewer = (await Promise.all(reviewerTransitions.map(async item => ((await userHasPermission(ctx.user, item.requiredPermission)) ? item : undefined)))).filter((item): item is (typeof reviewerTransitions)[number] => item !== undefined);
    const employee = (await Promise.all(employeeTransitions.map(async item => ((await userHasPermission(ctx.user, item.requiredPermission)) ? item : undefined)))).filter((item): item is (typeof employeeTransitions)[number] => item !== undefined);
    return { reviewer, employee };
  }),
  filterOptions: protectedProcedure.input(z.object({ fiscalYearId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireFiscalYearAccess(ctx.user, input.fiscalYearId, false);
    const db = await database();
    const [types, reviewerStates, employeeStates] = await Promise.all([
      db.select({ id: operationTypes.id, name: operationTypes.name, color: operationTypes.color }).from(operationTypes).where(eq(operationTypes.isActive, true)).orderBy(asc(operationTypes.sortOrder), asc(operationTypes.name)),
      db.select({ id: reviewerStatuses.id, name: reviewerStatuses.name, color: reviewerStatuses.color }).from(reviewerStatuses).where(eq(reviewerStatuses.isActive, true)).orderBy(asc(reviewerStatuses.sortOrder)),
      db.select({ id: employeeStatuses.id, name: employeeStatuses.name, color: employeeStatuses.color }).from(employeeStatuses).where(eq(employeeStatuses.isActive, true)).orderBy(asc(employeeStatuses.sortOrder)),
    ]);
    const canViewAll = await userHasPermission(ctx.user, PERMISSIONS.REVIEWS_VIEW_ALL);
    const availableEmployees = canViewAll ? await db.select({ id: employees.id, displayName: employees.displayName }).from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.displayName)) : [];
    return { operationTypes: types, reviewerStatuses: reviewerStates, employeeStatuses: employeeStates, employees: availableEmployees };
  }),

  formOptions: protectedProcedure.input(z.object({ fiscalYearId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.REVIEWS_CREATE);
    await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true);
    const db = await database();
    const [types, reviewerStates, employeeStates, assignableEmployees] = await Promise.all([
      db.select({ id: operationTypes.id, name: operationTypes.name, color: operationTypes.color }).from(operationTypes).where(eq(operationTypes.isActive, true)).orderBy(asc(operationTypes.sortOrder), asc(operationTypes.name)),
      db.select({ id: reviewerStatuses.id, name: reviewerStatuses.name, color: reviewerStatuses.color, isTerminal: reviewerStatuses.isTerminal }).from(reviewerStatuses).where(eq(reviewerStatuses.isActive, true)).orderBy(asc(reviewerStatuses.sortOrder)),
      db.select({ id: employeeStatuses.id, name: employeeStatuses.name, color: employeeStatuses.color, isTerminal: employeeStatuses.isTerminal }).from(employeeStatuses).where(eq(employeeStatuses.isActive, true)).orderBy(asc(employeeStatuses.sortOrder)),
      db.select({ id: employees.id, displayName: employees.displayName, department: employees.department }).from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.displayName)),
    ]);
    return { operationTypes: types, reviewerStatuses: reviewerStates, employeeStatuses: employeeStates, employees: assignableEmployees };
  }),

  editOptions: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.REVIEWS_UPDATE);
    const db = await database();
    const [review] = await db.select().from(reviews).where(and(eq(reviews.id, input.id), isNull(reviews.deletedAt))).limit(1);
    if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "المراجعة غير موجودة." });
    if (review.archivedAt) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن تحرير مراجعة مؤرشفة. استعدها أولًا." });
    await requireFiscalYearAccess(ctx.user, review.fiscalYearId, true);
    await enforceReviewVisibility(ctx.user, review);
    const [types, assignableEmployees] = await Promise.all([
      db.select({ id: operationTypes.id, name: operationTypes.name, color: operationTypes.color }).from(operationTypes).where(eq(operationTypes.isActive, true)).orderBy(asc(operationTypes.sortOrder), asc(operationTypes.name)),
      db.select({ id: employees.id, displayName: employees.displayName, department: employees.department }).from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.displayName)),
    ]);
    return { fiscalYearId: review.fiscalYearId, operationTypes: types, employees: assignableEmployees };
  }),

  list: protectedProcedure.input(reviewListInput).query(async ({ ctx, input }) => {
    await requireFiscalYearAccess(ctx.user, input.fiscalYearId, false);
    const db = await database();
    const plan = buildReviewListPlan(input);
    const conditions: SQL[] = [
      eq(reviews.fiscalYearId, plan.fiscalYearId),
      isNull(reviews.deletedAt),
      plan.archiveScope === "archived" ? isNotNull(reviews.archivedAt) : isNull(reviews.archivedAt),
    ];
    const canViewAll = await userHasPermission(ctx.user, PERMISSIONS.REVIEWS_VIEW_ALL);
    if (!canViewAll) {
      await requirePermission(ctx.user, PERMISSIONS.REVIEWS_VIEW_ASSIGNED);
      const employee = await getEmployeeForUser(ctx.user.id);
      if (!employee) return { items: [], total: 0, page: plan.page, pageSize: plan.pageSize, totalPages: 0 };
      conditions.push(eq(reviews.assignedEmployeeId, employee.id));
    }
    if (plan.queryTerm) {
      conditions.push(or(like(reviews.internalRef, plan.queryTerm), like(reviews.title, plan.queryTerm), like(reviews.voucherNumber, plan.queryTerm))!);
    }
    if (plan.operationTypeIds?.length) conditions.push(inArray(reviews.operationTypeId, plan.operationTypeIds));
    if (plan.reviewerStatusIds?.length) conditions.push(inArray(reviews.reviewerStatusId, plan.reviewerStatusIds));
    if (plan.employeeStatusIds?.length) conditions.push(inArray(reviews.employeeStatusId, plan.employeeStatusIds));
    if (plan.priorities?.length) conditions.push(inArray(reviews.priority, plan.priorities));
    if (plan.assignedEmployeeId) conditions.push(eq(reviews.assignedEmployeeId, plan.assignedEmployeeId));
    if (plan.dueFrom) conditions.push(gte(reviews.dueDate, plan.dueFrom));
    if (plan.dueTo) conditions.push(lte(reviews.dueDate, plan.dueTo));
    const where = and(...conditions);
    const sortColumn = { createdAt: reviews.createdAt, dueDate: reviews.dueDate, internalRef: reviews.internalRef, priority: reviews.priority }[plan.sortBy];
    const ordering = plan.sortDirection === "asc" ? asc(sortColumn) : desc(sortColumn);
    const [result, counted] = await Promise.all([
      db.select({
        id: reviews.id, internalRef: reviews.internalRef, voucherNumber: reviews.voucherNumber, title: reviews.title, priority: reviews.priority, dueDate: reviews.dueDate, createdAt: reviews.createdAt, archivedAt: reviews.archivedAt,
        operationTypeId: reviews.operationTypeId, operationTypeName: operationTypes.name, operationTypeColor: operationTypes.color,
        reviewerStatusId: reviews.reviewerStatusId, reviewerStatusName: reviewerStatuses.name, reviewerStatusColor: reviewerStatuses.color,
        employeeStatusId: reviews.employeeStatusId, employeeStatusName: employeeStatuses.name, employeeStatusColor: employeeStatuses.color,
        assignedEmployeeId: reviews.assignedEmployeeId, assignedEmployeeName: employees.displayName,
      }).from(reviews).innerJoin(operationTypes, eq(reviews.operationTypeId, operationTypes.id)).innerJoin(reviewerStatuses, eq(reviews.reviewerStatusId, reviewerStatuses.id)).innerJoin(employeeStatuses, eq(reviews.employeeStatusId, employeeStatuses.id)).leftJoin(employees, eq(reviews.assignedEmployeeId, employees.id)).where(where).orderBy(ordering).limit(plan.pageSize).offset(plan.offset),
      db.select({ count: sql<number>`count(*)` }).from(reviews).where(where),
    ]);
    const total = Number(counted[0]?.count ?? 0);
    return { items: result, total, page: plan.page, pageSize: plan.pageSize, totalPages: Math.ceil(total / plan.pageSize) };
  }),

  get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await database();
    const [review] = await db.select().from(reviews).where(and(eq(reviews.id, input.id), isNull(reviews.deletedAt))).limit(1);
    if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "المراجعة غير موجودة." });
    await enforceReviewVisibility(ctx.user, review);
    const [[operationType], [reviewerStatus], [employeeStatus], assignedEmployeeRows] = await Promise.all([
      db.select({ id: operationTypes.id, name: operationTypes.name, color: operationTypes.color }).from(operationTypes).where(eq(operationTypes.id, review.operationTypeId)).limit(1),
      db.select({ id: reviewerStatuses.id, name: reviewerStatuses.name, color: reviewerStatuses.color, isTerminal: reviewerStatuses.isTerminal }).from(reviewerStatuses).where(eq(reviewerStatuses.id, review.reviewerStatusId)).limit(1),
      db.select({ id: employeeStatuses.id, name: employeeStatuses.name, color: employeeStatuses.color, isTerminal: employeeStatuses.isTerminal }).from(employeeStatuses).where(eq(employeeStatuses.id, review.employeeStatusId)).limit(1),
      review.assignedEmployeeId ? db.select({ id: employees.id, displayName: employees.displayName, department: employees.department }).from(employees).where(eq(employees.id, review.assignedEmployeeId)).limit(1) : Promise.resolve([]),
    ]);
    return { ...review, operationType, reviewerStatus, employeeStatus, assignedEmployee: assignedEmployeeRows[0] ?? null };
  }),

  create: protectedProcedure.input(reviewInput).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.REVIEWS_CREATE);
    const year = await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true);
    await validateReferences(input);
    const db = await database();
    const provisionalRef = `TMP-${nanoid(16)}`;
    const result = await db.insert(reviews).values({
      internalRef: provisionalRef,
      fiscalYearId: input.fiscalYearId,
      operationTypeId: input.operationTypeId,
      reviewerStatusId: input.reviewerStatusId,
      employeeStatusId: input.employeeStatusId,
      assignedEmployeeId: input.assignedEmployeeId ?? null,
      voucherNumber: input.voucherNumber ?? null,
      title: input.title,
      description: input.description ?? null,
      problem: input.problem ?? null,
      requiredAction: input.requiredAction ?? null,
      priority: input.priority,
      dueDate: toDate(input.dueDate),
      createdByUserId: ctx.user.id,
      updatedByUserId: ctx.user.id,
    });
    const id = Number(result[0].insertId);
    const internalRef = `REV-${year.year}-${String(id).padStart(6, "0")}`;
    await db.update(reviews).set({ internalRef }).where(eq(reviews.id, id));
    await createActivity(id, ctx.user.id, "review.created", undefined, undefined, { internalRef });
    await notifyAssignedEmployee(id, internalRef, input.title, input.assignedEmployeeId, ctx.user.id);
    return { id, internalRef };
  }),

  update: protectedProcedure.input(reviewInput.omit({ fiscalYearId: true }).partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.REVIEWS_UPDATE);
    const db = await database();
    const [existing] = await db.select().from(reviews).where(and(eq(reviews.id, input.id), isNull(reviews.deletedAt))).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "المراجعة غير موجودة." });
    if (existing.archivedAt) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن تعديل مراجعة مؤرشفة. استعدها أولًا." });
    await requireFiscalYearAccess(ctx.user, existing.fiscalYearId, true);
    await enforceReviewVisibility(ctx.user, existing);
    if (input.operationTypeId || input.reviewerStatusId || input.employeeStatusId || input.assignedEmployeeId !== undefined) {
      await validateReferences({
        fiscalYearId: existing.fiscalYearId,
        operationTypeId: input.operationTypeId ?? existing.operationTypeId,
        reviewerStatusId: input.reviewerStatusId ?? existing.reviewerStatusId,
        employeeStatusId: input.employeeStatusId ?? existing.employeeStatusId,
        assignedEmployeeId: input.assignedEmployeeId === undefined ? existing.assignedEmployeeId : input.assignedEmployeeId,
        title: input.title ?? existing.title,
        priority: input.priority ?? existing.priority,
      });
    }
    const { id, dueDate, ...changes } = input;
    await db.update(reviews).set({ ...changes, ...(dueDate === undefined ? {} : { dueDate: toDate(dueDate) }), updatedByUserId: ctx.user.id }).where(eq(reviews.id, id));
    await createActivity(id, ctx.user.id, "review.updated", undefined, undefined, changes);
    if (input.assignedEmployeeId !== undefined && input.assignedEmployeeId !== existing.assignedEmployeeId) await notifyAssignedEmployee(id, existing.internalRef, input.title ?? existing.title, input.assignedEmployeeId, ctx.user.id);
    return { success: true };
  }),

  assign: protectedProcedure.input(z.object({ id: z.number().int().positive(), employeeId: z.number().int().positive().nullable() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.REVIEWS_ASSIGN);
    const db = await database();
    const [review] = await db.select().from(reviews).where(and(eq(reviews.id, input.id), isNull(reviews.deletedAt))).limit(1);
    if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "المراجعة غير موجودة." });
    if (review.archivedAt) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن تعديل تكليف مراجعة مؤرشفة. استعدها أولًا." });
    await requireFiscalYearAccess(ctx.user, review.fiscalYearId, true);
    if (input.employeeId) {
      const [employee] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.isActive, true))).limit(1);
      if (!employee) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف المكلف غير صالح." });
    }
    await db.update(reviews).set({ assignedEmployeeId: input.employeeId, updatedByUserId: ctx.user.id }).where(eq(reviews.id, input.id));
    await createActivity(input.id, ctx.user.id, "review.assigned", "assignedEmployeeId", review.assignedEmployeeId, input.employeeId);
    await notifyAssignedEmployee(input.id, review.internalRef, review.title, input.employeeId, ctx.user.id);
    return { success: true };
  }),

  remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.REVIEWS_DELETE);
    const db = await database();
    const [review] = await db.select().from(reviews).where(and(eq(reviews.id, input.id), isNull(reviews.deletedAt))).limit(1);
    if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "المراجعة غير موجودة أو حذفت مسبقًا." });
    await requireFiscalYearAccess(ctx.user, review.fiscalYearId, true);
    await enforceReviewVisibility(ctx.user, review);
    await db.update(reviews).set({ deletedAt: new Date(), deletedByUserId: ctx.user.id, updatedByUserId: ctx.user.id }).where(eq(reviews.id, input.id));
    await createActivity(input.id, ctx.user.id, "review.deleted");
    return { success: true };
  }),

  restore: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.REVIEWS_RESTORE);
    const db = await database();
    const [review] = await db.select().from(reviews).where(eq(reviews.id, input.id)).limit(1);
    if (!review || !review.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "المراجعة المحذوفة غير موجودة." });
    await requireFiscalYearAccess(ctx.user, review.fiscalYearId, true);
    await db.update(reviews).set({ deletedAt: null, deletedByUserId: null, updatedByUserId: ctx.user.id }).where(eq(reviews.id, input.id));
    await createActivity(input.id, ctx.user.id, "review.restored");
    return { success: true };
  }),

  archive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.REVIEWS_UPDATE);
    const db = await database();
    const [review] = await db.select().from(reviews).where(and(eq(reviews.id, input.id), isNull(reviews.deletedAt))).limit(1);
    if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "المراجعة غير موجودة." });
    if (review.archivedAt) throw new TRPCError({ code: "CONFLICT", message: "المراجعة موجودة بالفعل في الأرشيف." });
    await requireFiscalYearAccess(ctx.user, review.fiscalYearId, true);
    await enforceReviewVisibility(ctx.user, review);
    const [reviewerStatus, employeeStatus] = await Promise.all([
      db.select({ isTerminal: reviewerStatuses.isTerminal }).from(reviewerStatuses).where(eq(reviewerStatuses.id, review.reviewerStatusId)).limit(1),
      db.select({ isTerminal: employeeStatuses.isTerminal }).from(employeeStatuses).where(eq(employeeStatuses.id, review.employeeStatusId)).limit(1),
    ]);
    if (!reviewerStatus[0]?.isTerminal || !employeeStatus[0]?.isTerminal) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن أرشفة المراجعة قبل اكتمال حالة المراجع وحالة الموظف." });
    const archivedAt = new Date();
    await db.update(reviews).set({ archivedAt, archivedByUserId: ctx.user.id, updatedByUserId: ctx.user.id }).where(eq(reviews.id, input.id));
    await createActivity(input.id, ctx.user.id, "review.archived", "archivedAt", null, archivedAt.toISOString());
    return { success: true, archivedAt };
  }),

  restoreFromArchive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.REVIEWS_RESTORE);
    const db = await database();
    const [review] = await db.select().from(reviews).where(and(eq(reviews.id, input.id), isNull(reviews.deletedAt), isNotNull(reviews.archivedAt))).limit(1);
    if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "المراجعة المؤرشفة غير موجودة." });
    await requireFiscalYearAccess(ctx.user, review.fiscalYearId, true);
    await enforceReviewVisibility(ctx.user, review);
    await db.update(reviews).set({ archivedAt: null, archivedByUserId: null, updatedByUserId: ctx.user.id }).where(eq(reviews.id, input.id));
    await createActivity(input.id, ctx.user.id, "review.unarchived", "archivedAt", review.archivedAt?.toISOString() ?? null, null);
    return { success: true };
  }),

  changeStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), side: z.enum(["reviewer", "employee"]), toStatusId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    const [review] = await db.select().from(reviews).where(and(eq(reviews.id, input.id), isNull(reviews.deletedAt))).limit(1);
    if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "المراجعة غير موجودة." });
    if (review.archivedAt) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن تغيير حالة مراجعة مؤرشفة. استعدها أولًا." });
    await requireFiscalYearAccess(ctx.user, review.fiscalYearId, true);
    await enforceReviewVisibility(ctx.user, review);
    if (input.side === "employee") {
      const employee = await getEmployeeForUser(ctx.user.id);
      if (ctx.user.role !== "admin" && (!employee || review.assignedEmployeeId !== employee.id)) throw new TRPCError({ code: "FORBIDDEN", message: "يمكن للموظف تغيير حالة المراجعة المكلف بها فقط." });
    }
    const transitionConditions = input.side === "reviewer"
      ? and(eq(statusTransitions.side, "reviewer"), eq(statusTransitions.fromReviewerStatusId, review.reviewerStatusId), eq(statusTransitions.toReviewerStatusId, input.toStatusId), eq(statusTransitions.isActive, true))
      : and(eq(statusTransitions.side, "employee"), eq(statusTransitions.fromEmployeeStatusId, review.employeeStatusId), eq(statusTransitions.toEmployeeStatusId, input.toStatusId), eq(statusTransitions.isActive, true));
    const [transition] = await db.select().from(statusTransitions).where(transitionConditions).limit(1);
    if (!transition) throw new TRPCError({ code: "CONFLICT", message: "انتقال الحالة المطلوب غير مسموح به." });
    await requirePermission(ctx.user, transition.requiredPermission);
    const target = input.side === "reviewer"
      ? await db.select({ isTerminal: reviewerStatuses.isTerminal }).from(reviewerStatuses).where(eq(reviewerStatuses.id, input.toStatusId)).limit(1)
      : await db.select({ isTerminal: employeeStatuses.isTerminal }).from(employeeStatuses).where(eq(employeeStatuses.id, input.toStatusId)).limit(1);
    if (!target.length) throw new TRPCError({ code: "BAD_REQUEST", message: "الحالة الهدف غير موجودة." });
    const otherStatus = input.side === "reviewer"
      ? await db.select({ isTerminal: employeeStatuses.isTerminal }).from(employeeStatuses).where(eq(employeeStatuses.id, review.employeeStatusId)).limit(1)
      : await db.select({ isTerminal: reviewerStatuses.isTerminal }).from(reviewerStatuses).where(eq(reviewerStatuses.id, review.reviewerStatusId)).limit(1);
    const completedAt = completedAtForTransition(target[0].isTerminal, Boolean(otherStatus[0]?.isTerminal));
    const change = input.side === "reviewer" ? { reviewerStatusId: input.toStatusId } : { employeeStatusId: input.toStatusId };
    await db.update(reviews).set({ ...change, completedAt, updatedByUserId: ctx.user.id }).where(eq(reviews.id, input.id));
    await createActivity(input.id, ctx.user.id, `review.status.${input.side}.changed`, input.side === "reviewer" ? "reviewerStatusId" : "employeeStatusId", input.side === "reviewer" ? review.reviewerStatusId : review.employeeStatusId, input.toStatusId);
    return { success: true, isTargetTerminal: target[0].isTerminal };
  }),
});
