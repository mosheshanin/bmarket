CREATE TABLE `edit_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_id` integer NOT NULL,
	`tg_user_id` integer NOT NULL,
	`text` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`admin_note` text,
	`handled_by` integer,
	`handled_by_name` text,
	`created_at` integer NOT NULL,
	`handled_at` integer,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `edit_requests_business_idx` ON `edit_requests` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `edit_requests_status_idx` ON `edit_requests` (`status`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_id` integer NOT NULL,
	`tg_user_id` integer,
	`provider` text NOT NULL,
	`provider_order_id` text,
	`capture_id` text,
	`status` text DEFAULT 'created' NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'ILS' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`checked_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_order_uq` ON `payments` (`provider_order_id`);--> statement-breakpoint
CREATE INDEX `payments_business_idx` ON `payments` (`business_id`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `businesses` ADD `seller_tg_id` integer;--> statement-breakpoint
ALTER TABLE `businesses` ADD `seller_stage` text;--> statement-breakpoint
CREATE INDEX `businesses_seller_idx` ON `businesses` (`seller_tg_id`);--> statement-breakpoint
ALTER TABLE `leads` ADD `tg_chat_id` text;