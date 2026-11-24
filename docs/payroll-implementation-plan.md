# Payroll implementation instructions and progress

Updated: 2026-11-25. This is the execution checklist for Team Adwings payroll. [Payroll architecture and rules](payroll.md), `AGENTS.md` and the [UI standard](ui-design-guidelines.md) remain applicable.

## Instructions for each implementation step

1. Read this checklist and inspect the current implementation and working tree. Preserve existing changes. Run local Intent discovery and load applicable installed skills before substantial edits.
2. Implement the next unchecked step in dependency order. Keep each step small enough to verify and deliver independently. Do not build unrelated finance functionality or introduce another backend, ORM, form, table or component library.
3. Keep protected entry points independently authenticated and authorized, validate application inputs with Georgian Zod messages, and retain trusted actor attribution. Recheck mutable permissions and workflow conditions inside transactions.
4. Preserve history and exact money/time inputs. Use dated versions, integer monetary/rate units, explicit company-local dates, database constraints and concurrency protection. Never infer employment dates or historical schedules from account creation or today's configuration.
5. Never equate missing attendance with confirmed absence. Warnings have no monetary effect until an authorized decision. Keep salary adjustments, fines, tax, employee pension and employer contributions distinct.
6. Add focused behavioral and PostgreSQL integration tests for financial, authorization and concurrency rules. Run TypeScript, targeted lint/format and migration checks. Run a production build for route/runtime changes; inspect actual rendered UI for interface changes.
7. Mark a checkbox complete only after its acceptance conditions pass. Record migration and verification evidence, what remains unavailable, and the next step. Do not mark a parent phase complete while any of its tasks remain open.
8. Apply tested additive migrations to local development only. Production releases, external declarations, actual payments and accountant/legal validation are separate work.

## 1. Company configuration and accountant role

- [x] Add the Georgian `ბუღალტერი` label and `accountant` role.
- [x] Grant configuration access to administrators, accountants and owners through explicit permissions. Keep account administration and employee-management authority separate.
- [x] Protect accountant provisioning, role assignment and account-recovery actions from ordinary HR grants. Preserve self-modification restrictions and session revocation.
- [x] Add `/manage/payroll/settings` and permission-filtered management navigation.
- [x] Configure gross/net agreement defaults and scheduled-day, calendar-day or fixed-30 daily divisors.
- [x] Configure income-tax and pension calculation switches and separate employee/employer percentages.
- [x] Persist effective-dated versions with reasons, trusted authors, timestamps and optimistic concurrency checks.
- [x] Preserve drafts after failed saves/background refreshes, provide Georgian validation/toasts and pending protection, and distinguish configuration from unavailable payroll calculation.
- [x] Generate and apply local migration `0054_payroll_configuration.sql`.
- [x] Verify authorization, schemas, concurrent saves, retained versions, form behavior, production build and rendered desktop/mobile layouts in both themes.

Evidence: the initial default suite passed 828 tests; isolated payroll/account integration suites passed 34 tests. Later targeted payroll UI checks include first-click submission, saved-value retention, consecutive saves, failed-refresh draft preservation and invalid-field focus. The browser form accessibility scan reported zero violations. No real employee salary, bonus, fine or payment has been created.

## 2. Historical calculation foundations

### 2.1. Individual schedule history

- [x] Retain immutable employee schedule versions whenever the existing account workflow assigns, changes or removes an individual schedule.
- [x] Represent company-schedule inheritance explicitly, including a return from an individual schedule to company defaults.
- [x] Establish a clearly identified opening baseline for existing employees at the migration's company-local date. Do not manufacture earlier history.
- [x] Initialize a dated baseline when provisioning new employees, including employees inheriting the company schedule.
- [x] Provide a bounded scheduling service read for historical daily expectations, with explicit unknown-history and unconfigured-company states.
- [x] Preserve current attendance behavior, stored session snapshots, schedule notifications and leave-allowance behavior.
- [x] Verify same-day changes, earlier dates, inheritance, actor attribution, atomic rollback and concurrent writes against isolated PostgreSQL.
- [x] Generate, inspect and apply the additive local migration; update this checklist with verification results.

