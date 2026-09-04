CREATE TABLE "coinbase_events" (
	"id" varchar(255) NOT NULL,
	"type" varchar(160) NOT NULL,
	"receivedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coinbase_events_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"displayName" varchar(160),
	"avatarDataUrl" text,
	"isLive" boolean DEFAULT false NOT NULL,
	"payoutWalletAddress" varchar(128),
	"payoutWalletAsset" varchar(32),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_profiles_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "coinbaseChargeId" varchar(255);--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_coinbaseChargeId_unique" UNIQUE("coinbaseChargeId");