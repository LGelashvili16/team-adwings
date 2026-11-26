CREATE TABLE "employee_employment_audit" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_employment_audit_action_valid" CHECK ("employee_employment_audit"."action" in ('created', 'updated', 'voided')),
	CONSTRAINT "employee_employment_audit_reason_valid" CHECK (length(trim("employee_employment_audit"."reason")) between 5 and 500)
);
--> statement-breakpoint
CREATE TABLE "employee_employment_period" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_employment_period_dates_valid" CHECK ("employee_employment_period"."start_date" between date '1900-01-01' and date '2100-12-31' and ("employee_employment_period"."end_date" is null or ("employee_employment_period"."end_date" >= "employee_employment_period"."start_date" and "employee_employment_period"."end_date" <= date '2100-12-31')))
);
--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "employment_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_employment_audit" ADD CONSTRAINT "employee_employment_audit_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_employment_audit" ADD CONSTRAINT "employee_employment_audit_period_id_employee_employment_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."employee_employment_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_employment_audit" ADD CONSTRAINT "employee_employment_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_employment_period" ADD CONSTRAINT "employee_employment_period_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_employment_audit_history" ON "employee_employment_audit" USING btree ("employee_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_employment_period_start" ON "employee_employment_period" USING btree ("employee_id","start_date") WHERE "employee_employment_period"."voided_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_employment_period_one_open" ON "employee_employment_period" USING btree ("employee_id") WHERE "employee_employment_period"."end_date" is null and "employee_employment_period"."voided_at" is null;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_employment_revision_valid" CHECK ("employee"."employment_revision" >= 0);