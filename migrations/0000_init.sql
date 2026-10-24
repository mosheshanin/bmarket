CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_id` integer NOT NULL,
	`admin_id` integer NOT NULL,
	`admin_name` text,
	`action` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_business_idx` ON `audit_log` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`business_ids` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`cursor` integer DEFAULT 0 NOT NULL,
	`delivered` integer DEFAULT 0 NOT NULL,
	`blocked` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `broadcasts_status_idx` ON `broadcasts` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `business_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_id` integer NOT NULL,
	`r2_key` text NOT NULL,
	`r2_key_small` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`alt` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `photos_business_idx` ON `business_photos` (`business_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_number` integer NOT NULL,
	`slug` text DEFAULT '' NOT NULL,
	`public_title` text DEFAULT '' NOT NULL,
	`category_id` integer,
	`city_id` integer,
	`area_note` text,
	`price_ils` integer,
	`price_negotiable` integer DEFAULT false NOT NULL,
	`monthly_revenue_ils` integer,
	`monthly_profit_ils` integer,
	`payback_months` integer,
	`year_founded` integer,
	`employees_count` integer,
	`area_sqm` integer,
	`rent_monthly_ils` integer,
	`lease_until` text,
	`legal_form` text,
	`business_license` text,
	`included_in_sale` text DEFAULT '[]' NOT NULL,
	`owner_support` text,
	`reason_for_sale` text,
	`short_description` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`video_url` text,
	`is_featured` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`notified_at` integer,
	`real_name` text,
	`exact_address` text,
	`owner_name` text,
	`owner_phone` text,
	`owner_telegram` text,
	`internal_notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `businesses_lot_uq` ON `businesses` (`lot_number`);--> statement-breakpoint
CREATE INDEX `businesses_status_pub_idx` ON `businesses` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `businesses_status_city_idx` ON `businesses` (`status`,`city_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_uq` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `cities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_prepositional` text NOT NULL,
	`slug` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cities_slug_uq` ON `cities` (`slug`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`business_id` integer,
	`source` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_type_created_idx` ON `events` (`type`,`created_at`);--> statement-breakpoint
CREATE INDEX `events_dedup_idx` ON `events` (`visitor_hash`,`business_id`,`type`,`created_at`);--> statement-breakpoint
CREATE INDEX `events_business_idx` ON `events` (`business_id`,`type`,`created_at`);--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`date` text PRIMARY KEY NOT NULL,
	`usd_ils` real NOT NULL,
	`eur_ils` real NOT NULL,
	`source` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`business_id` integer NOT NULL,
	`name` text,
	`phone` text,
	`preferred_contact` text NOT NULL,
	`comment` text,
	`telegram_user_id` integer,
	`telegram_username` text,
	`source` text NOT NULL,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`utm_content` text,
	`utm_term` text,
	`consent_at` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`admin_note` text,
	`handled_by` integer,
	`handled_by_name` text,
	`is_read` integer DEFAULT false NOT NULL,
	`tg_delivered` integer,
	`tg_message_id` integer,
	`ip_hash` text,
	`anonymized_at` integer,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `leads_created_idx` ON `leads` (`created_at`);--> statement-breakpoint
CREATE INDEX `leads_business_idx` ON `leads` (`business_id`);--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads` (`status`);--> statement-breakpoint
CREATE INDEX `leads_ip_idx` ON `leads` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `leads_tg_idx` ON `leads` (`telegram_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscribers` (
	`telegram_user_id` integer PRIMARY KEY NOT NULL,
	`first_name` text,
	`username` text,
	`is_active` integer DEFAULT true NOT NULL,
	`subscribed_at` integer NOT NULL,
	`unsubscribed_at` integer,
	`blocked_at` integer
);
--> statement-breakpoint
CREATE INDEX `subscribers_active_idx` ON `subscribers` (`is_active`,`telegram_user_id`);