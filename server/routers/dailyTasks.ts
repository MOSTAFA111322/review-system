import { and, asc, desc, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { dashboardAlertSettings, dashboardTeamAlertSettings, dailyTaskTemplates, dailyTasks, employees, employeeStatuses, fiscalYears, operationTypes, reviewerStatuses, reviews } from "../../drizzle/schema";
import { getDb } from "../db";
import { PERMISSIONS, requireFiscalYearAccess, requirePermission, userHasPermission } from "../rbac";
import { protectedProcedure, router } from "../_core/trpc";
import { notifyTeamOverdueThresholds } from "../teamOverdueAlerts";

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ يجب أن يكون بصيغة YYYY-MM-DD.");
const priority = z.enum(["normal", "urgent", "critical"]);
const status = z.enum(["pending", "in_progress", "completed", "skipped"]);
const recurrenceType = z.enum(["daily", "workdays", "weekly"]);

export function matchesRecurrence(date: Date, type: "daily" | "workdays" | "weekly", days?: string | null) {
  if (type === "daily") return true;
  const day = date.getUTCDay();
  if (type === "workdays") return day >= 0 && day <= 4;
  return new Set((days ?? "").split(",").filter(Boolean).map(Number)).has(day);
}

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
  recurrenceType: recurrenceType.default("daily"),
  recurrenceDays: z.string().regex(/^[0-6](,[0-6])*$/).optional(),
  startDate: dateText,
  endDate: dateText.optional(),
}).refine(value => !value.endDate || value.endDate >= value.startDate, { message: "تاريخ نهاية القالب يجب أن يساوي أو يتجاوز تاريخ البداية." }).refine(value => value.recurrenceType !== "weekly" || Boolean(value.recurrenceDays), { message: "حدد أيام الأسبوع عند اختيار التكرار الأسبوعي." });

const taskListInput = z.object({
  fiscalYearId: z.number().int().positive(),
  employeeId: z.number().int().positive().optional(),
  startDate: dateText.optional(),
  endDate: dateText.optional(),
  status: status.optional(),
}).refine(value => !value.startDate || !value.endDate || value.endDate >= value.startDate, { message: "نطاق التاريخ غير صحيح." });

const weeklyTeamComplianceInput = z.object({
  fiscalYearId: z.number().int().positive(),
  weekStart: dateText.optional(),
});

type WeeklyTaskRow = { teamName: string | null; taskDate: Date; status: "pending" | "in_progress" | "completed" | "skipped"; notes: string | null };

/** تجميع نقي قابل للاختبار؛ الفريق هو قسم الموظف النشط عند تنفيذ الاستعلام. */
export function buildWeeklyTeamCompliance(rows: WeeklyTaskRow[], defaultThreshold: number, thresholdsByTeam: Array<{ teamName: string; overdueThreshold: number }>, referenceDate: Date) {
  const today = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));
  const thresholdByTeam = new Map(thresholdsByTeam.map(setting => [setting.teamName, setting.overdueThreshold]));
  const grouped = new Map<string, { teamName: string; total: number; completed: number; overdue: number; unupdated: number }>();
  for (const row of rows) {
    const teamName = row.teamName?.trim() || "بدون فريق";
    const current = grouped.get(teamName) ?? { teamName, total: 0, completed: 0, overdue: 0, unupdated: 0 };
    current.total += 1;
    if (row.status === "completed") current.completed += 1;
    if (row.status !== "completed" && row.status !== "skipped" && new Date(row.taskDate).getTime() < today.getTime()) current.overdue += 1;
    if (row.status !== "completed" && !row.notes?.trim()) current.unupdated += 1;
    grouped.set(teamName, current);
  }
  return Array.from(grouped.values())
    .map(row => {
      const threshold = thresholdByTeam.get(row.teamName) ?? defaultThreshold;
      return { ...row, completionRate: row.total ? Math.round((row.completed / row.total) * 100) : 0, threshold, exceedsThreshold: row.overdue >= threshold };
    })
    .sort((a, b) => Number(b.exceedsThreshold) - Number(a.exceedsThreshold) || b.overdue - a.overdue || b.unupdated - a.unupdated || a.teamName.localeCompare(b.teamName, "ar"));
}

