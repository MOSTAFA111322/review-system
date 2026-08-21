CREATE TABLE `rent_payment_follow_up_activity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`followUpId` int NOT NULL,
	`actorUserId` int,
	`action` varchar(64) NOT NULL,
	`beforeValue` json,
	`afterValue` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rent_payment_follow_up_activity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `rent_payment_follow_up_activity` ADD CONSTRAINT `rent_payment_follow_up_activity_followUpId_rent_payment_follow_ups_id_fk` FOREIGN KEY (`followUpId`) REFERENCES `rent_payment_follow_ups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_payment_follow_up_activity` ADD CONSTRAINT `rent_payment_follow_up_activity_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `rent_followup_activity_followup_idx` ON `rent_payment_follow_up_activity` (`followUpId`,`createdAt`);