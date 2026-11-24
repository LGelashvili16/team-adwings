CREATE TABLE "job_employee" (
	"job_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "job_employee_job_id_user_id_pk" PRIMARY KEY("job_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "job_event" DROP CONSTRAINT "job_event_action_valid";--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "gps_device_id" uuid;--> statement-breakpoint
ALTER TABLE "job_event" ADD COLUMN "assignment_change" jsonb;--> statement-breakpoint
ALTER TABLE "job_employee" ADD CONSTRAINT "job_employee_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_employee" ADD CONSTRAINT "job_employee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_employee_user" ON "job_employee" USING btree ("user_id","job_id");--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_team_id_production_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."production_team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_gps_device_id_gps_device_id_fk" FOREIGN KEY ("gps_device_id") REFERENCES "public"."gps_device"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_team" ON "job" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "job_gps_device" ON "job" USING btree ("gps_device_id");--> statement-breakpoint
ALTER TABLE "job_event" ADD CONSTRAINT "job_event_action_valid" CHECK ("job_event"."action" in ('created', 'edited', 'status_changed', 'assignments_changed'));