import {
  boolean,
  date,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const auditTimestamps = {
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
};

/** هوية المستخدم التي تديرها مصادقة Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  /** اسم مستخدم داخلي اختياري؛ تستمر حسابات OAuth بلا اسم مستخدم محلي. */
  username: varchar("username", { length: 64 }).unique(),
  /** تجزئة scrypt فقط؛ لا تُخزَّن كلمة المرور الأصلية مطلقًا. */
  passwordHash: varchar("passwordHash", { length: 512 }),
  passwordChangedAt: timestamp("passwordChangedAt"),
  /** يرفع عند إعادة التعيين أو التعطيل لإبطال الجلسات المحلية السابقة. */
  sessionVersion: int("sessionVersion").default(1).notNull(),
  failedLoginCount: int("failedLoginCount").default(0).notNull(),
  loginLockedUntil: timestamp("loginLockedUntil"),
  /** دور المنصة الأساسي؛ صلاحيات النظام التفصيلية محفوظة في userRoles. */
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** ملف الموظف المنفصل عن هوية الدخول، ليظل التعيين محفوظًا تاريخيًا. */
export const employees = mysqlTable(
  "employees",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id, { onDelete: "set null" }),
    displayName: varchar("displayName", { length: 180 }).notNull(),
    email: varchar("email", { length: 320 }),
    department: varchar("department", { length: 160 }),
    isActive: boolean("isActive").default(true).notNull(),
    ...auditTimestamps,
  },
  table => [uniqueIndex("employees_user_unique").on(table.userId), index("employees_active_idx").on(table.isActive)],
);

export const roles = mysqlTable("roles", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  isSystem: boolean("isSystem").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  ...auditTimestamps,
});

export const permissions = mysqlTable("permissions", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  group: varchar("group", { length: 64 }).notNull(),
  description: text("description"),
  ...auditTimestamps,
});

export const userRoles = mysqlTable(
  "user_roles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: int("roleId").notNull().references(() => roles.id, { onDelete: "cascade" }),
    assignedByUserId: int("assignedByUserId").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("user_roles_user_role_unique").on(table.userId, table.roleId), index("user_roles_user_idx").on(table.userId)],
);

export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    id: int("id").autoincrement().primaryKey(),
    roleId: int("roleId").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: int("permissionId").notNull().references(() => permissions.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("role_permissions_role_permission_unique").on(table.roleId, table.permissionId),
    index("role_permissions_role_idx").on(table.roleId),
  ],
);

export const fiscalYears = mysqlTable(
  "fiscal_years",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    year: int("year").notNull().unique(),
    startDate: date("startDate").notNull(),
    endDate: date("endDate").notNull(),
    status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
    isCurrent: boolean("isCurrent").default(false).notNull(),
    createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
    closedByUserId: int("closedByUserId").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closedAt"),
    ...auditTimestamps,
  },
  table => [index("fiscal_years_status_idx").on(table.status), index("fiscal_years_current_idx").on(table.isCurrent)],
);

/** نطاق وصول المستخدم للسنوات؛ عدم وجود سجل يعني لا يسمح بالقراءة إلا لمدير النظام. */
export const userFiscalYears = mysqlTable(
  "user_fiscal_years",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    fiscalYearId: int("fiscalYearId").notNull().references(() => fiscalYears.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("user_fiscal_year_unique").on(table.userId, table.fiscalYearId),
    index("user_fiscal_year_user_idx").on(table.userId),
  ],
);

export const operationTypes = mysqlTable("operation_types", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 20 }).default("#64748b").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  ...auditTimestamps,
});

export const reviewerStatuses = mysqlTable("reviewer_statuses", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  color: varchar("color", { length: 20 }).default("#64748b").notNull(),
  isTerminal: boolean("isTerminal").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  ...auditTimestamps,
});

export const employeeStatuses = mysqlTable("employee_statuses", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  color: varchar("color", { length: 20 }).default("#64748b").notNull(),
  isTerminal: boolean("isTerminal").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  ...auditTimestamps,
});

