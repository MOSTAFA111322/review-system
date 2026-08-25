import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { dashboardAlertSettings, dashboardAlertSettingsActivity, dashboardTeamAlertSettings, employees, employeeStatuses, fiscalYears, operationTypes, permissions, reviewerStatuses, statusTransitions, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { PERMISSIONS, requirePermission } from "../rbac";
import { protectedProcedure, router } from "../_core/trpc";
import { notifyTeamOverdueThresholds } from "../teamOverdueAlerts";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#64748b");
const sortOrder = z.number().int().min(0).max(10000).default(0);
const identifier = z.string().trim().min(2).max(64).regex(/^[a-z0-9_]+$/);

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  return db;
}

async function requireSettingsPermission(user: Parameters<typeof requirePermission>[0]) {
  await requirePermission(user, PERMISSIONS.SETTINGS_MANAGE);
}

const operationTypesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    return db.select().from(operationTypes).orderBy(asc(operationTypes.sortOrder), asc(operationTypes.name));
  }),
  create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(140), description: z.string().trim().max(5000).optional(), color, sortOrder })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    const result = await db.insert(operationTypes).values(input);
    return { id: Number(result[0].insertId) };
  }),
  update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(140), description: z.string().trim().max(5000).nullable(), color, sortOrder, isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(operationTypes).set(input).where(eq(operationTypes.id, input.id));
    return { success: true };
  }),
  setActive: protectedProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(operationTypes).set({ isActive: input.isActive }).where(eq(operationTypes.id, input.id));
    return { success: true };
  }),
});

const reviewerStatusesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    return db.select().from(reviewerStatuses).orderBy(asc(reviewerStatuses.sortOrder), asc(reviewerStatuses.name));
  }),
  create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120), code: identifier, color, isTerminal: z.boolean().default(false), sortOrder })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    const result = await db.insert(reviewerStatuses).values(input);
    return { id: Number(result[0].insertId) };
  }),
  update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(120), code: identifier, color, isTerminal: z.boolean(), sortOrder, isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(reviewerStatuses).set(input).where(eq(reviewerStatuses.id, input.id));
    return { success: true };
  }),
  setActive: protectedProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(reviewerStatuses).set({ isActive: input.isActive }).where(eq(reviewerStatuses.id, input.id));
    return { success: true };
  }),
});

const employeeStatusesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    return db.select().from(employeeStatuses).orderBy(asc(employeeStatuses.sortOrder), asc(employeeStatuses.name));
  }),
  create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120), code: identifier, color, isTerminal: z.boolean().default(false), sortOrder })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    const result = await db.insert(employeeStatuses).values(input);
    return { id: Number(result[0].insertId) };
  }),
  update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(120), code: identifier, color, isTerminal: z.boolean(), sortOrder, isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(employeeStatuses).set(input).where(eq(employeeStatuses.id, input.id));
    return { success: true };
  }),
  setActive: protectedProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(employeeStatuses).set({ isActive: input.isActive }).where(eq(employeeStatuses.id, input.id));
    return { success: true };
  }),
});

export const transitionInput = z.object({ side: z.enum(["reviewer", "employee"]), fromStatusId: z.number().int().positive(), toStatusId: z.number().int().positive(), requiredPermission: z.string().min(3).max(100) });

const transitionsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    return db.select().from(statusTransitions).orderBy(asc(statusTransitions.side), asc(statusTransitions.id));
  }),
  permissionOptions: protectedProcedure.query(async ({ ctx }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    return db.select({ code: permissions.code, name: permissions.name, group: permissions.group }).from(permissions).orderBy(asc(permissions.group), asc(permissions.name));
  }),
  create: protectedProcedure.input(transitionInput).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    const [permission] = await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.code, input.requiredPermission)).limit(1);
    if (!permission) throw new TRPCError({ code: "BAD_REQUEST", message: "الصلاحية المطلوبة غير موجودة." });
    if (input.side === "reviewer") {
      const [from, to] = await Promise.all([
        db.select({ id: reviewerStatuses.id }).from(reviewerStatuses).where(eq(reviewerStatuses.id, input.fromStatusId)).limit(1),
        db.select({ id: reviewerStatuses.id }).from(reviewerStatuses).where(eq(reviewerStatuses.id, input.toStatusId)).limit(1),
      ]);
      if (!from.length || !to.length) throw new TRPCError({ code: "BAD_REQUEST", message: "حالة المراجع غير صالحة." });
      const result = await db.insert(statusTransitions).values({ side: input.side, fromReviewerStatusId: input.fromStatusId, toReviewerStatusId: input.toStatusId, requiredPermission: input.requiredPermission });
      return { id: Number(result[0].insertId) };
    }
    const [from, to] = await Promise.all([
      db.select({ id: employeeStatuses.id }).from(employeeStatuses).where(eq(employeeStatuses.id, input.fromStatusId)).limit(1),
      db.select({ id: employeeStatuses.id }).from(employeeStatuses).where(eq(employeeStatuses.id, input.toStatusId)).limit(1),
    ]);
    if (!from.length || !to.length) throw new TRPCError({ code: "BAD_REQUEST", message: "حالة الموظف غير صالحة." });
    const result = await db.insert(statusTransitions).values({ side: input.side, fromEmployeeStatusId: input.fromStatusId, toEmployeeStatusId: input.toStatusId, requiredPermission: input.requiredPermission });
    return { id: Number(result[0].insertId) };
  }),
  setActive: protectedProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(statusTransitions).set({ isActive: input.isActive }).where(eq(statusTransitions.id, input.id));
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({ id: z.number().int().positive(), requiredPermission: z.string().min(3).max(100), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    const [permission] = await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.code, input.requiredPermission)).limit(1);
    if (!permission) throw new TRPCError({ code: "BAD_REQUEST", message: "الصلاحية المطلوبة غير موجودة." });
    await db.update(statusTransitions).set({ requiredPermission: input.requiredPermission, isActive: input.isActive }).where(eq(statusTransitions.id, input.id));
    return { success: true };
  }),
});

