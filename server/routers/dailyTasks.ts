import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { dailyTaskTemplates, dailyTasks, employees, employeeStatuses, fiscalYears, operationTypes, reviewerStatuses, reviews } from "../../drizzle/schema";
import { getDb } from "../db";
import { PERMISSIONS, requireFiscalYearAccess, requirePermission, userHasPermission } from "../rbac";
import { protectedProcedure, router } from "../_core/trpc";

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ يجب أن يكون بصيغة YYYY-MM-DD.");
const priority = z.enum(["normal", "urgent", "critical"]);
const status = z.enum(["pending", "in_progress", "completed", "skipped"]);

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  return db;
}

async function linkedEmployee(userId: number) {
  const db = await database();
  const [employee] = await db.select({ id: employees.id, displayName: employees.displayName }).from(employees).where(and(eq(employees.userId, userId), eq(employees.isActive, true))).limit(1);
  return employee;
}

async function canManage(user: Parameters<typeof requirePermission>[0]) {
  return user.role === "admin" || await userHasPermission(user, PERMISSIONS.DAILY_TASKS_MANAGE);
}

const templateInput = z.object({
  fiscalYearId: z.number().int().positive(),
  employeeId: z.number().int().positive(),
  title: z.string().trim().min(2).max(220),
  description: z.string().trim().max(5000).optional(),
  priority: priority.default("normal"),
  defaultDueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  startDate: dateText,
  endDate: dateText.optional(),
}).refine(value => !value.endDate || value.endDate >= value.startDate, { message: "تاريخ نهاية القالب يجب أن يساوي أو يتجاوز تاريخ البداية." });

const taskListInput = z.object({
  fiscalYearId: z.number().int().positive(),
  employeeId: z.number().int().positive().optional(),
  startDate: dateText.optional(),
  endDate: dateText.optional(),
  status: status.optional(),
}).refine(value => !value.startDate || !value.endDate || value.endDate >= value.startDate, { message: "نطاق التاريخ غير صحيح." });

