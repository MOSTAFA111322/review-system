import { and, desc, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { fiscalYears, reviews } from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { TrpcContext } from "./_core/context";
import { getDb, getUserByOpenId } from "./db";
import { appRouter } from "./routers";

const describeWithLiveData = ENV.databaseUrl && ENV.ownerOpenId ? describe : describe.skip;

function contextFor(user: NonNullable<Awaited<ReturnType<typeof getUserByOpenId>>>): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describeWithLiveData("live review API acceptance — read-only", () => {
  it("يعرض العملية الحقيقية ضمن سنتها مع تفاصيلها وسجل انتقال الحالة دون تعديلها", async () => {
    const db = await getDb();
    const owner = await getUserByOpenId(ENV.ownerOpenId);
    expect(db).toBeTruthy();
    expect(owner).toBeTruthy();
    if (!db || !owner) return;

    const [year] = await db.select().from(fiscalYears).where(eq(fiscalYears.status, "open")).limit(1);
    expect(year).toBeTruthy();
    if (!year) return;

    const caller = appRouter.createCaller(contextFor(owner));
    const visible = await caller.reviews.list({ fiscalYearId: year.id, page: 1, pageSize: 5, sortBy: "createdAt", sortDirection: "asc" });
    expect(visible.total).toBeGreaterThanOrEqual(1);
    const visibleId = visible.items[0]?.id;
    expect(visibleId).toBeTruthy();
    if (!visibleId) return;
    const [actualReview] = await db.select().from(reviews).where(and(eq(reviews.id, visibleId), eq(reviews.fiscalYearId, year.id), isNull(reviews.deletedAt), isNull(reviews.archivedAt), isNull(reviews.cancelledAt))).limit(1);
    expect(actualReview).toBeTruthy();
    if (!actualReview) return;

    const listed = await caller.reviews.list({
      fiscalYearId: year.id,
      page: 1,
      pageSize: 5,
      query: actualReview.internalRef,
      operationTypeIds: [actualReview.operationTypeId],
      reviewerStatusIds: [actualReview.reviewerStatusId],
      employeeStatusIds: [actualReview.employeeStatusId],
      priorities: [actualReview.priority],
      sortBy: "internalRef",
      sortDirection: "asc",
    });
    expect(listed.page).toBe(1);
    expect(listed.pageSize).toBe(5);
    expect(listed.total).toBeGreaterThanOrEqual(1);
    expect(listed.items.length).toBeLessThanOrEqual(5);
    expect(listed.items.some(item => item.id === actualReview.id)).toBe(true);
    expect(listed.items.every(item => item.id === actualReview.id || item.internalRef.includes(actualReview.internalRef))).toBe(true);
    expect(listed.items.every(item => item.operationTypeId === actualReview.operationTypeId && item.reviewerStatusId === actualReview.reviewerStatusId && item.employeeStatusId === actualReview.employeeStatusId && item.priority === actualReview.priority)).toBe(true);
    expect(listed.items.map(item => item.internalRef)).toEqual([...listed.items.map(item => item.internalRef)].sort((left, right) => left.localeCompare(right)));
    await expect(caller.reviews.list({ fiscalYearId: 999999999, page: 1, pageSize: 5, sortBy: "createdAt", sortDirection: "desc" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const detail = await caller.reviews.get({ id: actualReview.id });
    expect(detail.fiscalYearId).toBe(year.id);
    expect(detail.internalRef).toBe(actualReview.internalRef);

    const activity = await caller.activity.list({ reviewId: actualReview.id });
    expect(activity.some(event => event.action === "review.created")).toBe(true);
    const transitions = await caller.reviews.availableTransitions({ id: actualReview.id });
    expect([...transitions.reviewer, ...transitions.employee].length).toBeGreaterThan(0);

    await expect(
      caller.reviews.changeStatus({
        id: actualReview.id,
        side: "reviewer",
        toStatusId: 2_147_483_647,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  }, 30_000);
});