Evidence, 2026-11-25: migration `0055_employee_schedule_history.sql` applied locally. The default suite passed 833 tests; all seven new schedule-history PostgreSQL checks passed, alongside account provisioning, company scheduling, attendance and leave regression suites. TypeScript, targeted ESLint/Prettier, migration validation and the production build passed. This step changes persistence and private service reads only, with no UI changes or production release. Retention begins at the opening baseline; earlier missing-day expectations remain unknown. The next unchecked step is 2.2.

### 2.2. Employment eligibility dates

- [x] Define and implement HR-confirmed payroll eligibility dates and employment periods, including partial months and rehires.
- [x] Keep account creation, activation and login suspension distinct from employment/payroll eligibility.
- [x] Provide authorized Georgian editing and history with validation, audit attribution and concurrency protection.
- [x] Leave unconfirmed legacy dates unknown and prevent final calculations from guessing them.

Evidence, 2026-11-25: migration `0056_employee_employment_periods.sql` applied locally without backfilling employment dates. Employee profiles now contain a period table and a right-side editor, with independent URL pagination for periods and history. Explicit editing rights default to HR, administrators and owners; self editing is forbidden. Nine isolated PostgreSQL tests passed for eligibility boundaries, rehires, overlap prevention, current authorization, employee scope, concurrent writes and audit rollback. The full default suite passed 846 tests; the final focused suite passed 32 tests, including three additional card checks. TypeScript, targeted lint/format, migration validation and the production build passed. Browser review covered real synthetic-account saves, history, Georgian validation, keyboard submission, desktop/mobile and both themes. The editor accessibility scan reported zero violations. Financial finalization remains unimplemented and must consume the explicit unknown eligibility state. The next unchecked step is 2.3.

### 2.3. Calendar exceptions

- [x] Reuse the existing Georgian statutory holiday rules and resolve special/substituted working dates explicitly.
- [x] Add company/employee exceptions only with real authorized editing workflows and retained history.
- [x] Establish precedence between exceptions, employee schedules and company schedules.
- [x] Verify overnight ownership, unknown schedules and approved/pending leave interactions without fabricating absence records.

Evidence, 2026-11-25: `/manage/payroll/calendar` provides company and employee calendars, one-date working/rest exceptions, audited restoration, required reasons, revision checks, employee search and paginated/searchable history. Employee exceptions precede company exceptions, statutory holidays and the retained recurring schedule. An explicit working override preserves the statutory holiday marker and requires later pay review. Missing schedule history remains unresolved. The verified general statutory calendar starts at 2025-01-01; earlier dates remain legally unresolved rather than applying today's law backwards. Transferred/additional dates require separate confirmed entries. Pending/approved leave is shown independently, with no attendance, leave-balance, absence or monetary writes.

Migration `0058_payroll_calendar_exceptions.sql` was applied locally. Ten isolated PostgreSQL checks passed, including current authorization, self-edit denial, scoped history/search, concurrent writes, audit rollback, overnight attendance preservation and leave interactions. The default suite passed 877 tests; after the final legal-history and cache-scope safeguards, all 13 focused rule/query/editor tests passed. Scheduling, attendance and leave database regressions passed 121 tests. TypeScript, targeted ESLint/Prettier, migration checks and the production build passed. Browser checks covered synthetic company/employee saves, history filtering, month navigation, desktop/mobile and both themes; page/editor accessibility scans reported zero violations. The next unchecked phase is 4, bonuses, premiums and reviewed deductions. Actual monthly calculation and publication remain unavailable.

## 3. Employee compensation

