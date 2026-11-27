CREATE TABLE "gps_job_presence" (
	"device_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"state" text NOT NULL,
	"active_visit_id" uuid,
	"geofence_version" integer DEFAULT 0 NOT NULL,
	"geofence_diameter" integer DEFAULT 200 NOT NULL,
	"candidate_since" timestamp with time zone,
	"candidate_fix_id" uuid,
	"last_fix_at" timestamp with time zone,
	"last_fix_id" uuid,
	"last_inside_fix_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gps_job_presence_device_id_job_id_pk" PRIMARY KEY("device_id","job_id"),
	CONSTRAINT "gps_job_presence_state_valid" CHECK ("gps_job_presence"."state" in ('outside', 'pending_entry', 'inside', 'pending_exit') and "gps_job_presence"."geofence_diameter" > 0 and "gps_job_presence"."geofence_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "gps_job_visit" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"job_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"timezone" text NOT NULL,
	"geofence_version" integer NOT NULL,
	"geofence_diameter" integer NOT NULL,
	"entry_fix_id" uuid NOT NULL,
	"exit_fix_id" uuid,
	"confirmed_entry_at" timestamp with time zone NOT NULL,
	"confirmed_exit_at" timestamp with time zone,
	"on_site_seconds" integer DEFAULT 0 NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gps_job_visit_state_valid" CHECK ("gps_job_visit"."mode" in ('observation', 'automatic') and "gps_job_visit"."status" in ('open', 'completed', 'uncertain') and "gps_job_visit"."on_site_seconds" >= 0 and "gps_job_visit"."geofence_diameter" > 0 and "gps_job_visit"."geofence_version" >= 0),
	CONSTRAINT "gps_job_visit_interval_valid" CHECK ("gps_job_visit"."confirmed_exit_at" is null or "gps_job_visit"."confirmed_exit_at" >= "gps_job_visit"."confirmed_entry_at")
);
--> statement-breakpoint
CREATE TABLE "gps_job_visit_crew" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"visit_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"attendance_session_id" uuid,
	"outcome" text NOT NULL,
	"on_site_seconds" integer DEFAULT 0 NOT NULL,
	"conflict_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gps_job_visit_crew_outcome_valid" CHECK ("gps_job_visit_crew"."outcome" in ('observed', 'clocked_in', 'completed', 'conflict_open_session', 'conflict_overlap', 'ineligible') and "gps_job_visit_crew"."on_site_seconds" >= 0 and length("gps_job_visit_crew"."conflict_reason") <= 500)
);
--> statement-breakpoint
ALTER TABLE "attendance_session" ADD COLUMN "gps_visit_id" uuid;--> statement-breakpoint
ALTER TABLE "job_geofence_setting" ADD COLUMN "auto_attendance_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gps_job_presence" ADD CONSTRAINT "gps_job_presence_device_id_gps_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."gps_device"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_job_presence" ADD CONSTRAINT "gps_job_presence_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_job_presence" ADD CONSTRAINT "gps_job_presence_active_visit_id_gps_job_visit_id_fk" FOREIGN KEY ("active_visit_id") REFERENCES "public"."gps_job_visit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_job_presence" ADD CONSTRAINT "gps_job_presence_candidate_fix_id_gps_position_id_fk" FOREIGN KEY ("candidate_fix_id") REFERENCES "public"."gps_position"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_job_presence" ADD CONSTRAINT "gps_job_presence_last_fix_id_gps_position_id_fk" FOREIGN KEY ("last_fix_id") REFERENCES "public"."gps_position"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_job_visit" ADD CONSTRAINT "gps_job_visit_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_job_visit" ADD CONSTRAINT "gps_job_visit_device_id_gps_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."gps_device"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_job_visit" ADD CONSTRAINT "gps_job_visit_entry_fix_id_gps_position_id_fk" FOREIGN KEY ("entry_fix_id") REFERENCES "public"."gps_position"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_job_visit" ADD CONSTRAINT "gps_job_visit_exit_fix_id_gps_position_id_fk" FOREIGN KEY ("exit_fix_id") REFERENCES "public"."gps_position"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_job_visit_crew" ADD CONSTRAINT "gps_job_visit_crew_visit_id_gps_job_visit_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."gps_job_visit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_job_visit_crew" ADD CONSTRAINT "gps_job_visit_crew_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_job_visit_crew" ADD CONSTRAINT "gps_job_visit_crew_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_job_visit_crew" ADD CONSTRAINT "gps_job_visit_crew_attendance_session_id_attendance_session_id_fk" FOREIGN KEY ("attendance_session_id") REFERENCES "public"."attendance_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gps_job_presence_job" ON "gps_job_presence" USING btree ("job_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "gps_job_visit_entry_once" ON "gps_job_visit" USING btree ("device_id","job_id","entry_fix_id");--> statement-breakpoint
CREATE INDEX "gps_job_visit_job_recent" ON "gps_job_visit" USING btree ("job_id","confirmed_entry_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "gps_job_visit_date" ON "gps_job_visit" USING btree ("work_date","device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gps_job_visit_crew_once" ON "gps_job_visit_crew" USING btree ("visit_id","employee_id");--> statement-breakpoint
CREATE INDEX "gps_job_visit_crew_employee" ON "gps_job_visit_crew" USING btree ("employee_id","visit_id");