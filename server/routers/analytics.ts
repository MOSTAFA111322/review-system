import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import { z } from "zod";
import { calculateOverview, reportRows } from "../analytics";
import { employees, employeeStatuses, operationTypes, reviewerStatuses, reviewActivityLog, reviews, roles, userRoles, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { PERMISSIONS, requireFiscalYearAccess, requirePermission, userHasPermission } from "../rbac";
import { protectedProcedure, router } from "../_core/trpc";

const periodInput = z.object({ fiscalYearId: z.number().int().positive(), startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional() }).refine(input => !input.startDate || !input.endDate || input.startDate <= input.endDate, { message: "يجب أن يسبق تاريخ البداية تاريخ النهاية." });
const overdueInput = z.object({ fiscalYearId: z.number().int().positive(), weeksBack: z.number().int().min(1).max(52).default(12) });

type AnalyticsUser = Parameters<typeof requirePermission>[0];

async function getAnalyticsRows(user: AnalyticsUser, input: z.infer<typeof periodInput>) {
  await requirePermission(user, PERMISSIONS.REPORTS_VIEW);
  await requireFiscalYearAccess(user, input.fiscalYearId);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  const conditions = [eq(reviews.fiscalYearId, input.fiscalYearId), isNull(reviews.deletedAt), isNull(reviews.cancelledAt)];
  if (input.startDate) conditions.push(gte(reviews.createdAt, input.startDate));
  if (input.endDate) conditions.push(lte(reviews.createdAt, input.endDate));
  const canViewAll = user.role === "admin" || await userHasPermission(user, PERMISSIONS.REVIEWS_VIEW_ALL);
  if (!canViewAll) {
    const [employee] = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, user.id)).limit(1);
    if (!employee) return { rows: [], returnedIds: new Set<number>() };
    conditions.push(eq(reviews.assignedEmployeeId, employee.id));
  }
  const rows = await db.select({ id: reviews.id, internalRef: reviews.internalRef, title: reviews.title, priority: reviews.priority, dueDate: reviews.dueDate, createdAt: reviews.createdAt, completedAt: reviews.completedAt, operationTypeName: operationTypes.name, reviewerStatusName: reviewerStatuses.name, reviewerTerminal: reviewerStatuses.isTerminal, employeeStatusName: employeeStatuses.name, employeeTerminal: employeeStatuses.isTerminal, employeeId: employees.id, employeeName: employees.displayName }).from(reviews).innerJoin(operationTypes, eq(reviews.operationTypeId, operationTypes.id)).innerJoin(reviewerStatuses, eq(reviews.reviewerStatusId, reviewerStatuses.id)).innerJoin(employeeStatuses, eq(reviews.employeeStatusId, employeeStatuses.id)).leftJoin(employees, eq(reviews.assignedEmployeeId, employees.id)).where(and(...conditions));
  const ids = rows.map(row => row.id);
  const activities = ids.length ? await db.select({ reviewId: reviewActivityLog.reviewId }).from(reviewActivityLog).where(and(inArray(reviewActivityLog.reviewId, ids), eq(reviewActivityLog.action, "review.status.reviewer.changed"))) : [];
  const changes = new Map<number, number>();
  for (const activity of activities) changes.set(activity.reviewId, (changes.get(activity.reviewId) ?? 0) + 1);
  return { rows, returnedIds: new Set(Array.from(changes).filter(([, count]) => count > 1).map(([id]) => id)) };
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function mondayOf(dateText: string) {
  const date = new Date(`${dateText}T00:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return isoDate(date);
}

async function getWeeklyOverdue(user: AnalyticsUser, input: z.infer<typeof overdueInput>) {
  await requirePermission(user, PERMISSIONS.REPORTS_VIEW);
  await requireFiscalYearAccess(user, input.fiscalYearId);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  const today = new Date();
  const todayText = isoDate(today);
  const cutoff = new Date(`${todayText}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - input.weeksBack * 7);
  const cutoffText = isoDate(cutoff);
  const conditions = [eq(reviews.fiscalYearId, input.fiscalYearId), isNull(reviews.deletedAt), isNull(reviews.cancelledAt), isNull(reviews.archivedAt), lt(reviews.dueDate, today)];
  const canViewAll = user.role === "admin" || await userHasPermission(user, PERMISSIONS.REVIEWS_VIEW_ALL);
  if (!canViewAll) {
    const [employee] = await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, user.id)).limit(1);
    if (!employee) return { asOf: todayText, weeksBack: input.weeksBack, total: 0, rows: [] };
    conditions.push(eq(reviews.assignedEmployeeId, employee.id));
  }
  const overdueRows = await db.select({ id: reviews.id, internalRef: reviews.internalRef, title: reviews.title, dueDate: reviews.dueDate, priority: reviews.priority, employeeId: employees.id, employeeName: employees.displayName, reviewerTerminal: reviewerStatuses.isTerminal, employeeTerminal: employeeStatuses.isTerminal }).from(reviews).innerJoin(reviewerStatuses, eq(reviews.reviewerStatusId, reviewerStatuses.id)).innerJoin(employeeStatuses, eq(reviews.employeeStatusId, employeeStatuses.id)).leftJoin(employees, eq(reviews.assignedEmployeeId, employees.id)).where(and(...conditions));
  const grouped = new Map<string, { weekStart: string; employeeId: number | null; employeeName: string; count: number; critical: number; urgent: number; reviewIds: number[] }>();
  for (const row of overdueRows) {
    if (!row.dueDate || isoDate(new Date(row.dueDate)) < cutoffText || (row.reviewerTerminal && row.employeeTerminal)) continue;
    const dueText = isoDate(new Date(row.dueDate));
    const weekStart = mondayOf(dueText);
    const key = `${weekStart}:${row.employeeId ?? "unassigned"}`;
    const current = grouped.get(key) ?? { weekStart, employeeId: row.employeeId, employeeName: row.employeeName ?? "غير مكلف", count: 0, critical: 0, urgent: 0, reviewIds: [] };
    current.count += 1;
    current.critical += row.priority === "critical" ? 1 : 0;
    current.urgent += row.priority === "urgent" ? 1 : 0;
    current.reviewIds.push(row.id);
    grouped.set(key, current);
  }
  const rows = Array.from(grouped.values()).sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.employeeName.localeCompare(b.employeeName, "ar"));
  return { asOf: todayText, weeksBack: input.weeksBack, total: rows.reduce((sum, row) => sum + row.count, 0), rows };
}

