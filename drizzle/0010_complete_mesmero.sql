CREATE TABLE `rent_payment_follow_ups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fiscalYearId` int NOT NULL,
	`buildingName` varchar(180) NOT NULL,
	`apartmentNumber` varchar(80) NOT NULL,
	`tenantName` varchar(180) NOT NULL,
	`paidAmount` decimal(14,2) NOT NULL,
	`paymentDate` date NOT NULL,
	`contractNumber` varchar(120),
	`paymentAccountNumber` varchar(160),
	`ownerConfirmation` enum('pending','confirmed','needs_review') NOT NULL DEFAULT 'pending',
	`ownerConfirmationDate` date,
	`amlakiaReceiptNumber` varchar(120),
	`transferStatus` enum('not_transferred','transferred') NOT NULL DEFAULT 'not_transferred',
	`notes` text,
	`sourceSheet` varchar(180),
	`sourceRow` int,
	`sourceFingerprint` varchar(128),
	`createdByUserId` int NOT NULL,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rent_payment_follow_ups_id` PRIMARY KEY(`id`),
	CONSTRAINT `rent_followups_source_fingerprint_unique` UNIQUE(`sourceFingerprint`)
);
--> statement-breakpoint
ALTER TABLE `rent_payment_follow_ups` ADD CONSTRAINT `rent_payment_follow_ups_fiscalYearId_fiscal_years_id_fk` FOREIGN KEY (`fiscalYearId`) REFERENCES `fiscal_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_payment_follow_ups` ADD CONSTRAINT `rent_payment_follow_ups_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_payment_follow_ups` ADD CONSTRAINT `rent_payment_follow_ups_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `rent_followups_fy_building_date_idx` ON `rent_payment_follow_ups` (`fiscalYearId`,`buildingName`,`paymentDate`);--> statement-breakpoint
CREATE INDEX `rent_followups_confirmation_idx` ON `rent_payment_follow_ups` (`ownerConfirmation`,`transferStatus`);