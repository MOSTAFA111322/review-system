import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { calculateOverview, reportRows } from "../analytics";
import { employees, employeeStatuses, operationTypes, reviewerStatuses, reviewActivityLog, reviews } from "../../drizzle/schema";
import { getDb } from "../db";
import { PERMISSIONS, requireFiscalYearAccess, requirePermission, userHasPermission } from "../rbac";
import { protectedProcedure, router } from "../_core/trpc";

const periodInput = z.object({ fiscalYearId: z.number().int().positive(), startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional() }).refine(input => !input.startDate || !input.endDate || input.startDate <= input.endDate, { message: "يجب أن يسبق تاريخ البداية تاريخ النهاية." });

async function getAnalyticsRows(user: Parameters<typeof requirePermission>[0], input: z.infer<typeof periodInput>) {
  await requirePermission(user, PERMISSIONS.REPORTS_VIEW);
  await requireFiscalYearAccess(user, input.fiscalYearId);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  const conditions = [eq(reviews.fiscalYearId, input.fiscalYearId), isNull(reviews.deletedAt)];
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

export const analyticsRouter = router({
  overview: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const { rows, returnedIds } = await getAnalyticsRows(ctx.user, input);
    return calculateOverview(rows, returnedIds);
  }),
  report: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const { rows, returnedIds } = await getAnalyticsRows(ctx.user, input);
    return reportRows(rows, returnedIds);
  }),
  export: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.REPORTS_EXPORT);
    const { rows, returnedIds } = await getAnalyticsRows(ctx.user, input);
    return reportRows(rows, returnedIds);
  }),
});
