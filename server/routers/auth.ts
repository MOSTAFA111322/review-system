import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { loginActivity, permissions, rolePermissions, roles, userFiscalYears, userRoles, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { getSessionCookieOptions } from "../_core/cookies";
import { PERMISSIONS, requirePermission } from "../rbac";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

export const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const db = await getDb();
    if (!db) return { ...ctx.user, roles: [], permissions: [], fiscalYearIds: [] };

    const [roleRows, permissionRows, fiscalRows] = await Promise.all([
      db.select({ code: roles.code, name: roles.name }).from(userRoles).innerJoin(roles, and(eq(userRoles.roleId, roles.id), eq(roles.isActive, true))).where(eq(userRoles.userId, ctx.user.id)),
      db.select({ code: permissions.code }).from(userRoles).innerJoin(roles, and(eq(userRoles.roleId, roles.id), eq(roles.isActive, true))).innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id)).innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id)).where(eq(userRoles.userId, ctx.user.id)),
      db.select({ fiscalYearId: userFiscalYears.fiscalYearId }).from(userFiscalYears).where(eq(userFiscalYears.userId, ctx.user.id)),
    ]);

    const [recentLogin] = await db.select({ id: loginActivity.id }).from(loginActivity).where(and(eq(loginActivity.userId, ctx.user.id), eq(loginActivity.event, "login"), gte(loginActivity.createdAt, new Date(Date.now() - 30 * 60 * 1000)))).limit(1);
    if (!recentLogin) {
      const rawIp = ctx.req.headers["x-forwarded-for"];
      const rawAgent = ctx.req.headers["user-agent"];
      await db.insert(loginActivity).values({ userId: ctx.user.id, event: "login", ipAddress: Array.isArray(rawIp) ? rawIp[0] : rawIp?.split(",")[0]?.trim() ?? null, userAgent: Array.isArray(rawAgent) ? rawAgent[0] : rawAgent ?? null });
    }

    return {
      ...ctx.user,
      roles: ctx.user.role === "admin" ? [{ code: "system_admin", name: "مدير النظام" }, ...roleRows] : roleRows,
      permissions: ctx.user.role === "admin" ? ["*"] : Array.from(new Set(permissionRows.map(item => item.code))),
      fiscalYearIds: fiscalRows.map(item => item.fiscalYearId),
    };
  }),
  activity: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional()).query(async ({ ctx, input }) => {
    await requirePermission(ctx.user, PERMISSIONS.USERS_MANAGE);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });
    return db.select({ id: loginActivity.id, event: loginActivity.event, ipAddress: loginActivity.ipAddress, userAgent: loginActivity.userAgent, createdAt: loginActivity.createdAt, userId: users.id, userName: users.name, email: users.email }).from(loginActivity).innerJoin(users, eq(loginActivity.userId, users.id)).orderBy(desc(loginActivity.createdAt)).limit(input?.limit ?? 50);
  }),
  logout: publicProcedure.mutation(({ ctx }) => {
    if (ctx.user) {
      const rawIp = ctx.req.headers["x-forwarded-for"];
      const rawAgent = ctx.req.headers["user-agent"];
      void getDb().then(db => db?.insert(loginActivity).values({ userId: ctx.user!.id, event: "logout", ipAddress: Array.isArray(rawIp) ? rawIp[0] : rawIp?.split(",")[0]?.trim() ?? null, userAgent: Array.isArray(rawAgent) ? rawAgent[0] : rawAgent ?? null })).catch(error => console.warn("[Audit] تعذر تسجيل حدث الخروج:", error));
    }
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
});
