CREATE TABLE "promo_credit_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"credits" integer NOT NULL,
	"note" varchar(200),
	"grantedBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "promoCredits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "companionAccessUntil" timestamp;