import { and, eq, isNull, lt, ne } from "drizzle-orm";
import type { Request, Response } from "express";
import { dailyTasks, employees, fiscalYears, notifications } from "../drizzle/schema";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";

export async function handleDailyTaskAlerts(req: Request, res: Response) {
  const timestamp = new Date().toISOString();
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "database-unavailable", timestamp });
    const [fiscalYear] = await db.select({ id: fiscalYears.id }).from(fiscalYears).where(eq(fiscalYears.scheduleCronTaskUid, user.taskUid)).limit(1);
    if (!fiscalYear) return res.json({ ok: true, skipped: "orphan" });
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const overdue = await db.select({ id: dailyTasks.id, employeeUserId: employees.userId, title: dailyTasks.title, taskDate: dailyTasks.taskDate }).from(dailyTasks).innerJoin(employees, eq(dailyTasks.employeeId, employees.id)).where(and(eq(dailyTasks.fiscalYearId, fiscalYear.id), lt(dailyTasks.taskDate, today), ne(dailyTasks.status, "completed"), ne(dailyTasks.status, "skipped")));
    let created = 0;
    for (const task of overdue) {
      if (!task.employeeUserId) continue;
      const body = `المهمة #${task.id} — ${task.title} — تاريخها ${task.taskDate.toISOString().slice(0, 10)}`;
      const [existing] = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, task.employeeUserId), eq(notifications.type, "daily_task.overdue"), eq(notifications.body, body), isNull(notifications.readAt))).limit(1);
      if (existing) continue;
      await db.insert(notifications).values({ userId: task.employeeUserId, type: "daily_task.overdue", title: "مهمة يومية متأخرة", body, link: "/daily-tasks" });
      created += 1;
    }
    return res.json({ ok: true, fiscalYearId: fiscalYear.id, overdue: overdue.length, created, timestamp });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "scheduled-alert-failed", stack: error instanceof Error ? error.stack : undefined, context: { url: req.originalUrl, taskUid: req.headers["x-task-uid"] ?? null }, timestamp });
  }
}
