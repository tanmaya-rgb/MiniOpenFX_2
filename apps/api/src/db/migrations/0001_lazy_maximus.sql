CREATE TYPE "public"."ledger_reason" AS ENUM('DEPOSIT', 'TRADE');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('ACTIVE', 'EXPIRED', 'EXECUTED');--> statement-breakpoint
CREATE TYPE "public"."trade_side" AS ENUM('BUY', 'SELL');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('FILLED', 'REJECTED');--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "reason" SET DATA TYPE "public"."ledger_reason" USING "reason"::"public"."ledger_reason";--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "side" SET DATA TYPE "public"."trade_side" USING "side"::"public"."trade_side";--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"public"."quote_status";--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "status" SET DATA TYPE "public"."quote_status" USING "status"::"public"."quote_status";--> statement-breakpoint
ALTER TABLE "trades" ALTER COLUMN "side" SET DATA TYPE "public"."trade_side" USING "side"::"public"."trade_side";--> statement-breakpoint
ALTER TABLE "trades" ALTER COLUMN "status" SET DATA TYPE "public"."trade_status" USING "status"::"public"."trade_status";