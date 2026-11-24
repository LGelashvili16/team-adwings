CREATE TABLE "payroll_calendar_exception" (
	"revision" integer PRIMARY KEY NOT NULL,
	"employee_id" uuid,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"start" text,
	"end" text,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_calendar_revision_valid" CHECK ("payroll_calendar_exception"."revision" > 0),
	CONSTRAINT "payroll_calendar_date_valid" CHECK ("payroll_calendar_exception"."date" between date '2000-01-01' and date '2100-12-31'),
	CONSTRAINT "payroll_calendar_kind_valid" CHECK ("payroll_calendar_exception"."kind" in ('working','day_off','inherit')),
	CONSTRAINT "payroll_calendar_hours_valid" CHECK (("payroll_calendar_exception"."kind" = 'working' and "payroll_calendar_exception"."start" is not null and "payroll_calendar_exception"."end" is not null and "payroll_calendar_exception"."start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "payroll_calendar_exception"."end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "payroll_calendar_exception"."end" > "payroll_calendar_exception"."start") or ("payroll_calendar_exception"."kind" <> 'working' and "payroll_calendar_exception"."start" is null and "payroll_calendar_exception"."end" is null)),
	CONSTRAINT "payroll_calendar_reason_valid" CHECK (length(trim("payroll_calendar_exception"."reason")) between 5 and 500)
);
--> statement-breakpoint
ALTER TABLE "payroll_calendar_exception" ADD CONSTRAINT "payroll_calendar_exception_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_calendar_exception" ADD CONSTRAINT "payroll_calendar_exception_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_calendar_employee_date" ON "payroll_calendar_exception" USING btree ("employee_id","date","revision");--> statement-breakpoint
CREATE INDEX "payroll_calendar_company_date" ON "payroll_calendar_exception" USING btree ("date","revision") WHERE "payroll_calendar_exception"."employee_id" is null;