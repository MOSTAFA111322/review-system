import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { employeeStatuses, operationTypes, permissions, reviewerStatuses, statusTransitions } from "../../drizzle/schema";
import { getDb } from "../db";
import { PERMISSIONS, requirePermission } from "../rbac";
import { protectedProcedure, router } from "../_core/trpc";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#64748b");
const sortOrder = z.number().int().min(0).max(10000).default(0);
const identifier = z.string().trim().min(2).max(64).regex(/^[a-z0-9_]+$/);

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  return db;
}

async function requireSettingsPermission(user: Parameters<typeof requirePermission>[0]) {
  await requirePermission(user, PERMISSIONS.SETTINGS_MANAGE);
}

const operationTypesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    return db.select().from(operationTypes).orderBy(asc(operationTypes.sortOrder), asc(operationTypes.name));
  }),
  create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(140), description: z.string().trim().max(5000).optional(), color, sortOrder })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    const result = await db.insert(operationTypes).values(input);
    return { id: Number(result[0].insertId) };
  }),
  update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(140), description: z.string().trim().max(5000).nullable(), color, sortOrder, isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(operationTypes).set(input).where(eq(operationTypes.id, input.id));
    return { success: true };
  }),
  setActive: protectedProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(operationTypes).set({ isActive: input.isActive }).where(eq(operationTypes.id, input.id));
    return { success: true };
  }),
});

const reviewerStatusesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    return db.select().from(reviewerStatuses).orderBy(asc(reviewerStatuses.sortOrder), asc(reviewerStatuses.name));
  }),
  create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120), code: identifier, color, isTerminal: z.boolean().default(false), sortOrder })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    const result = await db.insert(reviewerStatuses).values(input);
    return { id: Number(result[0].insertId) };
  }),
  update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(120), code: identifier, color, isTerminal: z.boolean(), sortOrder, isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(reviewerStatuses).set(input).where(eq(reviewerStatuses.id, input.id));
    return { success: true };
  }),
  setActive: protectedProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(reviewerStatuses).set({ isActive: input.isActive }).where(eq(reviewerStatuses.id, input.id));
    return { success: true };
  }),
});

const employeeStatusesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    return db.select().from(employeeStatuses).orderBy(asc(employeeStatuses.sortOrder), asc(employeeStatuses.name));
  }),
  create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120), code: identifier, color, isTerminal: z.boolean().default(false), sortOrder })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    const result = await db.insert(employeeStatuses).values(input);
    return { id: Number(result[0].insertId) };
  }),
  update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(120), code: identifier, color, isTerminal: z.boolean(), sortOrder, isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(employeeStatuses).set(input).where(eq(employeeStatuses.id, input.id));
    return { success: true };
  }),
  setActive: protectedProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(employeeStatuses).set({ isActive: input.isActive }).where(eq(employeeStatuses.id, input.id));
    return { success: true };
  }),
});

export const transitionInput = z.object({ side: z.enum(["reviewer", "employee"]), fromStatusId: z.number().int().positive(), toStatusId: z.number().int().positive(), requiredPermission: z.string().min(3).max(100) });

const transitionsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    return db.select().from(statusTransitions).orderBy(asc(statusTransitions.side), asc(statusTransitions.id));
  }),
  permissionOptions: protectedProcedure.query(async ({ ctx }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    return db.select({ code: permissions.code, name: permissions.name, group: permissions.group }).from(permissions).orderBy(asc(permissions.group), asc(permissions.name));
  }),
  create: protectedProcedure.input(transitionInput).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    const [permission] = await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.code, input.requiredPermission)).limit(1);
    if (!permission) throw new TRPCError({ code: "BAD_REQUEST", message: "الصلاحية المطلوبة غير موجودة." });
    if (input.side === "reviewer") {
      const [from, to] = await Promise.all([
        db.select({ id: reviewerStatuses.id }).from(reviewerStatuses).where(eq(reviewerStatuses.id, input.fromStatusId)).limit(1),
        db.select({ id: reviewerStatuses.id }).from(reviewerStatuses).where(eq(reviewerStatuses.id, input.toStatusId)).limit(1),
      ]);
      if (!from.length || !to.length) throw new TRPCError({ code: "BAD_REQUEST", message: "حالة المراجع غير صالحة." });
      const result = await db.insert(statusTransitions).values({ side: input.side, fromReviewerStatusId: input.fromStatusId, toReviewerStatusId: input.toStatusId, requiredPermission: input.requiredPermission });
      return { id: Number(result[0].insertId) };
    }
    const [from, to] = await Promise.all([
      db.select({ id: employeeStatuses.id }).from(employeeStatuses).where(eq(employeeStatuses.id, input.fromStatusId)).limit(1),
      db.select({ id: employeeStatuses.id }).from(employeeStatuses).where(eq(employeeStatuses.id, input.toStatusId)).limit(1),
    ]);
    if (!from.length || !to.length) throw new TRPCError({ code: "BAD_REQUEST", message: "حالة الموظف غير صالحة." });
    const result = await db.insert(statusTransitions).values({ side: input.side, fromEmployeeStatusId: input.fromStatusId, toEmployeeStatusId: input.toStatusId, requiredPermission: input.requiredPermission });
    return { id: Number(result[0].insertId) };
  }),
  setActive: protectedProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    await db.update(statusTransitions).set({ isActive: input.isActive }).where(eq(statusTransitions.id, input.id));
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({ id: z.number().int().positive(), requiredPermission: z.string().min(3).max(100), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSettingsPermission(ctx.user);
    const db = await database();
    const [permission] = await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.code, input.requiredPermission)).limit(1);
    if (!permission) throw new TRPCError({ code: "BAD_REQUEST", message: "الصلاحية المطلوبة غير موجودة." });
    await db.update(statusTransitions).set({ requiredPermission: input.requiredPermission, isActive: input.isActive }).where(eq(statusTransitions.id, input.id));
    return { success: true };
  }),
});

export const settingsRouter = router({
  operationTypes: operationTypesRouter,
  reviewerStatuses: reviewerStatusesRouter,
  employeeStatuses: employeeStatusesRouter,
  transitions: transitionsRouter,
});