export function summarizeUserStats(userRows: Array<{ id: number; isActive: boolean }>, roleRows: Array<{ userId: number; roleName: string }>) {
  const roleCounts = new Map<string, number>();
  const assignedUsers = new Set<number>();
  for (const row of roleRows) {
    roleCounts.set(row.roleName, (roleCounts.get(row.roleName) ?? 0) + 1);
    assignedUsers.add(row.userId);
  }
  const unassignedCount = userRows.filter(row => !assignedUsers.has(row.id)).length;
  if (unassignedCount) roleCounts.set("بدون دور", unassignedCount);
  return {
    total: userRows.length,
    active: userRows.filter(row => row.isActive).length,
    inactive: userRows.filter(row => !row.isActive).length,
    roles: Array.from(roleCounts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

async function getUserStats(user: AnalyticsUser) {
  if (user.role !== "admin" && !(await userHasPermission(user, PERMISSIONS.USERS_MANAGE))) return null;
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  const [userRows, roleRows] = await Promise.all([
    db.select({ id: users.id, isActive: users.isActive }).from(users),
    db.select({ userId: userRoles.userId, roleName: roles.name }).from(userRoles).innerJoin(roles, eq(userRoles.roleId, roles.id)),
  ]);
  return summarizeUserStats(userRows, roleRows);
}

export const analyticsRouter = router({
  userStats: protectedProcedure.query(({ ctx }) => getUserStats(ctx.user)),
  overview: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => { const { rows, returnedIds } = await getAnalyticsRows(ctx.user, input); return calculateOverview(rows, returnedIds); }),
  report: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => { const { rows, returnedIds } = await getAnalyticsRows(ctx.user, input); return reportRows(rows, returnedIds); }),
  export: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => { await requirePermission(ctx.user, PERMISSIONS.REPORTS_EXPORT); const { rows, returnedIds } = await getAnalyticsRows(ctx.user, input); return reportRows(rows, returnedIds); }),
  weeklyOverdue: protectedProcedure.input(overdueInput).query(({ ctx, input }) => getWeeklyOverdue(ctx.user, input)),
});
