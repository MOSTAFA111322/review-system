import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { fiscalYears, userFiscalYears } from "../../drizzle/schema";
import { getDb } from "../db";
import { PERMISSIONS, requirePermission } from "../rbac";
import { protectedProcedure, router } from "../_core/trpc";

const yearInput = z.object({
  name: z.string().trim().min(2).max(80),
  year: z.number().int().min(2000).max(2200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  makeCurrent: z.boolean().optional().default(false),
});

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  return db;
}

export const fiscalYearsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx.user, PERMISSIONS.FISCAL_YEARS_VIEW);
    const db = await database();
    if (ctx.user.role === "admin") return db.select().from(fiscalYears).orderBy(desc(fiscalYears.year));

    const access = await db.select({ fiscalYearId: userFiscalYears.fiscalYearId }).from(userFiscalYears).where(eq(userFiscalYears.userId, ctx.user.id));
    if (!access.length) return [];
    return db.select().from(fiscalYears).where(inArray(fiscalYears.id, access.map(row => row.fiscalYearId))).orderBy(desc(fiscalYears.year));
  }),

  create: protectedProcedure.input(yearInput).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.FISCAL_YEARS_MANAGE);
    if (input.endDate <= input.startDate) throw new TRPCError({ code: "BAD_REQUEST", message: "تاريخ نهاية السنة يجب أن يكون بعد تاريخ البداية." });
    const db = await database();
    const { makeCurrent, startDate, endDate, ...yearData } = input;
    const created = await db.transaction(async tx => {
      if (makeCurrent) await tx.update(fiscalYears).set({ isCurrent: false });
      const result = await tx.insert(fiscalYears).values({
        ...yearData,
        startDate: new Date(`${startDate}T00:00:00.000Z`),
        endDate: new Date(`${endDate}T00:00:00.000Z`),
        isCurrent: makeCurrent,
        createdByUserId: ctx.user.id,
      });
      const [year] = await tx.select().from(fiscalYears).where(eq(fiscalYears.id, Number(result[0].insertId))).limit(1);
      return year;
    });
    return created;
  }),

  update: protectedProcedure.input(yearInput.omit({ makeCurrent: true }).extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.FISCAL_YEARS_MANAGE);
    if (input.endDate <= input.startDate) throw new TRPCError({ code: "BAD_REQUEST", message: "تاريخ نهاية السنة يجب أن يكون بعد تاريخ البداية." });
    const db = await database();
    const [existing] = await db.select().from(fiscalYears).where(eq(fiscalYears.id, input.id)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "السنة المالية غير موجودة." });
    if (existing.status === "closed") throw new TRPCError({ code: "CONFLICT", message: "لا يمكن تعديل سنة مالية مغلقة." });
    await db.update(fiscalYears).set({
      name: input.name,
      year: input.year,
      startDate: new Date(`${input.startDate}T00:00:00.000Z`),
      endDate: new Date(`${input.endDate}T00:00:00.000Z`),
    }).where(eq(fiscalYears.id, input.id));
    return { success: true };
  }),

  setCurrent: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.FISCAL_YEARS_MANAGE);
    const db = await database();
    await db.transaction(async tx => {
      const [existing] = await tx.select().from(fiscalYears).where(eq(fiscalYears.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "السنة المالية غير موجودة." });
      await tx.update(fiscalYears).set({ isCurrent: false });
      await tx.update(fiscalYears).set({ isCurrent: true }).where(eq(fiscalYears.id, input.id));
    });
    return { success: true };
  }),

  close: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.FISCAL_YEARS_MANAGE);
    const db = await database();
    await db.update(fiscalYears).set({ status: "closed", closedByUserId: ctx.user.id, closedAt: new Date() }).where(and(eq(fiscalYears.id, input.id), eq(fiscalYears.status, "open")));
    return { success: true };
  }),

  reopen: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.FISCAL_YEARS_MANAGE);
    const db = await database();
    await db.update(fiscalYears).set({ status: "open", closedByUserId: null, closedAt: null }).where(eq(fiscalYears.id, input.id));
    return { success: true };
  }),
});
