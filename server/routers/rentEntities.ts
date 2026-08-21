import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { rentBuildings, rentContracts, rentPaymentFollowUps, rentUnits } from "../../drizzle/schema";
import { getDb } from "../db";
import { PERMISSIONS, requireFiscalYearAccess, requirePermission } from "../rbac";
import { protectedProcedure, router } from "../_core/trpc";

const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();
const buildingInput = z.object({ fiscalYearId: z.number().int().positive(), name: z.string().trim().min(1).max(180), code: nullableText(80), address: nullableText(300), notes: nullableText(4000) });
const unitInput = z.object({ fiscalYearId: z.number().int().positive(), buildingId: z.number().int().positive(), unitNumber: z.string().trim().min(1).max(80), tenantName: nullableText(180), paymentAccountNumber: nullableText(160), notes: nullableText(4000) });
const contractInput = z.object({ fiscalYearId: z.number().int().positive(), unitId: z.number().int().positive(), externalContractNumber: nullableText(120), internalContractNumber: nullableText(120), tenantName: nullableText(180), startDate: z.string().date().optional().nullable(), endDate: z.string().date().optional().nullable(), notes: nullableText(4000) });
const idInput = z.object({ id: z.number().int().positive() });

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  return db;
}
function asDate(value: string | null | undefined) { return value ? new Date(`${value}T00:00:00.000Z`) : null; }

async function getBuilding(db: Awaited<ReturnType<typeof database>>, id: number, fiscalYearId: number) {
  const [building] = await db.select().from(rentBuildings).where(and(eq(rentBuildings.id, id), eq(rentBuildings.fiscalYearId, fiscalYearId))).limit(1);
  if (!building) throw new TRPCError({ code: "NOT_FOUND", message: "العمارة غير موجودة ضمن السنة المالية المحددة." });
  return building;
}
async function getUnit(db: Awaited<ReturnType<typeof database>>, id: number, fiscalYearId: number) {
  const [unit] = await db.select({ unit: rentUnits, building: rentBuildings }).from(rentUnits).innerJoin(rentBuildings, eq(rentUnits.buildingId, rentBuildings.id)).where(and(eq(rentUnits.id, id), eq(rentBuildings.fiscalYearId, fiscalYearId))).limit(1);
  if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "الوحدة غير موجودة ضمن السنة المالية المحددة." });
  return unit;
}

