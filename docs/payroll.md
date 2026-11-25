# Payroll configuration and delivery

Employee compensation is authorized product scope. The first delivered workflow is `/manage/payroll/settings`, titled `ხელფასების პარამეტრები`, and the `accountant` role labeled `ბუღალტერი`.

Use the [implementation instructions and checked progress plan](payroll-implementation-plan.md) to continue delivery. It records completed work, independently verifiable next steps and remaining decisions.

## Delivered configuration

Administrators, accountants and owners receive `manage.access`, `payroll.configure`, `payroll.read.all`, `payroll.terms.manage`, `payroll.awards.propose` and `payroll.awards.review`. Award review requires independence from all preparers and beneficiaries. Accountants receive no account-administration, employee-management, attendance-review or monthly payroll-finalization authority by default. Explicit permission denials still apply. Route guards and server functions enforce their respective permissions. Services re-read persisted roles, overrides, access state and employment status under share locks, so stale actors cannot retain access.

Accountant is a privileged provisionable role alongside administrator. Only actors with `admin.access`, `users.manage` and `roles.manage` may provision or assign it. Ordinary HR employee-management rights cannot grant accountant or reset, edit or suspend an accountant account. Existing administrative role editing retains its self-modification prohibition, session revocation and audits.

The form stores an effective date, default gross/net agreement basis, fixed-monthly daily divisor, income-tax calculation toggle and rate, pension calculation toggle, and separate employee/employer pension rates. The divisor options are scheduled working days, calendar days, or a fixed 30 days; these are contractual settings, not a claim that every selection fits every employment agreement. Suggested percentages are 20%, 2% and 2%. Neither calculation toggle is enabled by the unsaved draft.

Every save creates an immutable `payroll_policy` version with the trusted author, required reason and database timestamp. This row is also its audit record, committed atomically. An advisory transaction lock serializes first/subsequent saves; the expected version rejects stale drafts. Rates use integer hundredths of a percent, avoiding floating-point persistence. Past-effective writes are rejected using the company-local date. Future policies are retained separately from the currently applicable policy. For a date, select the greatest effective date on or before it, then the greatest version for that date. Several same-day saves preserve every version. A later edit for an earlier effective date does not cancel an existing future-dated policy.

Reads create no policies. Suggested defaults never imply a saved configuration or an employee salary. The screen explicitly states that employee salary accrual, withholding, approval and payment are not implemented in this delivery. Disabling built-in withholding means external accounting, not exemption from a statutory obligation. Pension participation and tax exemptions will be employee-specific inputs to the calculation workflow.

## Georgian legal baseline

