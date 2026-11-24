ALTER TABLE "notification_policy_audit" ALTER COLUMN "before_enabled" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_policy_audit" ALTER COLUMN "after_enabled" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_policy" ADD COLUMN "job_notification_roles" text[] DEFAULT '{"production_specialist","supervisor","sales_manager","admin","owner"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_policy_audit" ADD COLUMN "before_roles" text[];--> statement-breakpoint
ALTER TABLE "notification_policy_audit" ADD COLUMN "after_roles" text[];--> statement-breakpoint
-- Preserve an administrator's disabled setting before replacing the creation-only switch.
UPDATE "notification_policy" SET "job_notification_roles" = '{}'::text[] WHERE "job_created_enabled" = false;--> statement-breakpoint
ALTER TABLE "notification_policy" DROP COLUMN "job_created_enabled";
