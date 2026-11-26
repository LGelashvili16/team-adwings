CREATE TABLE "payroll_award_pool" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"rule_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_key" text NOT NULL,
	"job_id" uuid,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_award_pool_source_valid" CHECK (("payroll_award_pool"."source_type" = 'job' and "payroll_award_pool"."job_id" is not null and "payroll_award_pool"."source_key" = "payroll_award_pool"."job_id"::text) or ("payroll_award_pool"."source_type" = 'external' and "payroll_award_pool"."job_id" is null and length("payroll_award_pool"."source_key") between 3 and 160)),
	CONSTRAINT "payroll_award_pool_state_valid" CHECK ("payroll_award_pool"."version" > 0 and "payroll_award_pool"."status" in ('proposed','withdrawn','approved','rejected','revoked'))
);
--> statement-breakpoint
CREATE TABLE "payroll_award_pool_version" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"pool_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"evidence_verified" boolean DEFAULT false NOT NULL,
	"rule_version_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"quantity_milli" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"reference" text NOT NULL,
	"evidence" text NOT NULL,
	"allocations" jsonb NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"request_id" uuid NOT NULL,
	"command_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_award_pool_review_valid" CHECK ("payroll_award_pool_version"."status" <> 'approved' or "payroll_award_pool_version"."evidence_verified"),
	CONSTRAINT "payroll_award_pool_version_valid" CHECK ("payroll_award_pool_version"."version" > 0 and "payroll_award_pool_version"."status" in ('proposed','withdrawn','approved','rejected','revoked')),
	CONSTRAINT "payroll_award_pool_money_valid" CHECK ("payroll_award_pool_version"."quantity_milli" between 1 and 100000000 and "payroll_award_pool_version"."total_minor" between 1 and 100000000),
	CONSTRAINT "payroll_award_pool_date_valid" CHECK ("payroll_award_pool_version"."work_date" between date '2000-01-01' and date '2100-12-31'),
	CONSTRAINT "payroll_award_pool_evidence_valid" CHECK (length("payroll_award_pool_version"."reference") <= 160 and length(trim("payroll_award_pool_version"."evidence")) between 5 and 1000 and length(trim("payroll_award_pool_version"."reason")) between 5 and 500 and "payroll_award_pool_version"."command_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "payroll_award_pool_allocations_valid" CHECK (jsonb_typeof("payroll_award_pool_version"."allocations") = 'array' and jsonb_array_length("payroll_award_pool_version"."allocations") between 2 and 20)
);
--> statement-breakpoint
CREATE TABLE "payroll_award_source" (
	"rule_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_key" text NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_award_source_rule_id_source_type_source_key_pk" PRIMARY KEY("rule_id","source_type","source_key"),
	CONSTRAINT "payroll_award_source_mode_valid" CHECK ("payroll_award_source"."mode" in ('individual','pool') and "payroll_award_source"."source_type" in ('job','external') and length("payroll_award_source"."source_key") between 3 and 160)
);
--> statement-breakpoint
ALTER TABLE "payroll_award_proposal" DROP CONSTRAINT "payroll_award_state_valid";--> statement-breakpoint
ALTER TABLE "payroll_award_proposal_version" DROP CONSTRAINT "payroll_award_version_state_valid";--> statement-breakpoint
ALTER TABLE "payroll_award_proposal" ADD COLUMN "pool_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_award_proposal_version" ADD COLUMN "pool_version_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_award_proposal_version" ADD COLUMN "evidence_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_award_pool" ADD CONSTRAINT "payroll_award_pool_rule_id_payroll_bonus_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."payroll_bonus_rule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_award_pool" ADD CONSTRAINT "payroll_award_pool_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_award_pool_version" ADD CONSTRAINT "payroll_award_pool_version_pool_id_payroll_award_pool_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."payroll_award_pool"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_award_pool_version" ADD CONSTRAINT "payroll_award_pool_version_rule_version_id_payroll_bonus_rule_version_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."payroll_bonus_rule_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_award_pool_version" ADD CONSTRAINT "payroll_award_pool_version_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_award_source" ADD CONSTRAINT "payroll_award_source_rule_id_payroll_bonus_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."payroll_bonus_rule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_award_pool_source" ON "payroll_award_pool" USING btree ("rule_id","source_type","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_award_pool_revision" ON "payroll_award_pool_version" USING btree ("pool_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_award_pool_command" ON "payroll_award_pool_version" USING btree ("actor_id","request_id");--> statement-breakpoint
ALTER TABLE "payroll_award_proposal" ADD CONSTRAINT "payroll_award_proposal_pool_id_payroll_award_pool_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."payroll_award_pool"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_award_proposal_version" ADD CONSTRAINT "payroll_award_proposal_version_pool_version_id_payroll_award_pool_version_id_fk" FOREIGN KEY ("pool_version_id") REFERENCES "public"."payroll_award_pool_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_award_pool_members" ON "payroll_award_proposal" USING btree ("pool_id","employee_id");--> statement-breakpoint
ALTER TABLE "payroll_award_proposal" ADD CONSTRAINT "payroll_award_state_valid" CHECK ("payroll_award_proposal"."version" > 0 and "payroll_award_proposal"."status" in ('proposed','withdrawn','approved','rejected','revoked'));--> statement-breakpoint
ALTER TABLE "payroll_award_proposal_version" ADD CONSTRAINT "payroll_award_review_valid" CHECK ("payroll_award_proposal_version"."status" <> 'approved' or "payroll_award_proposal_version"."evidence_verified");--> statement-breakpoint
ALTER TABLE "payroll_award_proposal_version" ADD CONSTRAINT "payroll_award_version_state_valid" CHECK ("payroll_award_proposal_version"."version" > 0 and "payroll_award_proposal_version"."status" in ('proposed','withdrawn','approved','rejected','revoked'));
--> statement-breakpoint
-- Preserve existing individual source reservations, including withdrawn proposals.
INSERT INTO "payroll_award_source" ("rule_id", "source_type", "source_key", "mode", "created_at")
SELECT "rule_id", "source_type", "source_key", 'individual', min("created_at")
FROM "payroll_award_proposal"
GROUP BY "rule_id", "source_type", "source_key";
