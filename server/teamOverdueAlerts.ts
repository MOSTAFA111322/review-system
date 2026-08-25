import { and, eq, gte, inArray, isNotNull, isNull, lt, ne } from "drizzle-orm";
import { dashboardAlertSettings, dashboardTeamAlertSettings, dailyTasks, employees, notifications, users } from "../drizzle/schema";
import { getDb } from "./db";
import { findMutedUserIds } from "./notificationPreferences";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type TeamThresholdRecipient = { userId: number; teamName: string; threshold: number };

export function buildTeamThresholdRecipients(input: { defaultThreshold: number; thresholdsByTeam: Array<{ teamName: string; overdueThreshold: number }>; overdueByTeam: Map<string, number>; teamMembers: Array<{ teamName: string | null; userId: number | null }> }): TeamThresholdRecipient[] {
  const thresholdByTeam = new Map(input.thresholdsByTeam.map(setting => [setting.teamName, setting.overdueThreshold]));
  const recipients = new Map<string, TeamThresholdRecipient>();
  for (const member of input.teamMembers) {
    if (!member.teamName || !member.userId) continue;
    const overdue = input.overdueByTeam.get(member.teamName) ?? 0;
    const threshold = thresholdByTeam.get(member.teamName) ?? input.defaultThreshold;
    if (overdue >= threshold) recipients.set(`${member.userId}:${member.teamName}`, { userId: member.userId, teamName: member.teamName, threshold });
  }
  return Array.from(recipients.values());
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * ينشئ تنبيهًا واحدًا غير مقروء لكل عضو نشط في الفريق عند تجاوز عتبة التأخر.
 * يتم تثبيته حتى يبقى التنبيه قابلًا لإزالة التكرار حتى لو تغير عدد المهام أثناء اليوم.
 */
export async function notifyTeamOverdueThresholds(db: Database, fiscalYearId: number, referenceDate = new Date()) {
  const today = startOfUtcDay(referenceDate);
  const [global, configuredTeams, overdueTasks, teamMembers] = await Promise.all([
    db.select({ overdueThreshold: dashboardAlertSettings.overdueThreshold }).from(dashboardAlertSettings).where(eq(dashboardAlertSettings.id, 1)).limit(1),
    db.select({ teamName: dashboardTeamAlertSettings.teamName, overdueThreshold: dashboardTeamAlertSettings.overdueThreshold }).from(dashboardTeamAlertSettings),
    db.select({ teamName: employees.department }).from(dailyTasks).innerJoin(employees, eq(dailyTasks.employeeId, employees.id)).where(and(eq(dailyTasks.fiscalYearId, fiscalYearId), lt(dailyTasks.taskDate, today), ne(dailyTasks.status, "completed"), ne(dailyTasks.status, "skipped"), isNotNull(employees.department))),
    db.select({ teamName: employees.department, userId: employees.userId }).from(employees).innerJoin(users, eq(employees.userId, users.id)).where(and(eq(employees.isActive, true), eq(users.isActive, true), isNotNull(employees.department), isNotNull(employees.userId))),
  ]);

  const defaultThreshold = global[0]?.overdueThreshold ?? 3;
  const overdueByTeam = new Map<string, number>();
  for (const task of overdueTasks) {
    if (task.teamName) overdueByTeam.set(task.teamName, (overdueByTeam.get(task.teamName) ?? 0) + 1);
  }

  const recipients = buildTeamThresholdRecipients({ defaultThreshold, thresholdsByTeam: configuredTeams, overdueByTeam, teamMembers });
  const entries = recipients.map(recipient => ({
    userId: recipient.userId,
    type: "daily_task.team_threshold",
    importance: "critical" as const,
    teamName: recipient.teamName,
    title: "تنبيه تأخر مهام الفريق",
    body: `فريق ${recipient.teamName} تجاوز عتبة المهام اليومية المتأخرة (${recipient.threshold}). افتح القائمة لمراجعة التفاصيل.`,
    link: "/daily-tasks?view=overdue",
  }));
  if (entries.length === 0) return { created: 0, affectedTeams: 0 };

  const userIds = Array.from(new Set(entries.map(entry => entry.userId)));
  const mutedUserIds = await findMutedUserIds(db, userIds, referenceDate);
  const existing = await db.select({ userId: notifications.userId, body: notifications.body }).from(notifications).where(and(inArray(notifications.userId, userIds), eq(notifications.type, "daily_task.team_threshold"), isNull(notifications.readAt), gte(notifications.createdAt, today)));
  const existingKeys = new Set(existing.map(entry => `${entry.userId}:${entry.body ?? ""}`));
  const pending = entries.filter(entry => !mutedUserIds.has(entry.userId) && !existingKeys.has(`${entry.userId}:${entry.body}`));
  if (pending.length === 0) return { created: 0, affectedTeams: overdueByTeam.size };
  await db.insert(notifications).values(pending);
  return { created: pending.length, affectedTeams: new Set(pending.map(entry => entry.body)).size };
}
