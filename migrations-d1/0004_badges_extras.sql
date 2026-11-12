ALTER TABLE `businesses` ADD `valuation_verified_at` integer;--> statement-breakpoint
ALTER TABLE `businesses` ADD `audit_passed_at` integer;--> statement-breakpoint
ALTER TABLE `businesses` ADD `extras_ordered` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `items` text DEFAULT '[]' NOT NULL;