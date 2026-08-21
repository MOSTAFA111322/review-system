import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { fiscalYears, rentPaymentFollowUps } from "../../drizzle/schema";
import { getDb } from "../db";
import { PERMISSIONS, requireFiscalYearAccess, requirePermission } from "../rbac";
import { protectedProcedure, router } from "../_core/trpc";

const confirmationSchema = z.enum(["pending", "confirmed", "needs_review"]);
const transferSchema = z.enum(["not_transferred", "transferred"]);

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  return db;
}

const paymentInput = z.object({
  fiscalYearId: z.number().int().positive(),
  buildingName: z.string().trim().min(1).max(180),
  apartmentNumber: z.string().trim().min(1).max(80),
  tenantName: z.string().trim().min(1).max(180),
  paidAmount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "أدخل مبلغًا صحيحًا بمنازل عشرية لا تتجاوز منزلتين."),
  paymentDate: z.string().date(),
  contractNumber: z.string().trim().max(120).optional().nullable(),
  internalContractNumber: z.string().trim().max(120).optional().nullable(),
  paymentAccountNumber: z.string().trim().max(160).optional().nullable(),
  ownerConfirmation: confirmationSchema.default("pending"),
  ownerConfirmationDate: z.string().date().optional().nullable(),
  amlakiaReceiptNumber: z.string().trim().max(120).optional().nullable(),
  transferStatus: transferSchema.default("not_transferred"),
  notes: z.string().trim().max(4000).optional().nullable(),
  sourceSheet: z.string().trim().max(180).optional().nullable(),
  sourceRow: z.number().int().positive().optional().nullable(),
});

function asDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function fingerprint(input: z.infer<typeof paymentInput>) {
  return [input.fiscalYearId, input.buildingName, input.apartmentNumber, input.tenantName, input.paidAmount, input.paymentDate, input.contractNumber ?? "", input.internalContractNumber ?? ""].join("|").toLowerCase();
}

function validateWorkflow(input: Pick<z.infer<typeof paymentInput>, "ownerConfirmation" | "ownerConfirmationDate" | "transferStatus" | "amlakiaReceiptNumber">) {
  if (input.ownerConfirmation === "confirmed" && !input.ownerConfirmationDate) throw new TRPCError({ code: "BAD_REQUEST", message: "أدخل تاريخ تأكيد المالك." });
  if (input.transferStatus === "transferred" && input.ownerConfirmation !== "confirmed") throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن ترحيل السداد قبل تأكيد المالك." });
  if (input.transferStatus === "transferred" && !input.amlakiaReceiptNumber) throw new TRPCError({ code: "BAD_REQUEST", message: "أدخل رقم السند في نظام إملاكي قبل اعتماد الترحيل." });
}

export const rentFollowUpsRouter = router({
  list: protectedProcedure.input(z.object({
    fiscalYearId: z.number().int().positive(),
    buildingName: z.string().trim().optional(),
    ownerConfirmation: confirmationSchema.optional(),
    transferStatus: transferSchema.optional(),
    fromDate: z.string().date().optional(),
    toDate: z.string().date().optional(),
    search: z.string().trim().max(180).optional(),
  })).query(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_VIEW);
    await requireFiscalYearAccess(ctx.user, input.fiscalYearId);
    const db = await database();
    const conditions = [eq(rentPaymentFollowUps.fiscalYearId, input.fiscalYearId)];
    if (input.buildingName) conditions.push(eq(rentPaymentFollowUps.buildingName, input.buildingName));
    if (input.ownerConfirmation) conditions.push(eq(rentPaymentFollowUps.ownerConfirmation, input.ownerConfirmation));
    if (input.transferStatus) conditions.push(eq(rentPaymentFollowUps.transferStatus, input.transferStatus));
    if (input.fromDate) conditions.push(gte(rentPaymentFollowUps.paymentDate, asDate(input.fromDate)!));
    if (input.toDate) conditions.push(lte(rentPaymentFollowUps.paymentDate, asDate(input.toDate)!));
    if (input.search) {
      const query = `%${input.search}%`;
      conditions.push(or(like(rentPaymentFollowUps.tenantName, query), like(rentPaymentFollowUps.apartmentNumber, query), like(rentPaymentFollowUps.contractNumber, query), like(rentPaymentFollowUps.internalContractNumber, query), like(rentPaymentFollowUps.buildingName, query))!);
    }
    return db.select().from(rentPaymentFollowUps).where(and(...conditions)).orderBy(desc(rentPaymentFollowUps.paymentDate), desc(rentPaymentFollowUps.id));
  }),
  summary: protectedProcedure.input(z.object({ fiscalYearId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_VIEW);
    await requireFiscalYearAccess(ctx.user, input.fiscalYearId);
    const db = await database();
    const [totals] = await db.select({ totalRows: sql<number>`count(*)`, totalAmount: sql<string>`coalesce(sum(${rentPaymentFollowUps.paidAmount}), 0)`, pending: sql<number>`sum(${rentPaymentFollowUps.ownerConfirmation} = 'pending')`, confirmed: sql<number>`sum(${rentPaymentFollowUps.ownerConfirmation} = 'confirmed')`, needsReview: sql<number>`sum(${rentPaymentFollowUps.ownerConfirmation} = 'needs_review')`, notTransferred: sql<number>`sum(${rentPaymentFollowUps.transferStatus} = 'not_transferred')`, transferred: sql<number>`sum(${rentPaymentFollowUps.transferStatus} = 'transferred')` }).from(rentPaymentFollowUps).where(eq(rentPaymentFollowUps.fiscalYearId, input.fiscalYearId));
    return totals;
  }),
  create: protectedProcedure.input(paymentInput).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_CREATE);
    await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true);
    validateWorkflow(input);
    const db = await database();
    const sourceFingerprint = fingerprint(input);
    const [existing] = await db.select({ id: rentPaymentFollowUps.id }).from(rentPaymentFollowUps).where(eq(rentPaymentFollowUps.sourceFingerprint, sourceFingerprint)).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "هذا السداد موجود مسبقًا وفق العمارة والشقة والمستأجر والمبلغ والتاريخ ورقم العقد." });
    const { paymentDate, ownerConfirmationDate, ...rest } = input;
    const result = await db.insert(rentPaymentFollowUps).values({ ...rest, paymentDate: asDate(paymentDate)!, ownerConfirmationDate: asDate(ownerConfirmationDate), sourceFingerprint, createdByUserId: ctx.user.id });
    return { id: Number(result[0].insertId) };
  }),
  update: protectedProcedure.input(paymentInput.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_UPDATE);
    await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true);
    validateWorkflow(input);
    const db = await database();
    const [existing] = await db.select().from(rentPaymentFollowUps).where(eq(rentPaymentFollowUps.id, input.id)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "سجل السداد غير موجود." });
    const { id, paymentDate, ownerConfirmationDate, ...changes } = input;
    await db.update(rentPaymentFollowUps).set({ ...changes, paymentDate: asDate(paymentDate)!, ownerConfirmationDate: asDate(ownerConfirmationDate), sourceFingerprint: fingerprint(input), updatedByUserId: ctx.user.id }).where(eq(rentPaymentFollowUps.id, id));
    return { success: true };
  }),
});