export const rentEntitiesRouter = router({
  buildings: router({
    list: protectedProcedure.input(z.object({ fiscalYearId: z.number().int().positive(), includeInactive: z.boolean().default(false) })).query(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_VIEW); await requireFiscalYearAccess(ctx.user, input.fiscalYearId);
      const db = await database();
      return db.select().from(rentBuildings).where(and(eq(rentBuildings.fiscalYearId, input.fiscalYearId), ...(input.includeInactive ? [] : [eq(rentBuildings.isActive, true)]))).orderBy(asc(rentBuildings.name));
    }),
    create: protectedProcedure.input(buildingInput).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_CREATE); await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true);
      const db = await database(); const [existing] = await db.select({ id: rentBuildings.id }).from(rentBuildings).where(and(eq(rentBuildings.fiscalYearId, input.fiscalYearId), eq(rentBuildings.name, input.name))).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "اسم العمارة موجود مسبقًا في هذه السنة المالية." });
      const result = await db.insert(rentBuildings).values({ ...input, createdByUserId: ctx.user.id }); return { id: Number(result[0].insertId) };
    }),
    update: protectedProcedure.input(buildingInput.merge(idInput)).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_UPDATE); await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true);
      const db = await database(); await getBuilding(db, input.id, input.fiscalYearId);
      const [duplicate] = await db.select({ id: rentBuildings.id }).from(rentBuildings).where(and(eq(rentBuildings.fiscalYearId, input.fiscalYearId), eq(rentBuildings.name, input.name), sql`${rentBuildings.id} <> ${input.id}`)).limit(1);
      if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "اسم العمارة مستخدم مسبقًا في هذه السنة المالية." });
      const { id, fiscalYearId, ...changes } = input; await db.update(rentBuildings).set(changes).where(eq(rentBuildings.id, id)); return { success: true };
    }),
    setActive: protectedProcedure.input(idInput.merge(z.object({ fiscalYearId: z.number().int().positive(), isActive: z.boolean() }))).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_UPDATE); await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true); const db = await database(); await getBuilding(db, input.id, input.fiscalYearId); await db.update(rentBuildings).set({ isActive: input.isActive }).where(eq(rentBuildings.id, input.id)); return { success: true };
    }),
  }),
  units: router({
    list: protectedProcedure.input(z.object({ fiscalYearId: z.number().int().positive(), buildingId: z.number().int().positive(), includeInactive: z.boolean().default(false) })).query(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_VIEW); await requireFiscalYearAccess(ctx.user, input.fiscalYearId); const db = await database(); await getBuilding(db, input.buildingId, input.fiscalYearId);
      return db.select().from(rentUnits).where(and(eq(rentUnits.buildingId, input.buildingId), ...(input.includeInactive ? [] : [eq(rentUnits.isActive, true)]))).orderBy(asc(rentUnits.unitNumber));
    }),
    create: protectedProcedure.input(unitInput).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_CREATE); await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true); const db = await database(); await getBuilding(db, input.buildingId, input.fiscalYearId);
      const [existing] = await db.select({ id: rentUnits.id }).from(rentUnits).where(and(eq(rentUnits.buildingId, input.buildingId), eq(rentUnits.unitNumber, input.unitNumber))).limit(1); if (existing) throw new TRPCError({ code: "CONFLICT", message: "رقم الوحدة موجود مسبقًا في هذه العمارة." });
      const { fiscalYearId, ...values } = input; const result = await db.insert(rentUnits).values({ ...values, createdByUserId: ctx.user.id }); return { id: Number(result[0].insertId) };
    }),
    update: protectedProcedure.input(unitInput.merge(idInput)).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_UPDATE); await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true); const db = await database(); await getUnit(db, input.id, input.fiscalYearId);
      await getBuilding(db, input.buildingId, input.fiscalYearId); const [duplicate] = await db.select({ id: rentUnits.id }).from(rentUnits).where(and(eq(rentUnits.buildingId, input.buildingId), eq(rentUnits.unitNumber, input.unitNumber), sql`${rentUnits.id} <> ${input.id}`)).limit(1); if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "رقم الوحدة مستخدم مسبقًا في هذه العمارة." });
      const { id, fiscalYearId, ...changes } = input; await db.update(rentUnits).set(changes).where(eq(rentUnits.id, id)); return { success: true };
    }),
    setActive: protectedProcedure.input(idInput.merge(z.object({ fiscalYearId: z.number().int().positive(), isActive: z.boolean() }))).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_UPDATE); await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true); const db = await database(); await getUnit(db, input.id, input.fiscalYearId); await db.update(rentUnits).set({ isActive: input.isActive }).where(eq(rentUnits.id, input.id)); return { success: true };
    }),
  }),
  contracts: router({
    list: protectedProcedure.input(z.object({ fiscalYearId: z.number().int().positive(), unitId: z.number().int().positive().optional(), includeInactive: z.boolean().default(false) })).query(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_VIEW); await requireFiscalYearAccess(ctx.user, input.fiscalYearId); const db = await database();
      const conditions = [eq(rentContracts.fiscalYearId, input.fiscalYearId), ...(input.includeInactive ? [] : [eq(rentContracts.isActive, true)])]; if (input.unitId) { await getUnit(db, input.unitId, input.fiscalYearId); conditions.push(eq(rentContracts.unitId, input.unitId)); }
      return db.select({ id: rentContracts.id, fiscalYearId: rentContracts.fiscalYearId, unitId: rentContracts.unitId, externalContractNumber: rentContracts.externalContractNumber, internalContractNumber: rentContracts.internalContractNumber, tenantName: rentContracts.tenantName, startDate: rentContracts.startDate, endDate: rentContracts.endDate, notes: rentContracts.notes, isActive: rentContracts.isActive, createdByUserId: rentContracts.createdByUserId, createdAt: rentContracts.createdAt, updatedAt: rentContracts.updatedAt, buildingName: rentBuildings.name, unitNumber: rentUnits.unitNumber }).from(rentContracts).innerJoin(rentUnits, eq(rentContracts.unitId, rentUnits.id)).innerJoin(rentBuildings, eq(rentUnits.buildingId, rentBuildings.id)).where(and(...conditions)).orderBy(asc(rentContracts.internalContractNumber));
    }),
    create: protectedProcedure.input(contractInput).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_CREATE); await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true); const db = await database(); await getUnit(db, input.unitId, input.fiscalYearId);
      if (input.internalContractNumber) { const [existing] = await db.select({ id: rentContracts.id }).from(rentContracts).where(and(eq(rentContracts.fiscalYearId, input.fiscalYearId), eq(rentContracts.unitId, input.unitId), eq(rentContracts.internalContractNumber, input.internalContractNumber))).limit(1); if (existing) throw new TRPCError({ code: "CONFLICT", message: "رقم العقد الداخلي مكرر لهذه الوحدة في السنة المالية." }); }
      const { fiscalYearId, startDate, endDate, ...values } = input; const result = await db.insert(rentContracts).values({ ...values, startDate: asDate(startDate), endDate: asDate(endDate), fiscalYearId, createdByUserId: ctx.user.id }); return { id: Number(result[0].insertId) };
    }),
    update: protectedProcedure.input(contractInput.merge(idInput)).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_UPDATE); await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true); const db = await database(); const [existing] = await db.select().from(rentContracts).where(and(eq(rentContracts.id, input.id), eq(rentContracts.fiscalYearId, input.fiscalYearId))).limit(1); if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "العقد غير موجود ضمن السنة المالية المحددة." }); await getUnit(db, input.unitId, input.fiscalYearId);
      if (input.internalContractNumber) { const [duplicate] = await db.select({ id: rentContracts.id }).from(rentContracts).where(and(eq(rentContracts.fiscalYearId, input.fiscalYearId), eq(rentContracts.unitId, input.unitId), eq(rentContracts.internalContractNumber, input.internalContractNumber), sql`${rentContracts.id} <> ${input.id}`)).limit(1); if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "رقم العقد الداخلي مكرر لهذه الوحدة في السنة المالية." }); }
      const { id, startDate, endDate, ...changes } = input; await db.update(rentContracts).set({ ...changes, startDate: asDate(startDate), endDate: asDate(endDate) }).where(eq(rentContracts.id, id)); return { success: true };
    }),
    setActive: protectedProcedure.input(idInput.merge(z.object({ fiscalYearId: z.number().int().positive(), isActive: z.boolean() }))).mutation(async ({ ctx, input }) => {
      await requirePermission(ctx.user, PERMISSIONS.RENT_FOLLOWUPS_UPDATE); await requireFiscalYearAccess(ctx.user, input.fiscalYearId, true); const db = await database(); const [existing] = await db.select({ id: rentContracts.id }).from(rentContracts).where(and(eq(rentContracts.id, input.id), eq(rentContracts.fiscalYearId, input.fiscalYearId))).limit(1); if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "العقد غير موجود ضمن السنة المالية المحددة." }); await db.update(rentContracts).set({ isActive: input.isActive }).where(eq(rentContracts.id, input.id)); return { success: true };
    }),
  }),
});
