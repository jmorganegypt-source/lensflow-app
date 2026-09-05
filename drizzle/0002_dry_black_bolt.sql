CREATE TYPE "public"."companion_source" AS ENUM('curated', 'self_avatar');--> statement-breakpoint
CREATE TABLE "companion_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"companionId" integer NOT NULL,
	"memorySummary" text,
	"messageCountSinceSummary" integer DEFAULT 0 NOT NULL,
	"lastMessageAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companion_conversations_userId_companionId_unique" UNIQUE("userId","companionId")
);
--> statement-breakpoint
CREATE TABLE "companion_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companions" (
	"id" serial PRIMARY KEY NOT NULL,
	"creatorId" integer,
	"ownerId" integer,
	"source" "companion_source" NOT NULL,
	"name" varchar(80) NOT NULL,
	"tagline" varchar(160),
	"personality" text NOT NULL,
	"avatarImageUrl" text,
	"elevenlabsVoiceId" varchar(64),
	"anamPersonaId" varchar(128),
	"isPublic" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "self_avatar_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"verifiedImageUrl" text NOT NULL,
	"provider" varchar(40) NOT NULL,
	"verifiedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "self_avatar_verifications_userId_unique" UNIQUE("userId")
);
