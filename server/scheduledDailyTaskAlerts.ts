import type { Request, Response } from "express";
import { and, eq, gte, isNull, lte, lt, ne } from "drizzle-orm";
import {
  dailyTasks,
  employees,
  fiscalYears,
  notifications,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";

const DAY_MS = 24 * 60 * 60 * 1000;
const REPORTS_VIEW_PERMISSION = "reports.view";

function utcStartOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function createUnreadNotification(
  db: Awaited<ReturnType<typeof import("./db").getDb>>,
  userId: number,
  type: string,
  title: string,
  body: string,
  link: string,
) {
  if (!db) return false;
  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, type),
        eq(notifications.body, body),
        isNull(notifications.readAt),
      ),
    )
    .limit(1);
  if (existing) return false;
  await db.insert(notifications).values({ userId, type, title, body, link });
  return true;
}

async function sendWeeklyManagerReport(db: NonNullable<Awaited<ReturnType<typeof import("./db").getDb>>>, fiscalYearId: number, weekStart: Date, weekEnd: Date) {
  const rows = await db
    .select({ employeeId: dailyTasks.employeeId, employeeName: employees.displayName, status: dailyTasks.status })
    .from(dailyTasks)
    .innerJoin(employees, eq(dailyTasks.employeeId, employees.id))
    .where(and(eq(dailyTasks.fiscalYearId, fiscalYearId), gteDate(dailyTasks.taskDate, weekStart), lt(dailyTasks.taskDate, weekEnd)));

  if (rows.length === 0) return { managers: 0, created: 0, total: 0 };

  const grouped = new Map<number, { employeeName: string; total: number; completed: number; overdue: number; pending: number }>();
  for (const row of rows) {
    const current = grouped.get(row.employeeId) ?? { employeeName: row.employeeName, total: 0, completed: 0, overdue: 0, pending: 0 };
    current.total += 1;
    if (row.status === "completed") current.completed += 1;
    else {
      current.pending += 1;
      current.overdue += 1;
    }
    grouped.set(row.employeeId, current);
  }

  const summaryLines = Array.from(grouped.values())
    .sort((a, b) => b.overdue - a.overdue || a.employeeName.localeCompare(b.employeeName, "ar"))
    .map(item => `• ${item.employeeName}: ${item.completed}/${item.total} مكتملة، ${item.overdue} متأخرة`)
    .join("\n");
  const body = `تقرير المهام اليومية للأسبوع ${formatDate(weekStart)} إلى ${formatDate(new Date(weekEnd.getTime() - DAY_MS))}\nالإجمالي: ${rows.length}\n${summaryLines}`;

  const [admins, reportManagers] = await Promise.all([
    db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.isActive, true))),
    db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.isActive, true)))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, and(eq(permissions.id, rolePermissions.permissionId), eq(permissions.code, REPORTS_VIEW_PERMISSION)))
      .where(eq(users.isActive, true)),
  ]);
  const managerIds = Array.from(new Set([...admins, ...reportManagers].map(row => row.id)));
  let created = 0;
  for (const managerId of managerIds) {
    if (await createUnreadNotification(db, managerId, "daily_task.weekly_report", "التقرير الأسبوعي للمهام اليومية", body, "/reports")) created += 1;
  }
  return { managers: managerIds.length, created, total: rows.length };
}

// Drizzle's date operators are kept behind this small helper to preserve the date-only UTC boundary.
function gteDate(column: typeof dailyTasks.taskDate, value: Date) {
  return gte(column, value);
}

export async function handleDailyTaskAlerts(req: Request, res: Response) {
  const timestamp = new Date().toISOString();
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "database-unavailable", timestamp });

    const [fiscalYear] = await db
      .select({ id: fiscalYears.id })
      .from(fiscalYears)
      .where(eq(fiscalYears.scheduleCronTaskUid, user.taskUid))
      .limit(1);
    if (!fiscalYear) return res.json({ ok: true, skipped: "orphan" });

    const today = utcStartOfToday();
    const staleThreshold = new Date(today.getTime() - DAY_MS);
    const candidates = await db
      .select({
        id: dailyTasks.id,
        employeeUserId: employees.userId,
        title: dailyTasks.title,
        taskDate: dailyTasks.taskDate,
        status: dailyTasks.status,
        updatedAt: dailyTasks.updatedAt,
      })
      .from(dailyTasks)
      .innerJoin(employees, eq(dailyTasks.employeeId, employees.id))
      .where(and(eq(dailyTasks.fiscalYearId, fiscalYear.id), lte(dailyTasks.taskDate, today), ne(dailyTasks.status, "completed"), ne(dailyTasks.status, "skipped")));

    const overdue = candidates.filter(task => task.taskDate < today);
    const unupdated = candidates.filter(task => task.updatedAt < staleThreshold);
    let created = 0;
    for (const task of overdue) {
      if (!task.employeeUserId) continue;
      const body = `المهمة #${task.id} — ${task.title} — تاريخها ${formatDate(task.taskDate)} — يلزم المتابعة`;
      if (await createUnreadNotification(db, task.employeeUserId, "daily_task.overdue", "مهمة يومية متأخرة", body, "/daily-tasks")) created += 1;
    }
    for (const task of unupdated) {
      if (!task.employeeUserId) continue;
      const body = `المهمة #${task.id} — ${task.title} — تاريخها ${formatDate(task.taskDate)} — لم تُحدّث منذ أكثر من يوم`;
      if (await createUnreadNotification(db, task.employeeUserId, "daily_task.unupdated", "مهمة يومية غير محدثة", body, "/daily-tasks")) created += 1;
    }

    let weeklyReport = null;
    if (today.getUTCDay() === 6) {
      const weekStart = new Date(today.getTime() - 7 * DAY_MS);
      weeklyReport = await sendWeeklyManagerReport(db, fiscalYear.id, weekStart, today);
    }

    return res.json({ ok: true, fiscalYearId: fiscalYear.id, overdue: overdue.length, unupdated: unupdated.length, created, weeklyReport, timestamp });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "scheduled-alert-failed",
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl, taskUid: req.headers["x-task-uid"] ?? null },
      timestamp,
    });
  }
}
