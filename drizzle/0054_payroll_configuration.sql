CREATE TABLE "payroll_policy" (
	"version" integer PRIMARY KEY NOT NULL,
	"effective_from" date NOT NULL,
	"amount_basis" text NOT NULL,
	"day_basis" text NOT NULL,
	"income_tax_enabled" boolean NOT NULL,
	"income_tax_basis_points" integer NOT NULL,
	"pension_enabled" boolean NOT NULL,
	"employee_pension_basis_points" integer NOT NULL,
	"employer_pension_basis_points" integer NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_policy_version_valid" CHECK ("payroll_policy"."version" > 0),
	CONSTRAINT "payroll_policy_amount_basis_valid" CHECK ("payroll_policy"."amount_basis" in ('gross', 'net')),
	CONSTRAINT "payroll_policy_day_basis_valid" CHECK ("payroll_policy"."day_basis" in ('scheduled_workdays', 'calendar_days', 'fixed_30')),
	CONSTRAINT "payroll_policy_rates_valid" CHECK ("payroll_policy"."income_tax_basis_points" between 1 and 10000 and "payroll_policy"."employee_pension_basis_points" between 1 and 10000 and "payroll_policy"."employer_pension_basis_points" between 1 and 10000),
	CONSTRAINT "payroll_policy_reason_valid" CHECK (length(trim("payroll_policy"."reason")) between 5 and 500)
);
--> statement-breakpoint
ALTER TABLE "payroll_policy" ADD CONSTRAINT "payroll_policy_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_policy_effective" ON "payroll_policy" USING btree ("effective_from","version");