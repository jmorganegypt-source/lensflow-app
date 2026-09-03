-- Adds the two new creator_rooms columns used to model the real "Fantasy Rooms"
-- catalogue: whether a room is a live human or an AI avatar, and which of the
-- 4 live package tiers (Spark/Heat/Peak/Marathon) a room row represents.
-- Hand-written rather than `drizzle-kit generate` because this export does not
-- include drizzle/meta (no prior snapshot to diff against) — safe to run
-- directly, or regenerate with drizzle-kit once you have your real migration
-- history available.
ALTER TABLE `creator_rooms` ADD `roomType` enum('human','avatar') NOT NULL DEFAULT 'human';
--> statement-breakpoint
ALTER TABLE `creator_rooms` ADD `packageLabel` varchar(40);
