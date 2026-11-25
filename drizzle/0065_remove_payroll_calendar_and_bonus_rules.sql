-- Remove retired grants while preserving every other permission override.
UPDATE "user"
SET "permission_overrides" = jsonb_set(
  jsonb_set("permission_overrides", '{allow}', ("permission_overrides"->'allow') - ARRAY['payroll.awards.propose', 'payroll.awards.review']),
  '{deny}', ("permission_overrides"->'deny') - ARRAY['payroll.awards.propose', 'payroll.awards.review']
)
WHERE jsonb_typeof("permission_overrides"->'allow') = 'array'
  AND jsonb_typeof("permission_overrides"->'deny') = 'array'
  AND (("permission_overrides"->'allow') ?| ARRAY['payroll.awards.propose', 'payroll.awards.review']
    OR ("permission_overrides"->'deny') ?| ARRAY['payroll.awards.propose', 'payroll.awards.review']);
--> statement-breakpoint
DROP TABLE
  "payroll_calendar_exception",
  "payroll_bonus_rule",
  "payroll_bonus_rule_version",
  "payroll_award_proposal",
  "payroll_award_proposal_version",
  "payroll_award_pool",
  "payroll_award_pool_version",
  "payroll_award_source";
