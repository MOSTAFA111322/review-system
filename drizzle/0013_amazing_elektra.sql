CREATE TABLE `rent_buildings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fiscalYearId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`code` varchar(80),
	`address` varchar(300),
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rent_buildings_id` PRIMARY KEY(`id`),
	CONSTRAINT `rent_buildings_fy_name_unique` UNIQUE(`fiscalYearId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `rent_contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fiscalYearId` int NOT NULL,
	`unitId` int NOT NULL,
	`externalContractNumber` varchar(120),
	`internalContractNumber` varchar(120),
	`tenantName` varchar(180),
	`startDate` date,
	`endDate` date,
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rent_contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `rent_contracts_fy_unit_internal_unique` UNIQUE(`fiscalYearId`,`unitId`,`internalContractNumber`)
);
--> statement-breakpoint
CREATE TABLE `rent_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`buildingId` int NOT NULL,
	`unitNumber` varchar(80) NOT NULL,
	`tenantName` varchar(180),
	`paymentAccountNumber` varchar(160),
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rent_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `rent_units_building_number_unique` UNIQUE(`buildingId`,`unitNumber`)
);
--> statement-breakpoint
ALTER TABLE `rent_payment_follow_ups` ADD `buildingId` int;--> statement-breakpoint
ALTER TABLE `rent_payment_follow_ups` ADD `unitId` int;--> statement-breakpoint
ALTER TABLE `rent_payment_follow_ups` ADD `contractId` int;--> statement-breakpoint
ALTER TABLE `rent_buildings` ADD CONSTRAINT `rent_buildings_fiscalYearId_fiscal_years_id_fk` FOREIGN KEY (`fiscalYearId`) REFERENCES `fiscal_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_buildings` ADD CONSTRAINT `rent_buildings_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_contracts` ADD CONSTRAINT `rent_contracts_fiscalYearId_fiscal_years_id_fk` FOREIGN KEY (`fiscalYearId`) REFERENCES `fiscal_years`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_contracts` ADD CONSTRAINT `rent_contracts_unitId_rent_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `rent_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_contracts` ADD CONSTRAINT `rent_contracts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_units` ADD CONSTRAINT `rent_units_buildingId_rent_buildings_id_fk` FOREIGN KEY (`buildingId`) REFERENCES `rent_buildings`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_units` ADD CONSTRAINT `rent_units_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `rent_buildings_fy_active_idx` ON `rent_buildings` (`fiscalYearId`,`isActive`);--> statement-breakpoint
CREATE INDEX `rent_contracts_fy_active_idx` ON `rent_contracts` (`fiscalYearId`,`isActive`);--> statement-breakpoint
CREATE INDEX `rent_contracts_unit_idx` ON `rent_contracts` (`unitId`);--> statement-breakpoint
CREATE INDEX `rent_units_building_active_idx` ON `rent_units` (`buildingId`,`isActive`);--> statement-breakpoint
ALTER TABLE `rent_payment_follow_ups` ADD CONSTRAINT `rent_payment_follow_ups_buildingId_rent_buildings_id_fk` FOREIGN KEY (`buildingId`) REFERENCES `rent_buildings`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_payment_follow_ups` ADD CONSTRAINT `rent_payment_follow_ups_unitId_rent_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `rent_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rent_payment_follow_ups` ADD CONSTRAINT `rent_payment_follow_ups_contractId_rent_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `rent_contracts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `rent_followups_entity_refs_idx` ON `rent_payment_follow_ups` (`fiscalYearId`,`buildingId`,`unitId`,`contractId`);