CREATE TABLE "job_read" (
	"user_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_read_user_id_job_id_pk" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
-- Existing jobs predate new indicators; only future inserts participate.
ALTER TABLE "job" ADD COLUMN "tracks_reads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "tracks_reads" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "job_read" ADD CONSTRAINT "job_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_read" ADD CONSTRAINT "job_read_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;