export const statusTransitions = mysqlTable(
  "status_transitions",
  {
    id: int("id").autoincrement().primaryKey(),
    side: mysqlEnum("side", ["reviewer", "employee"]).notNull(),
    fromReviewerStatusId: int("fromReviewerStatusId").references(() => reviewerStatuses.id, { onDelete: "cascade" }),
    toReviewerStatusId: int("toReviewerStatusId").references(() => reviewerStatuses.id, { onDelete: "cascade" }),
    fromEmployeeStatusId: int("fromEmployeeStatusId").references(() => employeeStatuses.id, { onDelete: "cascade" }),
    toEmployeeStatusId: int("toEmployeeStatusId").references(() => employeeStatuses.id, { onDelete: "cascade" }),
    requiredPermission: varchar("requiredPermission", { length: 100 }).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    ...auditTimestamps,
  },
  table => [index("status_transitions_side_idx").on(table.side, table.isActive)],
);

export const reviews = mysqlTable(
  "reviews",
  {
    id: int("id").autoincrement().primaryKey(),
    internalRef: varchar("internalRef", { length: 40 }).notNull().unique(),
    voucherNumber: varchar("voucherNumber", { length: 100 }),
    title: varchar("title", { length: 220 }).notNull(),
    description: text("description"),
    problem: text("problem"),
    requiredAction: text("requiredAction"),
    fiscalYearId: int("fiscalYearId").notNull().references(() => fiscalYears.id, { onDelete: "restrict" }),
    operationTypeId: int("operationTypeId").notNull().references(() => operationTypes.id, { onDelete: "restrict" }),
    reviewerStatusId: int("reviewerStatusId").notNull().references(() => reviewerStatuses.id, { onDelete: "restrict" }),
    employeeStatusId: int("employeeStatusId").notNull().references(() => employeeStatuses.id, { onDelete: "restrict" }),
    assignedEmployeeId: int("assignedEmployeeId").references(() => employees.id, { onDelete: "set null" }),
    priority: mysqlEnum("priority", ["normal", "urgent", "critical"]).default("normal").notNull(),
    dueDate: date("dueDate"),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: int("updatedByUserId").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completedAt"),
    /** تاريخ نقل العملية المكتملة إلى الأرشيف؛ لا يحذف السجل أو مرفقاته. */
    archivedAt: timestamp("archivedAt"),
    /** المستخدم الذي نفذ الأرشفة لضمان قابلية المراجعة والاسترجاع. */
    archivedByUserId: int("archivedByUserId").references(() => users.id, { onDelete: "set null" }),
    /** الإلغاء لا يحذف العملية؛ يبقي السجل مرئيًا في قائمة العمليات الملغاة للقراءة والاسترجاع. */
    cancelledAt: timestamp("cancelledAt"),
    cancelledByUserId: int("cancelledByUserId").references(() => users.id, { onDelete: "set null" }),
    cancellationReason: varchar("cancellationReason", { length: 1000 }),
    deletedAt: timestamp("deletedAt"),
    deletedByUserId: int("deletedByUserId").references(() => users.id, { onDelete: "set null" }),
    ...auditTimestamps,
  },
  table => [
    index("reviews_fy_type_idx").on(table.fiscalYearId, table.operationTypeId),
    index("reviews_fy_reviewer_status_idx").on(table.fiscalYearId, table.reviewerStatusId),
    index("reviews_fy_employee_status_idx").on(table.fiscalYearId, table.employeeStatusId),
    index("reviews_fy_employee_idx").on(table.fiscalYearId, table.assignedEmployeeId),
    index("reviews_fy_deleted_created_idx").on(table.fiscalYearId, table.deletedAt, table.createdAt),
    index("reviews_fy_lifecycle_created_idx").on(table.fiscalYearId, table.cancelledAt, table.archivedAt, table.deletedAt, table.createdAt),
    index("reviews_due_date_idx").on(table.dueDate),
  ],
);

