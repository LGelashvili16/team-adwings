CREATE TABLE "payroll_monthly_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"month" date NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"salary" jsonb NOT NULL,
	"source_token" text NOT NULL,
	"worked_seconds" integer NOT NULL,
	"manual_base" boolean NOT NULL,
	"base_reason" text NOT NULL,
	"base_minor" integer NOT NULL,
	"adjustments" jsonb NOT NULL,
	"bonus_minor" integer NOT NULL,
	"premium_minor" integer NOT NULL,
	"fine_minor" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"request_id" uuid NOT NULL,
	"command_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_monthly_entry_scope" CHECK ("payroll_monthly_entry"."version" > 0 and "payroll_monthly_entry"."month" between date '2000-01-01' and date '2100-12-01' and extract(day from "payroll_monthly_entry"."month") = 1 and "payroll_monthly_entry"."status" in ('draft','finalized','voided')),
	CONSTRAINT "payroll_monthly_entry_amounts" CHECK ("payroll_monthly_entry"."base_minor" between 0 and 100000000 and "payroll_monthly_entry"."bonus_minor" between 0 and 100000000 and "payroll_monthly_entry"."premium_minor" between 0 and 100000000 and "payroll_monthly_entry"."fine_minor" between 0 and 100000000 and "payroll_monthly_entry"."total_minor" between 0 and 100000000 and "payroll_monthly_entry"."total_minor" = "payroll_monthly_entry"."base_minor" + "payroll_monthly_entry"."bonus_minor" + "payroll_monthly_entry"."premium_minor" - "payroll_monthly_entry"."fine_minor"),
	CONSTRAINT "payroll_monthly_entry_time" CHECK ("payroll_monthly_entry"."worked_seconds" between 0 and 2678400),
	CONSTRAINT "payroll_monthly_entry_evidence" CHECK (length(trim("payroll_monthly_entry"."reason")) between 5 and 500 and length("payroll_monthly_entry"."base_reason") <= 500 and (not "payroll_monthly_entry"."manual_base" or length(trim("payroll_monthly_entry"."base_reason")) >= 5) and jsonb_typeof("payroll_monthly_entry"."adjustments") = 'array' and jsonb_array_length("payroll_monthly_entry"."adjustments") <= 20 and "payroll_monthly_entry"."source_token" ~ '^[a-f0-9]{64}$' and "payroll_monthly_entry"."command_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "payroll_monthly_entry" ADD CONSTRAINT "payroll_monthly_entry_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_monthly_entry" ADD CONSTRAINT "payroll_monthly_entry_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_monthly_entry_revision" ON "payroll_monthly_entry" USING btree ("month","employee_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_monthly_entry_retry" ON "payroll_monthly_entry" USING btree ("actor_id","request_id","employee_id");
