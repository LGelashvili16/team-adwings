CREATE TABLE "employee_rest_day_policy" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"effective_from" date NOT NULL,
	"rest_day_clock_in_allowed" boolean NOT NULL,
	"auto_rest_day_bonus_enabled" boolean NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_rest_day_policy_version_valid" CHECK ("employee_rest_day_policy"."version" > 0),
	CONSTRAINT "employee_rest_day_policy_date_valid" CHECK ("employee_rest_day_policy"."effective_from" between date '1900-01-01' and date '2100-12-31'),
	CONSTRAINT "employee_rest_day_policy_reason_valid" CHECK (length(trim("employee_rest_day_policy"."reason")) between 5 and 500)
);
--> statement-breakpoint
CREATE TABLE "payroll_attendance_decision" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"month" date NOT NULL,
	"item_key" text NOT NULL,
	"item_kind" text NOT NULL,
	"version" integer NOT NULL,
	"action" text NOT NULL,
	"source_hash" text NOT NULL,
	"calculated_seconds" integer,
	"override_seconds" integer,
	"calculated_amount_minor" integer,
	"override_amount_minor" integer,
	"note" text DEFAULT '' NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"command_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_attendance_decision_scope" CHECK ("payroll_attendance_decision"."version" > 0 and "payroll_attendance_decision"."month" between date '2000-01-01' and date '2100-12-01' and extract(day from "payroll_attendance_decision"."month") = 1 and length(trim("payroll_attendance_decision"."item_key")) between 3 and 160),
	CONSTRAINT "payroll_attendance_decision_kind_action" CHECK ("payroll_attendance_decision"."item_kind" in ('fixed_rest_day_bonus', 'missing_scheduled_day', 'hourly_earning', 'gps_job_earning', 'gps_conflict') and "payroll_attendance_decision"."action" in ('approved', 'overridden', 'voided', 'resolved')),
	CONSTRAINT "payroll_attendance_decision_amounts" CHECK (("payroll_attendance_decision"."calculated_amount_minor" is null or "payroll_attendance_decision"."calculated_amount_minor" between 0 and 100000000) and ("payroll_attendance_decision"."override_amount_minor" is null or "payroll_attendance_decision"."override_amount_minor" between 0 and 100000000) and ("payroll_attendance_decision"."action" <> 'overridden' or "payroll_attendance_decision"."override_amount_minor" is not null) and ("payroll_attendance_decision"."calculated_seconds" is null or "payroll_attendance_decision"."calculated_seconds" between 0 and 2678400) and ("payroll_attendance_decision"."override_seconds" is null or "payroll_attendance_decision"."override_seconds" between 0 and 2678400)),
	CONSTRAINT "payroll_attendance_decision_audit" CHECK (length(trim("payroll_attendance_decision"."reason")) between 5 and 500 and length("payroll_attendance_decision"."note") <= 500 and "payroll_attendance_decision"."source_hash" ~ '^[a-f0-9]{64}$' and "payroll_attendance_decision"."command_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "employee_rest_day_policy" ADD CONSTRAINT "employee_rest_day_policy_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_rest_day_policy" ADD CONSTRAINT "employee_rest_day_policy_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_attendance_decision" ADD CONSTRAINT "payroll_attendance_decision_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_attendance_decision" ADD CONSTRAINT "payroll_attendance_decision_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_rest_day_policy_version" ON "employee_rest_day_policy" USING btree ("employee_id","version");--> statement-breakpoint
CREATE INDEX "employee_rest_day_policy_effective" ON "employee_rest_day_policy" USING btree ("employee_id","effective_from","version");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_attendance_decision_revision" ON "payroll_attendance_decision" USING btree ("employee_id","month","item_key","version" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_attendance_decision_retry" ON "payroll_attendance_decision" USING btree ("actor_id","request_id");--> statement-breakpoint
CREATE INDEX "payroll_attendance_decision_month" ON "payroll_attendance_decision" USING btree ("month","employee_id","item_key","version" DESC NULLS LAST);