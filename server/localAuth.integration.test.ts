import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { COOKIE_NAME } from "../shared/const";
import { employees, fiscalYears, loginActivity, roles, userFiscalYears, userRoles, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { getDb, getUserByOpenId } from "./db";
import { PERMISSIONS } from "./rbac";
import { appRouter } from "./routers";

const describeWithLiveData = ENV.databaseUrl && ENV.ownerOpenId ? describe : describe.skip;

type CookieCall = { name: string; value: string; options: Record<string, unknown> };

function contextFor(user: TrpcContext["user"], cookies: CookieCall[] = []): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }),
      clearCookie: (name: string, options: Record<string, unknown>) => cookies.push({ name, value: "", options }),
    } as TrpcContext["res"],
  };
}

function tokenFrom(cookies: CookieCall[]) {
  const cookie = cookies.find(item => item.name === COOKIE_NAME && item.value);
  expect(cookie?.value).toBeTruthy();
  return cookie!.value;
}

function requestWithToken(token: string) {
  return { headers: { cookie: `${COOKIE_NAME}=${token}` } } as Parameters<typeof sdk.authenticateRequest>[0];
}

describeWithLiveData("المصادقة المحلية — قبول تكاملي للحسابات والجلسات", () => {
  it("ينشئ حسابًا بلا بريد، ويثبت الدور والسنة والجلسة والرفض والقفل والإبطال", async () => {
    const db = await getDb();
    const owner = await getUserByOpenId(ENV.ownerOpenId);
    expect(db).toBeTruthy();
    expect(owner).toBeTruthy();
    if (!db || !owner) return;

    const [reviewerRole] = await db.select().from(roles).where(eq(roles.code, "reviewer")).limit(1);
    const [employeeRole] = await db.select().from(roles).where(eq(roles.code, "employee")).limit(1);
    const [fiscalYear] = await db.select({ id: fiscalYears.id }).from(fiscalYears).limit(1);
    expect(reviewerRole).toBeTruthy();
    expect(employeeRole).toBeTruthy();
    expect(fiscalYear).toBeTruthy();
    if (!reviewerRole || !employeeRole || !fiscalYear) return;

    const runId = nanoid(10).toLowerCase().replace(/[^a-z0-9]/g, "x");
    const username = `uat.local.${runId}`;
    const employeeUsername = `uat.employee.${runId}`;
    const initialPassword = "Pass#123";
    const changedPassword = "Next#456";
    const localUserIds: number[] = [];

    try {
      const ownerCaller = appRouter.createCaller(contextFor(owner));
      const ownerProfile = await ownerCaller.auth.me();
      expect(owner.loginMethod).not.toBe("local");
      expect(ownerProfile?.roles.some(role => role.code === "system_admin")).toBe(true);
      expect(ownerProfile?.permissions).toContain("*");

      const created = await ownerCaller.users.createLocal({
        name: `مراجع قبول محلي ${runId}`,
        username,
        password: initialPassword,
        roleIds: [reviewerRole.id],
        fiscalYearIds: [fiscalYear.id],
      });
      localUserIds.push(created.id);

      const [localUser] = await db.select().from(users).where(eq(users.id, created.id)).limit(1);
      expect(localUser).toMatchObject({ id: created.id, username, email: null, loginMethod: "local", isActive: true });
      expect(localUser?.passwordHash).toBeTruthy();
      expect(localUser?.passwordHash).not.toContain(initialPassword);

      const successfulCookies: CookieCall[] = [];
      const anonymousCaller = appRouter.createCaller(contextFor(null, successfulCookies));
      await expect(anonymousCaller.auth.localLogin({ username, password: initialPassword })).resolves.toEqual({ success: true });
      const firstToken = tokenFrom(successfulCookies);
      const firstSession = await sdk.verifySession(firstToken);
      expect(firstSession).toMatchObject({ openId: localUser!.openId, sessionVersion: localUser!.sessionVersion });

      const signedInUser = await sdk.authenticateRequest(requestWithToken(firstToken));
      expect(signedInUser.id).toBe(created.id);
      const reviewerCaller = appRouter.createCaller(contextFor(signedInUser));
      const reviewerProfile = await reviewerCaller.auth.me();
      expect(reviewerProfile).toMatchObject({ id: created.id, fiscalYearIds: [fiscalYear.id] });
      expect(reviewerProfile?.roles.some(role => role.code === "reviewer")).toBe(true);
      expect(reviewerProfile?.permissions).toContain(PERMISSIONS.REVIEWER_STATUS_CHANGE);
      await expect(reviewerCaller.users.list()).rejects.toMatchObject({ code: "FORBIDDEN" });

      const employeeCreated = await ownerCaller.users.createLocal({
        name: `موظف قبول محلي ${runId}`,
        username: employeeUsername,
        password: initialPassword,
        roleIds: [employeeRole.id],
        fiscalYearIds: [fiscalYear.id],
      });
      localUserIds.push(employeeCreated.id);
      const employeeCookies: CookieCall[] = [];
      await expect(appRouter.createCaller(contextFor(null, employeeCookies)).auth.localLogin({ username: employeeUsername, password: initialPassword })).resolves.toEqual({ success: true });
      const employeeSignedIn = await sdk.authenticateRequest(requestWithToken(tokenFrom(employeeCookies)));
      const employeeProfile = await appRouter.createCaller(contextFor(employeeSignedIn)).auth.me();
      expect(employeeProfile).toMatchObject({ id: employeeCreated.id, fiscalYearIds: [fiscalYear.id] });
      expect(employeeProfile?.roles.some(role => role.code === "employee")).toBe(true);
      await expect(appRouter.createCaller(contextFor(employeeSignedIn)).users.list()).rejects.toMatchObject({ code: "FORBIDDEN" });

      const logoutCookies: CookieCall[] = [];
      const logoutCaller = appRouter.createCaller(contextFor(signedInUser, logoutCookies));
      await expect(logoutCaller.auth.logout()).resolves.toEqual({ success: true });
      expect(logoutCookies).toEqual(expect.arrayContaining([expect.objectContaining({ name: COOKIE_NAME, value: "", options: expect.objectContaining({ maxAge: -1 }) })]));

      await ownerCaller.users.resetLocalPassword({ userId: created.id, password: changedPassword });
      await expect(sdk.authenticateRequest(requestWithToken(firstToken))).rejects.toThrow();
      await expect(appRouter.createCaller(contextFor(null)).auth.localLogin({ username, password: initialPassword })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      const changedCookies: CookieCall[] = [];
      await expect(appRouter.createCaller(contextFor(null, changedCookies)).auth.localLogin({ username, password: changedPassword })).resolves.toEqual({ success: true });
      const changedToken = tokenFrom(changedCookies);
      await expect(sdk.authenticateRequest(requestWithToken(changedToken))).resolves.toMatchObject({ id: created.id });

      await ownerCaller.users.setActive({ userId: created.id, isActive: false });
      await expect(sdk.authenticateRequest(requestWithToken(changedToken))).rejects.toThrow();
      await ownerCaller.users.setActive({ userId: created.id, isActive: true });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await expect(appRouter.createCaller(contextFor(null)).auth.localLogin({ username, password: "Incorrect-local-password!" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      }
      const [lockedUser] = await db.select().from(users).where(eq(users.id, created.id)).limit(1);
      expect(lockedUser?.failedLoginCount).toBe(0);
      expect(lockedUser?.loginLockedUntil && lockedUser.loginLockedUntil.getTime()).toBeGreaterThan(Date.now());
      await expect(appRouter.createCaller(contextFor(null)).auth.localLogin({ username, password: changedPassword })).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      const failedEvents = await db.select().from(loginActivity).where(eq(loginActivity.userId, created.id));
      expect(failedEvents.filter(event => event.event === "failed_login")).toHaveLength(7);
    } finally {
      for (const localUserId of localUserIds) {
        await db.delete(loginActivity).where(eq(loginActivity.userId, localUserId));
        await db.delete(employees).where(eq(employees.userId, localUserId));
        await db.delete(userFiscalYears).where(eq(userFiscalYears.userId, localUserId));
        await db.delete(userRoles).where(eq(userRoles.userId, localUserId));
        await db.delete(users).where(eq(users.id, localUserId));
      }
    }
  });
});
