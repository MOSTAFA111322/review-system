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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readDashboardPeriod(value: unknown) {
  const parsed = dashboardPeriodInput.safeParse(asRecord(value).dashboardPeriod);
  return parsed.success ? parsed.data : defaultPeriod;
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
});
