import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
  fiscalYears,
  permissions,
  rolePermissions,
  roles,
  userFiscalYears,
  userRoles,
  users,
  type User,
} from "../drizzle/schema";
import { getDb } from "./db";

export const PERMISSIONS = {
  SYSTEM_MANAGE: "system.manage",
  USERS_MANAGE: "users.manage",
  ROLES_MANAGE: "roles.manage",
  FISCAL_YEARS_VIEW: "fiscalYears.view",
  FISCAL_YEARS_MANAGE: "fiscalYears.manage",
  SETTINGS_MANAGE: "settings.manage",
  REVIEWS_VIEW_ALL: "reviews.view.all",
  REVIEWS_VIEW_ASSIGNED: "reviews.view.assigned",
  REVIEWS_CREATE: "reviews.create",
  REVIEWS_UPDATE: "reviews.update",
  REVIEWS_ASSIGN: "reviews.assign",
  REVIEWS_DELETE: "reviews.delete",
  REVIEWS_RESTORE: "reviews.restore",
  REVIEWER_STATUS_CHANGE: "reviews.status.reviewer.change",
  EMPLOYEE_STATUS_CHANGE: "reviews.status.employee.change",
  COMMENTS_CREATE: "comments.create",
  ATTACHMENTS_MANAGE: "attachments.manage",
  REPORTS_VIEW: "reports.view",
  REPORTS_EXPORT: "reports.export",
  DAILY_TASKS_VIEW: "dailyTasks.view",
  DAILY_TASKS_MANAGE: "dailyTasks.manage",
  DAILY_TASKS_UPDATE: "dailyTasks.update",
  RENT_FOLLOWUPS_VIEW: "rentFollowUps.view",
  RENT_FOLLOWUPS_CREATE: "rentFollowUps.create",
  RENT_FOLLOWUPS_UPDATE: "rentFollowUps.update",
  RENT_FOLLOWUPS_EXPORT: "rentFollowUps.export",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const PLATFORM_ADMIN = "admin";

function forbidden(message = "ليس لديك صلاحية لتنفيذ هذا الإجراء."): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

export async function userHasPermission(user: User, permission: PermissionCode | string): Promise<boolean> {
  if (!user.isActive) return false;
  if (user.role === PLATFORM_ADMIN) return true;

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });

  const result = await db
    .select({ permission: permissions.code })
    .from(userRoles)
    .innerJoin(roles, and(eq(userRoles.roleId, roles.id), eq(roles.isActive, true)))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(and(eq(userRoles.userId, user.id), eq(permissions.code, permission)));

  return result.length > 0;
}

export async function requirePermission(user: User, permission: PermissionCode | string): Promise<void> {
  if (!(await userHasPermission(user, permission))) forbidden();
}

/** قاعدة موحدة تمنع جميع تغييرات البيانات في السنة المالية المغلقة. */
export function assertFiscalYearWritable(status: "open" | "closed"): void {
  if (status === "closed") {
    throw new TRPCError({ code: "CONFLICT", message: "السنة المالية مغلقة ولا تقبل أي تعديل." });
  }
}

/** يفرض عزل السنوات. لا يتجاوز الحارس مدير المنصة إلا بعد التأكد من وجود السنة. */
export async function requireFiscalYearAccess(user: User, fiscalYearId: number, write = false) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });

  const [year] = await db.select().from(fiscalYears).where(eq(fiscalYears.id, fiscalYearId)).limit(1);
  if (!year) throw new TRPCError({ code: "NOT_FOUND", message: "السنة المالية غير موجودة." });

  if (user.role !== PLATFORM_ADMIN) {
    const granted = await db
      .select({ id: userFiscalYears.id })
      .from(userFiscalYears)
      .where(and(eq(userFiscalYears.userId, user.id), eq(userFiscalYears.fiscalYearId, fiscalYearId)))
      .limit(1);
    if (granted.length === 0) forbidden("ليس لديك نطاق وصول إلى هذه السنة المالية.");
  }

  if (write) assertFiscalYearWritable(year.status);

  return year;
}

export async function requireActiveUser(user: User): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة حاليًا." });

  const [record] = await db.select({ isActive: users.isActive }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!record?.isActive) forbidden("تم تعطيل حسابك. تواصل مع مدير النظام.");
}

export function ensurePlatformAdmin(user: User): void {
  if (user.role !== PLATFORM_ADMIN) forbidden("هذا الإجراء متاح لمدير النظام فقط.");
}
