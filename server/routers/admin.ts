import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { employees, fiscalYears, permissions, rolePermissions, roles, userFiscalYears, userRoles, users } from "../../drizzle/schema";
import { ensureInitialFiscalYear, ensureInitialWorkflowConfiguration, ensureSystemConfiguration, getRoleByCode } from "../bootstrap";
import { getDb } from "../db";
import { hashLocalPassword, normalizeLocalUsername } from "../localAuth";
import { PERMISSIONS, requirePermission } from "../rbac";
import { protectedProcedure, router } from "../_core/trpc";

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
  return db;
}

export const setupRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const db = await database();
    const [roleCount] = await db.select({ count: roles.id }).from(roles);
    return { isPlatformAdmin: ctx.user.role === "admin", configured: Boolean(roleCount?.count) };
  }),
  bootstrap: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "تهيئة النظام الأولية متاحة لمدير النظام فقط." });
    await ensureSystemConfiguration();
    await ensureInitialFiscalYear(ctx.user.id);
    await ensureInitialWorkflowConfiguration();
    const systemAdmin = await getRoleByCode("system_admin");
    const db = await database();
    if (systemAdmin) {
      await db.insert(userRoles).values({ userId: ctx.user.id, roleId: systemAdmin.id, assignedByUserId: ctx.user.id }).onDuplicateKeyUpdate({ set: { roleId: systemAdmin.id } });
    }
    return { success: true };
  }),
});

