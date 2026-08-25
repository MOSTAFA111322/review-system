CREATE TABLE `dashboard_alert_settings_activity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scope` enum('global','team') NOT NULL,
	`teamName` varchar(160),
	`previousThreshold` int NOT NULL,
	`nextThreshold` int NOT NULL,
	`actorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dashboard_alert_settings_activity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dashboard_team_alert_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamName` varchar(160) NOT NULL,
	`overdueThreshold` int NOT NULL,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dashboard_team_alert_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `dashboard_team_alert_settings_team_unique` UNIQUE(`teamName`)
);
--> statement-breakpoint
ALTER TABLE `dashboard_alert_settings_activity` ADD CONSTRAINT `dashboard_alert_settings_activity_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dashboard_team_alert_settings` ADD CONSTRAINT `dashboard_team_alert_settings_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `dashboard_alert_activity_created_idx` ON `dashboard_alert_settings_activity` (`createdAt`);--> statement-breakpoint
CREATE INDEX `dashboard_alert_activity_team_idx` ON `dashboard_alert_settings_activity` (`teamName`,`createdAt`);