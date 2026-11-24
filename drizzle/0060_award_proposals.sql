CREATE TABLE "payroll_award_proposal" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"rule_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_key" text NOT NULL,
	"job_id" uuid,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_award_source_valid" CHECK (("payroll_award_proposal"."source_type" = 'job' and "payroll_award_proposal"."job_id" is not null and "payroll_award_proposal"."source_key" = "payroll_award_proposal"."job_id"::text) or ("payroll_award_proposal"."source_type" = 'external' and "payroll_award_proposal"."job_id" is null and length("payroll_award_proposal"."source_key") between 3 and 160)),
	CONSTRAINT "payroll_award_state_valid" CHECK ("payroll_award_proposal"."version" > 0 and "payroll_award_proposal"."status" in ('proposed','withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "payroll_award_proposal_version" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"rule_version_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"quantity_milli" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"reference" text NOT NULL,
	"evidence" text NOT NULL,
	"completion_event_id" uuid,
	"source_snapshot" jsonb NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"request_id" uuid NOT NULL,
	"command_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_award_version_state_valid" CHECK ("payroll_award_proposal_version"."version" > 0 and "payroll_award_proposal_version"."status" in ('proposed','withdrawn')),
	CONSTRAINT "payroll_award_work_date_valid" CHECK ("payroll_award_proposal_version"."work_date" between date '2000-01-01' and date '2100-12-31'),
	CONSTRAINT "payroll_award_quantity_valid" CHECK ("payroll_award_proposal_version"."quantity_milli" between 1 and 100000000 and "payroll_award_proposal_version"."amount_minor" between 1 and 100000000),
	CONSTRAINT "payroll_award_evidence_valid" CHECK (length(trim("payroll_award_proposal_version"."evidence")) between 5 and 1000 and length("payroll_award_proposal_version"."reference") <= 160 and length(trim("payroll_award_proposal_version"."reason")) between 5 and 500 and "payroll_award_proposal_version"."command_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "payroll_award_proposal" ADD CONSTRAINT "payroll_award_proposal_rule_id_payroll_bonus_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."payroll_bonus_rule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_award_proposal" ADD CONSTRAINT "payroll_award_proposal_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_award_proposal" ADD CONSTRAINT "payroll_award_proposal_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_award_proposal_version" ADD CONSTRAINT "payroll_award_proposal_version_proposal_id_payroll_award_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."payroll_award_proposal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_award_proposal_version" ADD CONSTRAINT "payroll_award_proposal_version_rule_version_id_payroll_bonus_rule_version_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."payroll_bonus_rule_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_award_proposal_version" ADD CONSTRAINT "payroll_award_proposal_version_completion_event_id_job_event_id_fk" FOREIGN KEY ("completion_event_id") REFERENCES "public"."job_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_award_proposal_version" ADD CONSTRAINT "payroll_award_proposal_version_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_award_source_claim" ON "payroll_award_proposal" USING btree ("rule_id","employee_id","source_type","source_key");--> statement-breakpoint
CREATE INDEX "payroll_award_directory" ON "payroll_award_proposal" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_award_version" ON "payroll_award_proposal_version" USING btree ("proposal_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_award_command" ON "payroll_award_proposal_version" USING btree ("actor_id","request_id");