export const reviewComments = mysqlTable(
  "review_comments",
  {
    id: int("id").autoincrement().primaryKey(),
    reviewId: int("reviewId").notNull().references(() => reviews.id, { onDelete: "cascade" }),
    parentCommentId: int("parentCommentId"),
    body: text("body").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deletedAt"),
    ...auditTimestamps,
  },
  table => [index("review_comments_review_idx").on(table.reviewId, table.createdAt)],
);

export const reviewActivityLog = mysqlTable(
  "review_activity_log",
  {
    id: int("id").autoincrement().primaryKey(),
    reviewId: int("reviewId").notNull().references(() => reviews.id, { onDelete: "cascade" }),
    actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    field: varchar("field", { length: 100 }),
    beforeValue: json("beforeValue"),
    afterValue: json("afterValue"),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("review_activity_review_idx").on(table.reviewId, table.createdAt)],
);

export const attachments = mysqlTable(
  "attachments",
  {
    id: int("id").autoincrement().primaryKey(),
    reviewId: int("reviewId").notNull().references(() => reviews.id, { onDelete: "cascade" }),
    storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    sizeBytes: int("sizeBytes").notNull(),
    uploadedByUserId: int("uploadedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deletedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("attachments_review_idx").on(table.reviewId, table.deletedAt)],
);

export const customFields = mysqlTable("custom_fields", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 80 }).notNull().unique(),
  label: varchar("label", { length: 160 }).notNull(),
  type: mysqlEnum("type", ["text", "textarea", "number", "currency", "date", "email", "url", "select", "multi_select", "boolean", "employee", "user", "reviewer_status", "employee_status"]).notNull(),
  helpText: text("helpText"),
  isRequired: boolean("isRequired").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  ...auditTimestamps,
});

export const customFieldOptions = mysqlTable(
  "custom_field_options",
  {
    id: int("id").autoincrement().primaryKey(),
    customFieldId: int("customFieldId").notNull().references(() => customFields.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 160 }).notNull(),
    value: varchar("value", { length: 160 }).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    ...auditTimestamps,
  },
  table => [uniqueIndex("custom_field_options_unique").on(table.customFieldId, table.value)],
);

export const operationTypeFields = mysqlTable(
  "operation_type_fields",
  {
    id: int("id").autoincrement().primaryKey(),
    operationTypeId: int("operationTypeId").notNull().references(() => operationTypes.id, { onDelete: "cascade" }),
    customFieldId: int("customFieldId").notNull().references(() => customFields.id, { onDelete: "cascade" }),
    isRequiredOverride: boolean("isRequiredOverride"),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("operation_type_fields_unique").on(table.operationTypeId, table.customFieldId)],
);

export const customFieldValues = mysqlTable(
  "custom_field_values",
  {
    id: int("id").autoincrement().primaryKey(),
    reviewId: int("reviewId").notNull().references(() => reviews.id, { onDelete: "cascade" }),
    customFieldId: int("customFieldId").notNull().references(() => customFields.id, { onDelete: "restrict" }),
    value: json("value").notNull(),
    ...auditTimestamps,
  },
  table => [uniqueIndex("custom_field_values_unique").on(table.reviewId, table.customFieldId)],
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    link: varchar("link", { length: 512 }),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("notifications_user_read_idx").on(table.userId, table.readAt, table.createdAt)],
);

export const loginActivity = mysqlTable(
  "login_activity",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    event: mysqlEnum("event", ["login", "logout", "failed_login"]).notNull(),
    ipAddress: varchar("ipAddress", { length: 64 }),
    userAgent: text("userAgent"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("login_activity_user_created_idx").on(table.userId, table.createdAt)],
);

export const userPreferences = mysqlTable("user_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  defaultFiscalYearId: int("defaultFiscalYearId").references(() => fiscalYears.id, { onDelete: "set null" }),
  preferences: json("preferences"),
  ...auditTimestamps,
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type FiscalYear = typeof fiscalYears.$inferSelect;
export type Review = typeof reviews.$inferSelect;
