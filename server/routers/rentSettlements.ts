import { and, asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { fiscalYears, rentContracts, rentOwners, rentPaymentFollowUps, rentSettlements, rentUnits } from "../../drizzle/schema";
import { getDb } from "../db";
import { PERMISSIONS, requireFiscalYearAccess, requirePermission } from "../rbac";
import { protectedProcedure, router } from "../_core/trpc";

const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();
const ownerInput = z.object({ fiscalYearId: z.number().int().positive(), name: z.string().trim().min(1).max(180), contactPhone: nullableText(80), paymentAccountNumber: nullableText(160), notes: nullableText(4000) });
const settlementInput = z.object({
  fiscalYearId: z.number().int().positive(), ownerId: z.number().int().positive(), followUpId: z.number().int().positive().optional().nullable(), contractId: z.number().int().positive().optional().nullable(),
  grossAmount: z.number().nonnegative(), managementFee: z.number().nonnegative().default(0), ownerNetAmount: z.number().nonnegative(),
  beneficiary: z.enum(["owner", "management_company"]).default("owner"), paymentMethod: nullableText(80), settlementDate: z.string().date(), status: z.enum(["pending", "settled", "cancelled"]).default("pending"), notes: nullableText(4000), sourceFingerprint: nullableText(128),
});
async function dbOrThrow() { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." }); return db; }
function cents(value: number) { return Math.round(value * 100); }
function asDate(value: string) { return new Date(`${value}T00:00:00.000Z`); }

export const rentSettlementsRouter = router({
  owners: router({
    list: protectedProcedure.input(z.object({ fiscalYearId: z.number().int().positive(), includeInactive: z.boolean().default(false) })).query(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_OWNERS_VIEW); await requireFiscalYearAccess(ctx.user, input.fiscalYearId);
      const db = await dbOrThrow();
      return db.select().from(rentOwners).where(and(eq(rentOwners.fiscalYearId, input.fiscalYearId), ...(input.includeInactive ? [] : [eq(rentOwners.isActive, true)]))).orderBy(asc(rentOwners.name));
    }),
    create: protectedProcedure.input(ownerInput).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_OWNERS_MANAGE); await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true);
      const db = await dbOrThrow(); const [duplicate] = await db.select({ id: rentOwners.id }).from(rentOwners).where(and(eq(rentOwners.fiscalYearId, input.fiscalYearId), eq(rentOwners.name, input.name))).limit(1);
      if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "اسم المالك موجود مسبقًا في السنة المالية." });
      const result = await db.insert(rentOwners).values({ ...input, createdByUserId: ctx.user.id }); return { id: Number(result[0].insertId) };
    }),
    setActive: protectedProcedure.input(z.object({ fiscalYearId: z.number().int().positive(), id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_OWNERS_MANAGE); await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true); const db = await dbOrThrow();
      const [owner] = await db.select({ id: rentOwners.id }).from(rentOwners).where(and(eq(rentOwners.id, input.id), eq(rentOwners.fiscalYearId, input.fiscalYearId))).limit(1); if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "المالك غير موجود ضمن السنة المالية." });
      await db.update(rentOwners).set({ isActive: input.isActive }).where(eq(rentOwners.id, input.id)); return { success: true };
    }),
  }),
  settlements: router({
    list: protectedProcedure.input(z.object({ fiscalYearId: z.number().int().positive(), ownerId: z.number().int().positive().optional(), status: z.enum(["pending", "settled", "cancelled"]).optional() })).query(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_SETTLEMENTS_VIEW); await requireFiscalYearAccess(ctx.user, input.fiscalYearId); const db = await dbOrThrow();
      return db.select({ settlement: rentSettlements, owner: rentOwners }).from(rentSettlements).innerJoin(rentOwners, eq(rentSettlements.ownerId, rentOwners.id)).where(and(eq(rentSettlements.fiscalYearId, input.fiscalYearId), ...(input.ownerId ? [eq(rentSettlements.ownerId, input.ownerId)] : []), ...(input.status ? [eq(rentSettlements.status, input.status)] : []))).orderBy(desc(rentSettlements.settlementDate), desc(rentSettlements.id));
    }),
    create: protectedProcedure.input(settlementInput).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_SETTLEMENTS_MANAGE); await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true); const db = await dbOrThrow();
      const [owner] = await db.select({ id: rentOwners.id }).from(rentOwners).where(and(eq(rentOwners.id, input.ownerId), eq(rentOwners.fiscalYearId, input.fiscalYearId), eq(rentOwners.isActive, true))).limit(1); if (!owner) throw new TRPCError({ code: "NOT_FOUND", message: "المالك غير موجود أو غير نشط ضمن السنة المالية." });
      if (cents(input.grossAmount) !== cents(input.managementFee) + cents(input.ownerNetAmount)) throw new TRPCError({ code: "BAD_REQUEST", message: "يجب أن يساوي الإجمالي أتعاب الإدارة مضافًا إليها صافي المالك." });
      if (input.beneficiary === "owner" && input.ownerNetAmount <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تسجيل تسوية لصالح المالك بصافي مبلغ يساوي صفرًا." });
      if (input.beneficiary === "management_company" && (input.ownerNetAmount !== 0 || input.managementFee !== input.grossAmount)) throw new TRPCError({ code: "BAD_REQUEST", message: "عند اختيار شركة الإدارة كمستفيد يجب أن يكون كامل المبلغ أتعاب إدارة وصافي المالك صفرًا." });
      if (input.followUpId) { const [row] = await db.select({ id: rentPaymentFollowUps.id }).from(rentPaymentFollowUps).where(and(eq(rentPaymentFollowUps.id, input.followUpId), eq(rentPaymentFollowUps.fiscalYearId, input.fiscalYearId))).limit(1); if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "سجل السداد لا يتبع السنة المالية المحددة." }); }
      if (input.contractId) { const [row] = await db.select({ id: rentContracts.id }).from(rentContracts).innerJoin(rentUnits, eq(rentContracts.unitId, rentUnits.id)).where(and(eq(rentContracts.id, input.contractId), eq(rentContracts.fiscalYearId, input.fiscalYearId))).limit(1); if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "العقد لا يتبع السنة المالية المحددة." }); }
      if (input.sourceFingerprint) { const [duplicate] = await db.select({ id: rentSettlements.id }).from(rentSettlements).where(eq(rentSettlements.sourceFingerprint, input.sourceFingerprint)).limit(1); if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "التسوية مستوردة مسبقًا." }); }
      const { fiscalYearId, grossAmount, managementFee, ownerNetAmount, settlementDate, ...rest } = input;
      const result = await db.insert(rentSettlements).values({ ...rest, fiscalYearId, grossAmount: grossAmount.toFixed(2), managementFee: managementFee.toFixed(2), ownerNetAmount: ownerNetAmount.toFixed(2), settlementDate: asDate(settlementDate), createdByUserId: ctx.user.id }); return { id: Number(result[0].insertId) };
    }),
  }),
});

export type RentSettlementsRouter = typeof rentSettlementsRouter;

void fiscalYears;
