DROP INDEX `reviews_fy_archived_deleted_created_idx` ON `reviews`;--> statement-breakpoint
ALTER TABLE `reviews` ADD `cancelledAt` timestamp;--> statement-breakpoint
ALTER TABLE `reviews` ADD `cancelledByUserId` int;--> statement-breakpoint
ALTER TABLE `reviews` ADD `cancellationReason` varchar(1000);--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_cancelledByUserId_users_id_fk` FOREIGN KEY (`cancelledByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `reviews_fy_lifecycle_created_idx` ON `reviews` (`fiscalYearId`,`cancelledAt`,`archivedAt`,`deletedAt`,`createdAt`);