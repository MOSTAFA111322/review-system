import {
  boolean,
  date,
  decimal,
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
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    ...auditTimestamps,
  },
  table => [index("fiscal_years_status_idx").on(table.status), index("fiscal_years_current_idx").on(table.isCurrent), index("fiscal_years_schedule_uid_idx").on(table.scheduleCronTaskUid)],
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

/** قالب مهمة يومية متكررة؛ لا ينشئ بيانات تشغيلية تلقائيًا قبل الاستيراد أو التفعيل. */
export const dailyTaskTemplates = mysqlTable(
  "daily_task_templates",
  {
    id: int("id").autoincrement().primaryKey(),
    fiscalYearId: int("fiscalYearId").notNull().references(() => fiscalYears.id, { onDelete: "restrict" }),
    employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 220 }).notNull(),
    description: text("description"),
    priority: mysqlEnum("priority", ["normal", "urgent", "critical"]).default("normal").notNull(),
    recurrenceType: mysqlEnum("recurrenceType", ["daily", "workdays", "weekly"]).default("daily").notNull(),
    recurrenceDays: varchar("recurrenceDays", { length: 20 }),
    defaultDueTime: varchar("defaultDueTime", { length: 5 }),
    startDate: date("startDate").notNull(),
    endDate: date("endDate"),
    isActive: boolean("isActive").default(true).notNull(),
    source: mysqlEnum("source", ["manual", "imported"]).default("manual").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    ...auditTimestamps,
  },
  table => [
    index("daily_templates_fy_employee_idx").on(table.fiscalYearId, table.employeeId, table.isActive),
    index("daily_templates_dates_idx").on(table.startDate, table.endDate),
  ],
);

/** نسخة تشغيلية مؤرخة من قالب أو مهمة مضافة أثناء المراجعة. */
export const dailyTasks = mysqlTable(
  "daily_tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    fiscalYearId: int("fiscalYearId").notNull().references(() => fiscalYears.id, { onDelete: "restrict" }),
    employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "restrict" }),
    templateId: int("templateId").references(() => dailyTaskTemplates.id, { onDelete: "set null" }),
    reviewId: int("reviewId").references(() => reviews.id, { onDelete: "set null" }),
    title: varchar("title", { length: 220 }).notNull(),
    description: text("description"),
    notes: text("notes"),
    taskDate: date("taskDate").notNull(),
    dueTime: varchar("dueTime", { length: 5 }),
    priority: mysqlEnum("priority", ["normal", "urgent", "critical"]).default("normal").notNull(),
    status: mysqlEnum("status", ["pending", "in_progress", "completed", "skipped"]).default("pending").notNull(),
    source: mysqlEnum("source", ["recurring", "manual", "review", "imported"]).default("manual").notNull(),
    completedAt: timestamp("completedAt"),
    completedByUserId: int("completedByUserId").references(() => users.id, { onDelete: "set null" }),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    ...auditTimestamps,
  },
  table => [
    uniqueIndex("daily_tasks_template_date_unique").on(table.templateId, table.taskDate),
    index("daily_tasks_fy_employee_date_idx").on(table.fiscalYearId, table.employeeId, table.taskDate),
    index("daily_tasks_review_idx").on(table.reviewId),
    index("daily_tasks_status_date_idx").on(table.status, table.taskDate),
  ],
);

/** مرجع العمارات القابل للإدارة ضمن السنة المالية. */
export const rentBuildings = mysqlTable(
  "rent_buildings",
  {
    id: int("id").autoincrement().primaryKey(),
    fiscalYearId: int("fiscalYearId").notNull().references(() => fiscalYears.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 180 }).notNull(),
    code: varchar("code", { length: 80 }),
    address: varchar("address", { length: 300 }),
    notes: text("notes"),
    isActive: boolean("isActive").default(true).notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    ...auditTimestamps,
  },
  table => [
    uniqueIndex("rent_buildings_fy_name_unique").on(table.fiscalYearId, table.name),
    index("rent_buildings_fy_active_idx").on(table.fiscalYearId, table.isActive),
  ],
);

/** الوحدات التابعة لعمارة، مع بيانات المستأجر الحالية لتسريع إدخال السداد. */
export const rentUnits = mysqlTable(
  "rent_units",
  {
    id: int("id").autoincrement().primaryKey(),
    buildingId: int("buildingId").notNull().references(() => rentBuildings.id, { onDelete: "restrict" }),
    unitNumber: varchar("unitNumber", { length: 80 }).notNull(),
    tenantName: varchar("tenantName", { length: 180 }),
    paymentAccountNumber: varchar("paymentAccountNumber", { length: 160 }),
    notes: text("notes"),
    isActive: boolean("isActive").default(true).notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    ...auditTimestamps,
  },
  table => [
    uniqueIndex("rent_units_building_number_unique").on(table.buildingId, table.unitNumber),
    index("rent_units_building_active_idx").on(table.buildingId, table.isActive),
  ],
);

