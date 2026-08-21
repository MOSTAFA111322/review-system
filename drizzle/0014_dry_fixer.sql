CREATE TABLE `rent_owners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fiscalYearId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`contactPhone` varchar(80),
	`paymentAccountNumber` varchar(160),
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rent_owners_id` PRIMARY KEY(`id`),
	CONSTRAINT `rent_owners_fy_name_unique` UNIQUE(`fiscalYearId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `rent_settlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fiscalYearId` int NOT NULL,
	`ownerId` int NOT NULL,
	`followUpId` int,
	`contractId` int,
	`grossAmount` decimal(14,2) NOT NULL,
	`managementFee` decimal(14,2) NOT NULL DEFAULT '0',
	`ownerNetAmount` decimal(14,2) NOT NULL,
	`beneficiary` enum('owner','management_company') NOT NULL DEFAULT 'owner',
	`paymentMethod` varchar(80),
	`settlementDate` date NOT NULL,
	`status` enum('pending','settled','cancelled') NOT NULL DEFAULT 'pending',
	`notes` text,
	`sourceFingerprint` varchar(128),
	`createdByUserId` int NOT NULL,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rent_settlements_id` PRIMARY KEY(`id`),
	CONSTRAINT `rent_settlements_source_fingerprint_unique` UNIQUE(`sourceFingerprint`)
);
--> statement-breakpoint
ALTER TABLE `rent_owners` ADD CONSTRAINT `rent_owners_fiscalYearId_fiscal_years_id_fk` FOREIGN KEY (`fiscalYearId`) REFERENCES `fiscal_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_owners` ADD CONSTRAINT `rent_owners_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_settlements` ADD CONSTRAINT `rent_settlements_fiscalYearId_fiscal_years_id_fk` FOREIGN KEY (`fiscalYearId`) REFERENCES `fiscal_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_settlements` ADD CONSTRAINT `rent_settlements_ownerId_rent_owners_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `rent_owners`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_settlements` ADD CONSTRAINT `rent_settlements_followUpId_rent_payment_follow_ups_id_fk` FOREIGN KEY (`followUpId`) REFERENCES `rent_payment_follow_ups`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_settlements` ADD CONSTRAINT `rent_settlements_contractId_rent_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `rent_contracts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_settlements` ADD CONSTRAINT `rent_settlements_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_settlements` ADD CONSTRAINT `rent_settlements_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `rent_owners_fy_active_idx` ON `rent_owners` (`fiscalYearId`,`isActive`);--> statement-breakpoint
CREATE INDEX `rent_settlements_fy_owner_date_idx` ON `rent_settlements` (`fiscalYearId`,`ownerId`,`settlementDate`);--> statement-breakpoint
CREATE INDEX `rent_settlements_followup_idx` ON `rent_settlements` (`followUpId`);--> statement-breakpoint
CREATE INDEX `rent_settlements_status_idx` ON `rent_settlements` (`fiscalYearId`,`status`);