const dashboardAlertsRouter = router({
  get: protectedProcedure.query(async () => {
    const db = await database();
    const [settings] = await db.select({ overdueThreshold: dashboardAlertSettings.overdueThreshold }).from(dashboardAlertSettings).where(eq(dashboardAlertSettings.id, 1)).limit(1);
    return { overdueThreshold: settings?.overdueThreshold ?? 3 };
  }),
  manageOverview: protectedProcedure.query(async ({ ctx }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    const [global] = await db.select({ overdueThreshold: dashboardAlertSettings.overdueThreshold }).from(dashboardAlertSettings).where(eq(dashboardAlertSettings.id, 1)).limit(1);
    const [teams, history] = await Promise.all([
      db.select({ teamName: employees.department }).from(employees).where(and(eq(employees.isActive, true), isNotNull(employees.department))).groupBy(employees.department).orderBy(asc(employees.department)),
      db.select({ id: dashboardAlertSettingsActivity.id, scope: dashboardAlertSettingsActivity.scope, teamName: dashboardAlertSettingsActivity.teamName, previousThreshold: dashboardAlertSettingsActivity.previousThreshold, nextThreshold: dashboardAlertSettingsActivity.nextThreshold, createdAt: dashboardAlertSettingsActivity.createdAt, actorName: users.name, actorUsername: users.username }).from(dashboardAlertSettingsActivity).leftJoin(users, eq(dashboardAlertSettingsActivity.actorUserId, users.id)).orderBy(desc(dashboardAlertSettingsActivity.createdAt)).limit(12),
    ]);
    const teamSettings = await db.select({ teamName: dashboardTeamAlertSettings.teamName, overdueThreshold: dashboardTeamAlertSettings.overdueThreshold, updatedAt: dashboardTeamAlertSettings.updatedAt }).from(dashboardTeamAlertSettings).orderBy(asc(dashboardTeamAlertSettings.teamName));
    return { globalThreshold: global?.overdueThreshold ?? 3, teams: teams.flatMap(team => team.teamName ? [team.teamName] : []), teamSettings, history };
  }),
  update: protectedProcedure.input(z.object({ overdueThreshold: z.number().int().min(1).max(1000) })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    const [current] = await db.select({ id: dashboardAlertSettings.id, overdueThreshold: dashboardAlertSettings.overdueThreshold }).from(dashboardAlertSettings).where(eq(dashboardAlertSettings.id, 1)).limit(1);
    const previousThreshold = current?.overdueThreshold ?? 3;
    if (current) await db.update(dashboardAlertSettings).set({ overdueThreshold: input.overdueThreshold, updatedByUserId: ctx.user.id }).where(eq(dashboardAlertSettings.id, 1));
    else await db.insert(dashboardAlertSettings).values({ id: 1, overdueThreshold: input.overdueThreshold, updatedByUserId: ctx.user.id });
    if (previousThreshold !== input.overdueThreshold) {
      await db.insert(dashboardAlertSettingsActivity).values({ scope: "global", previousThreshold, nextThreshold: input.overdueThreshold, actorUserId: ctx.user.id });
      const currentFiscalYears = await db.select({ id: fiscalYears.id }).from(fiscalYears).where(eq(fiscalYears.isCurrent, true));
      await Promise.all(currentFiscalYears.map(fiscalYear => notifyTeamOverdueThresholds(db, fiscalYear.id)));
    }
    return { success: true };
  }),
  updateTeam: protectedProcedure.input(z.object({ teamName: z.string().trim().min(2).max(160), overdueThreshold: z.number().int().min(1).max(1000) })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    const [team] = await db.select({ teamName: employees.department }).from(employees).where(and(eq(employees.isActive, true), eq(employees.department, input.teamName))).limit(1);
    if (!team?.teamName) throw new TRPCError({ code: "BAD_REQUEST", message: "فريق العمل المحدد غير موجود ضمن الموظفين النشطين." });
    const [global] = await db.select({ overdueThreshold: dashboardAlertSettings.overdueThreshold }).from(dashboardAlertSettings).where(eq(dashboardAlertSettings.id, 1)).limit(1);
    const [current] = await db.select({ id: dashboardTeamAlertSettings.id, overdueThreshold: dashboardTeamAlertSettings.overdueThreshold }).from(dashboardTeamAlertSettings).where(eq(dashboardTeamAlertSettings.teamName, input.teamName)).limit(1);
    const previousThreshold = current?.overdueThreshold ?? global?.overdueThreshold ?? 3;
    if (current) await db.update(dashboardTeamAlertSettings).set({ overdueThreshold: input.overdueThreshold, updatedByUserId: ctx.user.id }).where(eq(dashboardTeamAlertSettings.id, current.id));
    else await db.insert(dashboardTeamAlertSettings).values({ teamName: input.teamName, overdueThreshold: input.overdueThreshold, updatedByUserId: ctx.user.id });
    if (previousThreshold !== input.overdueThreshold) {
      await db.insert(dashboardAlertSettingsActivity).values({ scope: "team", teamName: input.teamName, previousThreshold, nextThreshold: input.overdueThreshold, actorUserId: ctx.user.id });
      const currentFiscalYears = await db.select({ id: fiscalYears.id }).from(fiscalYears).where(eq(fiscalYears.isCurrent, true));
      await Promise.all(currentFiscalYears.map(fiscalYear => notifyTeamOverdueThresholds(db, fiscalYear.id)));
    }
    return { success: true };
  }),
});

export const settingsRouter = router({
  operationTypes: operationTypesRouter,
  reviewerStatuses: reviewerStatusesRouter,
  employeeStatuses: employeeStatusesRouter,
  transitions: transitionsRouter,
  dashboardAlerts: dashboardAlertsRouter,
});
