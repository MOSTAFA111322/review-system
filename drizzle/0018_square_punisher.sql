ALTER TABLE `notifications` ADD `archivedAt` timestamp;--> statement-breakpoint
CREATE INDEX `notifications_user_archived_idx` ON `notifications` (`userId`,`archivedAt`,`createdAt`);