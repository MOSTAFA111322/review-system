CREATE TABLE `daily_task_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fiscalYearId` int NOT NULL,
	`employeeId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`description` text,
	`priority` enum('normal','urgent','critical') NOT NULL DEFAULT 'normal',
	`defaultDueTime` varchar(5),
	`startDate` date NOT NULL,
	`endDate` date,
	`isActive` boolean NOT NULL DEFAULT true,
	`source` enum('manual','imported') NOT NULL DEFAULT 'manual',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_task_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `daily_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fiscalYearId` int NOT NULL,
	`employeeId` int NOT NULL,
	`templateId` int,
	`reviewId` int,
	`title` varchar(220) NOT NULL,
	`description` text,
	`taskDate` date NOT NULL,
	`dueTime` varchar(5),
	`priority` enum('normal','urgent','critical') NOT NULL DEFAULT 'normal',
	`status` enum('pending','in_progress','completed','skipped') NOT NULL DEFAULT 'pending',
	`source` enum('recurring','manual','review','imported') NOT NULL DEFAULT 'manual',
	`completedAt` timestamp,
	`completedByUserId` int,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_tasks_template_date_unique` UNIQUE(`templateId`,`taskDate`)
);
--> statement-breakpoint
ALTER TABLE `daily_task_templates` ADD CONSTRAINT `daily_task_templates_fiscalYearId_fiscal_years_id_fk` FOREIGN KEY (`fiscalYearId`) REFERENCES `fiscal_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `daily_task_templates` ADD CONSTRAINT `daily_task_templates_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `daily_task_templates` ADD CONSTRAINT `daily_task_templates_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `daily_tasks` ADD CONSTRAINT `daily_tasks_fiscalYearId_fiscal_years_id_fk` FOREIGN KEY (`fiscalYearId`) REFERENCES `fiscal_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `daily_tasks` ADD CONSTRAINT `daily_tasks_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `daily_tasks` ADD CONSTRAINT `daily_tasks_templateId_daily_task_templates_id_fk` FOREIGN KEY (`templateId`) REFERENCES `daily_task_templates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `daily_tasks` ADD CONSTRAINT `daily_tasks_reviewId_reviews_id_fk` FOREIGN KEY (`reviewId`) REFERENCES `reviews`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `daily_tasks` ADD CONSTRAINT `daily_tasks_completedByUserId_users_id_fk` FOREIGN KEY (`completedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `daily_tasks` ADD CONSTRAINT `daily_tasks_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `daily_templates_fy_employee_idx` ON `daily_task_templates` (`fiscalYearId`,`employeeId`,`isActive`);--> statement-breakpoint
CREATE INDEX `daily_templates_dates_idx` ON `daily_task_templates` (`startDate`,`endDate`);--> statement-breakpoint
CREATE INDEX `daily_tasks_fy_employee_date_idx` ON `daily_tasks` (`fiscalYearId`,`employeeId`,`taskDate`);--> statement-breakpoint
CREATE INDEX `daily_tasks_review_idx` ON `daily_tasks` (`reviewId`);--> statement-breakpoint
CREATE INDEX `daily_tasks_status_date_idx` ON `daily_tasks` (`status`,`taskDate`);