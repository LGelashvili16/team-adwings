CREATE TABLE "employee_salary_term" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"employee_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"effective_from" date NOT NULL,
	"kind" text NOT NULL,
	"amount_basis" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_salary_term_version_valid" CHECK ("employee_salary_term"."version" > 0),
	CONSTRAINT "employee_salary_term_date_valid" CHECK ("employee_salary_term"."effective_from" between date '1900-01-01' and date '2100-12-31'),
	CONSTRAINT "employee_salary_term_kind_valid" CHECK ("employee_salary_term"."kind" in ('monthly','hourly')),
	CONSTRAINT "employee_salary_term_basis_valid" CHECK ("employee_salary_term"."amount_basis" in ('gross','net')),
	CONSTRAINT "employee_salary_term_amount_valid" CHECK ("employee_salary_term"."amount_minor" between 1 and 100000000 and "employee_salary_term"."currency" = 'GEL'),
	CONSTRAINT "employee_salary_term_reason_valid" CHECK (length(trim("employee_salary_term"."reason")) between 5 and 500)
);
--> statement-breakpoint
ALTER TABLE "employee_salary_term" ADD CONSTRAINT "employee_salary_term_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salary_term" ADD CONSTRAINT "employee_salary_term_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_salary_term_version" ON "employee_salary_term" USING btree ("employee_id","version");--> statement-breakpoint
CREATE INDEX "employee_salary_term_effective" ON "employee_salary_term" USING btree ("employee_id","effective_from","version");