async function getWeeklyTeamComplianceReport(user: Parameters<typeof requirePermission>[0], input: z.infer<typeof weeklyTeamComplianceInput>) {
  await requireFiscalYearAccess(user, input.fiscalYearId);
  const db = await database();
  const [fiscalYear] = await db.select({ startDate: fiscalYears.startDate, endDate: fiscalYears.endDate }).from(fiscalYears).where(eq(fiscalYears.id, input.fiscalYearId)).limit(1);
  if (!fiscalYear) throw new TRPCError({ code: "NOT_FOUND", message: "السنة المالية غير موجودة." });
  const fiscalStart = new Date(`${new Date(fiscalYear.startDate).toISOString().slice(0, 10)}T00:00:00.000Z`);
  const fiscalEndExclusive = new Date(`${new Date(fiscalYear.endDate).toISOString().slice(0, 10)}T00:00:00.000Z`);
  fiscalEndExclusive.setUTCDate(fiscalEndExclusive.getUTCDate() + 1);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endExclusive = new Date(Math.min(today.getTime() + 24 * 60 * 60 * 1000, fiscalEndExclusive.getTime()));
  const requestedStart = input.weekStart ? new Date(`${input.weekStart}T00:00:00.000Z`) : new Date(endExclusive.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekStart = new Date(Math.max(fiscalStart.getTime(), requestedStart.getTime()));
  if (weekStart.getTime() >= endExclusive.getTime()) throw new TRPCError({ code: "BAD_REQUEST", message: "بداية الأسبوع يجب أن تقع ضمن نطاق السنة المالية المنقضي." });
  const [rows, globalSettings, teamSettings] = await Promise.all([
    db.select({ teamName: employees.department, taskDate: dailyTasks.taskDate, status: dailyTasks.status, notes: dailyTasks.notes }).from(dailyTasks).innerJoin(employees, eq(dailyTasks.employeeId, employees.id)).where(and(eq(dailyTasks.fiscalYearId, input.fiscalYearId), gte(dailyTasks.taskDate, weekStart), lt(dailyTasks.taskDate, endExclusive))),
    db.select({ overdueThreshold: dashboardAlertSettings.overdueThreshold }).from(dashboardAlertSettings).where(eq(dashboardAlertSettings.id, 1)).limit(1),
    db.select({ teamName: dashboardTeamAlertSettings.teamName, overdueThreshold: dashboardTeamAlertSettings.overdueThreshold }).from(dashboardTeamAlertSettings),
  ]);
  const teams = buildWeeklyTeamCompliance(rows, globalSettings[0]?.overdueThreshold ?? 3, teamSettings, now);
  return {
    fiscalYearId: input.fiscalYearId,
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    summary: teams.reduce((summary, team) => ({ total: summary.total + team.total, completed: summary.completed + team.completed, overdue: summary.overdue + team.overdue, unupdated: summary.unupdated + team.unupdated, teamsAtRisk: summary.teamsAtRisk + Number(team.exceedsThreshold) }), { total: 0, completed: 0, overdue: 0, unupdated: 0, teamsAtRisk: 0 }),
    teams,
  };
}

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
      return db.select({ id: dailyTaskTemplates.id, fiscalYearId: dailyTaskTemplates.fiscalYearId, employeeId: dailyTaskTemplates.employeeId, employeeName: employees.displayName, title: dailyTaskTemplates.title, description: dailyTaskTemplates.description, priority: dailyTaskTemplates.priority, defaultDueTime: dailyTaskTemplates.defaultDueTime, recurrenceType: dailyTaskTemplates.recurrenceType, recurrenceDays: dailyTaskTemplates.recurrenceDays, startDate: dailyTaskTemplates.startDate, endDate: dailyTaskTemplates.endDate, source: dailyTaskTemplates.source }).from(dailyTaskTemplates).innerJoin(employees, eq(dailyTaskTemplates.employeeId, employees.id)).where(and(...conditions)).orderBy(asc(employees.displayName), asc(dailyTaskTemplates.startDate), asc(dailyTaskTemplates.title));
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
    return db.select({ id: dailyTasks.id, fiscalYearId: dailyTasks.fiscalYearId, employeeId: dailyTasks.employeeId, employeeName: employees.displayName, templateId: dailyTasks.templateId, reviewId: dailyTasks.reviewId, title: dailyTasks.title, description: dailyTasks.description, notes: dailyTasks.notes, taskDate: dailyTasks.taskDate, dueTime: dailyTasks.dueTime, priority: dailyTasks.priority, status: dailyTasks.status, source: dailyTasks.source, completedAt: dailyTasks.completedAt }).from(dailyTasks).innerJoin(employees, eq(dailyTasks.employeeId, employees.id)).where(and(...conditions)).orderBy(desc(dailyTasks.taskDate), asc(employees.displayName), asc(dailyTasks.title));
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
    notes: z.string().trim().max(5000).optional(),
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
    const [result] = await db.insert(dailyTasks).values({ fiscalYearId: input.fiscalYearId, employeeId: input.employeeId, reviewId: input.reviewId ?? null, title: input.title, description: input.description, notes: input.notes, taskDate: new Date(`${input.taskDate}T00:00:00.000Z`), dueTime: input.dueTime, priority: input.priority, source: input.reviewId ? "review" : "manual", createdByUserId: ctx.user.id });
    await notifyTeamOverdueThresholds(db, input.fiscalYearId);
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
    const normalizeKey = (employeeId: number, taskDate: string, title: string) => `${employeeId}|${taskDate}|${title.trim().toLocaleLowerCase("ar")}`;
    const keys = input.rows.map(row => normalizeKey(row.employeeId, row.taskDate, row.title));
    if (new Set(keys).size !== keys.length) throw new TRPCError({ code: "BAD_REQUEST", message: "يوجد تكرار داخل ملف الاستيراد لنفس الموظف والتاريخ والمهمة." });
    const existing = await db.select({ employeeId: dailyTasks.employeeId, taskDate: dailyTasks.taskDate, title: dailyTasks.title }).from(dailyTasks).where(and(eq(dailyTasks.fiscalYearId, input.fiscalYearId), inArray(dailyTasks.employeeId, employeeIds)));
    const existingKeys = new Set(existing.map(row => normalizeKey(row.employeeId, row.taskDate.toISOString().slice(0, 10), row.title)));
    const repeatedRows = input.rows.filter(row => existingKeys.has(normalizeKey(row.employeeId, row.taskDate, row.title)));
    if (repeatedRows.length > 0) throw new TRPCError({ code: "CONFLICT", message: `يوجد ${repeatedRows.length} من المهام موجودة مسبقًا. لم يتم استيراد أي صف لتجنب التكرار.` });
    await db.insert(dailyTasks).values(input.rows.map(row => ({ ...row, fiscalYearId: input.fiscalYearId, taskDate: new Date(`${row.taskDate}T00:00:00.000Z`), source: "imported" as const, createdByUserId: ctx.user.id })));
    await notifyTeamOverdueThresholds(db, input.fiscalYearId);
    return { imported: input.rows.length };
  }),

  updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status, notes: z.string().trim().max(5000).optional() })).mutation(async ({ ctx, input }) => {
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
    await db.update(dailyTasks).set({ status: input.status, notes: input.notes, completedAt: input.status === "completed" ? new Date() : null, completedByUserId: input.status === "completed" ? ctx.user.id : null }).where(eq(dailyTasks.id, input.id));
    await notifyTeamOverdueThresholds(db, task.fiscalYearId);
    return { success: true };
  }),

  operationalIndicators: protectedProcedure.input(taskListInput).query(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.DAILY_TASKS_VIEW);
    await requireFiscalYearAccess(ctx.user, input.fiscalYearId);
    const db = await database();
    const manage = await canManage(ctx.user);
    const employee = !manage ? await linkedEmployee(ctx.user.id) : undefined;
    if (!manage && !employee) return { total: 0, completed: 0, overdue: 0, unupdated: 0, completionRate: 0, byEmployee: [] };
    const employeeId = input.employeeId ?? employee?.id;
    if (!manage && employeeId !== employee?.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض مؤشرات موظف آخر." });
    const conditions = [eq(dailyTasks.fiscalYearId, input.fiscalYearId)];
    if (employeeId) conditions.push(eq(dailyTasks.employeeId, employeeId));
    if (input.startDate) conditions.push(gte(dailyTasks.taskDate, new Date(`${input.startDate}T00:00:00.000Z`)));
    if (input.endDate) conditions.push(lte(dailyTasks.taskDate, new Date(`${input.endDate}T23:59:59.999Z`)));
    const rows = await db.select({ employeeId: dailyTasks.employeeId, employeeName: employees.displayName, taskDate: dailyTasks.taskDate, status: dailyTasks.status, notes: dailyTasks.notes }).from(dailyTasks).innerJoin(employees, eq(dailyTasks.employeeId, employees.id)).where(and(...conditions));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const summary = rows.reduce((acc, row) => { acc.total += 1; if (row.status === "completed") acc.completed += 1; if (row.status !== "completed" && row.status !== "skipped" && new Date(row.taskDate).getTime() < today.getTime()) acc.overdue += 1; if (row.status !== "completed" && !row.notes?.trim()) acc.unupdated += 1; return acc; }, { total: 0, completed: 0, overdue: 0, unupdated: 0 });
    const grouped = new Map<number, { employeeId: number; employeeName: string; total: number; completed: number; overdue: number; unupdated: number }>();
    for (const row of rows) { const current = grouped.get(row.employeeId) ?? { employeeId: row.employeeId, employeeName: row.employeeName, total: 0, completed: 0, overdue: 0, unupdated: 0 }; current.total += 1; if (row.status === "completed") current.completed += 1; if (row.status !== "completed" && row.status !== "skipped" && new Date(row.taskDate).getTime() < today.getTime()) current.overdue += 1; if (row.status !== "completed" && !row.notes?.trim()) current.unupdated += 1; grouped.set(row.employeeId, current); }
    return { ...summary, completionRate: summary.total ? Math.round((summary.completed / summary.total) * 100) : 0, byEmployee: Array.from(grouped.values()).sort((a, b) => b.overdue - a.overdue || a.employeeName.localeCompare(b.employeeName, "ar")) };
  }),

  weeklyTeamCompliance: protectedProcedure.input(weeklyTeamComplianceInput).query(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.REPORTS_VIEW);
    await requirePermission(ctx.user, PERMISSIONS.DAILY_TASKS_MANAGE);
    return getWeeklyTeamComplianceReport(ctx.user, input);
  }),

  weeklyTeamComplianceExport: protectedProcedure.input(weeklyTeamComplianceInput).query(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.REPORTS_EXPORT);
    await requirePermission(ctx.user, PERMISSIONS.DAILY_TASKS_MANAGE);
    return getWeeklyTeamComplianceReport(ctx.user, input);
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
      db.select({ id: dailyTasks.id, employeeId: dailyTasks.employeeId, employeeName: employees.displayName, title: dailyTasks.title, notes: dailyTasks.notes, taskDate: dailyTasks.taskDate, priority: dailyTasks.priority, status: dailyTasks.status, source: dailyTasks.source, reviewId: dailyTasks.reviewId }).from(dailyTasks).innerJoin(employees, eq(dailyTasks.employeeId, employees.id)).where(and(...taskConditions)).orderBy(desc(dailyTasks.taskDate)),
      db.select({ id: reviews.id, internalRef: reviews.internalRef, title: reviews.title, dueDate: reviews.dueDate, priority: reviews.priority, employeeId: reviews.assignedEmployeeId, employeeName: employees.displayName, reviewerStatus: reviewerStatuses.name, employeeStatus: employeeStatuses.name, operationType: operationTypes.name }).from(reviews).leftJoin(employees, eq(reviews.assignedEmployeeId, employees.id)).innerJoin(reviewerStatuses, eq(reviews.reviewerStatusId, reviewerStatuses.id)).innerJoin(employeeStatuses, eq(reviews.employeeStatusId, employeeStatuses.id)).innerJoin(operationTypes, eq(reviews.operationTypeId, operationTypes.id)).where(and(...reviewConditions)).orderBy(desc(reviews.createdAt)),
    ]);
    return { employeeId: employeeId ?? null, employeeName: daily[0]?.employeeName ?? reviewRows[0]?.employeeName ?? null, dailyTasks: daily, reviews: reviewRows };
  }),
});
