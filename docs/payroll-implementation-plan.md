# Payroll implementation instructions and progress

Updated: 2026-11-26. This is the execution checklist for Team Adwings payroll. [Payroll architecture and rules](payroll.md), `AGENTS.md` and the [UI standard](ui-design-guidelines.md) remain applicable.

## Current delivery scope, updated 2026-11-26

Replace month closing with published payments for ready employees. Scheduled payments record payouts made externally. Prior finalized statements stay available in the read-only archive.

- [x] Verify one or two salary payments, either bonus and premium payment month with the following month as default, and company and employee fine-stage settings.
- [x] Verify publication for ready employees, fixed first-payment overrides, confirmed hourly calculations, independent retries and month-filtered employee payment history.
- [x] Verify migration 0072 removes the retired calculation settings and preserves salary history.
- [ ] Implement overtime and rest-day formulas after the user supplies calculation rules. Hourly work can fall on any calendar day.

Verification, 2026-11-26. All 73 payroll tests passed, including 37 checks against isolated PostgreSQL databases. Tests covered an upgrade with an existing configuration, two concurrent publishers, duplicate command retries, payment isolation, and archived and published statements. TypeScript, targeted ESLint and formatting, Drizzle validation and the production build passed. Chrome checks used synthetic data with the actual settings, entry and payment-history components at desktop and mobile widths. The real database was left for deployment of the verified migration.

Payroll settings group payment rules and schedule dates into two responsive panels. Split schedules show `ხელფასის პირველი ნაწილი` and `ხელფასის მეორე ნაწილი`. The frequency selector and schedule layout were checked in Chrome at desktop and mobile widths.

Monthly Payroll now displays assigned base salaries before draft preparation, with explicit confirmation for partial months. Both edit sheets support payment dates, and the adjustments table shows planned or actual dates beside the earning-month totals. All 73 payroll tests passed, including date-based publication and paid-date protection in PostgreSQL. Migration `0073_payroll_adjustment_dates.sql` was verified in isolated tests and was present in the local development database. The production build and desktop and mobile Chrome previews passed.

- [x] Show the automatic full-month base on rows that previously contained only adjustments, add first-part and second-part views with matching CSV export, and link missing employment dates to the employee profile. Verified by 74 payroll tests, including installment, export and role checks in isolated PostgreSQL databases. Checked keyboard operation and desktop and mobile layouts in Chrome with synthetic records.
- [x] Prefill the month editor with the applicable fixed salary when the monthly base needs review, label the first installment separately, and start the paginated history accordion collapsed. Verified by 74 payroll tests and a Chrome check of the prefilled field, keyboard expansion and collapsed state after reopening on mobile.
- [x] Use the selected period’s salary label in the table and CSV, and include the earning month, planned window and recorded payment date for each relevant stage. Verified by 74 payroll tests, including default and overridden payout dates, and a Chrome preview of all three headings at desktop and mobile widths.
- [x] Show compact period tabs beside the dropdown for comparison on split schedules. Both controls share the selected period for the table and export. Verified synchronization in both directions, keyboard activation and desktop and mobile layout in Chrome with sample records.
- [x] Keep the period tabs after the comparison and use the collapsed Jobs-style filter accordion on mobile. Verified desktop layout, mobile search, sorting, month selection and preservation of filters when switching periods in Chrome with sample records.
- [x] Fix desktop search sizing and keep the payroll toolbar on one row. Use full-width payout, period and CSV controls on mobile. Verified desktop input at the reported width, keyboard access on narrower desktop layouts and matching control widths on mobile in Chrome with sample records.
- [x] Select the active half of the current company-local month on split schedules, refresh at the next boundary, and preserve explicit tab choices. Verified with 75 payroll tests, including the company-local midnight and month rollover, and a simulated open-page rollover in Chrome.
- [x] Align CSV export with the right edge of the desktop payroll toolbar and keep it full width on mobile. Verified both widths in a Chrome preview.
- [x] Highlight nonzero fines and the unset-salary summary count with semantic red. Verified the treatment in light and dark Chrome previews.
- [x] Reduce the gap between payroll filters and table results to 8px. Verified rendered spacing in Chrome.
- [x] Keep the filters and displayed results in place while an uncached period loads. Disable CSV export until the requested results arrive. Verified with a regression test and delayed responses in desktop and mobile Chrome previews.
- [x] Refresh unpaid monthly payroll after a fixed salary correction. Require review for partial months and custom amounts and preserve issued installments. Verified in isolated PostgreSQL and with a Chrome preview of the corrected row and confirmation field.
- [x] Show review, published-payment and neutral metadata badges in Monthly Payroll. Verified the whole-month and first-half states in Chrome with light and dark themes.

