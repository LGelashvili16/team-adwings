CREATE TABLE "job_geofence_setting" (
	"version" integer PRIMARY KEY NOT NULL,
	"diameter" smallint NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_geofence_setting_valid" CHECK ("job_geofence_setting"."version" > 0 and "job_geofence_setting"."diameter" in (100, 200))
);
--> statement-breakpoint
ALTER TABLE "job_geofence_setting" ADD CONSTRAINT "job_geofence_setting_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;