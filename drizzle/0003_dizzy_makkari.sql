-- Heal the duplicate curated companions created by a race in
-- seedCuratedCompanions() (concurrent boots both passing a
-- check-then-insert before either committed — see server/seedCompanions.ts
-- for the fix). Keeps the lowest id per curated name, drops the rest.
--
-- Repoint first, in case a conversation somehow already started against a
-- duplicate row in the few minutes it existed, so deleting the duplicate
-- below never orphans it.
UPDATE "companion_conversations" cc
SET "companionId" = keep."id"
FROM "companions" dup
JOIN "companions" keep ON keep."source" = 'curated' AND keep."name" = dup."name" AND keep."id" < dup."id"
WHERE dup."source" = 'curated' AND cc."companionId" = dup."id";
--> statement-breakpoint
DELETE FROM "companions" a
USING "companions" b
WHERE a."source" = 'curated'
  AND b."source" = 'curated'
  AND a."name" = b."name"
  AND a."id" > b."id";
--> statement-breakpoint
CREATE UNIQUE INDEX "companions_curated_name_unique" ON "companions" USING btree ("name") WHERE "companions"."source" = 'curated';