## Historical simplified delivery, 2026-11-25

The user narrowed delivery to fixed or hourly salaries, bonuses, premiums and fines. The notes below record earlier delivery and verification. Enter bonuses, premiums and fines in one adjustments tab or directly in Monthly Payroll. The former deduction review is retired.

- [x] Deliver one monthly workspace with employee selection, fixed salary or hourly rate times accountant-confirmed hours, bonus and premium lines with optional notes, reasoned fine lines and an explainable contractual total.
- [x] Reuse dated salary terms and confirmed employment. Require explicit base confirmation for partial months or changing terms instead of building an automatic proration engine. Do not infer payable hours from raw attendance.
- [x] Save drafts and corrections with exact money, current authorization, concurrency protection and retained history. Finalize a month atomically; corrections require explicitly reopening it with a reason.
- [x] Verify money, access, stale sources, retries, competing writes, finalization and rendered desktop/mobile UI. Keep this checklist and payroll.md aligned with verified behavior.

Automatic absence penalties, leave/overtime valuation, tax/pension engines, bank payments and external declarations are deferred. The monthly total retains its gross/net agreement basis and is not a fabricated take-home or tax result. The older phases 5 to 8 below are retained as background, not delivery requirements.

Delivery evidence, 2026-11-25: `/manage/payroll/monthly` is the management Payroll link's destination. Primary tabs cover monthly payroll, employee rates and settings. Migration `0064_simple_monthly_payroll.sql` adds one immutable revision table and was applied locally with its exact migration hash verified. No existing financial records or dependencies were replaced.

The full default suite passed 923 tests. All 54 isolated PostgreSQL checks passed: 11 monthly checks, 12 deduction checks and 31 award regressions. The final 11 monthly checks passed again after adding coverage for corrected same-date salary versions and global month counts under search. All 38 final focused form, dialog, rule, query and sidebar checks passed. Database coverage includes current grants, self modification, exact hourly rounding, partial months, mixed bases, stale sources, same-command retries, concurrent saves/decisions, month locking/reopening, removal/restoration, scoped pagination and whole-month rollback.

Synthetic browser verification covered fixed salary plus bonus/premium/fine entry, confirmed-hour entry, partial-month confirmation requirements, reason validation and focus, persisted reloads, finalization, locked history, reopening and draft removal. The fixed example retained 1,500 + 100 + 50 - 20 = 1,630 GEL; 1.33 confirmed hours at 123.45 GEL retained 164.19 GEL. Desktop/mobile layouts were inspected in light and dark themes. Settled main-content and mobile-editor accessibility scans reported zero violations; the hourly editor had one inconclusive help-text contrast check, reviewed visually against the shared tokens. No clean full-shell scan is claimed. The isolated browser database, server and temporary QA scripts were removed after verification. The final production build, TypeScript, targeted ESLint/Prettier, migration validation and diff whitespace checks passed.

Once this simplified scope is verified, do not resume the older roadmap automatically. Operational deployment, actual company inputs and accountant reconciliation remain separate from this implementation; no real employee payroll or bank payment was created.

The subsequent cleanup removes the payroll calendar, bonus rules and their dependent award proposals and pools through migration `0065_remove_payroll_calendar_and_bonus_rules.sql`. Working days remain in the schedule workspace and payroll settings remain available from their tab. The migration drops the retired records when applied. Back up any retired records that need to be retained before upgrading an existing database.

Cleanup verification passed 110 focused tests and 72 isolated PostgreSQL checks across monthly payroll, deductions and jobs. TypeScript, targeted lint and formatting, migration validation and the production build passed. Chrome measured the shared payroll sheet's native 200 ms slide-in in an isolated fixture. Migration 0065 was exercised in disposable databases and applied locally with 0066 after confirming the retired tables were empty.

