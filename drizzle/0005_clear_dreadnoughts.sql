CREATE TYPE "public"."companion_sub_status" AS ENUM('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid');--> statement-breakpoint
CREATE TABLE "companion_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"stripeCustomerId" varchar(255),
	"stripeSubscriptionId" varchar(255),
	"status" "companion_sub_status" DEFAULT 'incomplete' NOT NULL,
	"currentPeriodEnd" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companion_subscriptions_userId_unique" UNIQUE("userId"),
	CONSTRAINT "companion_subscriptions_stripeSubscriptionId_unique" UNIQUE("stripeSubscriptionId")
);
