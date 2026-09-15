ALTER TABLE "quotes" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::text;--> statement-breakpoint
DROP TYPE "public"."quote_status";--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('ACTIVE', 'EXECUTED');--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"public"."quote_status";--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "status" SET DATA TYPE "public"."quote_status" USING "status"::"public"."quote_status";