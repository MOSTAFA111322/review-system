import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { employees, fiscalYears, reviews, roles, userFiscalYears, userRoles, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { TrpcContext } from "./_core/context";
import { getDb, getUserByOpenId } from "./db";
import { appRouter } from "./routers";

const describeWithLiveData = ENV.databaseUrl && ENV.ownerOpenId ? describe : describe.skip;

function contextFor(user: NonNullable<Awaited<ReturnType<typeof getUserByOpenId>>>): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describeWithLiveData("live API role matrix — temporary identities are removed", () => {
  it("يفرض حدود مدير النظام والمدير والمراجع والموظف دون إنشاء أي مراجعة تجريبية", async () => {
    const db = await getDb();
    const owner = await getUserByOpenId(ENV.ownerOpenId);
    expect(db).toBeTruthy();
    expect(owner).toBeTruthy();
    if (!db || !owner) return;

    const [openYear] = await db.select().from(fiscalYears).where(eq(fiscalYears.status, "open")).limit(1);
    const [actualReview] = await db.select().from(reviews).where(and(eq(reviews.fiscalYearId, openYear.id), isNull(reviews.deletedAt))).orderBy(desc(reviews.createdAt)).limit(1);
    expect(openYear).toBeTruthy();
    expect(actualReview).toBeTruthy();
    if (!openYear || !actualReview) return;

    const runId = nanoid(10);
    const roleCodes = ["manager", "reviewer", "employee"] as const;
    const openIds = roleCodes.map(code => `qa-${code}-${runId}`);
    const createdIds: number[] = [];
    const existingYears = await db.select({ year: fiscalYears.year }).from(fiscalYears);
    const isolationYearNumber = Array.from({ length: 201 }, (_, index) => 2200 - index).find(year => !existingYears.some(existing => existing.year === year));
    let isolationYearId: number | undefined;

    try {
      expect(isolationYearNumber).toBeTruthy();
      if (!isolationYearNumber) return;
      await db.insert(fiscalYears).values({
        name: `QA isolation ${runId}`,
        year: isolationYearNumber,
        startDate: new Date("2099-01-01T00:00:00.000Z"),
        endDate: new Date("2099-12-31T00:00:00.000Z"),
        status: "open",
        isCurrent: false,
        createdByUserId: owner.id,
      });
      const [isolationYear] = await db.select().from(fiscalYears).where(eq(fiscalYears.year, isolationYearNumber)).limit(1);
      expect(isolationYear).toBeTruthy();
      if (!isolationYear) return;
      isolationYearId = isolationYear.id;
      await db.insert(users).values(roleCodes.map((code, index) => ({
        openId: openIds[index],
        name: `QA ${code} ${runId}`,
        email: `${code}-${runId}@example.invalid`,
        loginMethod: "integration-test",
        role: "user",
        isActive: true,
      })));
      const temporaryUsers = await db.select().from(users).where(inArray(users.openId, openIds));
      createdIds.push(...temporaryUsers.map(user => user.id));
      const roleRows = await db.select().from(roles).where(inArray(roles.code, [...roleCodes]));
      expect(temporaryUsers).toHaveLength(3);
      expect(roleRows).toHaveLength(3);

      await db.insert(userRoles).values(temporaryUsers.map(user => ({
        userId: user.id,
        roleId: roleRows.find(role => role.code === user.openId.split("-")[1])!.id,
        assignedByUserId: owner.id,
      })));
      await db.insert(userFiscalYears).values(temporaryUsers.map(user => ({ userId: user.id, fiscalYearId: openYear.id })));
      const employeeUser = temporaryUsers.find(user => user.openId.startsWith("qa-employee-"))!;
      await db.insert(employees).values({ userId: employeeUser.id, displayName: `QA employee ${runId}`, isActive: true });

      const byRole = new Map(temporaryUsers.map(user => [user.openId.split("-")[1], user]));
      const manager = appRouter.createCaller(contextFor(byRole.get("manager")!));
      const reviewer = appRouter.createCaller(contextFor(byRole.get("reviewer")!));
      const employee = appRouter.createCaller(contextFor(byRole.get("employee")!));
      const listInput = { fiscalYearId: openYear.id, page: 1, pageSize: 5, sortBy: "createdAt" as const, sortDirection: "desc" as const };

      await expect(appRouter.createCaller(contextFor(owner)).users.list()).resolves.toBeInstanceOf(Array);
      await expect(manager.reviews.list(listInput)).resolves.toMatchObject({ page: 1 });
      await expect(manager.reviews.list({ ...listInput, fiscalYearId: isolationYear.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(reviewer.reviews.formOptions({ fiscalYearId: openYear.id })).resolves.toMatchObject({ operationTypes: expect.any(Array) });
      await expect(employee.reviews.list(listInput)).resolves.toMatchObject({ items: [], total: 0 });
      await expect(employee.reviews.get({ id: actualReview.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(manager.users.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(reviewer.users.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(employee.reviews.formOptions({ fiscalYearId: openYear.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(reviewer.reviews.changeStatus({ id: actualReview.id, side: "employee", toStatusId: 2_147_483_647 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      if (isolationYearId) await db.delete(fiscalYears).where(eq(fiscalYears.id, isolationYearId));
      if (createdIds.length) {
        await db.delete(employees).where(inArray(employees.userId, createdIds));
        await db.delete(users).where(inArray(users.id, createdIds));
      }
    }
  });
});