- [x] Put deduction proposals directly in the shared payroll tab strip and keep tab placement consistent across the tabbed pages.
- [x] Label the fines workspace ჯარიმები, place settings last, and use compensation icons, a shadcn month picker, compact Jobs-style filters and matching alert icons. Verified the desktop toolbar, narrow mobile layout, tab order and month selection in a browser preview.
- [x] Add a single Bonuses and Premiums tab for employee entries by month. It uses the same monthly records and shows separate subtotals and their combined total.
- [x] Merge fines into the monthly adjustments tab and sheet. Remove the open-month draft badges. Migration `0067_unified_monthly_adjustments.sql` supports fines before base pay is set and retains old review records for audit. Verified locally with 102 focused tests, 16 PostgreSQL checks and an index-only latest-revision plan without a sort in EXPLAIN.
- [x] Use one row per employee and month with actions to edit individual adjustments or confirm removal of all three types. Removing adjustments preserves base pay, hours and history. Verified with five focused form tests and 17 PostgreSQL checks.
- [x] Add a dedicated bonus and premium sheet with employee selection, type, amount and optional note. Bonus saves preserve existing base pay, hours and fines. Migration `0066_bonus_only_monthly_drafts.sql` allows bonuses before base pay is ready and blocks finalizing those drafts. Verified with 16 monthly PostgreSQL checks and a rendered form test.

Chrome verified the same tab position across all five tabs at 320, 390 and 1440 px. A synthetic 100.50 GEL bonus plus a 40.00 GEL premium appeared as 140.50 GEL on the bonuses tab and was included once in the 1,140.50 GEL monthly payroll total. The focused suite passed 93 tests and the isolated monthly PostgreSQL suite passed 12 checks. This update uses the existing database schema.

- [x] Allow bonuses and premiums in the month a first salary takes effect during confirmed employment, with explicit base confirmation. All 14 monthly PostgreSQL checks passed, including saving and finalizing a bonus and rejecting a salary that starts after employment ends.

- [x] Remove the change-reason field from salary assignment. The server records an audit note and retains prior explanations. Verified with 15 focused tests, 10 salary PostgreSQL checks and an isolated browser preview.
- [x] Use the full management content width for employee salary detail. Show the current agreement and the next scheduled change above responsive salary history.
- [x] Remove the general change-reason field from the shared monthly entry sheet and record an automatic audit note on save. Verified with seven focused tests and 14 monthly PostgreSQL checks.
- [x] Remove the base-pay explanation from the monthly entry sheet. Require an explicit amount when needed and record the confirmation automatically. Verified with seven focused tests, 17 monthly PostgreSQL checks and desktop and mobile browser previews.
- [x] Replace the Monthly Payroll employee popup with table search by name or username. Editors can open rows without a saved entry in an open month. The entire row opens the sheet, and keyboard focus returns to the employee button after closing. Verified with 17 PostgreSQL checks and a desktop and mobile browser preview.
- [x] Link directly from the Monthly Payroll sheet to the selected employee’s salary page when the applicable salary is missing. When employment dates need attention, link authorized users to the employment periods on the employee profile.
- [x] Show employees their own finalized monthly payroll statements with a calendar-month filter and server pagination. Reopening hides the statement until it is finalized again. Keep payment tracking outside this flow. Verified with 28 payroll and salary PostgreSQL checks, 17 focused tests and a desktop and mobile browser preview.
- [x] Restrict payroll management pages and server actions to accountants, administrators and owners, even if another role has individual payroll grants. Explicit denials still apply and personal salary access stays employee-scoped. Verified with 59 focused tests and 35 payroll PostgreSQL checks.
- [x] Remove the unused payroll history search component and add an employee-first index for personal monthly statements. Verified the new migration with 35 disposable PostgreSQL checks. On a synthetic history of 192,000 revisions, the employee query changed from 193 index searches and a sort to one ordered index scan. The older deduction tables remain as audit storage.
- [x] Refresh Payroll Settings with full-width responsive sections, compact version status and one notice about inactive calculations. Preserve the effective date, audit reason and existing save workflow. Verified with 28 focused tests and a desktop and mobile preview in both themes.
- [x] Remove the manual reason field from Payroll Settings. Save the effective-dated version with an automatic audit note and keep existing audit history.
- [x] Keep employment dates on the employee profile, restore the sheet's native slide-in and show date guidance in icon alerts. The server records audit notes for changes without a reason field. Verified with 19 focused tests, nine PostgreSQL checks and a Chrome preview.

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
- [x] Allow authorized managers to confirm an optional start date during employee creation, with the period and audit saved in the account transaction.
- [x] Leave unconfirmed legacy dates unknown and prevent final calculations from guessing them.