export const dailyTasksRouter = router({
  employees: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx.user, PERMISSIONS.DAILY_TASKS_MANAGE);
    const db = await database();
    return db.select({ id: employees.id, displayName: employees.displayName }).from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.displayName));
  }),

  templates: router({
    list: protectedProcedure.input(z.object({ fiscalYearId: z.number().int().positive(), employeeId: z.number().int().positive().optional() })).query(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.DAILY_TASKS_VIEW);
      await requireFiscalYearAccess(ctx.user, input.fiscalYearId);
      const db = await database();
      const conditions = [eq(dailyTaskTemplates.fiscalYearId, input.fiscalYearId), eq(dailyTaskTemplates.isActive, true)];
      const manage = await canManage(ctx.user);
      if (input.employeeId && !manage) {
        const employee = await linkedEmployee(ctx.user.id);
        if (!employee || employee.id !== input.employeeId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض مهام موظف آخر." });
      }
      if (input.employeeId) conditions.push(eq(dailyTaskTemplates.employeeId, input.employeeId));
      if (!manage) {
        const employee = await linkedEmployee(ctx.user.id);
        if (!employee) return [];
        conditions.push(eq(dailyTaskTemplates.employeeId, employee.id));
      }
      return db.select({ id: dailyTaskTemplates.id, fiscalYearId: dailyTaskTemplates.fiscalYearId, employeeId: dailyTaskTemplates.employeeId, employeeName: employees.displayName, title: dailyTaskTemplates.title, description: dailyTaskTemplates.description, priority: dailyTaskTemplates.priority, defaultDueTime: dailyTaskTemplates.defaultDueTime, startDate: dailyTaskTemplates.startDate, endDate: dailyTaskTemplates.endDate, source: dailyTaskTemplates.source }).from(dailyTaskTemplates).innerJoin(employees, eq(dailyTaskTemplates.employeeId, employees.id)).where(and(...conditions)).orderBy(asc(employees.displayName), asc(dailyTaskTemplates.startDate), asc(dailyTaskTemplates.title));
    }),
    create: protectedProcedure.input(templateInput).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.DAILY_TASKS_MANAGE);
      await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true);
      const db = await database();
      const [employee] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.isActive, true))).limit(1);
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "الموظف غير موجود أو غير نشط." });
      const [result] = await db.insert(dailyTaskTemplates).values({ ...input, startDate: new Date(`${input.startDate}T00:00:00.000Z`), endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null, createdByUserId: ctx.user.id });
      return { id: Number(result.insertId) };
    }),
  }),

  list: protectedProcedure.input(taskListInput).query(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.DAILY_TASKS_VIEW);
    await requireFiscalYearAccess(ctx.user, input.fiscalYearId);
    const db = await database();
    const conditions = [eq(dailyTasks.fiscalYearId, input.fiscalYearId)];
    const manage = await canManage(ctx.user);
    if (input.employeeId) conditions.push(eq(dailyTasks.employeeId, input.employeeId));
    if (input.startDate) conditions.push(gte(dailyTasks.taskDate, new Date(`${input.startDate}T00:00:00.000Z`)));
    if (input.endDate) conditions.push(lte(dailyTasks.taskDate, new Date(`${input.endDate}T00:00:00.000Z`)));
    if (input.status) conditions.push(eq(dailyTasks.status, input.status));
    if (!manage) {
      const employee = await linkedEmployee(ctx.user.id);
      if (!employee) return [];
      if (input.employeeId && input.employeeId !== employee.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض مهام موظف آخر." });
      conditions.push(eq(dailyTasks.employeeId, employee.id));
    }
    return db.select({ id: dailyTasks.id, fiscalYearId: dailyTasks.fiscalYearId, employeeId: dailyTasks.employeeId, employeeName: employees.displayName, templateId: dailyTasks.templateId, reviewId: dailyTasks.reviewId, title: dailyTasks.title, description: dailyTasks.description, taskDate: dailyTasks.taskDate, dueTime: dailyTasks.dueTime, priority: dailyTasks.priority, status: dailyTasks.status, source: dailyTasks.source, completedAt: dailyTasks.completedAt }).from(dailyTasks).innerJoin(employees, eq(dailyTasks.employeeId, employees.id)).where(and(...conditions)).orderBy(desc(dailyTasks.taskDate), asc(employees.displayName), asc(dailyTasks.title));
  }),

  createExtra: protectedProcedure.input(z.object({
    fiscalYearId: z.number().int().positive(),
    employeeId: z.number().int().positive(),
    reviewId: z.number().int().positive().optional(),
    title: z.string().trim().min(2).max(220),
    description: z.string().trim().max(5000).optional(),
    taskDate: dateText,
    dueTime: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/).optional(),
    priority: priority.default("normal"),
  })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.DAILY_TASKS_MANAGE);
    await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true);
    const db = await database();
    const [employee] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.isActive, true))).limit(1);
    if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "الموظف غير موجود أو غير نشط." });
    if (input.reviewId) {
      const [review] = await db.select({ id: reviews.id, fiscalYearId: reviews.fiscalYearId, assignedEmployeeId: reviews.assignedEmployeeId }).from(reviews).where(and(eq(reviews.id, input.reviewId), isNull(reviews.deletedAt), isNull(reviews.cancelledAt))).limit(1);
      if (!review || review.fiscalYearId !== input.fiscalYearId) throw new TRPCError({ code: "NOT_FOUND", message: "المراجعة غير موجودة ضمن السنة المالية." });
      if (review.assignedEmployeeId !== input.employeeId) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف المحدد ليس الموظف المكلف بالمراجعة." });
    }
    const [result] = await db.insert(dailyTasks).values({ fiscalYearId: input.fiscalYearId, employeeId: input.employeeId, reviewId: input.reviewId ?? null, title: input.title, description: input.description, taskDate: new Date(`${input.taskDate}T00:00:00.000Z`), dueTime: input.dueTime, priority: input.priority, source: input.reviewId ? "review" : "manual", createdByUserId: ctx.user.id });
    return { id: Number(result.insertId) };
  }),

  importBatch: protectedProcedure.input(z.object({
    fiscalYearId: z.number().int().positive(),
    rows: z.array(z.object({
      employeeId: z.number().int().positive(),
      title: z.string().trim().min(2).max(220),
      description: z.string().trim().max(5000).optional(),
      taskDate: dateText,
      dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
      priority: priority.default("normal"),
    })).min(1).max(500),
  })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.DAILY_TASKS_MANAGE);
    await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true);
    const db = await database();
    const employeeIds = Array.from(new Set(input.rows.map(row => row.employeeId)));
    const activeEmployees = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.isActive, true), inArray(employees.id, employeeIds)));
    if (activeEmployees.length !== employeeIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "يحتوي الملف على موظف غير موجود أو غير نشط." });
    const keys = input.rows.map(row => `${row.employeeId}|${row.taskDate}|${row.title.toLocaleLowerCase("ar")}`);
    if (new Set(keys).size !== keys.length) throw new TRPCError({ code: "BAD_REQUEST", message: "يوجد تكرار داخل ملف الاستيراد لنفس الموظف والتاريخ والمهمة." });
    await db.insert(dailyTasks).values(input.rows.map(row => ({ ...row, fiscalYearId: input.fiscalYearId, taskDate: new Date(`${row.taskDate}T00:00:00.000Z`), source: "imported" as const, createdByUserId: ctx.user.id })));
    return { imported: input.rows.length };
  }),

  updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.DAILY_TASKS_UPDATE);
    const db = await database();
    const [task] = await db.select().from(dailyTasks).where(eq(dailyTasks.id, input.id)).limit(1);
    if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "المهمة غير موجودة." });
    await requireFiscalYearAccess(ctx.user, task.fiscalYearId, true);
    const manage = await canManage(ctx.user);
    if (!manage) {
      const employee = await linkedEmployee(ctx.user.id);
      if (!employee || employee.id !== task.employeeId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك تحديث مهمة موظف آخر." });
    }
    await db.update(dailyTasks).set({ status: input.status, completedAt: input.status === "completed" ? new Date() : null, completedByUserId: input.status === "completed" ? ctx.user.id : null }).where(eq(dailyTasks.id, input.id));
    return { success: true };
  }),

  unifiedReport: protectedProcedure.input(taskListInput).query(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.REPORTS_VIEW);
    await requireFiscalYearAccess(ctx.user, input.fiscalYearId);
    const db = await database();
    const manage = await canManage(ctx.user);
    const employee = !manage ? await linkedEmployee(ctx.user.id) : undefined;
    if (!manage && !employee) return { employeeId: null, employeeName: null, dailyTasks: [], reviews: [] };
    const employeeId = input.employeeId ?? employee?.id;
    if (!manage && employeeId !== employee?.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض تقرير موظف آخر." });
    const taskConditions = [eq(dailyTasks.fiscalYearId, input.fiscalYearId)];
    const reviewConditions = [eq(reviews.fiscalYearId, input.fiscalYearId), isNull(reviews.deletedAt), isNull(reviews.cancelledAt)];
    if (employeeId) { taskConditions.push(eq(dailyTasks.employeeId, employeeId)); reviewConditions.push(eq(reviews.assignedEmployeeId, employeeId)); }
    if (input.startDate) { const start = new Date(`${input.startDate}T00:00:00.000Z`); taskConditions.push(gte(dailyTasks.taskDate, start)); reviewConditions.push(gte(reviews.createdAt, start)); }
    if (input.endDate) { const end = new Date(`${input.endDate}T23:59:59.999Z`); taskConditions.push(lte(dailyTasks.taskDate, end)); reviewConditions.push(lte(reviews.createdAt, end)); }
    const [daily, reviewRows] = await Promise.all([
      db.select({ id: dailyTasks.id, employeeId: dailyTasks.employeeId, employeeName: employees.displayName, title: dailyTasks.title, taskDate: dailyTasks.taskDate, priority: dailyTasks.priority, status: dailyTasks.status, source: dailyTasks.source, reviewId: dailyTasks.reviewId }).from(dailyTasks).innerJoin(employees, eq(dailyTasks.employeeId, employees.id)).where(and(...taskConditions)).orderBy(desc(dailyTasks.taskDate)),
      db.select({ id: reviews.id, internalRef: reviews.internalRef, title: reviews.title, dueDate: reviews.dueDate, priority: reviews.priority, employeeId: reviews.assignedEmployeeId, employeeName: employees.displayName, reviewerStatus: reviewerStatuses.name, employeeStatus: employeeStatuses.name, operationType: operationTypes.name }).from(reviews).leftJoin(employees, eq(reviews.assignedEmployeeId, employees.id)).innerJoin(reviewerStatuses, eq(reviews.reviewerStatusId, reviewerStatuses.id)).innerJoin(employeeStatuses, eq(reviews.employeeStatusId, employeeStatuses.id)).innerJoin(operationTypes, eq(reviews.operationTypeId, operationTypes.id)).where(and(...reviewConditions)).orderBy(desc(reviews.createdAt)),
    ]);
    return { employeeId: employeeId ?? null, employeeName: daily[0]?.employeeName ?? reviewRows[0]?.employeeName ?? null, dailyTasks: daily, reviews: reviewRows };
  }),
});