Checked 2026-11-24 against the [Tax Code](https://matsne.gov.ge/ka/document/view/1043717), [Funded Pension Law](https://matsne.gov.ge/ka/document/view/4280127), and [Labour Code](https://matsne.gov.ge/ka/document/view/1155567). Standard employment-income tax is 20%, subject to applicable exemptions. For pension participants, the standard employee and employer contributions are 2% each. The employer contribution is an additional company expense. Ordinary employment bonuses and premiums require employment-income classification; their names do not establish exemptions. Policy percentages remain configurable to accommodate lawful applicable rules and changes, but saved settings alone do not establish legal compliance.

Before activating calculations, obtain accountant-reviewed examples for tax bases, pension eligibility/exemptions, sick pay, vacation pay, overtime, gross-up agreements, rounding, deductions and reporting dates. A fine must not automatically reduce taxable earnings. A missing attendance record is not proof of an unlawful absence or a lawful deduction.

## Next delivery stages

1. Add reviewed bulk fixed premiums, reusing the delivered individual/pool evidence, allocation and independent award-review controls. Bulk awards must distinguish a full amount per person from one shared total.
2. Add reviewed deduction proposals with reasons, retained decisions and no self-approval. Keep missing-day earnings adjustments separate from fines and other employee deductions.
3. Use the retained monthly/hourly employee compensation terms, employment periods and calendar references for monthly drafts. Keep payroll payable-time classification separate from recorded timesheet totals; resolve open, provisional, pending and rejected attendance explicitly.
4. Build monthly drafts with daily calculation explanations. Detect potential absences only after expected work ends and after checking approved/pending leave, holidays, overnight attendance and employer/system exceptions. Warnings never deduct money without a separate authorized decision.
5. Add employee statutory profiles and exact gross-to-net calculations. Separate employee pension withholding, income tax, lawful other deductions and employer contributions. Record legal policy versions and actual calculation inputs on each statement.
6. Add independent approval/publication permissions, no self-approval, immutable published statements and auditable subsequent adjustments. Retain both earning periods and actual payment/reporting dates. Tax/pension declaration and remittance integrations are separate workflows.
7. Reconcile a shadow payroll month against accountant calculations before operational use. Do not fabricate historical compensation or employment dates.

## Retained individual schedule history

Migration `0055_employee_schedule_history.sql` establishes one observed opening version for each existing employee, using the company-local migration date and their current individual schedule or explicit company inheritance. The source is `migration`, with no invented human editor or earlier effective date. For production rollout, pause schedule writes between the migration and release of the new writer so an older application cannot make unrecorded changes during that interval.

New account provisioning records an inherited or individual opening decision in the account transaction. Operator-only owner bootstrap is explicitly attributed as provisioning without a human actor. Schedule changes and removal of a custom week append versions in the same transaction as the existing current assignment, notifications and access audit. Employee row locks serialize version allocation; a failed history insert rolls the assignment back. Identical current-state saves do not create changes. Every same-day change is retained, and the highest version provides that date's reference. Already-started attendance sessions retain their own original expectation snapshots.

The private `getHistoricalEmployeeSchedule` service validates an employee UUID and inclusive date range of at most 366 days. One SQL snapshot resolves retained employee decisions against the company schedule effective on each date. It returns daily reference hours and distinguishes `unknown_history`, `unconfigured`, `scheduled` and `day_off`. Inheritance is a known decision; an absent earlier version is unknown. Missing company weekday rows and malformed retained individual weeks cannot become known days off. Callers must establish the actor's permissions and target-employee scope before this internal read, as with existing attendance/leave scheduling interfaces. It has no independently exposed HTTP or server-function endpoint.

This supplies schedule references for future calculations, without applying leave, holiday exceptions, absence decisions, payable-time classification or money calculations. Current attendance and vacation-allowance workflows continue to use their existing current-assignment behavior; this release does not recalculate historical leave charges. The payroll calendar below composes these references without changing that scheduling contract.

## Payroll calendar and exceptions

`/manage/payroll/calendar` is the calendar tab alongside employee salaries and configuration. Company calendar reads and changes require `manage.access` and `payroll.configure`; employee selection, reads and changes additionally require `payroll.read.all`. These permissions default to administrators, accountants and owners. Services recheck current persisted authorization. An employee-specific exception cannot be edited by its subject. The picker selects only minimal employee identity, with debounced search and server pagination.

Each confirmed company-local date can have a company or employee working-day/rest-day exception. Working dates require explicit same-day start/end times. Restoring inheritance appends a new decision rather than deleting history. A required reason, trusted actor, timestamp and global revision are retained on every decision. The revision check and advisory transaction lock reject concurrent stale saves; failed writes retain the editor draft. Migration `0058_payroll_calendar_exceptions.sql` adds only this immutable table, with date, kind, time and reason constraints. There is no calendar backfill.

Precedence is employee exception, company exception, statutory holiday, then historical recurring employee/company schedule. Removing an employee exception reveals the company exception; removing a company exception reveals the statutory/recurring rule. An absent historical employee decision, incomplete company week or unverified legal calendar stays unresolved even when an exception exists. A company-only preview uses company schedule history without inventing an employee version. Pending and approved leave are separate contextual facts; neither changes the expected schedule or establishes payable leave. Existing overnight attendance keeps its original work date and stored expectation snapshot. Calendar writes change no attendance, leave balance, employment period, salary or absence decision.

The existing fixed-date and Orthodox Easter holiday calculation is shared with leave allowance rules. The general holiday baseline was checked on 2026-11-25 against [Labour Code Article 30](https://matsne.gov.ge/ka/document/view/1155567). Statutory holiday work retains its holiday marker and is flagged for later remuneration review under Articles 27 and 30; marking a date working does not remove that obligation. Government-declared additional dates and contractual substitutions need individually confirmed entries and reasons. No decree dates, applicability or automatic substitute days are guessed. For example, the [2024 May 17 decree](https://www.matsne.gov.ge/ka/document/view/6173967) had a defined administrative-body scope and cannot establish a general private-employer holiday for that year.

Financial coverage of the verified general list starts at 2025-01-01. Earlier dates return `legalCalendarKnown: false`, no assumed statutory marker and unresolved hours. Historical legal regimes require a separately verified version before calculations may use them. The calendar's rule identifier is `labour-code-30-2026-11-25`; this is a retained reference, not automatic legal-policy updating. The leave helper's existing behavior is preserved rather than retroactively changing approved charges.

The private `getPayrollCalendar(tx, input)` service validates an employee UUID and at most 366 dates. Its caller owns employee authorization and a consistent transaction. Results include the calendar revision, legal-rule version, dated schedule sources and pending/approved leave IDs/revisions. The calendar revision covers exception decisions only. Future draft/finalization workflows must independently reread and snapshot the complete schedule, employment, leave, compensation and legal inputs, then revalidate them atomically. Missing sources must block a financial conclusion. Monthly view/history parameters are Zod-validated URL state; history is month/person scoped, searchable by author or reason and paginated at ten decisions per page. Query placeholders never retain another actor, employee or month's data.

## Confirmed employment periods

Employee profiles at `/manage/employees/$employeeId` now compose the `employees` feature's employment-period card. Readers need `manage.access` and `employees.manage`; mutations also need `employees.employment.manage`, granted to HR, administrators and owners by default. Accountants retain their separate payroll-configuration scope. Editing one's own periods is forbidden, including for owners. HR can confirm business dates for an administrator/accountant without receiving authority over that person's roles, account access or recovery codes.

Each confirmed period has inclusive company-local start/end dates; an empty end means ongoing employment. Separate non-overlapping periods support partial months and rehires. Planned dates are allowed and labeled. Neither account creation nor activation establishes a start date. Neither suspension nor the existing employee access status supplies an end date. Saving or voiding a period changes no access state and does not schedule a future account suspension.

The right-side Sheet requires a reason for creation, correction and voiding. It retains failed drafts and captured revisions, prevents duplicate saves/dismissal while pending, and stays mounted through the shared close transition. The period table uses TanStack Table with shared shadcn presentation. `employmentPage` and `employmentHistoryPage` are independently validated, one-based URL state; each server page contains at most five entries. History retains exact before/after dates, operation, trusted actor, timestamp and reason. Voiding excludes a period from eligibility without deleting its audit.

Migration `0056_employee_employment_periods.sql` adds period/audit tables and the employee-wide revision, with no fabricated legacy periods. The service re-reads and share-locks current actor authorization, locks the target employee, rejects stale revisions and inclusive overlaps, and commits the dates, revision and audit atomically. Database checks also enforce date bounds and one non-voided open period per employee.

The private `readEmploymentEligibility(tx, input)` service reads at most 366 calendar dates and returns a revision and confirmed overlapping intervals, or an explicit `unknown` state when no authoritative periods exist. The caller must authorize the employee and use its own consistent transaction. Confirmed dates are supplied by HR; legacy completeness is never inferred from the account. Future statement preparation/finalization must reject unknown eligibility, reconcile complete confirmed periods, snapshot the revision and revalidate it before financial decisions. There is no finalization workflow yet. Employment periods alone do not determine payable days, prove absence or authorize a deduction.

## Salary workspace and assignment

Every signed-in employee has `ხელფასი` at `/payroll`. It shows the current agreed monthly amount or hourly rate, contractual gross/net basis, effective date, next scheduled change and paginated rate history. The subject comes exclusively from the authenticated identity. Administrative reasons and author details are not selected for self-service responses. No employee can read another person's salary by supplying a user ID to this endpoint.

Administrators, accountants and owners can open `ხელფასები` at `/manage/payroll` with `manage.access` and `payroll.read.all`. The directory has validated URL search, employment-status/type filters, name ordering, SQL pagination and separate counts for monthly/hourly/unconfigured employees. `/manage/payroll/$userId` shows an individual agreement and administrative change history. Rate setting additionally requires `payroll.terms.manage`. Self-assignment is forbidden, including for owners. The company configuration remains at `/manage/payroll/settings`, and salary, proposal, rule, calendar and settings pages share section navigation.

Select employees on the directory's current page to assign one agreement to the reviewed selection, or open an individual salary detail. The Sheet captures each target's expected version and requires salary type, exact amount in lari, gross/net basis, effective date and a reason. New agreements start with the active company policy's basis; changing that default does not rewrite existing contracts. Failed saves retain the draft. Pending saves block repeated submission and dismissal. No salary is guessed or seeded from attendance or account records.

Migration `0057_employee_salary_terms.sql` adds immutable salary-term versions. Dates are inclusive company-local dates. For a date, the greatest effective date on or before it wins, with the greatest version breaking same-day ties. Later edits for earlier dates retain existing future changes. To correct a scheduled agreement, record the replacement at its effective date. Exact integer tetri and explicit `GEL` currency are persisted; decimal text is validated before conversion. Lari formatting stays Georgian even when a browser lacks Georgian ICU currency support.

Writers recheck current persisted authorization, lock target employees in a deterministic order, compare expected versions and insert the full audited agreement in one transaction. Bulk assignments either all commit or all roll back. No mutation changes a prior agreement. Financial calculation must reconcile these agreements with confirmed employment periods and calendar rules, snapshot the source revisions, block incomplete/re-hire inputs and recheck revisions before finalizing a statement. Backdated contract entry is supported for confirmed opening data; once payroll finalization exists, locked financial periods will also require explicit correction controls.

These pages show agreed salary conditions. They do not accrue earnings, sum different gross/net or monthly/hourly rates into a misleading payroll total, calculate withholding, publish monthly statements, or record payment. The UI states that monthly payroll calculation is unavailable. The next implementation phase is bonuses, premiums and reviewed deductions, followed by calendar-aware monthly drafts, statutory calculations and separately approved publication into this personal workspace.

## Dated bonus and premium rule catalog

`/manage/payroll/bonuses` provides the company catalog; `/manage/payroll/bonuses/$ruleId` shows a rule's current/next conditions and paginated history. The new `წახალისება` tab is available with `payroll.configure`; route guards and server functions require `manage.access` as well. Services independently reread current roles, explicit denials, account state and active employment. Configuring company rules grants no employee-award, approval or payment authority. Employee self-service does not expose these administrative configuration records.

Bonus rules support a fixed amount, a rate per completed job, a rate per completed task, or a rate per explicitly named extra-work unit. Premium rules support fixed amounts. Every version retains the name, qualification/evidence condition, exact integer-tetri rate, explicit GEL currency and gross/net contractual basis, effective date, activation state, actor, reason and recording instant. Additional work units are descriptive configuration, not accepted quantities or automatic overtime classification. Under [Labour Code Article 27](https://matsne.gov.ge/ka/document/view/1155567), overtime remuneration has its own requirements; this catalog does not resolve or replace them.

Dates may be today or future company-local dates. No backdated rules or opening legacy records are manufactured. At a date, the greatest effective date wins, then the greatest version on that date. An earlier dated correction preserves already scheduled later decisions. Dated deactivation records an inactive version rather than deleting history. The directory identifies the latest recorded name/type separately from the current and next effective conditions. A future-only rule has no current rate; it is never represented as zero. Changing or disabling a rule does not amend employee salaries or create employee awards.

Migration `0059_bonus_rule_catalog.sql` adds stable rule identities and immutable version/audit rows. Writers lock each rule, compare its expected version and commit the version and audit atomically. Actor-scoped command UUIDs make identical retries return the prior result; changed retries fail. A command lock also serializes repeated first creations. Authorization is checked before replaying a previous command. Failed version writes roll back newly created identities. No privileged administrative inputs are taken from the client.

Directory search, type filtering, name ordering and pagination are validated URL state and SQL-backed. Directory pages contain at most 20 rules; history pages contain ten versions and support debounced author/reason search. Search literals escape SQL wildcard characters. Detail placeholders retain context only for the same actor and rule. Editors capture their initial version, retain failed drafts, prevent repeat submission/dismissal while saving, and stay mounted during the shared Sheet close transition. All UI copy is Georgian, with semantic status badges and confirmed-action Sonner feedback.

Catalog writes save rules only. The award workflows below retain accepted quantities, source evidence, allocations and independent decisions separately. Native task records and automatic task acceptance are unavailable merely because a per-task rate can be configured. Bulk awards, deductions, exactly-once statement consumption, tax treatment and publication remain unchecked implementation tasks.

## Individual award proposals and accepted quantities

`/manage/payroll/awards` and `/manage/payroll/awards/$proposalId` provide the `განაცხადები` tab. Readers require `manage.access` and `payroll.read.all`. Preparation, correction, withdrawal, resubmission and input pickers also require `payroll.awards.propose`, defaulting only to administrators, accountants and owners. Services recheck current persisted grants, explicit denials, account state and active employment. Actors cannot create, change or withdraw their own beneficiary proposals. This preparation permission grants no approval authority. Employee self-service still shows salary agreements only; these proposals are not published statements.

Each proposal names one beneficiary, an earning date, an applicable immutable rule version, accepted quantity, source identity, evidence and reason. Employment must be explicitly confirmed for that date. Historical earned work may belong to an employee whose account is now inactive; access status does not establish or erase employment dates. Future work dates, unknown eligibility, absent/disabled rules and stale selected rates are rejected. Work before a rule's first effective date cannot acquire a guessed rate. Later rate changes do not rewrite existing proposals.

Quantities use integer thousandths of a named unit, at most three decimal places and 100,000 units. Fixed awards and job bonuses require quantity one; task quantities must be whole numbers. Additional-work units do not infer overtime or recorded attendance. Integer/BigInt multiplication rounds once, half up, to integer tetri. Rates and proposed totals are bounded by 1,000,000 GEL. Amounts retain the rule's gross/net contractual basis without withholding, pension, gross-up or payment calculation. The directory does not sum amounts with different bases into a payroll total.

For job rules, a narrow jobs service independently validates payroll permissions and beneficiary scope, locks the job, and requires its current completed state plus an immutable completion event. The beneficiary must be the claimant or a planned crew member. The earning date equals the completion date in the company timezone. Evidence retains completion identity, observed job title/revision, completion instant/actor and claimant, plus employment revision and timezone. The picker contains only that employee's completed jobs on the chosen date. Payroll does not read a private jobs repository or mutate jobs.

Fixed premiums/bonuses, tasks and additional work require an external decision/work reference and evidence statement. References use Unicode NFKC, lowercase and collapsed whitespace. Invisible/control characters and overlong canonical keys are rejected. These are manual supporting records, not native task verification. Evidence is escaped text, with no URL fetching. Declaring an accepted quantity does not replace independent review or establish an approved payment.

Migration `0060_award_proposals.sql` adds stable source claims and immutable proposal versions. Duplicate protection keys rule identity, beneficiary, source type and canonical source identity, deliberately excluding work date, rate version and completion-event identity. Reopening/recompleting a job cannot create another proposal for that rule/beneficiary. External protection depends on authoritative reference identities; differently identified documents can still describe the same work and need review. Individual proposals apply the full configured rate per beneficiary and do not represent shared-pool allocation.

Withdrawal appends a version and reserves the source. Correction/resubmission uses the same proposal and an expected revision; beneficiary, rule and source identity remain fixed. Resubmission rereads eligible employment, applicable rates and source evidence. Withdrawal does not require re-accepting the work. Actor-scoped command UUIDs and validated-command fingerprints make identical retries idempotent and reject changed retries. UUID normalization, source locks and database uniqueness protect competing creation. Root revisions and audit rows commit atomically; audit failure rolls the claim back.

Award states are `proposed`, `withdrawn`, `approved`, `rejected` and `revoked`. Approval/rejection applies only to a proposal; approval revocation applies only to an approved award. Approved preparation is locked until an independent reviewer revokes approval. Rejected, withdrawn or revoked records can be corrected and resubmitted using the same identity and a new review. There is still no salary mutation, statement consumption or payment.

Lists use validated URL search, status filters, stable date ordering and SQL pagination at 20 proposals per page. History is proposal-scoped, searchable by author/reason and paginated at ten versions. Cache placeholders never cross actors or proposals. Editors retain captured revisions and failed drafts, prevent repeat saves/dismissal while pending and preserve shared close transitions. Picker form submission does not submit the enclosing proposal. Amounts have explicit decision states; financial finalization remains unavailable.

## Shared pools and independent award review

The award directory offers individual preparation and `საერთო ფონდი`. `/manage/payroll/award-pools/$poolId` shows a shared total, exact beneficiary shares, source, qualification and searchable/paginated decision history. The configured rate and shared quantity calculate the total once, rounded once to tetri. Between two and twenty distinct beneficiaries receive positive integer-tetri shares whose sum must match the total. The equal-split helper assigns remaining tetri in stable user-identity order; manual shares remain editable. All shares retain the same rule version and contractual gross/net basis.

Migration `0061_award_allocation_review.sql` adds pool roots, immutable group versions, member links, verification attestations and source-mode reservations. Existing sources are reserved as individual, including withdrawn proposals, without creating awards or approving anything. A rule/source identity permanently selects either full-rate individual awards or one shared pool. Switching modes is intentionally unavailable; changing a date, tariff, beneficiary, completion event or document capitalization cannot bypass the reservation. Different authoritative references still require human duplicate review.

Each pool beneficiary must have confirmed employment on the earning date. For native jobs every beneficiary must be the claimant or a planned crew member. Shared task/work evidence and quantities are retained at pool level; native completion/employment snapshots remain beneficiary-specific. Pool correction can add or remove beneficiaries before approval. Removed shares become withdrawn while preserving their former allocation context; readding the same person reuses the reserved identity. Preparation and withdrawal reject current or historical beneficiaries acting on their own pool. Individual APIs cannot edit, withdraw or decide a pool child. Group versions and every affected share commit atomically, including withdrawals, rejection, revocation and resubmission.

`payroll.awards.review` is an explicit grant, separate from preparation and future monthly payroll approval. Server middleware and services require `manage.access` and `payroll.read.all` as well. A beneficiary or any historical preparer cannot review an individual award. Pool review also excludes every current or historical beneficiary and preparer, preventing independence from being obtained by editing membership or handing preparation to someone else. Review-only actors may revalidate native evidence without receiving proposal-picker or preparation rights.

Approval requires an explicit independent-verification attestation and a reason identifying the checked document/record. Reviewers manually verify external tasks, additional work, fixed bonuses and premiums; an external reference is not native task completion. Every decision retains its actor, reason, recording instant, exact amounts, applicable rule version and evidence. The service rereads employment eligibility/revision, applicable enabled rate, job state/version, completion identity, beneficiary scope and company timezone under locks. Stale evidence blocks approval until preparation is refreshed. Rejection and approval revocation can resolve stale work without accepting it again. Concurrent decisions use expected revisions and source locks; identical commands replay once and changed retries fail.

Award approval is an internal decision, not legal approval of tax treatment, an employee payslip, declaration or payment. No award has yet been consumed by a monthly statement. The later statement workflow must revalidate approved source snapshots when work changes after approval, consume an exact approved share/version once and atomically block revocation or correction after consumption, using explicit reversals for later corrections. Bulk premiums, deductions and statutory calculation remain separate tasks. Existing Georgian legal references above still apply; this increment introduces no new tax or pension formula.

## Verification

Run the default Vitest suite, TypeScript, targeted ESLint/Prettier checks, `pnpm db:check` and a production build. The generated migration is `0054_payroll_configuration.sql` and does not assign roles to existing accounts or create policies automatically.

Local PostgreSQL integration tests create and remove isolated databases, never use employee data from the application database:

```powershell
$env:RUN_PAYROLL_DB_TESTS='1'
$env:RUN_ACCOUNT_DB_TESTS='1'
pnpm exec vitest run src/features/payroll/server/payroll-settings.integration.test.ts src/features/access/server/access.integration.test.ts
```

Schedule-history and existing scheduling/attendance/leave regressions:

```powershell
$env:RUN_SCHEDULE_DB_TESTS='1'
$env:RUN_ATTENDANCE_DB_TESTS='1'
$env:RUN_LEAVE_DB_TESTS='1'
pnpm exec vitest run src/features/scheduling/employee-schedule-history.integration.test.ts src/features/scheduling/scheduling.integration.test.ts src/features/attendance/server/attendance.integration.test.ts src/features/leave/server/leave.integration.test.ts
```

Coverage includes direct unauthorized calls, forged/stale actors, suspended/inactive accounts, denials, exact rates, current/future applicability, concurrent first writes, stale saves, actor attribution, retained versions and privileged accountant provisioning. UI tests cover validation, percentage conversion, failed-save draft preservation, pending submission and safe loading errors. Inspect rendered layouts in both themes and on narrow screens before release.

Employment-period checks use a disposable local database and include a legacy employee created before migration 0056:

```powershell
$env:RUN_EMPLOYMENT_DB_TESTS='1'
pnpm exec vitest run src/features/employees/employment.integration.test.ts
```

The Windows build can report Nitro dependency-symlink privilege warnings while exiting successfully. This local verification is not a production deployment or validation of a Windows-built Linux release artifact.

Bonus rule catalog checks use a disposable local database:

```powershell
$env:RUN_BONUS_RULE_DB_TESTS='1'
pnpm exec vitest run src/features/payroll/server/bonus-rules.integration.test.ts
```

The ten checks cover exact rates and all rule types, dated resolution/deactivation, fresh authorization, stale/concurrent writers, replay identity, history/search bounds and atomic rollback. Editor tests cover required-field focus, first-click valid saves, extra-work units, fixed premiums, failed draft retention, stable retries and pending protection. The actor/rule query test checks that history filtering never presents another actor or rule's cached configuration. Browser verification uses disposable synthetic accounts and removes their isolated database afterward.

Proposal and existing job regression checks use disposable local databases:

```powershell
$env:RUN_AWARD_DB_TESTS='1'
$env:RUN_JOBS_DB_TESTS='1'
pnpm exec vitest run src/features/payroll/server/award-proposals.integration.test.ts src/features/jobs/server/jobs.integration.test.ts --maxWorkers=2
```

All 61 checks passed, including twelve proposal checks for exact amounts, retained evidence/rates, fresh authorization, concurrent claims, retries, normalization, withdrawn-source reservation, eligible dates, completion/reopening, scoped search/pagination and rollback. Jobs fixture cleanup explicitly includes the new referencing tables in its isolated database. The default suite passed 893 tests; seven final focused checks include a new actor/proposal cache test. Synthetic browser QA covered external/job saves, withdrawal/resubmission, filters, keyboard validation, desktop/mobile and both themes. Final page/editor/dialog accessibility scans reported zero violations. The isolated QA database was removed.

Calendar checks use an isolated local database:

```powershell
$env:RUN_CALENDAR_DB_TESTS='1'
pnpm exec vitest run src/features/payroll/server/payroll-calendar.integration.test.ts
```

Coverage includes exception precedence/restoration, statutory markers, unknown history, leave privacy, overnight attendance preservation, current permissions, self-edit denial, concurrent saves, audit rollback, bounded searches/pagination and scope-safe query placeholders. The editor tests verify validation focus, retained conflicting drafts and pending protection. Calendar page/editor scans reported zero violations; one mobile table-header contrast check was inconclusive in axe and was visually checked against the shared foreground/background tokens. No real employee calendar decisions were created during browser verification.

Salary agreement verification:

```powershell
$env:RUN_SALARY_DB_TESTS='1'
pnpm exec vitest run src/features/payroll/server/salary.integration.test.ts
```

Run the full UI/unit suite separately from the production build with `pnpm exec vitest run --maxWorkers=4` on this Windows workstation. The salary service tests cover current authorization, self-only projections, exact money, current/future company defaults, dated resolution, atomic bulk changes, rollback, concurrent writers and SQL filters/pagination. The local additive migration is `0057_employee_salary_terms.sql`.
