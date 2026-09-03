CREATE TYPE "public"."booking_status" AS ENUM('pending', 'paid', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'paid', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."room_type" AS ENUM('human', 'avatar');--> statement-breakpoint
CREATE TYPE "public"."slot_status" AS ENUM('open', 'booked', 'cancelled');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"roomId" integer NOT NULL,
	"slotId" integer NOT NULL,
	"creatorId" integer NOT NULL,
	"duoCreatorId" integer,
	"duoSplitPercent" integer DEFAULT 50 NOT NULL,
	"guestName" varchar(160),
	"guestEmail" varchar(320) NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"consentAcceptedAt" timestamp,
	"amountCents" integer DEFAULT 0 NOT NULL,
	"creatorShareCents" integer DEFAULT 0 NOT NULL,
	"platformShareCents" integer DEFAULT 0 NOT NULL,
	"stripeCheckoutSessionId" varchar(255),
	"stripePaymentIntentId" varchar(255),
	"payoutStatus" "payout_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_stripeCheckoutSessionId_unique" UNIQUE("stripeCheckoutSessionId")
);
--> statement-breakpoint
CREATE TABLE "creator_rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"creatorId" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"roomType" "room_type" DEFAULT 'human' NOT NULL,
	"packageLabel" varchar(40),
	"durationMinutes" integer DEFAULT 30 NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"priceCents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"status" "room_status" DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"roomId" integer NOT NULL,
	"startsAt" timestamp NOT NULL,
	"endsAt" timestamp NOT NULL,
	"status" "slot_status" DEFAULT 'open' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" varchar(255) NOT NULL,
	"type" varchar(160) NOT NULL,
	"receivedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_events_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"passwordHash" varchar(255),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
