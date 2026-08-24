import { and, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import {
  attachments,
  customFieldOptions,
  customFields,
  customFieldValues,
  employeeStatuses,
  employees,
  fiscalYears,
  loginActivity,
  notifications,
  operationTypeFields,
  operationTypes,
  reviewActivityLog,
  reviewComments,
  reviews,
  reviewerStatuses,
  roles,
  statusTransitions,
  userFiscalYears,
  userRoles,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { TrpcContext } from "./_core/context";
import { getDb, getUserByOpenId } from "./db";
import { PERMISSIONS } from "./rbac";
import { appRouter } from "./routers";

const describeWithLiveData = ENV.databaseUrl && ENV.ownerOpenId ? describe : describe.skip;

function contextFor(user: NonNullable<Awaited<ReturnType<typeof getUserByOpenId>>>): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describeWithLiveData("UAT final — temporary workflow data is completely removed", () => {
  it("ينفذ دورة مراجعة حقيقية عبر API ويثبت العزل والحالات والحقول والفلاتر والتحليلات", async () => {
    const db = await getDb();
    const owner = await getUserByOpenId(ENV.ownerOpenId);
    expect(db).toBeTruthy();
    expect(owner).toBeTruthy();
    if (!db || !owner) return;
    const runId = nanoid(8).toLowerCase().replace(/[^a-z0-9]/g, "x");
    const existingYears = await db.select({ year: fiscalYears.year }).from(fiscalYears);
    const availableYears = Array.from({ length: 100 }, (_, index) => 2100 + index).filter(year => !existingYears.some(item => item.year === year));
    const [yearOne, yearTwo] = availableYears;
    expect(yearOne).toBeTruthy();
    expect(yearTwo).toBeTruthy();
    if (!yearOne || !yearTwo) return;

    const openIds = ["manager", "reviewer", "employee", "outsider"].map(role => `uat-${role}-${runId}`);
    const createdReviewIds: number[] = [];
    const createdUserIds: number[] = [];
    const createdEmployeeIds: number[] = [];
    const createdOperationTypeIds: number[] = [];
    const createdReviewerStatusIds: number[] = [];
    const createdEmployeeStatusIds: number[] = [];
    const createdTransitionIds: number[] = [];
    const createdFieldIds: number[] = [];
    const createdYearIds: number[] = [];
    const createdAttachmentIds: number[] = [];

    try {
      const ownerCaller = appRouter.createCaller(contextFor(owner));
      const firstYear = await ownerCaller.fiscalYears.create({ name: `UAT ${yearOne}`, year: yearOne, startDate: `${yearOne}-01-01`, endDate: `${yearOne}-12-31`, makeCurrent: false });
      const secondYear = await ownerCaller.fiscalYears.create({ name: `UAT ${yearTwo}`, year: yearTwo, startDate: `${yearTwo}-01-01`, endDate: `${yearTwo}-12-31`, makeCurrent: false });
      createdYearIds.push(firstYear.id, secondYear.id);
  
      const typeNames = ["قبض", "صرف", "قيد يومية", "مشتريات", "مبيعات", "تكليف", "مرتجع"].map(name => `UAT ${name} ${runId}`);
      for (const [index, name] of typeNames.entries()) {
        const type = await ownerCaller.settings.operationTypes.create({ name, description: "بيانات قبول مؤقتة", color: "#2563eb", sortOrder: 9000 + index });
        createdOperationTypeIds.push(type.id);
      }
      const purchasesTypeId = createdOperationTypeIds[3];
      const refundTypeId = createdOperationTypeIds[6];

      const reviewerOpen = await ownerCaller.settings.reviewerStatuses.create({ name: `UAT مراجع جديد ${runId}`, code: `uat_r_open_${runId}`, color: "#2563eb", isTerminal: false, sortOrder: 9000 });
      const reviewerDone = await ownerCaller.settings.reviewerStatuses.create({ name: `UAT مراجع منتهٍ ${runId}`, code: `uat_r_done_${runId}`, color: "#16a34a", isTerminal: true, sortOrder: 9001 });
      const employeeOpen = await ownerCaller.settings.employeeStatuses.create({ name: `UAT موظف جديد ${runId}`, code: `uat_e_open_${runId}`, color: "#d97706", isTerminal: false, sortOrder: 9000 });
      const employeeDone = await ownerCaller.settings.employeeStatuses.create({ name: `UAT موظف منتهٍ ${runId}`, code: `uat_e_done_${runId}`, color: "#16a34a", isTerminal: true, sortOrder: 9001 });
      createdReviewerStatusIds.push(reviewerOpen.id, reviewerDone.id);
      createdEmployeeStatusIds.push(employeeOpen.id, employeeDone.id);
      const reviewerTransition = await ownerCaller.settings.transitions.create({ side: "reviewer", fromStatusId: reviewerOpen.id, toStatusId: reviewerDone.id, requiredPermission: PERMISSIONS.REVIEWER_STATUS_CHANGE });
      const employeeTransition = await ownerCaller.settings.transitions.create({ side: "employee", fromStatusId: employeeOpen.id, toStatusId: employeeDone.id, requiredPermission: PERMISSIONS.EMPLOYEE_STATUS_CHANGE });
      createdTransitionIds.push(reviewerTransition.id, employeeTransition.id);

      await db.insert(users).values(openIds.map((openId, index) => ({ openId, name: `UAT ${["Manager", "Reviewer", "Employee", "Outsider"][index]} ${runId}`, email: `${openId}@example.invalid`, loginMethod: "uat", role: "user", isActive: true })));
      const temporaryUsers = await db.select().from(users).where(inArray(users.openId, openIds));
        expect(temporaryUsers).toHaveLength(4);
      createdUserIds.push(...temporaryUsers.map(user => user.id));
      const [managerRole, reviewerRole, employeeRole] = await Promise.all([
        db.select().from(roles).where(eq(roles.code, "manager")).limit(1),
        db.select().from(roles).where(eq(roles.code, "reviewer")).limit(1),
        db.select().from(roles).where(eq(roles.code, "employee")).limit(1),
      ]);
      expect(managerRole[0]).toBeTruthy();
      expect(reviewerRole[0]).toBeTruthy();
      expect(employeeRole[0]).toBeTruthy();
      if (!managerRole[0] || !reviewerRole[0] || !employeeRole[0]) return;
      const byRole = new Map(temporaryUsers.map(user => [user.openId.split("-")[1], user]));
      const managerUser = byRole.get("manager")!;
      const reviewerUser = byRole.get("reviewer")!;
      const employeeUser = byRole.get("employee")!;
      const outsiderUser = byRole.get("outsider")!;
      await db.insert(userRoles).values([
        { userId: managerUser.id, roleId: managerRole[0].id, assignedByUserId: owner.id },
        { userId: reviewerUser.id, roleId: reviewerRole[0].id, assignedByUserId: owner.id },
        { userId: employeeUser.id, roleId: employeeRole[0].id, assignedByUserId: owner.id },
        { userId: outsiderUser.id, roleId: employeeRole[0].id, assignedByUserId: owner.id },
      ]);
      await db.insert(userFiscalYears).values([managerUser, reviewerUser, employeeUser, outsiderUser].map(user => ({ userId: user.id, fiscalYearId: firstYear.id })));
      await db.insert(employees).values([
        { userId: employeeUser.id, displayName: `UAT موظف مكلف ${runId}`, department: "QA", isActive: true },
        { userId: outsiderUser.id, displayName: `UAT موظف غير مكلف ${runId}`, department: "QA", isActive: true },
      ]);
      const employeeRows = await db.select().from(employees).where(inArray(employees.userId, [employeeUser.id, outsiderUser.id]));
      createdEmployeeIds.push(...employeeRows.map(row => row.id));
      const assignedEmployee = employeeRows.find(row => row.userId === employeeUser.id)!;

      const manager = appRouter.createCaller(contextFor(managerUser));
      const reviewer = appRouter.createCaller(contextFor(reviewerUser));
      const employee = appRouter.createCaller(contextFor(employeeUser));
      const outsider = appRouter.createCaller(contextFor(outsiderUser));
      await expect(manager.reviews.formOptions({ fiscalYearId: secondYear.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      const options = await manager.reviews.formOptions({ fiscalYearId: firstYear.id });
        expect(options.operationTypes.some(type => type.id === purchasesTypeId)).toBe(true);
      expect(options.employees.some(item => item.id === assignedEmployee.id)).toBe(true);

      const field = await ownerCaller.customFields.create({ key: `uat_po_${runId}`, label: "رقم أمر شراء UAT", type: "number", isRequired: true, helpText: "رقم مؤقت", sortOrder: 9000 });
      createdFieldIds.push(field.id);
      await ownerCaller.customFields.setOperationTypes({ customFieldId: field.id, mappings: [{ operationTypeId: purchasesTypeId, isRequiredOverride: true, sortOrder: 9000 }] });
      const dynamicFields = await manager.customFields.forOperation({ fiscalYearId: firstYear.id, operationTypeId: purchasesTypeId });
      expect(dynamicFields).toEqual(expect.arrayContaining([expect.objectContaining({ id: field.id, isRequired: true, type: "number" })]));

      const createInput = { fiscalYearId: firstYear.id, operationTypeId: purchasesTypeId, reviewerStatusId: reviewerOpen.id, employeeStatusId: employeeOpen.id, assignedEmployeeId: assignedEmployee.id, voucherNumber: null, title: `UAT مشتريات عاجلة ${runId}`, description: "وصف قبول مؤقت", problem: "مشكلة اختبار UAT", requiredAction: "إجراء تصحيحي", priority: "critical" as const, dueDate: `${yearOne}-06-15` };
      const primary = await manager.reviews.create(createInput);
        createdReviewIds.push(primary.id);
      expect(primary.internalRef).toMatch(new RegExp(`^REV-${yearOne}-\\d{6,}$`));
      for (let index = 0; index < 5; index += 1) {
        const extra = await manager.reviews.create({ ...createInput, title: `UAT سجل ${index} ${runId}`, voucherNumber: `V-${runId}-${index}`, priority: index === 0 ? "urgent" : "normal" });
        createdReviewIds.push(extra.id);
      }
      expect(new Set(createdReviewIds).size).toBe(createdReviewIds.length);
      const firstPage = await manager.reviews.list({ fiscalYearId: firstYear.id, page: 1, pageSize: 5, operationTypeIds: [purchasesTypeId], priorities: ["critical", "urgent", "normal"], sortBy: "createdAt", sortDirection: "desc" });
      expect(firstPage.total).toBe(6);
      expect(firstPage.totalPages).toBe(2);
      const searched = await manager.reviews.list({ fiscalYearId: firstYear.id, page: 1, pageSize: 5, query: primary.internalRef, sortBy: "internalRef", sortDirection: "asc" });
      expect(searched.items).toHaveLength(1);
      expect(searched.items[0].id).toBe(primary.id);
      await expect(employee.reviews.get({ id: primary.id })).resolves.toMatchObject({ id: primary.id, assignedEmployeeId: assignedEmployee.id });
      await expect(outsider.reviews.get({ id: primary.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(outsider.comments.create({ reviewId: primary.id, body: "محاولة وصول غير مصرح" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(employee.reviews.changeStatus({ id: primary.id, side: "reviewer", toStatusId: reviewerDone.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(manager.reviews.archive({ id: primary.id })).rejects.toMatchObject({ code: "CONFLICT" });

      await expect(manager.customFields.values.set({ reviewId: primary.id, values: [{ customFieldId: field.id, value: null }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await manager.customFields.values.set({ reviewId: primary.id, values: [{ customFieldId: field.id, value: 8721 }] });
      const fieldValues = await manager.customFields.values.list({ reviewId: primary.id });
      expect(fieldValues).toEqual(expect.arrayContaining([expect.objectContaining({ id: field.id, value: 8721 })]));

      await manager.reviews.assign({ id: primary.id, employeeId: null });
      await manager.reviews.assign({ id: primary.id, employeeId: assignedEmployee.id });
      const assignmentNotification = (await employee.notifications.list({ unreadOnly: true })).find(item => item.type === "review.assigned" && item.link === `/reviews/${primary.id}`);
      expect(assignmentNotification).toBeTruthy();
      if (!assignmentNotification) throw new Error("تعذر العثور على إشعار التكليف المؤقت");
      await outsider.notifications.markRead({ id: assignmentNotification.id });
      expect((await employee.notifications.list({ unreadOnly: true })).some(item => item.id === assignmentNotification.id)).toBe(true);
      await employee.notifications.markRead({ id: assignmentNotification.id });
      expect((await employee.notifications.list({ unreadOnly: true })).some(item => item.id === assignmentNotification.id)).toBe(false);
      const comment = await employee.comments.create({ reviewId: primary.id, body: "تمت معالجة المشكلة ضمن اختبار القبول." });
      expect(comment.id).toBeGreaterThan(0);
      await employee.reviews.changeStatus({ id: primary.id, side: "employee", toStatusId: employeeDone.id });
      let afterEmployee = await manager.reviews.get({ id: primary.id });
      expect(afterEmployee.employeeStatusId).toBe(employeeDone.id);
      expect(afterEmployee.reviewerStatusId).toBe(reviewerOpen.id);
      await reviewer.reviews.changeStatus({ id: primary.id, side: "reviewer", toStatusId: reviewerDone.id });
      const completed = await manager.reviews.get({ id: primary.id });
      expect(completed.reviewerStatusId).toBe(reviewerDone.id);
      expect(completed.employeeStatusId).toBe(employeeDone.id);
      expect(completed.completedAt).toBeTruthy();
      await expect(employee.reviews.archive({ id: primary.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await manager.reviews.archive({ id: primary.id });
      const activeAfterArchive = await manager.reviews.list({ fiscalYearId: firstYear.id, page: 1, pageSize: 15, archiveScope: "active", sortBy: "createdAt", sortDirection: "desc" });
      const archivedAfterArchive = await manager.reviews.list({ fiscalYearId: firstYear.id, page: 1, pageSize: 15, archiveScope: "archived", sortBy: "createdAt", sortDirection: "desc" });
      expect(activeAfterArchive.items.some(item => item.id === primary.id)).toBe(false);
      expect(archivedAfterArchive.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: primary.id, archivedAt: expect.any(Date) })]));
      await expect(manager.reviews.changeStatus({ id: primary.id, side: "reviewer", toStatusId: reviewerOpen.id })).rejects.toMatchObject({ code: "CONFLICT" });
      await manager.reviews.restoreFromArchive({ id: primary.id });
      const activeAfterRestore = await manager.reviews.list({ fiscalYearId: firstYear.id, page: 1, pageSize: 15, archiveScope: "active", sortBy: "createdAt", sortDirection: "desc" });
      expect(activeAfterRestore.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: primary.id, archivedAt: null })]));
      await expect(employee.reviews.cancel({ id: primary.id, reason: "محاولة إلغاء غير مصرح بها" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await manager.reviews.cancel({ id: primary.id, reason: "ألغي السند ضمن سيناريو قبول مؤقت." });
      const cancelledAfterCancel = await manager.reviews.list({ fiscalYearId: firstYear.id, page: 1, pageSize: 15, archiveScope: "cancelled", sortBy: "createdAt", sortDirection: "desc" });
      expect(cancelledAfterCancel.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: primary.id, cancelledAt: expect.any(Date), cancellationReason: "ألغي السند ضمن سيناريو قبول مؤقت." })]));
      const activeAfterCancel = await manager.reviews.list({ fiscalYearId: firstYear.id, page: 1, pageSize: 15, archiveScope: "active", sortBy: "createdAt", sortDirection: "desc" });
      expect(activeAfterCancel.items.some(item => item.id === primary.id)).toBe(false);
      await expect(manager.reviews.update({ id: primary.id, title: "تعديل ممنوع بعد الإلغاء" })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(manager.reviews.changeStatus({ id: primary.id, side: "reviewer", toStatusId: reviewerOpen.id })).rejects.toMatchObject({ code: "CONFLICT" });
      await manager.reviews.restoreCancelled({ id: primary.id });
      const activeAfterCancelledRestore = await manager.reviews.list({ fiscalYearId: firstYear.id, page: 1, pageSize: 15, archiveScope: "active", sortBy: "createdAt", sortDirection: "desc" });
      expect(activeAfterCancelledRestore.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: primary.id, cancelledAt: null, cancellationReason: null })]));
      const activity = await manager.activity.list({ reviewId: primary.id });
        expect(activity.map(item => item.action)).toEqual(expect.arrayContaining(["review.created", "review.assigned", "comment.created", "review.status.employee.changed", "review.status.reviewer.changed", "review.archived", "review.unarchived", "review.cancelled", "review.cancelled.restored", "customFields.updated"]));

      const attachmentFixtures = [
        { fileName: `uat-${runId}.pdf`, mimeType: "application/pdf", bytes: Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n") },
        { fileName: `uat-${runId}.png`, mimeType: "image/png", bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Jd5oAAAAASUVORK5CYII=", "base64") },
        { fileName: `uat-${runId}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: Buffer.from("PK\x03\x04UAT-SPREADSHEET-CONTENT") },
      ];
      for (const fixture of attachmentFixtures) {
        const uploaded = await ownerCaller.attachments.upload({ reviewId: primary.id, fileName: fixture.fileName, mimeType: fixture.mimeType, base64: fixture.bytes.toString("base64") });
        createdAttachmentIds.push(uploaded.id);
      }
      const listedAttachments = await manager.attachments.list({ reviewId: primary.id });
        expect(listedAttachments).toHaveLength(3);
      await expect(ownerCaller.attachments.upload({ reviewId: primary.id, fileName: `invalid-${runId}.pdf`, mimeType: "application/pdf", base64: attachmentFixtures[1].bytes.toString("base64") })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(outsider.attachments.getAccessUrl({ id: createdAttachmentIds[0] })).rejects.toMatchObject({ code: "FORBIDDEN" });
      for (const attachmentId of createdAttachmentIds) {
        const access = await ownerCaller.attachments.getAccessUrl({ id: attachmentId });
        expect(access.url).toMatch(/^https?:\/\//);
        const downloaded = await fetch(access.url);
        expect(downloaded.ok).toBe(true);
        expect((await downloaded.arrayBuffer()).byteLength).toBeGreaterThan(0);
        await ownerCaller.attachments.remove({ id: attachmentId });
      }
      expect(await manager.attachments.list({ reviewId: primary.id })).toHaveLength(0);

      const overviewBeforeDelete = await manager.analytics.overview({ fiscalYearId: firstYear.id });
        expect(overviewBeforeDelete.metrics.total).toBe(6);
      await manager.reviews.remove({ id: primary.id });
      const overviewAfterDelete = await manager.analytics.overview({ fiscalYearId: firstYear.id });
      expect(overviewAfterDelete.metrics.total).toBe(5);
      await manager.reviews.restore({ id: primary.id });
      const overviewAfterRestore = await manager.analytics.overview({ fiscalYearId: firstYear.id });
      expect(overviewAfterRestore.metrics.total).toBe(6);
      const activityAfterRestore = await manager.activity.list({ reviewId: primary.id });
      expect(activityAfterRestore.map(item => item.action)).toEqual(expect.arrayContaining(["review.deleted", "review.restored"]));

      await ownerCaller.settings.operationTypes.setActive({ id: refundTypeId, isActive: false });
      const formAfterDisable = await manager.reviews.formOptions({ fiscalYearId: firstYear.id });
      expect(formAfterDisable.operationTypes.some(type => type.id === refundTypeId)).toBe(false);
      await ownerCaller.settings.operationTypes.setActive({ id: purchasesTypeId, isActive: false });
      await expect(manager.reviews.get({ id: primary.id })).resolves.toMatchObject({ id: primary.id, operationTypeId: purchasesTypeId });
      await ownerCaller.settings.operationTypes.setActive({ id: purchasesTypeId, isActive: true });
    } finally {
        if (createdReviewIds.length) await db.delete(attachments).where(inArray(attachments.reviewId, createdReviewIds));
      if (createdReviewIds.length) await db.delete(reviews).where(inArray(reviews.id, createdReviewIds));
      if (createdFieldIds.length) {
        await db.delete(customFieldValues).where(inArray(customFieldValues.customFieldId, createdFieldIds));
        await db.delete(customFieldOptions).where(inArray(customFieldOptions.customFieldId, createdFieldIds));
        await db.delete(operationTypeFields).where(inArray(operationTypeFields.customFieldId, createdFieldIds));
        await db.delete(customFields).where(inArray(customFields.id, createdFieldIds));
      }
      if (createdTransitionIds.length) await db.delete(statusTransitions).where(inArray(statusTransitions.id, createdTransitionIds));
      if (createdOperationTypeIds.length) await db.delete(operationTypes).where(inArray(operationTypes.id, createdOperationTypeIds));
      if (createdReviewerStatusIds.length) await db.delete(reviewerStatuses).where(inArray(reviewerStatuses.id, createdReviewerStatusIds));
      if (createdEmployeeStatusIds.length) await db.delete(employeeStatuses).where(inArray(employeeStatuses.id, createdEmployeeStatusIds));
      if (createdUserIds.length) {
        await db.delete(notifications).where(inArray(notifications.userId, createdUserIds));
        await db.delete(loginActivity).where(inArray(loginActivity.userId, createdUserIds));
        await db.delete(userFiscalYears).where(inArray(userFiscalYears.userId, createdUserIds));
        await db.delete(userRoles).where(inArray(userRoles.userId, createdUserIds));
        await db.delete(employees).where(inArray(employees.id, createdEmployeeIds));
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
      if (createdYearIds.length) await db.delete(fiscalYears).where(inArray(fiscalYears.id, createdYearIds));
      }
  }, 90_000);
});
