CREATE TABLE `team_compliance_decline_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fiscalYearId` int NOT NULL,
	`teamName` varchar(160) NOT NULL,
	`periodStart` date NOT NULL,
	`periodEnd` date NOT NULL,
	`completionRate` int NOT NULL,
	`previousCompletionRate` int NOT NULL,
	`completionRateDelta` int NOT NULL,
	`threshold` int NOT NULL,
	`status` enum('new','acknowledged') NOT NULL DEFAULT 'new',
	`acknowledgementNote` text,
	`acknowledgedByUserId` int,
	`acknowledgedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `team_compliance_decline_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `team_compliance_decline_alert_window_unique` UNIQUE(`fiscalYearId`,`teamName`,`periodStart`,`periodEnd`)
);
--> statement-breakpoint
ALTER TABLE `team_compliance_decline_alerts` ADD CONSTRAINT `tcda_fy_fk` FOREIGN KEY (`fiscalYearId`) REFERENCES `fiscal_years`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_compliance_decline_alerts` ADD CONSTRAINT `tcda_ack_user_fk` FOREIGN KEY (`acknowledgedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `team_compliance_decline_alert_fiscal_created_idx` ON `team_compliance_decline_alerts` (`fiscalYearId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `team_compliance_decline_alert_status_idx` ON `team_compliance_decline_alerts` (`status`,`createdAt`);