/** العقود المرجعية للوحدة؛ يسمح بأكثر من عقد تاريخيًا مع رقم داخلي فريد داخل السنة والوحدة. */
export const rentContracts = mysqlTable(
  "rent_contracts",
  {
    id: int("id").autoincrement().primaryKey(),
    fiscalYearId: int("fiscalYearId").notNull().references(() => fiscalYears.id, { onDelete: "restrict" }),
    unitId: int("unitId").notNull().references(() => rentUnits.id, { onDelete: "restrict" }),
    externalContractNumber: varchar("externalContractNumber", { length: 120 }),
    internalContractNumber: varchar("internalContractNumber", { length: 120 }),
    tenantName: varchar("tenantName", { length: 180 }),
    startDate: date("startDate"),
    endDate: date("endDate"),
    notes: text("notes"),
    isActive: boolean("isActive").default(true).notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    ...auditTimestamps,
  },
  table => [
    uniqueIndex("rent_contracts_fy_unit_internal_unique").on(table.fiscalYearId, table.unitId, table.internalContractNumber),
    index("rent_contracts_fy_active_idx").on(table.fiscalYearId, table.isActive),
    index("rent_contracts_unit_idx").on(table.unitId),
  ],
);

/** كشف متابعة فقط لإفادة سداد الإيجار، تأكيد المالك، ومرجع الترحيل إلى إملاكي. لا يمثل سند قبض أو قيدًا محاسبيًا. */
export const rentPaymentFollowUps = mysqlTable(
  "rent_payment_follow_ups",
  {
    id: int("id").autoincrement().primaryKey(),
    fiscalYearId: int("fiscalYearId").notNull().references(() => fiscalYears.id, { onDelete: "restrict" }),
    buildingId: int("buildingId").references(() => rentBuildings.id, { onDelete: "restrict" }),
    unitId: int("unitId").references(() => rentUnits.id, { onDelete: "restrict" }),
    contractId: int("contractId").references(() => rentContracts.id, { onDelete: "restrict" }),
    buildingName: varchar("buildingName", { length: 180 }).notNull(),
    apartmentNumber: varchar("apartmentNumber", { length: 80 }).notNull(),
    tenantName: varchar("tenantName", { length: 180 }).notNull(),
    paidAmount: decimal("paidAmount", { precision: 14, scale: 2 }).notNull(),
    paymentDate: date("paymentDate").notNull(),
    contractNumber: varchar("contractNumber", { length: 120 }),
    /** رقم عقد داخلي مستقل عن الرقم الخارجي أو رقم العقد الوارد من إملاكي/Excel. */
    internalContractNumber: varchar("internalContractNumber", { length: 120 }),
    paymentAccountNumber: varchar("paymentAccountNumber", { length: 160 }),
    ownerConfirmation: mysqlEnum("ownerConfirmation", ["pending", "confirmed", "needs_review"]).default("pending").notNull(),
    ownerConfirmationDate: date("ownerConfirmationDate"),
    amlakiaReceiptNumber: varchar("amlakiaReceiptNumber", { length: 120 }),
    transferStatus: mysqlEnum("transferStatus", ["not_transferred", "transferred"]).default("not_transferred").notNull(),
    notes: text("notes"),
    sourceSheet: varchar("sourceSheet", { length: 180 }),
    sourceRow: int("sourceRow"),
    sourceFingerprint: varchar("sourceFingerprint", { length: 128 }),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: int("updatedByUserId").references(() => users.id, { onDelete: "set null" }),
    ...auditTimestamps,
  },
  table => [
    index("rent_followups_fy_building_date_idx").on(table.fiscalYearId, table.buildingName, table.paymentDate),
    index("rent_followups_entity_refs_idx").on(table.fiscalYearId, table.buildingId, table.unitId, table.contractId),
    index("rent_followups_fy_internal_contract_idx").on(table.fiscalYearId, table.internalContractNumber),
    index("rent_followups_confirmation_idx").on(table.ownerConfirmation, table.transferStatus),
    uniqueIndex("rent_followups_source_fingerprint_unique").on(table.sourceFingerprint),
  ],
);

/** سجل تدقيق لتغييرات كشف متابعة الإيجارات، منفصل عن سجل المراجعات. */
export const rentPaymentFollowUpActivity = mysqlTable(
  "rent_payment_follow_up_activity",
  {
    id: int("id").autoincrement().primaryKey(),
    followUpId: int("followUpId").notNull().references(() => rentPaymentFollowUps.id, { onDelete: "cascade" }),
    actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 64 }).notNull(),
    beforeValue: json("beforeValue"),
    afterValue: json("afterValue"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("rent_followup_activity_followup_idx").on(table.followUpId, table.createdAt)],
);

export const notifications = mysqlTable("notifications", {
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
