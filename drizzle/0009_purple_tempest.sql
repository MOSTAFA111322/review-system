ALTER TABLE `fiscal_years` ADD `scheduleCronTaskUid` varchar(65);--> statement-breakpoint
CREATE INDEX `fiscal_years_schedule_uid_idx` ON `fiscal_years` (`scheduleCronTaskUid`);