- [x] Add effective-dated monthly/hourly employee terms with explicit gross/net agreement basis and currency.
- [x] Add a permission-scoped employee payroll directory and individual/bulk term assignment with reviewable results.
- [x] Preserve prior rates and dated salary-type changes without overlapping effective agreements; keep employment eligibility separate.
- [x] Treat missing compensation as unconfigured, never zero.
- [x] Add a personal workspace salary page, showing only the authenticated employee's current agreement, next change and paginated history.
- [x] Use the currently applicable company gross/net default for new agreements while retaining each saved contract's basis.

Evidence, 2026-11-25: salary assignment and workspace visibility were delivered independently of calendar-based calculation. `/payroll` is personal and `/manage/payroll` is the company salary directory, with individual details and atomic bulk assignment. Migration `0057_employee_salary_terms.sql` retains exact integer tetri, immutable dated agreements, trusted authors and required administrative reasons; no real salaries are seeded. The full suite passed 865 tests with four workers; the final focused suite passed 59 tests, including navigation-denial serialization and form behavior. All ten isolated PostgreSQL checks passed. Desktop/mobile and light/dark browser checks covered bulk assignment, employee self-service, history privacy, and keyboard scrolling. The final employee-page and editor accessibility scans reported zero violations. The initial unconstrained test run timed out during a concurrent build; the bounded full rerun passed. Calendar exceptions in 2.3 are complete. Monthly payroll totals, adjustments and published statements remain unavailable.

## 4. Bonuses, premiums and deductions

- [x] Provide an authorized catalog of fixed, per-job, per-task and additional-work bonus rules, plus fixed premium rules, with dated exact rates, units, qualification, activation/deactivation and retained history.
- [x] Record accepted quantities and source-backed individual award proposals against the applicable immutable rule version. A configured rule alone never creates an award.
- [x] Retain native job completion evidence and canonical external references; prevent duplicate proposals across retries, withdrawal and job reopening.
- [ ] Define per-person versus shared-pool awards, beneficiaries, allocations, qualification and approval.
- [ ] Independently verify external task/work evidence during approval, retaining provenance and preventing repeated accepted consumption.
- [ ] Support occasional fixed `პრემია` awards and reviewed bulk awards.
- [ ] Keep absence earnings adjustments separate from individually justified fines and other employee deductions.
- [ ] Record proposals, reasons, decisions, revisions and exactly-once statement consumption. Prevent self-approval.

Evidence, 2026-11-25: `/manage/payroll/bonuses` and `/manage/payroll/bonuses/$ruleId` now deliver the catalog and individual history under `manage.access` and `payroll.configure`, defaulting to administrators, accountants and owners. Rates use integer tetri, explicit gross/net basis and GEL. Additional work requires a named unit; premiums require fixed amounts. Qualification and administrative reasons are required. Future dated changes, same-day corrections and dated deactivation retain every version. Backdating is rejected; current and next conditions are shown separately. Retried commands are idempotent, stale versions conflict and failed writes roll back rule identity and audit together.

Migration `0059_bonus_rule_catalog.sql` was applied locally. Ten isolated PostgreSQL checks passed for authorization, concurrency, retries, applicability, exact rates, history/search and rollback. The full default suite passed 886 tests; the additional cache-isolation test passed separately. Four editor checks and two schema checks are included in that full suite. TypeScript, targeted lint/format, migration validation and the production build passed. Synthetic browser saves and rate revisions retained history; desktop/mobile and both themes were inspected, and page/editor accessibility scans reported zero violations. No real employee award or salary was created. At that catalog milestone, individual proposals and approvals remained unavailable. The following evidence records the proposal delivery.

Individual proposal evidence, 2026-11-25: `/manage/payroll/awards` and `/manage/payroll/awards/$proposalId` provide individual proposals, exact quantities/amounts, evidence, corrections, withdrawal, resubmission and paginated/searchable immutable history. Reading requires `manage.access` and `payroll.read.all`; writing and input pickers additionally require `payroll.awards.propose`, defaulting only to administrators, accountants and owners. Self proposals and self changes are forbidden. Saves require confirmed employment dates and an enabled, applicable rule. Completed jobs are checked through an independently authorized jobs service; external task/work/premium references are manual evidence rather than invented native task records.

