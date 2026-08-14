CREATE TABLE `attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reviewId` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`sizeBytes` int NOT NULL,
	`uploadedByUserId` int NOT NULL,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attachments_id` PRIMARY KEY(`id`),
	CONSTRAINT `attachments_storageKey_unique` UNIQUE(`storageKey`)
);
--> statement-breakpoint
CREATE TABLE `custom_field_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customFieldId` int NOT NULL,
	`label` varchar(160) NOT NULL,
	`value` varchar(160) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_field_options_id` PRIMARY KEY(`id`),
	CONSTRAINT `custom_field_options_unique` UNIQUE(`customFieldId`,`value`)
);
--> statement-breakpoint
CREATE TABLE `custom_field_values` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reviewId` int NOT NULL,
	`customFieldId` int NOT NULL,
	`value` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_field_values_id` PRIMARY KEY(`id`),
	CONSTRAINT `custom_field_values_unique` UNIQUE(`reviewId`,`customFieldId`)
);
--> statement-breakpoint
CREATE TABLE `custom_fields` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(80) NOT NULL,
	`label` varchar(160) NOT NULL,
	`type` enum('text','number','date','select','boolean') NOT NULL,
	`helpText` text,
	`isRequired` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_fields_id` PRIMARY KEY(`id`),
	CONSTRAINT `custom_fields_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `employee_statuses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`code` varchar(64) NOT NULL,
	`color` varchar(20) NOT NULL DEFAULT '#64748b',
	`isTerminal` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_statuses_id` PRIMARY KEY(`id`),
	CONSTRAINT `employee_statuses_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`displayName` varchar(180) NOT NULL,
	`email` varchar(320),
	`department` varchar(160),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `fiscal_years` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`year` int NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`isCurrent` boolean NOT NULL DEFAULT false,
	`createdByUserId` int,
	`closedByUserId` int,
	`closedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fiscal_years_id` PRIMARY KEY(`id`),
	CONSTRAINT `fiscal_years_year_unique` UNIQUE(`year`)
);
--> statement-breakpoint
CREATE TABLE `login_activity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`event` enum('login','logout','failed_login') NOT NULL,
	`ipAddress` varchar(64),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_activity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` varchar(64) NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text,
	`link` varchar(512),
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operation_type_fields` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operationTypeId` int NOT NULL,
	`customFieldId` int NOT NULL,
	`isRequiredOverride` boolean,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operation_type_fields_id` PRIMARY KEY(`id`),
	CONSTRAINT `operation_type_fields_unique` UNIQUE(`operationTypeId`,`customFieldId`)
);
--> statement-breakpoint
CREATE TABLE `operation_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(140) NOT NULL,
	`description` text,
	`color` varchar(20) NOT NULL DEFAULT '#64748b',
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operation_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(100) NOT NULL,
	`name` varchar(160) NOT NULL,
	`group` varchar(64) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `review_activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reviewId` int NOT NULL,
	`actorUserId` int,
	`action` varchar(100) NOT NULL,
	`field` varchar(100),
	`beforeValue` json,
	`afterValue` json,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `review_activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `review_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reviewId` int NOT NULL,
	`parentCommentId` int,
	`body` text NOT NULL,
	`createdByUserId` int NOT NULL,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `review_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reviewer_statuses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`code` varchar(64) NOT NULL,
	`color` varchar(20) NOT NULL DEFAULT '#64748b',
	`isTerminal` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reviewer_statuses_id` PRIMARY KEY(`id`),
	CONSTRAINT `reviewer_statuses_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`internalRef` varchar(40) NOT NULL,
	`voucherNumber` varchar(100),
	`title` varchar(220) NOT NULL,
	`description` text,
	`problem` text,
	`requiredAction` text,
	`fiscalYearId` int NOT NULL,
	`operationTypeId` int NOT NULL,
	`reviewerStatusId` int NOT NULL,
	`employeeStatusId` int NOT NULL,
	`assignedEmployeeId` int,
	`priority` enum('normal','urgent','critical') NOT NULL DEFAULT 'normal',
	`dueDate` date,
	`createdByUserId` int NOT NULL,
	`updatedByUserId` int,
	`completedAt` timestamp,
	`deletedAt` timestamp,
	`deletedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `reviews_internalRef_unique` UNIQUE(`internalRef`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roleId` int NOT NULL,
	`permissionId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `role_permissions_role_permission_unique` UNIQUE(`roleId`,`permissionId`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`isSystem` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `status_transitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`side` enum('reviewer','employee') NOT NULL,
	`fromReviewerStatusId` int,
	`toReviewerStatusId` int,
	`fromEmployeeStatusId` int,
	`toEmployeeStatusId` int,
	`requiredPermission` varchar(100) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `status_transitions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_fiscal_years` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fiscalYearId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_fiscal_years_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_fiscal_year_unique` UNIQUE(`userId`,`fiscalYearId`)
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`defaultFiscalYearId` int,
	`preferences` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_preferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`roleId` int NOT NULL,
	`assignedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_roles_user_role_unique` UNIQUE(`userId`,`roleId`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_reviewId_reviews_id_fk` FOREIGN KEY (`reviewId`) REFERENCES `reviews`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_uploadedByUserId_users_id_fk` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `custom_field_options` ADD CONSTRAINT `custom_field_options_customFieldId_custom_fields_id_fk` FOREIGN KEY (`customFieldId`) REFERENCES `custom_fields`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `custom_field_values` ADD CONSTRAINT `custom_field_values_reviewId_reviews_id_fk` FOREIGN KEY (`reviewId`) REFERENCES `reviews`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `custom_field_values` ADD CONSTRAINT `custom_field_values_customFieldId_custom_fields_id_fk` FOREIGN KEY (`customFieldId`) REFERENCES `custom_fields`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fiscal_years` ADD CONSTRAINT `fiscal_years_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fiscal_years` ADD CONSTRAINT `fiscal_years_closedByUserId_users_id_fk` FOREIGN KEY (`closedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `login_activity` ADD CONSTRAINT `login_activity_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operation_type_fields` ADD CONSTRAINT `operation_type_fields_operationTypeId_operation_types_id_fk` FOREIGN KEY (`operationTypeId`) REFERENCES `operation_types`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operation_type_fields` ADD CONSTRAINT `operation_type_fields_customFieldId_custom_fields_id_fk` FOREIGN KEY (`customFieldId`) REFERENCES `custom_fields`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_activity_log` ADD CONSTRAINT `review_activity_log_reviewId_reviews_id_fk` FOREIGN KEY (`reviewId`) REFERENCES `reviews`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_activity_log` ADD CONSTRAINT `review_activity_log_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_comments` ADD CONSTRAINT `review_comments_reviewId_reviews_id_fk` FOREIGN KEY (`reviewId`) REFERENCES `reviews`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_comments` ADD CONSTRAINT `review_comments_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_fiscalYearId_fiscal_years_id_fk` FOREIGN KEY (`fiscalYearId`) REFERENCES `fiscal_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_operationTypeId_operation_types_id_fk` FOREIGN KEY (`operationTypeId`) REFERENCES `operation_types`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_reviewerStatusId_reviewer_statuses_id_fk` FOREIGN KEY (`reviewerStatusId`) REFERENCES `reviewer_statuses`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_employeeStatusId_employee_statuses_id_fk` FOREIGN KEY (`employeeStatusId`) REFERENCES `employee_statuses`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_assignedEmployeeId_employees_id_fk` FOREIGN KEY (`assignedEmployeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_deletedByUserId_users_id_fk` FOREIGN KEY (`deletedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_roleId_roles_id_fk` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permissionId_permissions_id_fk` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `status_transitions` ADD CONSTRAINT `status_transitions_fromReviewerStatusId_reviewer_statuses_id_fk` FOREIGN KEY (`fromReviewerStatusId`) REFERENCES `reviewer_statuses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `status_transitions` ADD CONSTRAINT `status_transitions_toReviewerStatusId_reviewer_statuses_id_fk` FOREIGN KEY (`toReviewerStatusId`) REFERENCES `reviewer_statuses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `status_transitions` ADD CONSTRAINT `status_transitions_fromEmployeeStatusId_employee_statuses_id_fk` FOREIGN KEY (`fromEmployeeStatusId`) REFERENCES `employee_statuses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `status_transitions` ADD CONSTRAINT `status_transitions_toEmployeeStatusId_employee_statuses_id_fk` FOREIGN KEY (`toEmployeeStatusId`) REFERENCES `employee_statuses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_fiscal_years` ADD CONSTRAINT `user_fiscal_years_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_fiscal_years` ADD CONSTRAINT `user_fiscal_years_fiscalYearId_fiscal_years_id_fk` FOREIGN KEY (`fiscalYearId`) REFERENCES `fiscal_years`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD CONSTRAINT `user_preferences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD CONSTRAINT `user_preferences_defaultFiscalYearId_fiscal_years_id_fk` FOREIGN KEY (`defaultFiscalYearId`) REFERENCES `fiscal_years`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_roleId_roles_id_fk` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_assignedByUserId_users_id_fk` FOREIGN KEY (`assignedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attachments_review_idx` ON `attachments` (`reviewId`,`deletedAt`);--> statement-breakpoint
CREATE INDEX `employees_active_idx` ON `employees` (`isActive`);--> statement-breakpoint
CREATE INDEX `fiscal_years_status_idx` ON `fiscal_years` (`status`);--> statement-breakpoint
CREATE INDEX `fiscal_years_current_idx` ON `fiscal_years` (`isCurrent`);--> statement-breakpoint
CREATE INDEX `login_activity_user_created_idx` ON `login_activity` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`userId`,`readAt`,`createdAt`);--> statement-breakpoint
CREATE INDEX `review_activity_review_idx` ON `review_activity_log` (`reviewId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `review_comments_review_idx` ON `review_comments` (`reviewId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `reviews_fy_type_idx` ON `reviews` (`fiscalYearId`,`operationTypeId`);--> statement-breakpoint
CREATE INDEX `reviews_fy_reviewer_status_idx` ON `reviews` (`fiscalYearId`,`reviewerStatusId`);--> statement-breakpoint
CREATE INDEX `reviews_fy_employee_status_idx` ON `reviews` (`fiscalYearId`,`employeeStatusId`);--> statement-breakpoint
CREATE INDEX `reviews_fy_employee_idx` ON `reviews` (`fiscalYearId`,`assignedEmployeeId`);--> statement-breakpoint
CREATE INDEX `reviews_fy_deleted_created_idx` ON `reviews` (`fiscalYearId`,`deletedAt`,`createdAt`);--> statement-breakpoint
CREATE INDEX `reviews_due_date_idx` ON `reviews` (`dueDate`);--> statement-breakpoint
CREATE INDEX `role_permissions_role_idx` ON `role_permissions` (`roleId`);--> statement-breakpoint
CREATE INDEX `status_transitions_side_idx` ON `status_transitions` (`side`,`isActive`);--> statement-breakpoint
CREATE INDEX `user_fiscal_year_user_idx` ON `user_fiscal_years` (`userId`);--> statement-breakpoint
CREATE INDEX `user_roles_user_idx` ON `user_roles` (`userId`);