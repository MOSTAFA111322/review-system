import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { userPreferences } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dashboardPeriodInput = z.object({
  preset: z.enum(["fiscalYear", "last7", "last30", "custom"]),
  customStartDate: dateText.optional(),
  customEndDate: dateText.optional(),
});

const defaultPeriod = { preset: "fiscalYear" as const, customStartDate: undefined, customEndDate: undefined };
const dailyTaskFiltersInput = z.object({
  dateMode: z.enum(["today", "week", "custom"]),
  customStartDate: dateText.optional(),
  customEndDate: dateText.optional(),
  statusFilter: z.enum(["pending", "in_progress", "completed", "skipped"]).optional(),
  sourceFilter: z.enum(["all", "review", "recurring", "manual", "imported"]),
});
const defaultDailyTaskFilters = { dateMode: "today" as const, customStartDate: undefined, customEndDate: undefined, statusFilter: undefined, sourceFilter: "all" as const };
const archiveSearchText = z.string().trim().min(2).max(160);
const archiveSearchHistoryInput = z.array(archiveSearchText).max(8);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readDashboardPeriod(value: unknown) {
  const parsed = dashboardPeriodInput.safeParse(asRecord(value).dashboardPeriod);
  return parsed.success ? parsed.data : defaultPeriod;
}

function readDailyTaskFilters(value: unknown) {
  const parsed = dailyTaskFiltersInput.safeParse(asRecord(value).dailyTaskFilters);
  return parsed.success ? parsed.data : defaultDailyTaskFilters;
}

function readArchiveSearchHistory(value: unknown) {
  const parsed = archiveSearchHistoryInput.safeParse(asRecord(value).archiveSearchHistory);
  return parsed.success ? Array.from(new Map(parsed.data.map(item => [item.toLocaleLowerCase("ar"), item])).values()).slice(0, 8) : [];
}

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  return db;
}

export const dashboardPreferencesRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = await database();
    const [row] = await db.select({ preferences: userPreferences.preferences }).from(userPreferences).where(eq(userPreferences.userId, ctx.user.id)).limit(1);
    return readDashboardPeriod(row?.preferences);
  }),
  save: protectedProcedure.input(dashboardPeriodInput).mutation(async ({ ctx, input }) => {
    const db = await database();
    const [existing] = await db.select({ id: userPreferences.id, preferences: userPreferences.preferences }).from(userPreferences).where(eq(userPreferences.userId, ctx.user.id)).limit(1);
    const preferences = { ...asRecord(existing?.preferences), dashboardPeriod: input };
    if (existing) await db.update(userPreferences).set({ preferences }).where(eq(userPreferences.id, existing.id));
    else await db.insert(userPreferences).values({ userId: ctx.user.id, preferences });
    return input;
  }),
  dailyTaskFilters: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const db = await database();
      const [row] = await db.select({ preferences: userPreferences.preferences }).from(userPreferences).where(eq(userPreferences.userId, ctx.user.id)).limit(1);
      return readDailyTaskFilters(row?.preferences);
    }),
    save: protectedProcedure.input(dailyTaskFiltersInput).mutation(async ({ ctx, input }) => {
      const db = await database();
      const [existing] = await db.select({ id: userPreferences.id, preferences: userPreferences.preferences }).from(userPreferences).where(eq(userPreferences.userId, ctx.user.id)).limit(1);
      const preferences = { ...asRecord(existing?.preferences), dailyTaskFilters: input };
      if (existing) await db.update(userPreferences).set({ preferences }).where(eq(userPreferences.id, existing.id));
      else await db.insert(userPreferences).values({ userId: ctx.user.id, preferences });
      return input;
    }),
  }),
  archiveSearchHistory: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const db = await database();
      const [row] = await db.select({ preferences: userPreferences.preferences }).from(userPreferences).where(eq(userPreferences.userId, ctx.user.id)).limit(1);
      return readArchiveSearchHistory(row?.preferences);
    }),
    record: protectedProcedure.input(archiveSearchText).mutation(async ({ ctx, input }) => {
      const db = await database();
      const [existing] = await db.select({ id: userPreferences.id, preferences: userPreferences.preferences }).from(userPreferences).where(eq(userPreferences.userId, ctx.user.id)).limit(1);
      const history = [input, ...readArchiveSearchHistory(existing?.preferences).filter(item => item.toLocaleLowerCase("ar") !== input.toLocaleLowerCase("ar"))].slice(0, 8);
      const preferences = { ...asRecord(existing?.preferences), archiveSearchHistory: history };
      if (existing) await db.update(userPreferences).set({ preferences }).where(eq(userPreferences.id, existing.id));
      else await db.insert(userPreferences).values({ userId: ctx.user.id, preferences });
      return history;
    }),
  }),
});
