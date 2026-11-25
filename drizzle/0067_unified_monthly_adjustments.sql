-- Retire only the old review grants and leave all other overrides intact.
UPDATE "user"
SET "permission_overrides" = jsonb_set(
  jsonb_set("permission_overrides", '{allow}', ("permission_overrides"->'allow') - ARRAY['payroll.deductions.propose', 'payroll.deductions.review']),
  '{deny}', ("permission_overrides"->'deny') - ARRAY['payroll.deductions.propose', 'payroll.deductions.review']
)
WHERE jsonb_typeof("permission_overrides"->'allow') = 'array'
  AND jsonb_typeof("permission_overrides"->'deny') = 'array'
  AND (("permission_overrides"->'allow') ?| ARRAY['payroll.deductions.propose', 'payroll.deductions.review']
    OR ("permission_overrides"->'deny') ?| ARRAY['payroll.deductions.propose', 'payroll.deductions.review']);
--> statement-breakpoint
ALTER TABLE "payroll_monthly_entry" DROP CONSTRAINT "payroll_monthly_entry_amounts";--> statement-breakpoint
ALTER TABLE "payroll_monthly_entry" DROP CONSTRAINT "payroll_monthly_entry_salary_snapshot";--> statement-breakpoint
DROP INDEX "payroll_deduction_directory";--> statement-breakpoint
DROP INDEX "payroll_monthly_entry_revision";--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_monthly_entry_revision" ON "payroll_monthly_entry" USING btree ("month","employee_id","version" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "payroll_monthly_entry" ADD CONSTRAINT "payroll_monthly_entry_amounts" CHECK ("payroll_monthly_entry"."base_minor" between 0 and 100000000 and "payroll_monthly_entry"."bonus_minor" between 0 and 100000000 and "payroll_monthly_entry"."premium_minor" between 0 and 100000000 and "payroll_monthly_entry"."fine_minor" between 0 and 100000000 and "payroll_monthly_entry"."total_minor" between -100000000 and 100000000 and ("payroll_monthly_entry"."salary" is null or "payroll_monthly_entry"."total_minor" >= 0) and "payroll_monthly_entry"."total_minor" = "payroll_monthly_entry"."base_minor" + "payroll_monthly_entry"."bonus_minor" + "payroll_monthly_entry"."premium_minor" - "payroll_monthly_entry"."fine_minor");--> statement-breakpoint
ALTER TABLE "payroll_monthly_entry" ADD CONSTRAINT "payroll_monthly_entry_salary_snapshot" CHECK (("payroll_monthly_entry"."salary" is not null and "payroll_monthly_entry"."source_token" is not null) or ("payroll_monthly_entry"."salary" is null and "payroll_monthly_entry"."source_token" is null and "payroll_monthly_entry"."status" <> 'finalized' and "payroll_monthly_entry"."base_minor" = 0 and "payroll_monthly_entry"."worked_seconds" = 0 and not "payroll_monthly_entry"."manual_base" and "payroll_monthly_entry"."base_reason" = ''));
