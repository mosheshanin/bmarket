CREATE TABLE `visitor_profiles` (
	`telegram_user_id` integer PRIMARY KEY NOT NULL,
	`intent` text,
	`categories` text DEFAULT '[]' NOT NULL,
	`cities` text DEFAULT '[]' NOT NULL,
	`budget` text,
	`timeline` text,
	`wishes` text DEFAULT '[]' NOT NULL,
	`comment` text,
	`notify_matching` integer DEFAULT false NOT NULL,
	`consult_requested_at` integer,
	`phone` text,
	`username` text,
	`first_name` text,
	`completed_at` integer,
	`skipped_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `profiles_intent_idx` ON `visitor_profiles` (`intent`,`completed_at`);--> statement-breakpoint
CREATE INDEX `profiles_consult_idx` ON `visitor_profiles` (`consult_requested_at`);