CREATE TABLE "payroll_bonus_rule" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_bonus_rule_version" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"rule_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"effective_from" date NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"calculation" text NOT NULL,
	"unit_label" text NOT NULL,
	"qualification" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"amount_basis" text NOT NULL,
	"currency" text NOT NULL,
	"enabled" boolean NOT NULL,
	"actor_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_bonus_rule_revision_valid" CHECK ("payroll_bonus_rule_version"."version" > 0),
	CONSTRAINT "payroll_bonus_rule_date_valid" CHECK ("payroll_bonus_rule_version"."effective_from" between date '2000-01-01' and date '2100-12-31'),
	CONSTRAINT "payroll_bonus_rule_name_valid" CHECK (length(trim("payroll_bonus_rule_version"."name")) between 3 and 120),
	CONSTRAINT "payroll_bonus_rule_kind_valid" CHECK ("payroll_bonus_rule_version"."kind" in ('bonus','premium') and "payroll_bonus_rule_version"."calculation" in ('fixed','job','task','additional_work') and ("payroll_bonus_rule_version"."kind" <> 'premium' or "payroll_bonus_rule_version"."calculation" = 'fixed')),
	CONSTRAINT "payroll_bonus_rule_unit_valid" CHECK (("payroll_bonus_rule_version"."calculation" = 'additional_work' and length(trim("payroll_bonus_rule_version"."unit_label")) between 2 and 60) or ("payroll_bonus_rule_version"."calculation" <> 'additional_work' and "payroll_bonus_rule_version"."unit_label" = '')),
	CONSTRAINT "payroll_bonus_rule_qualification_valid" CHECK (length(trim("payroll_bonus_rule_version"."qualification")) between 5 and 1000),
	CONSTRAINT "payroll_bonus_rule_money_valid" CHECK ("payroll_bonus_rule_version"."amount_minor" between 1 and 100000000 and "payroll_bonus_rule_version"."amount_basis" in ('gross','net') and "payroll_bonus_rule_version"."currency" = 'GEL'),
	CONSTRAINT "payroll_bonus_rule_reason_valid" CHECK (length(trim("payroll_bonus_rule_version"."reason")) between 5 and 500)
);
--> statement-breakpoint
ALTER TABLE "payroll_bonus_rule_version" ADD CONSTRAINT "payroll_bonus_rule_version_rule_id_payroll_bonus_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."payroll_bonus_rule"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_bonus_rule_version" ADD CONSTRAINT "payroll_bonus_rule_version_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_bonus_rule_revision" ON "payroll_bonus_rule_version" USING btree ("rule_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_bonus_rule_request" ON "payroll_bonus_rule_version" USING btree ("actor_id","request_id");--> statement-breakpoint
CREATE INDEX "payroll_bonus_rule_effective" ON "payroll_bonus_rule_version" USING btree ("rule_id","effective_from","version");