Evidence, 2026-11-25: migration `0056_employee_employment_periods.sql` applied locally without backfilling employment dates. Employee profiles now contain a period table and a right-side editor, with independent URL pagination for periods and history. Explicit editing rights default to HR, administrators and owners; self editing is forbidden. Nine isolated PostgreSQL tests passed for eligibility boundaries, rehires, overlap prevention, current authorization, employee scope, concurrent writes and audit rollback. The full default suite passed 846 tests; the final focused suite passed 32 tests, including three additional card checks. TypeScript, targeted lint/format, migration validation and the production build passed. Browser review covered real synthetic-account saves, history, Georgian validation, keyboard submission, desktop/mobile and both themes. The editor accessibility scan reported zero violations. Financial finalization remains unimplemented and must consume the explicit unknown eligibility state. The next unchecked step is 2.3.

## 3. Employee compensation

- [x] Add effective-dated monthly/hourly employee terms with explicit gross/net agreement basis and currency.
- [x] Add a permission-scoped employee payroll directory and individual/bulk term assignment with reviewable results.
- [x] Preserve prior rates and dated salary-type changes without overlapping effective agreements; keep employment eligibility separate.
- [x] Treat missing compensation as unconfigured, never zero.
- [x] Add a personal workspace salary page, showing only the authenticated employee's current agreement, next change and paginated history.
- [x] Use the currently applicable company gross/net default for new agreements while retaining each saved contract's basis.

Evidence, 2026-11-25: salary assignment and workspace visibility were delivered independently of calendar-based calculation. `/payroll` is personal and `/manage/payroll` is the company salary directory, with individual details and atomic bulk assignment. Migration `0057_employee_salary_terms.sql` retains exact integer tetri, immutable dated agreements, trusted authors and required administrative reasons; no real salaries are seeded. The full suite passed 865 tests with four workers; the final focused suite passed 59 tests, including navigation-denial serialization and form behavior. All ten isolated PostgreSQL checks passed. Desktop/mobile and light/dark browser checks covered bulk assignment, employee self-service, history privacy, and keyboard scrolling. The final employee-page and editor accessibility scans reported zero violations. The initial unconstrained test run timed out during a concurrent build; the bounded full rerun passed. Calendar exceptions in 2.3 are complete. Monthly payroll totals, adjustments and published statements remain unavailable.

## 4. Monthly adjustments and historical deduction review

- [x] Record bonuses, premiums and fines directly in monthly payroll.
- [x] Retain optional individually reviewed deduction proposals and their history.

Historical deduction proposal evidence from before retirement, 2026-11-25: `/manage/payroll/deductions` and `/manage/payroll/deductions/$deductionId` provide individually justified fines and other deductions, exact tetri, occurrence dates, an explicit intended payroll month, external references, evidence and legal/contractual bases. Separate `payroll.deductions.propose` and `payroll.deductions.review` grants default only to administrators, accountants and owners. Current permissions are rechecked in transactions; deduction-only preparers can use employee pickers without award or salary-management rights. Subjects cannot prepare or review their own records, and every historical preparer is excluded from review. Independent attestation and reasons are required for approval. Approved records are locked until independent revocation. Corrections, withdrawal/resubmission, rejection and revocation append immutable history. Employee/source reservations survive withdrawal and prevent duplicates across categories, dates and normalized reference variants. Absence, tax and pension classifications are rejected. No salary, attendance, taxable-income or payment mutation is made.

Migration `0063_reviewed_deductions.sql` was inspected, tested and applied locally with its exact journal hash verified. The default suite passed 913 tests. All 43 final isolated PostgreSQL checks passed: 12 deduction checks and 31 award regressions. Seven final focused editor/dialog/query checks passed, including navigation after the editor's close transition, alongside schema and permission tests in the full suite. Coverage includes current grants, self-review denial, exact amounts, stale employment, same-command retries, competing source claims, correction-versus-approval concurrency, retained sources, scoped search/pagination and audit rollback. Browser verification covered synthetic accountant preparation, keyboard save, independent administrator approval, attestation validation, approved locking, history, status filtering and light/dark desktop/mobile layouts. Accessibility was checked manually through labels, validation focus and the accessibility tree; no automated axe result is claimed. The final production build, TypeScript, targeted lint/format and migration checks passed. The disposable browser database was removed. No real employee fine or salary reduction was created.

The earlier next-step recommendation was superseded by the simplified delivery scope at the top of this document. Automatic reconciliation is deferred. Exactly-once statement consumption remains unchecked until statements exist. Absence review, leave/overtime treatment, statutory calculations and publication remain open. Company contractual rules and accountant validation remain required before actual monetary deductions.

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
