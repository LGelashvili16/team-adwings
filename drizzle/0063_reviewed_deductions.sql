CREATE TABLE "payroll_deduction" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_key" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_deduction_identity_valid" CHECK ("payroll_deduction"."kind" in ('fine','other_deduction') and length("payroll_deduction"."source_key") between 3 and 160),
	CONSTRAINT "payroll_deduction_state_valid" CHECK ("payroll_deduction"."version" > 0 and "payroll_deduction"."status" in ('proposed','withdrawn','approved','rejected','revoked'))
);
--> statement-breakpoint
CREATE TABLE "payroll_deduction_version" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"deduction_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"occurred_on" date NOT NULL,
	"payroll_month" date NOT NULL,
	"amount_minor" integer NOT NULL,
	"reference" text NOT NULL,
	"evidence" text NOT NULL,
	"basis" text NOT NULL,
	"employment_revision" integer NOT NULL,
	"timezone" text NOT NULL,
	"evidence_verified" boolean DEFAULT false NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"request_id" uuid NOT NULL,
	"command_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_deduction_version_valid" CHECK ("payroll_deduction_version"."version" > 0 and "payroll_deduction_version"."status" in ('proposed','withdrawn','approved','rejected','revoked')),
	CONSTRAINT "payroll_deduction_money_valid" CHECK ("payroll_deduction_version"."amount_minor" between 1 and 100000000),
	CONSTRAINT "payroll_deduction_dates_valid" CHECK ("payroll_deduction_version"."occurred_on" between date '2000-01-01' and date '2100-12-31' and "payroll_deduction_version"."payroll_month" between date '2000-01-01' and date '2100-12-01' and extract(day from "payroll_deduction_version"."payroll_month") = 1 and "payroll_deduction_version"."payroll_month" >= date_trunc('month', "payroll_deduction_version"."occurred_on")::date),
	CONSTRAINT "payroll_deduction_evidence_valid" CHECK (length(trim("payroll_deduction_version"."reference")) between 3 and 160 and length(trim("payroll_deduction_version"."evidence")) between 5 and 1000 and length(trim("payroll_deduction_version"."basis")) between 5 and 1000 and length(trim("payroll_deduction_version"."reason")) between 5 and 500 and "payroll_deduction_version"."employment_revision" > 0 and length("payroll_deduction_version"."timezone") between 1 and 100 and "payroll_deduction_version"."command_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "payroll_deduction_review_valid" CHECK ("payroll_deduction_version"."status" <> 'approved' or "payroll_deduction_version"."evidence_verified")
);
--> statement-breakpoint
ALTER TABLE "payroll_deduction" ADD CONSTRAINT "payroll_deduction_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_deduction_version" ADD CONSTRAINT "payroll_deduction_version_deduction_id_payroll_deduction_id_fk" FOREIGN KEY ("deduction_id") REFERENCES "public"."payroll_deduction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_deduction_version" ADD CONSTRAINT "payroll_deduction_version_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_deduction_source" ON "payroll_deduction" USING btree ("employee_id","source_key");--> statement-breakpoint
CREATE INDEX "payroll_deduction_directory" ON "payroll_deduction" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_deduction_revision" ON "payroll_deduction_version" USING btree ("deduction_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_deduction_command" ON "payroll_deduction_version" USING btree ("actor_id","request_id");