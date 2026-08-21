import { asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { customFieldValues, customFields, employees, employeeStatuses, fiscalYears, operationTypes, operationTypeFields, reviewerStatuses, reviews, roles, userFiscalYears, userRoles, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { TrpcContext } from "./_core/context";
import { getDb, getUserByOpenId } from "./db";
import { appRouter } from "./routers";

const describeWithLiveData = ENV.databaseUrl && ENV.ownerOpenId ? describe : describe.skip;

function contextFor(user: NonNullable<Awaited<ReturnType<typeof getUserByOpenId>>>): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describeWithLiveData("custom field API behavior — temporary configuration is removed", () => {
  it("يفرض الإلزامية والنوع والمرجع والصلاحية ويحفظ ويسترجع القيمة الصحيحة", async () => {
    const db = await getDb();
    const owner = await getUserByOpenId(ENV.ownerOpenId);
    expect(db).toBeTruthy();
    expect(owner).toBeTruthy();
    if (!db || !owner) return;

    const [openYear] = await db.select().from(fiscalYears).where(eq(fiscalYears.status, "open")).limit(1);
    expect(openYear).toBeTruthy();
    if (!openYear) return;

    const runId = nanoid(10);
    const employeeOpenId = `qa-custom-employee-${runId}`;
    const keys = [`qa_required_number_${runId}`, `qa_employee_ref_${runId}`];
    let employeeUserId: number | undefined;
    let operationTypeId: number | undefined;
    let reviewId: number | undefined;
    let fieldIds: number[] = [];
    try {
      const [employeeRole] = await db.select().from(roles).where(eq(roles.code, "employee")).limit(1);
      expect(employeeRole).toBeTruthy();
      if (!employeeRole) return;
      await db.insert(users).values({ openId: employeeOpenId, name: `QA custom field employee ${runId}`, email: `${employeeOpenId}@example.invalid`, loginMethod: "integration-test", role: "user", isActive: true });
      const [temporaryUser] = await db.select().from(users).where(eq(users.openId, employeeOpenId)).limit(1);
      expect(temporaryUser).toBeTruthy();
      if (!temporaryUser) return;
      employeeUserId = temporaryUser.id;
      await db.insert(userRoles).values({ userId: temporaryUser.id, roleId: employeeRole.id, assignedByUserId: owner.id });
      await db.insert(userFiscalYears).values({ userId: temporaryUser.id, fiscalYearId: openYear.id });
      await db.insert(employees).values({ userId: temporaryUser.id, displayName: `QA custom field employee ${runId}`, isActive: true });

      const [baseReviewerStatus] = await db.select().from(reviewerStatuses).where(eq(reviewerStatuses.isActive, true)).orderBy(asc(reviewerStatuses.sortOrder)).limit(1);
      const [baseEmployeeStatus] = await db.select().from(employeeStatuses).where(eq(employeeStatuses.isActive, true)).orderBy(asc(employeeStatuses.sortOrder)).limit(1);
      expect(baseReviewerStatus).toBeTruthy();
      expect(baseEmployeeStatus).toBeTruthy();
      if (!baseReviewerStatus || !baseEmployeeStatus) return;
      const operationTypeInsert = await db.insert(operationTypes).values({ name: `QA custom fields ${runId}`, description: "نوع مؤقت لاختبار الحقول المخصصة", color: "#64748b", sortOrder: 9990 });
      operationTypeId = Number(operationTypeInsert[0].insertId);
      const reviewInsert = await db.insert(reviews).values({ internalRef: `QA-${Date.now()}-${runId}`, title: `QA custom field review ${runId}`, description: "مراجعة مؤقتة للاختبار", problem: null, requiredAction: null, fiscalYearId: openYear.id, operationTypeId, reviewerStatusId: baseReviewerStatus.id, employeeStatusId: baseEmployeeStatus.id, assignedEmployeeId: null, priority: "normal", dueDate: null, createdByUserId: owner.id });
      reviewId = Number(reviewInsert[0].insertId);
      const [review] = await db.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
      expect(review).toBeTruthy();
      if (!review) return;

      await db.insert(customFields).values([
        { key: keys[0], label: "QA required number", type: "number", isRequired: true, isActive: true, sortOrder: 9990 },
        { key: keys[1], label: "QA employee reference", type: "employee", isRequired: false, isActive: true, sortOrder: 9991 },
      ]);
      const fields = await db.select().from(customFields).where(inArray(customFields.key, keys));
      fieldIds = fields.map(field => field.id);
      expect(fieldIds).toHaveLength(2);
      const numberField = fields.find(field => field.key === keys[0])!;
      const employeeField = fields.find(field => field.key === keys[1])!;
      await db.insert(operationTypeFields).values(fieldIds.map((customFieldId, index) => ({ operationTypeId: review.operationTypeId, customFieldId, sortOrder: 9990 + index })));

      const ownerCaller = appRouter.createCaller(contextFor(owner));
      await expect(ownerCaller.customFields.values.set({ reviewId: review.id, values: [{ customFieldId: numberField.id, value: null }, { customFieldId: employeeField.id, value: null }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(ownerCaller.customFields.values.set({ reviewId: review.id, values: [{ customFieldId: numberField.id, value: "12" }, { customFieldId: employeeField.id, value: null }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(ownerCaller.customFields.values.set({ reviewId: review.id, values: [{ customFieldId: numberField.id, value: 12 }, { customFieldId: employeeField.id, value: 2_147_483_647 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(ownerCaller.customFields.values.set({ reviewId: review.id, values: [{ customFieldId: numberField.id, value: 12 }, { customFieldId: employeeField.id, value: null }] })).resolves.toEqual({ success: true });
      await expect(ownerCaller.customFields.values.list({ reviewId: review.id })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: numberField.id, value: 12 })]));
      await expect(appRouter.createCaller(contextFor(temporaryUser)).customFields.values.set({ reviewId: review.id, values: [{ customFieldId: numberField.id, value: 13 }, { customFieldId: employeeField.id, value: null }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      if (fieldIds.length) {
        await db.delete(customFieldValues).where(inArray(customFieldValues.customFieldId, fieldIds));
        await db.delete(operationTypeFields).where(inArray(operationTypeFields.customFieldId, fieldIds));
        await db.delete(customFields).where(inArray(customFields.id, fieldIds));
      }
      if (reviewId) await db.delete(reviews).where(eq(reviews.id, reviewId));
      if (operationTypeId) await db.delete(operationTypes).where(eq(operationTypes.id, operationTypeId));
      if (employeeUserId) {
        await db.delete(employees).where(eq(employees.userId, employeeUserId));
        await db.delete(users).where(eq(users.id, employeeUserId));
      }
    }
  });
});
