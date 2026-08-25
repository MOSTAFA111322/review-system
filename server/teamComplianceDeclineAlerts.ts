import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { dashboardAlertSettings, dailyTasks, employees, fiscalYears, notifications, permissions, rolePermissions, userRoles, users } from "../drizzle/schema";
import { getDb } from "./db";
import { findMutedUserIds } from "./notificationPreferences";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type TeamWindow = { total: number; completed: number };

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** يبني الفرق التي انخفض إنجازها فقط حين تتوفر بيانات فعلية في الفترتين. */
export function buildComplianceDeclines(input: { current: Array<{ teamName: string | null; status: "pending" | "in_progress" | "completed" | "skipped" }>; previous: Array<{ teamName: string | null; status: "pending" | "in_progress" | "completed" | "skipped" }>; threshold: number }) {
  const summarize = (rows: typeof input.current) => {
    const totals = new Map<string, TeamWindow>();
    for (const row of rows) {
      const teamName = row.teamName?.trim();
      if (!teamName) continue;
      const current = totals.get(teamName) ?? { total: 0, completed: 0 };
      current.total += 1;
      if (row.status === "completed") current.completed += 1;
      totals.set(teamName, current);
    }
    return totals;
  };
  const currentByTeam = summarize(input.current);
  const previousByTeam = summarize(input.previous);
  return Array.from(currentByTeam.entries()).flatMap(([teamName, current]) => {
    const previous = previousByTeam.get(teamName);
    if (!previous || current.total === 0 || previous.total === 0) return [];
    const completionRate = Math.round((current.completed / current.total) * 100);
    const previousCompletionRate = Math.round((previous.completed / previous.total) * 100);
    const completionRateDelta = completionRate - previousCompletionRate;
    return completionRateDelta <= -input.threshold ? [{ teamName, completionRate, previousCompletionRate, completionRateDelta }] : [];
  });
}

/**
 * يفحص الشهر المنقضي الحالي بعد تغير المهمة ويرسل تنبيهًا واحدًا غير مقروء لكل مدير
 * مخول. الجسم ثابت للفريق وفترة التقرير حتى لا تتكرر التنبيهات مع أي تعديل لاحق.
 */
export async function notifyTeamComplianceDeclines(db: Database, fiscalYearId: number, referenceDate = new Date()) {
  const [fiscalYear] = await db.select({ startDate: fiscalYears.startDate, endDate: fiscalYears.endDate }).from(fiscalYears).where(eq(fiscalYears.id, fiscalYearId)).limit(1);
  if (!fiscalYear) return { created: 0, affectedTeams: 0 };
  const fiscalStart = startOfUtcDay(new Date(fiscalYear.startDate));
  const fiscalEndExclusive = startOfUtcDay(new Date(fiscalYear.endDate));
  fiscalEndExclusive.setUTCDate(fiscalEndExclusive.getUTCDate() + 1);
  const today = startOfUtcDay(referenceDate);
  const endExclusive = new Date(Math.min(today.getTime() + 86_400_000, fiscalEndExclusive.getTime()));
  const start = new Date(Math.max(fiscalStart.getTime(), endExclusive.getTime() - 30 * 86_400_000));
  if (start.getTime() >= endExclusive.getTime()) return { created: 0, affectedTeams: 0 };
  const duration = endExclusive.getTime() - start.getTime();
  const previousEnd = new Date(start);
  const previousStart = new Date(Math.max(fiscalStart.getTime(), start.getTime() - duration));
  if (previousStart.getTime() >= previousEnd.getTime()) return { created: 0, affectedTeams: 0 };
  const [settings, currentRows, previousRows, managerPermissionRows] = await Promise.all([
    db.select({ complianceDeclineThreshold: dashboardAlertSettings.complianceDeclineThreshold }).from(dashboardAlertSettings).where(eq(dashboardAlertSettings.id, 1)).limit(1),
    db.select({ teamName: employees.department, status: dailyTasks.status }).from(dailyTasks).innerJoin(employees, eq(dailyTasks.employeeId, employees.id)).where(and(eq(dailyTasks.fiscalYearId, fiscalYearId), gte(dailyTasks.taskDate, start), lt(dailyTasks.taskDate, endExclusive))),
    db.select({ teamName: employees.department, status: dailyTasks.status }).from(dailyTasks).innerJoin(employees, eq(dailyTasks.employeeId, employees.id)).where(and(eq(dailyTasks.fiscalYearId, fiscalYearId), gte(dailyTasks.taskDate, previousStart), lt(dailyTasks.taskDate, previousEnd))),
    db.select({ userId: users.id, role: users.role, permissionCode: permissions.code }).from(users).leftJoin(userRoles, eq(userRoles.userId, users.id)).leftJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId)).leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId)).where(eq(users.isActive, true)),
  ]);
  const threshold = settings[0]?.complianceDeclineThreshold ?? 10;
  const declines = buildComplianceDeclines({ current: currentRows, previous: previousRows, threshold });
  if (!declines.length) return { created: 0, affectedTeams: 0 };
  const permissionsByUser = new Map<number, { isAdmin: boolean; codes: Set<string> }>();
  for (const row of managerPermissionRows) {
    const current = permissionsByUser.get(row.userId) ?? { isAdmin: row.role === "admin", codes: new Set<string>() };
    current.isAdmin ||= row.role === "admin";
    if (row.permissionCode) current.codes.add(row.permissionCode);
    permissionsByUser.set(row.userId, current);
  }
  const managerIds = Array.from(permissionsByUser.entries()).flatMap(([userId, access]) => access.isAdmin || (access.codes.has("reports.view") && access.codes.has("daily_tasks.manage")) ? [userId] : []);
  if (!managerIds.length) return { created: 0, affectedTeams: 0 };
  const weekStart = start.toISOString().slice(0, 10);
  const weekEnd = new Date(endExclusive.getTime() - 86_400_000).toISOString().slice(0, 10);
  const entries = managerIds.flatMap(userId => declines.map(decline => ({
    userId,
    type: "daily_task.team_compliance_decline",
    importance: "warning" as const,
    teamName: decline.teamName,
    title: "تراجع التزام الفريق الشهري",
    body: `انخفض التزام فريق ${decline.teamName} ضمن الفترة ${weekStart} إلى ${weekEnd} بما يتجاوز العتبة المعتمدة. راجع تقرير التزام الفرق الشهري.`,
    link: "/reports/team-compliance?period=month",
  })));
  const mutedUserIds = await findMutedUserIds(db, managerIds, referenceDate);
  const existing = await db.select({ userId: notifications.userId, body: notifications.body }).from(notifications).where(and(inArray(notifications.userId, managerIds), eq(notifications.type, "daily_task.team_compliance_decline"), isNull(notifications.readAt), gte(notifications.createdAt, start)));
  const existingKeys = new Set(existing.map(entry => `${entry.userId}:${entry.body ?? ""}`));
  const pending = entries.filter(entry => !mutedUserIds.has(entry.userId) && !existingKeys.has(`${entry.userId}:${entry.body}`));
  if (!pending.length) return { created: 0, affectedTeams: declines.length };
  await db.insert(notifications).values(pending);
  return { created: pending.length, affectedTeams: declines.length };
}
