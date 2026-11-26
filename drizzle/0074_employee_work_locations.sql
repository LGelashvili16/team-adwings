CREATE TABLE "employee_work_location" (
	"employee_id" uuid NOT NULL,
	"weekday" integer,
	"date" date,
	"remote" boolean NOT NULL,
	CONSTRAINT "employee_work_location_weekday_unique" UNIQUE("employee_id","weekday"),
	CONSTRAINT "employee_work_location_date_unique" UNIQUE("employee_id","date"),
	CONSTRAINT "employee_work_location_day_valid" CHECK (("employee_work_location"."weekday" is null and "employee_work_location"."date" is not null) or ("employee_work_location"."weekday" is not null and "employee_work_location"."weekday" between 1 and 7 and "employee_work_location"."date" is null and "employee_work_location"."remote"))
);
--> statement-breakpoint
ALTER TABLE "employee_work_location" ADD CONSTRAINT "employee_work_location_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;