export const usersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx.user, PERMISSIONS.USERS_MANAGE);
    const db = await database();
    const records = await db.select({ id: users.id, name: users.name, email: users.email, username: users.username, loginMethod: users.loginMethod, hasLocalPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`, isActive: users.isActive, lastSignedIn: users.lastSignedIn, platformRole: users.role }).from(users);
    const assignedRoles = await db.select({ userId: userRoles.userId, roleName: roles.name, roleCode: roles.code }).from(userRoles).innerJoin(roles, eq(userRoles.roleId, roles.id));
    const byUser = new Map<number, { name: string; code: string }[]>();
    for (const role of assignedRoles) byUser.set(role.userId, [...(byUser.get(role.userId) ?? []), { name: role.roleName, code: role.roleCode }]);
    return records.map(user => ({ ...user, roles: byUser.get(user.id) ?? [] }));
  }),
  setActive: protectedProcedure.input(z.object({ userId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.USERS_MANAGE);
    if (input.userId === ctx.user.id && !input.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك تعطيل حسابك الحالي." });
    const db = await database();
    await db.update(users).set({ isActive: input.isActive, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, input.userId));
    return { success: true };
  }),
  accessOptions: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx.user, PERMISSIONS.USERS_MANAGE);
    const db = await database();
    const [availableRoles, availableFiscalYears] = await Promise.all([
      db.select({ id: roles.id, code: roles.code, name: roles.name }).from(roles).where(eq(roles.isActive, true)),
      db.select({ id: fiscalYears.id, name: fiscalYears.name, year: fiscalYears.year, status: fiscalYears.status }).from(fiscalYears),
    ]);
    return { roles: availableRoles, fiscalYears: availableFiscalYears };
  }),
  createLocal: protectedProcedure.input(z.object({
    name: z.string().trim().min(2).max(180),
    username: z.string().trim().regex(/^[A-Za-z0-9\u0600-\u06FF._-]{3,64}$/, "اسم المستخدم يجب أن يتكون من أحرف أو أرقام أو النقطة أو الشرطة فقط.") ,
    password: z.string().min(8, "كلمة المرور يجب أن تتكون من 8 أحرف على الأقل.").max(128),
    roleIds: z.array(z.number().int().positive()).max(8).default([]),
    fiscalYearIds: z.array(z.number().int().positive()).max(50).default([]),
  })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.USERS_MANAGE);
    const db = await database();
    const username = normalizeLocalUsername(input.username);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم مستخدم بالفعل." });
    const [selectedRoles, selectedFiscalYears] = await Promise.all([
      input.roleIds.length ? db.select({ id: roles.id, code: roles.code }).from(roles).where(and(inArray(roles.id, input.roleIds), eq(roles.isActive, true))) : Promise.resolve([]),
      input.fiscalYearIds.length ? db.select({ id: fiscalYears.id }).from(fiscalYears).where(inArray(fiscalYears.id, input.fiscalYearIds)) : Promise.resolve([]),
    ]);
    if (selectedRoles.length !== input.roleIds.length || selectedFiscalYears.length !== input.fiscalYearIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "تتضمن الحسابات المختارة دورًا أو سنة مالية غير صالحة." });
    const passwordHash = await hashLocalPassword(input.password);
    const now = new Date();
    const result = await db.transaction(async tx => {
      const inserted = await tx.insert(users).values({ openId: `local_${crypto.randomUUID()}`, name: input.name, username, passwordHash, passwordChangedAt: now, loginMethod: "local", lastSignedIn: now });
      const userId = Number(inserted[0].insertId);
      if (input.roleIds.length) await tx.insert(userRoles).values(input.roleIds.map(roleId => ({ userId, roleId, assignedByUserId: ctx.user.id })));
      if (input.fiscalYearIds.length) await tx.insert(userFiscalYears).values(input.fiscalYearIds.map(fiscalYearId => ({ userId, fiscalYearId })));
      if (selectedRoles.some(role => role.code === "employee")) await tx.insert(employees).values({ userId, displayName: input.name });
      return { id: userId };
    });
    return result;
  }),
  resetLocalPassword: protectedProcedure.input(z.object({ userId: z.number().int().positive(), password: z.string().min(8, "كلمة المرور يجب أن تتكون من 8 أحرف على الأقل.").max(128) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.USERS_MANAGE);
    const db = await database();
    const [user] = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود." });
    if (!user.passwordHash) throw new TRPCError({ code: "BAD_REQUEST", message: "هذا الحساب يستخدم OAuth ولا يملك كلمة مرور محلية." });
    const passwordHash = await hashLocalPassword(input.password);
    await db.update(users).set({ passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, loginLockedUntil: null, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, user.id));
    return { success: true };
  }),
  renameLocalUsername: protectedProcedure.input(z.object({ userId: z.number().int().positive(), username: z.string().trim().regex(/^[A-Za-z0-9\u0600-\u06FF._-]{3,64}$/, "اسم المستخدم يجب أن يتكون من أحرف أو أرقام أو النقطة أو الشرطة فقط.") })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.USERS_MANAGE);
    const db = await database();
    const [user] = await db.select({ id: users.id, username: users.username, passwordHash: users.passwordHash, loginMethod: users.loginMethod }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "الحساب غير موجود." });
    if (!user.passwordHash || user.loginMethod !== "local") throw new TRPCError({ code: "BAD_REQUEST", message: "يمكن تعديل اسم مستخدم الحسابات المحلية فقط. حساب OAuth يُدار من منصة الدخول." });
    const username = normalizeLocalUsername(input.username);
    if (username === user.username) return { success: true, changed: false };
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    if (existing && existing.id !== user.id) throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم مستخدم بالفعل." });
    await db.update(users).set({ username, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, user.id));
    return { success: true, changed: true };
  }),
  setRoles: protectedProcedure.input(z.object({ userId: z.number().int().positive(), roleIds: z.array(z.number().int().positive()).max(8) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.USERS_MANAGE);
    const db = await database();
    const selected = input.roleIds.length ? await db.select({ id: roles.id }).from(roles).where(and(inArray(roles.id, input.roleIds), eq(roles.isActive, true))) : [];
    if (selected.length !== input.roleIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "تتضمن القائمة دورًا غير صالح أو معطلًا." });
    await db.transaction(async tx => {
      await tx.delete(userRoles).where(eq(userRoles.userId, input.userId));
      if (input.roleIds.length) await tx.insert(userRoles).values(input.roleIds.map(roleId => ({ userId: input.userId, roleId, assignedByUserId: ctx.user.id })));
    });
    return { success: true };
  }),
  setFiscalYears: protectedProcedure.input(z.object({ userId: z.number().int().positive(), fiscalYearIds: z.array(z.number().int().positive()).max(50) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.USERS_MANAGE);
    const db = await database();
    const selected = input.fiscalYearIds.length ? await db.select({ id: fiscalYears.id }).from(fiscalYears).where(inArray(fiscalYears.id, input.fiscalYearIds)) : [];
    if (selected.length !== input.fiscalYearIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "تتضمن القائمة سنة مالية غير صالحة." });
    await db.transaction(async tx => {
      await tx.delete(userFiscalYears).where(eq(userFiscalYears.userId, input.userId));
      if (input.fiscalYearIds.length) await tx.insert(userFiscalYears).values(input.fiscalYearIds.map(fiscalYearId => ({ userId: input.userId, fiscalYearId })));
    });
    return { success: true };
  }),
});

export const rolesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx.user, PERMISSIONS.ROLES_MANAGE);
    const db = await database();
    const roleRows = await db.select().from(roles);
    const links = await db.select({ roleId: rolePermissions.roleId, permissionId: rolePermissions.permissionId }).from(rolePermissions);
    return roleRows.map(role => ({ ...role, permissionIds: links.filter(link => link.roleId === role.id).map(link => link.permissionId) }));
  }),
  permissions: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx.user, PERMISSIONS.ROLES_MANAGE);
    const db = await database();
    return db.select().from(permissions);
  }),
  setPermissions: protectedProcedure.input(z.object({ roleId: z.number().int().positive(), permissionIds: z.array(z.number().int().positive()).max(50) })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.ROLES_MANAGE);
    const db = await database();
    const [role] = await db.select().from(roles).where(eq(roles.id, input.roleId)).limit(1);
    if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "الدور غير موجود." });
    const selected = input.permissionIds.length ? await db.select({ id: permissions.id }).from(permissions).where(inArray(permissions.id, input.permissionIds)) : [];
    if (selected.length !== input.permissionIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "تتضمن القائمة صلاحية غير صالحة." });
    await db.transaction(async tx => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, input.roleId));
      if (input.permissionIds.length) await tx.insert(rolePermissions).values(input.permissionIds.map(permissionId => ({ roleId: input.roleId, permissionId })));
    });
    return { success: true };
  }),
});

export const employeesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requirePermission(ctx.user, PERMISSIONS.USERS_MANAGE);
    const db = await database();
    return db.select().from(employees).orderBy(employees.displayName);
  }),
  create: protectedProcedure.input(z.object({ displayName: z.string().trim().min(2).max(180), email: z.string().email().optional(), department: z.string().trim().max(160).optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.USERS_MANAGE);
    const db = await database();
    const result = await db.insert(employees).values(input);
    return { id: Number(result[0].insertId) };
  }),
  update: protectedProcedure.input(z.object({ id: z.number().int().positive(), displayName: z.string().trim().min(2).max(180).optional(), email: z.string().email().nullable().optional(), department: z.string().trim().max(160).nullable().optional(), isActive: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.USERS_MANAGE);
    const db = await database();
    const { id, ...changes } = input;
    await db.update(employees).set(changes).where(eq(employees.id, id));
    return { success: true };
  }),
});
