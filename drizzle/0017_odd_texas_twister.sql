ALTER TABLE `notifications` ADD `importance` enum('normal','warning','critical') DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD `teamName` varchar(160);--> statement-breakpoint
CREATE INDEX `notifications_user_importance_idx` ON `notifications` (`userId`,`importance`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notifications_user_team_idx` ON `notifications` (`userId`,`teamName`,`createdAt`);