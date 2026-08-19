import { eq, sql } from "drizzle-orm";
import { employeeStatuses, fiscalYears, operationTypes, permissions, reviewerStatuses, rolePermissions, roles, statusTransitions } from "../drizzle/schema";
import { getDb } from "./db";
import { PERMISSIONS } from "./rbac";

const permissionDefinitions = [
  [PERMISSIONS.SYSTEM_MANAGE, "إدارة النظام", "النظام"],
  [PERMISSIONS.USERS_MANAGE, "إدارة المستخدمين", "المستخدمون"],
  [PERMISSIONS.ROLES_MANAGE, "إدارة الأدوار والصلاحيات", "المستخدمون"],
  [PERMISSIONS.FISCAL_YEARS_VIEW, "عرض السنوات المالية", "السنوات المالية"],
  [PERMISSIONS.FISCAL_YEARS_MANAGE, "إدارة السنوات المالية", "السنوات المالية"],
  [PERMISSIONS.SETTINGS_MANAGE, "إدارة إعدادات دورة العمل", "الإعدادات"],
  [PERMISSIONS.REVIEWS_VIEW_ALL, "عرض كل المراجعات ضمن النطاق", "المراجعات"],
  [PERMISSIONS.REVIEWS_VIEW_ASSIGNED, "عرض المراجعات المكلف بها", "المراجعات"],
  [PERMISSIONS.REVIEWS_CREATE, "إنشاء مراجعة", "المراجعات"],
  [PERMISSIONS.REVIEWS_UPDATE, "تعديل المراجعة", "المراجعات"],
  [PERMISSIONS.REVIEWS_ASSIGN, "تكليف موظف", "المراجعات"],
  [PERMISSIONS.REVIEWS_DELETE, "حذف المراجعة منطقيًا", "المراجعات"],
  [PERMISSIONS.REVIEWS_RESTORE, "استعادة المراجعة", "المراجعات"],
  [PERMISSIONS.REVIEWER_STATUS_CHANGE, "تغيير حالة المراجع", "المراجعات"],
  [PERMISSIONS.EMPLOYEE_STATUS_CHANGE, "تغيير حالة الموظف", "المراجعات"],
  [PERMISSIONS.COMMENTS_CREATE, "إضافة تعليقات", "التعاون"],
  [PERMISSIONS.ATTACHMENTS_MANAGE, "إدارة المرفقات", "التعاون"],
  [PERMISSIONS.REPORTS_VIEW, "عرض التقارير", "التقارير"],
  [PERMISSIONS.REPORTS_EXPORT, "تصدير التقارير", "التقارير"],
  [PERMISSIONS.DAILY_TASKS_VIEW, "عرض المهام اليومية", "المهام اليومية"],
  [PERMISSIONS.DAILY_TASKS_MANAGE, "إدارة قوالب المهام اليومية", "المهام اليومية"],
  [PERMISSIONS.DAILY_TASKS_UPDATE, "تحديث حالة المهام اليومية", "المهام اليومية"],
] as const;

const roleDefinitions = [
  ["system_admin", "مدير النظام", "صلاحية كاملة لإدارة النظام", true, Object.values(PERMISSIONS)],
  ["manager", "مدير", "إدارة الأعمال والتقارير ضمن نطاق السنوات المصرح بها", true, [
    PERMISSIONS.FISCAL_YEARS_VIEW, PERMISSIONS.REVIEWS_VIEW_ALL, PERMISSIONS.REVIEWS_CREATE,
    PERMISSIONS.REVIEWS_UPDATE, PERMISSIONS.REVIEWS_ASSIGN,     PERMISSIONS.REVIEWS_DELETE, PERMISSIONS.REVIEWS_RESTORE, PERMISSIONS.REVIEWER_STATUS_CHANGE, PERMISSIONS.EMPLOYEE_STATUS_CHANGE,
    PERMISSIONS.COMMENTS_CREATE, PERMISSIONS.ATTACHMENTS_MANAGE, PERMISSIONS.REPORTS_VIEW, PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.DAILY_TASKS_VIEW, PERMISSIONS.DAILY_TASKS_MANAGE, PERMISSIONS.DAILY_TASKS_UPDATE,

  ]],
  ["reviewer", "مراجع", "إدارة ومراجعة الأعمال ضمن نطاق السنوات المصرح بها", true, [
    PERMISSIONS.FISCAL_YEARS_VIEW, PERMISSIONS.REVIEWS_VIEW_ALL, PERMISSIONS.REVIEWS_CREATE,
    PERMISSIONS.REVIEWS_UPDATE, PERMISSIONS.REVIEWS_ASSIGN, PERMISSIONS.REVIEWER_STATUS_CHANGE,
    PERMISSIONS.COMMENTS_CREATE, PERMISSIONS.ATTACHMENTS_MANAGE, PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.DAILY_TASKS_VIEW, PERMISSIONS.DAILY_TASKS_UPDATE,
  ]],
  ["employee", "موظف", "تنفيذ الأعمال المكلف بها والتواصل حولها", true, [
    PERMISSIONS.FISCAL_YEARS_VIEW, PERMISSIONS.REVIEWS_VIEW_ASSIGNED, PERMISSIONS.EMPLOYEE_STATUS_CHANGE,
    PERMISSIONS.DAILY_TASKS_VIEW, PERMISSIONS.DAILY_TASKS_UPDATE,
    PERMISSIONS.COMMENTS_CREATE, PERMISSIONS.ATTACHMENTS_MANAGE,
  ]],
] as const;

