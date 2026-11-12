ALTER TABLE `cities` ADD `is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint
-- Временно работаем только в Хайфе (остальные города — «скоро»).
UPDATE `cities` SET `is_active` = 0 WHERE `slug` <> 'haifa';
