ALTER TABLE `reviews` ADD `archivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `reviews` ADD `archivedByUserId` int;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_archivedByUserId_users_id_fk` FOREIGN KEY (`archivedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `reviews_fy_archived_deleted_created_idx` ON `reviews` (`fiscalYearId`,`archivedAt`,`deletedAt`,`createdAt`);