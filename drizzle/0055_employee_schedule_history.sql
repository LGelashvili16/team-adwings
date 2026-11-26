CREATE TABLE "employee_schedule_version" (
	"employee_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"effective_from" date NOT NULL,
	"days" jsonb,
	"actor_id" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_schedule_version_employee_id_version_pk" PRIMARY KEY("employee_id","version"),
	CONSTRAINT "employee_schedule_version_positive" CHECK ("employee_schedule_version"."version" > 0),
	CONSTRAINT "employee_schedule_version_week_valid" CHECK ("employee_schedule_version"."days" is null or (jsonb_typeof("employee_schedule_version"."days") = 'array' and jsonb_array_length("employee_schedule_version"."days") = 7)),
	CONSTRAINT "employee_schedule_version_source_valid" CHECK (("employee_schedule_version"."source" = 'migration' and "employee_schedule_version"."actor_id" is null) or "employee_schedule_version"."source" = 'provisioned' or ("employee_schedule_version"."source" = 'changed' and "employee_schedule_version"."actor_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "employee_schedule_version" ADD CONSTRAINT "employee_schedule_version_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_schedule_version" ADD CONSTRAINT "employee_schedule_version_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_schedule_version_effective" ON "employee_schedule_version" USING btree ("employee_id","effective_from","version");
--> statement-breakpoint
-- Observe current assignments only from the migration's company-local date. Earlier missing days have no reliable employee schedule history.
INSERT INTO "employee_schedule_version" ("employee_id", "version", "effective_from", "days", "actor_id", "source")
SELECT person.id, 1,
  (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(
    (SELECT timezone FROM company_schedule ORDER BY effective_from DESC LIMIT 1),
    'Asia/Tbilisi'
  ))::date,
  assignment.days, NULL, 'migration'
FROM employee person
LEFT JOIN employee_work_schedule assignment ON assignment.employee_id = person.id;
