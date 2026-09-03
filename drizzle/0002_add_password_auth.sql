-- Hand-written, additive-only migration (same reasoning as 0001 — drizzle-kit's
-- meta/ snapshot history isn't present in this export, so `drizzle-kit generate`
-- can't diff correctly against it; a fresh generate risks colliding with 0000).
--
-- Adds real, standalone email/password authentication (see server/auth.ts),
-- replacing the Manus-platform-only OAuth login that this exported codebase
-- never actually had the client half of (see git history / PR description).
ALTER TABLE `users` ADD `passwordHash` varchar(255);
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);
