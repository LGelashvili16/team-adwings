ALTER TABLE "payroll_policy" DROP CONSTRAINT "payroll_policy_amount_basis_valid";--> statement-breakpoint
ALTER TABLE "payroll_policy" DROP CONSTRAINT "payroll_policy_day_basis_valid";--> statement-breakpoint
ALTER TABLE "payroll_policy" DROP CONSTRAINT "payroll_policy_rates_valid";--> statement-breakpoint
DROP INDEX "payroll_policy_effective";--> statement-breakpoint
ALTER TABLE "payroll_policy" DROP COLUMN "effective_from";--> statement-breakpoint
ALTER TABLE "payroll_policy" DROP COLUMN "amount_basis";--> statement-breakpoint
ALTER TABLE "payroll_policy" DROP COLUMN "day_basis";--> statement-breakpoint
ALTER TABLE "payroll_policy" DROP COLUMN "income_tax_enabled";--> statement-breakpoint
ALTER TABLE "payroll_policy" DROP COLUMN "income_tax_basis_points";--> statement-breakpoint
ALTER TABLE "payroll_policy" DROP COLUMN "pension_enabled";--> statement-breakpoint
ALTER TABLE "payroll_policy" DROP COLUMN "employee_pension_basis_points";--> statement-breakpoint
ALTER TABLE "payroll_policy" DROP COLUMN "employer_pension_basis_points";--> statement-breakpoint
CREATE TABLE "payroll_payment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"month" date NOT NULL,
	"stage" text NOT NULL,
	"policy_version" integer NOT NULL,
	"paid_on" date NOT NULL,
	"base_minor" integer NOT NULL,
	"bonus_minor" integer NOT NULL,
	"premium_minor" integer NOT NULL,
	"fine_minor" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"actor_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"command_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_payment_scope" CHECK (extract(day from "payroll_payment"."month") = 1 and "payroll_payment"."paid_on" >= "payroll_payment"."month" and "payroll_payment"."stage" in ('first','salary','adjustments')),
	CONSTRAINT "payroll_payment_amounts" CHECK ("payroll_payment"."base_minor" between 0 and 100000000 and "payroll_payment"."bonus_minor" between 0 and 100000000 and "payroll_payment"."premium_minor" between 0 and 100000000 and "payroll_payment"."fine_minor" between 0 and 100000000 and "payroll_payment"."total_minor" between 0 and 300000000 and "payroll_payment"."total_minor" = "payroll_payment"."base_minor" + "payroll_payment"."bonus_minor" + "payroll_payment"."premium_minor" - "payroll_payment"."fine_minor"),
	CONSTRAINT "payroll_payment_stage_components" CHECK (("payroll_payment"."stage" = 'adjustments' and "payroll_payment"."base_minor" = 0) or ("payroll_payment"."stage" = 'salary' and "payroll_payment"."bonus_minor" = 0 and "payroll_payment"."premium_minor" = 0) or ("payroll_payment"."stage" = 'first' and "payroll_payment"."bonus_minor" = 0 and "payroll_payment"."premium_minor" = 0 and "payroll_payment"."fine_minor" = 0)),
	CONSTRAINT "payroll_payment_hash" CHECK ("payroll_payment"."command_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "payroll_policy" ADD COLUMN "schedule" jsonb;--> statement-breakpoint
ALTER TABLE "payroll_policy" ADD CONSTRAINT "payroll_policy_schedule_valid" CHECK (jsonb_typeof("payroll_policy"."schedule") = 'object');--> statement-breakpoint
ALTER TABLE "payroll_monthly_entry" ADD COLUMN "first_payment_minor" integer;--> statement-breakpoint
ALTER TABLE "payroll_monthly_entry" ADD COLUMN "fine_stage" text;--> statement-breakpoint
ALTER TABLE "payroll_payment" ADD CONSTRAINT "payroll_payment_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment" ADD CONSTRAINT "payroll_payment_policy_version_payroll_policy_version_fk" FOREIGN KEY ("policy_version") REFERENCES "public"."payroll_policy"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payment" ADD CONSTRAINT "payroll_payment_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_payment_employee_stage" ON "payroll_payment" USING btree ("employee_id","month","stage");--> statement-breakpoint
CREATE INDEX "payroll_payment_month" ON "payroll_payment" USING btree ("month");--> statement-breakpoint
CREATE INDEX "payroll_payment_request" ON "payroll_payment" USING btree ("actor_id","request_id");--> statement-breakpoint
ALTER TABLE "payroll_monthly_entry" ADD CONSTRAINT "payroll_monthly_entry_payment_options" CHECK (("payroll_monthly_entry"."first_payment_minor" is null or "payroll_monthly_entry"."first_payment_minor" between 0 and "payroll_monthly_entry"."base_minor") and ("payroll_monthly_entry"."fine_stage" is null or "payroll_monthly_entry"."fine_stage" in ('salary','adjustments')));