/** ينشئ فقط البيانات المرجعية للنظام؛ لا ينشئ مراجعات أو بيانات مستخدمين وهمية. */
export async function ensureSystemConfiguration() {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");

  await db.transaction(async tx => {
    for (const [code, name, group] of permissionDefinitions) {
      await tx.insert(permissions).values({ code, name, group }).onDuplicateKeyUpdate({
        set: { name: sql`VALUES(name)`, group: sql`VALUES(\`group\`)` },
      });
    }

    for (const [code, name, description, isSystem] of roleDefinitions) {
      await tx.insert(roles).values({ code, name, description, isSystem }).onDuplicateKeyUpdate({
        set: { name: sql`VALUES(name)`, description: sql`VALUES(description)`, isSystem: sql`VALUES(isSystem)`, isActive: true },
      });
    }

    const storedRoles = await tx.select().from(roles);
    const storedPermissions = await tx.select().from(permissions);
    const roleByCode = new Map(storedRoles.map(role => [role.code, role]));
    const permissionByCode = new Map(storedPermissions.map(permission => [permission.code, permission]));

    for (const [roleCode, , , , allowed] of roleDefinitions) {
      const role = roleByCode.get(roleCode);
      if (!role) continue;
      for (const permissionCode of allowed) {
        const permission = permissionByCode.get(permissionCode);
        if (!permission) continue;
        await tx.insert(rolePermissions).values({ roleId: role.id, permissionId: permission.id }).onDuplicateKeyUpdate({
          set: { roleId: sql`VALUES(roleId)` },
        });
      }
    }
  });
}

export async function getRoleByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [role] = await db.select().from(roles).where(eq(roles.code, code)).limit(1);
  return role;
}

/** ينشئ السنة الحالية فقط في نظام خالٍ تمامًا من السنوات؛ لا ينشئ بيانات مراجعات تجريبية. */
export async function ensureInitialFiscalYear(createdByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const [existing] = await db.select({ id: fiscalYears.id }).from(fiscalYears).limit(1);
  if (existing) return;

  const year = new Date().getUTCFullYear();
  await db.insert(fiscalYears).values({
    name: `السنة المالية ${year}`,
    year,
    startDate: new Date(Date.UTC(year, 0, 1)),
    endDate: new Date(Date.UTC(year, 11, 31)),
    status: "open",
    isCurrent: true,
    createdByUserId,
  });
}

/** ينشئ مرجعيات قابلة للتعديل فقط عند غيابها، ويترك كل إعدادات الإدارة اللاحقة دون تغيير. */
export async function ensureInitialWorkflowConfiguration() {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");

  await db.transaction(async tx => {
    const [type] = await tx.select({ id: operationTypes.id }).from(operationTypes).limit(1);
    if (!type) {
      await tx.insert(operationTypes).values({ name: "مراجعة عامة", description: "نوع افتراضي قابل للتعديل أو التعطيل من الإعدادات.", color: "#2563eb", sortOrder: 1 });
    }

    const [reviewerStatus] = await tx.select({ id: reviewerStatuses.id }).from(reviewerStatuses).limit(1);
    if (!reviewerStatus) {
      await tx.insert(reviewerStatuses).values([
        { name: "جديدة", code: "new", color: "#64748b", sortOrder: 1 },
        { name: "قيد المراجعة", code: "in_review", color: "#2563eb", sortOrder: 2 },
        { name: "مكتملة", code: "completed", color: "#16a34a", isTerminal: true, sortOrder: 3 },
      ]);
    }

    const [employeeStatus] = await tx.select({ id: employeeStatuses.id }).from(employeeStatuses).limit(1);
    if (!employeeStatus) {
      await tx.insert(employeeStatuses).values([
        { name: "بانتظار البدء", code: "pending", color: "#64748b", sortOrder: 1 },
        { name: "قيد التنفيذ", code: "in_progress", color: "#d97706", sortOrder: 2 },
        { name: "تم التنفيذ", code: "submitted", color: "#16a34a", isTerminal: true, sortOrder: 3 },
      ]);
    }

    const [transition] = await tx.select({ id: statusTransitions.id }).from(statusTransitions).limit(1);
    if (!transition) {
      const reviewers = await tx.select().from(reviewerStatuses);
      const employees = await tx.select().from(employeeStatuses);
      const reviewer = new Map(reviewers.map(status => [status.code, status.id]));
      const employee = new Map(employees.map(status => [status.code, status.id]));
      const reviewerPairs = [["new", "in_review"], ["in_review", "completed"], ["completed", "in_review"]] as const;
      const employeePairs = [["pending", "in_progress"], ["in_progress", "submitted"], ["submitted", "in_progress"]] as const;
      for (const [from, to] of reviewerPairs) {
        if (reviewer.get(from) && reviewer.get(to)) await tx.insert(statusTransitions).values({ side: "reviewer", fromReviewerStatusId: reviewer.get(from), toReviewerStatusId: reviewer.get(to), requiredPermission: PERMISSIONS.REVIEWER_STATUS_CHANGE });
      }
      for (const [from, to] of employeePairs) {
        if (employee.get(from) && employee.get(to)) await tx.insert(statusTransitions).values({ side: "employee", fromEmployeeStatusId: employee.get(from), toEmployeeStatusId: employee.get(to), requiredPermission: PERMISSIONS.EMPLOYEE_STATUS_CHANGE });
      }
    }
  });
}
