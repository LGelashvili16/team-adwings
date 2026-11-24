CREATE TABLE "notification_policy" (
	"id" text PRIMARY KEY DEFAULT 'company' NOT NULL,
	"job_created_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_policy_singleton" CHECK ("notification_policy"."id" = 'company')
);
--> statement-breakpoint
CREATE TABLE "notification_policy_audit" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"actor_id" text NOT NULL,
	"before_enabled" boolean NOT NULL,
	"after_enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_policy_audit" ADD CONSTRAINT "notification_policy_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;