CREATE TABLE `bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`slotId` int NOT NULL,
	`creatorId` int NOT NULL,
	`duoCreatorId` int,
	`duoSplitPercent` int NOT NULL DEFAULT 50,
	`guestName` varchar(160),
	`guestEmail` varchar(320) NOT NULL,
	`status` enum('pending','paid','cancelled','refunded') NOT NULL DEFAULT 'pending',
	`consentAcceptedAt` timestamp,
	`amountCents` int NOT NULL DEFAULT 0,
	`creatorShareCents` int NOT NULL DEFAULT 0,
	`platformShareCents` int NOT NULL DEFAULT 0,
	`stripeCheckoutSessionId` varchar(255),
	`stripePaymentIntentId` varchar(255),
	`payoutStatus` enum('pending','processing','paid','not_applicable') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`),
	CONSTRAINT `bookings_stripeCheckoutSessionId_unique` UNIQUE(`stripeCheckoutSessionId`)
);
--> statement-breakpoint
CREATE TABLE `creator_rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creatorId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`description` text NOT NULL,
	`durationMinutes` int NOT NULL DEFAULT 30,
	`capacity` int NOT NULL DEFAULT 1,
	`priceCents` int NOT NULL DEFAULT 0,
	`currency` varchar(3) NOT NULL DEFAULT 'AUD',
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `creator_rooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `room_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`status` enum('open','booked','cancelled') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `room_slots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stripe_events` (
	`id` varchar(255) NOT NULL,
	`type` varchar(160) NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stripe_events_id_pk` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
