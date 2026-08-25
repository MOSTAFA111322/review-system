CREATE TABLE `dashboard_compliance_decline_settings_activity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`previousThreshold` int NOT NULL,
	`nextThreshold` int NOT NULL,
	`actorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dashboard_compliance_decline_settings_activity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `dashboard_alert_settings` ADD `complianceDeclineThreshold` int DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `dashboard_compliance_decline_settings_activity` ADD CONSTRAINT `dash_comp_decline_actor_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `dashboard_compliance_decline_activity_created_idx` ON `dashboard_compliance_decline_settings_activity` (`createdAt`);