Migration `0060_award_proposals.sql` was applied locally without real employee proposals or financial postings. The full default suite passed 893 tests; all seven final focused rule/query/editor checks passed, including actor/proposal cache isolation. All 61 isolated proposal/job checks passed, with the twelve proposal checks rerun after validation changes. TypeScript, lint/format, migration validation and the production build passed. Synthetic browser saves covered external references and native jobs, withdrawal/resubmission, history filters, first-click validation and desktop/mobile layouts in both themes. Final page/editor/dialog accessibility scans reported zero violations. The disposable QA database was removed. Shared-pool allocation, independent approval, bulk premiums, deductions and statement consumption remain open. Native task completion verification is unavailable; external references require independent review. The next task is beneficiary/allocation and approval, preserving these source reservations and preventing self approval.

## 5. Monthly drafts and absence review

- [ ] Reconcile dated compensation with employment eligibility, joining/leaving and rehires before calculating partial months; never infer a new employment agreement from an old account or rate.
- [ ] Classify payable attendance separately from recorded timesheet totals; resolve open, automatic, pending and rejected intervals explicitly.
- [ ] Calculate monthly/hourly earnings using exact durations and dated terms, with explainable daily lines and consistent rounding.
- [ ] Calculate applicable paid/unpaid leave, vacation, sick leave, holiday and overtime earnings using approved Georgian rules.
- [ ] Generate possible-absence warnings only for confirmed scheduled, eligible dates after reconciliation, considering leave, holidays, overnight work and employer/system exceptions.
- [ ] Show potential impact without deducting it. Provide correction, leave resolution, exception, waiver and deduction-proposal actions.
- [ ] Revalidate warnings and proposals when source records change; never silently keep an obsolete deduction.

## 6. Georgian statutory calculations

- [ ] Record employee pension participation and applicable tax exemptions with validity dates and supporting decisions.
- [ ] Implement exact gross-to-net and net-to-gross calculations, employee withholding and separate employer expense.
- [ ] Apply bonuses/premiums to the appropriate legal bases. Do not assume fines reduce taxable earnings.
- [ ] Validate statutory rates, contribution/exemption rules, leave pay, overtime, rounding and deduction limits with the company's accountant before operational use.
- [ ] Handle disabled built-in calculation through explicit external-accounting inputs or gross-only results, never a fabricated take-home amount.

## 7. Approval, publication and reconciliation

- [ ] Add monthly periods and independently reviewable employee statements with scoped preparation, approval, publication and export permissions.
- [ ] Block finalization on unresolved inputs, stale revisions and invalid totals; enforce no self-approval.
- [ ] Finalize source snapshots, lines, adjustment consumption and audit records atomically.
- [ ] Publish immutable employee statements with explanations and a clarification/dispute path.
- [ ] Preserve actual earning, payment and reporting dates. Model later corrections, reversals, advances and partial payments explicitly.
- [ ] Keep calculation, payment, declaration submission and remittance states independent. Add external integrations only when explicitly scoped.

## 8. Operational release

- [ ] Normalize protected document permission-denial HTTP status before release. The salary page now renders the correct forbidden message across SSR, but the current Router document response is still HTTP 500; salary data endpoints remain independently authorized. Do not treat the rendered message alone as an HTTP-status check.
- [ ] Reconcile a complete shadow payroll month with accountant calculations for every included employee.
- [ ] Review confidentiality, role changes, permission revocation, audit retention, exports and all consequential actions.
- [ ] Verify real employee/management workflows, Georgian messages, keyboard use, loading/errors and both themes on narrow/wide layouts.
- [ ] Document production migration, reconciliation and recovery procedures before deployment.

## Open business decisions

Confirm contractual daily proration, partial-day treatment, paid day-off/sick-leave rules, overtime rates, bonus qualification/allocation, payment deadlines, eligible approvers, deduction handling and historical opening data. The configuration options do not establish that every possible value is legally applicable. Current legal references and limitations are recorded in [payroll.md](payroll.md).
