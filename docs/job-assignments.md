# Job assignment plan and implementation

## Ownership and behavior

The jobs feature owns a planned crew separately from `job.assigneeId`, which continues to identify the account that claims execution. Assignment does not advance status, grant claim rights, transfer team membership or grant GPS telemetry access.

Individual employees are the primary assignment. Each job can also reference one production team and one GPS device. Team selection adds its current eligible members to the local employee draft without duplicates. Users may remove or add individuals before saving. Team removal preserves the selected employees. Later roster changes do not change saved job crews. Disabled or deleted team labels do not remove crew members.

Eligible employees follow the existing production-team rule: active employment and account, with employee, production specialist, supervisor or sales manager roles; HR, admin and owner accounts are excluded even if they hold another eligible role. Only active teams and enabled GPS devices can be selected. A tracker may be associated with multiple jobs; this feature does not reserve devices or enforce scheduling conflicts.

Each team picker row shows its current eligible member count, including zero for an empty team. Counts follow the same eligibility rules as team selection and exclude ended memberships.

Saving a crew sends a personal in-app notification to each employee added to or removed from the saved crew, including employees added through team selection. These alerts are independent of the configured general job-notification roles. Unchanged members receive no personal assignment alert, and unsaved drafts and no-op saves send none. The notification links to the job and identifies it and the actor. Active-account and employment checks and actor self-notification suppression still apply. Personal alerts take precedence over a generic job-update alert for the same recipient and revision. Assignment changes, audit records, notifications and live inbox signals commit or roll back together.

## Implementation sequence

1. Add `job_employee` with a composite primary key and an employee/job lookup index, plus nullable job team/device foreign keys. Extend immutable job events with before/after assignment snapshots.
2. Add `jobs.assign` for administrators, owners and production supervisors. The assignment policy additionally requires one of those current roles, even when an account has an individual permission exception. Explicit denials still apply. Reload current identity and employment for every service operation.
3. Provide Zod-validated Start GET functions for paginated candidate searches and coherent team roster snapshots, and a POST function for the complete assignment draft. Return minimal names and IDs. Authorized GPS picker rows also include the configured phone number and reported GPS identifier for disambiguation; shared job-detail reads retain names and internal IDs only. Do not include telemetry or credentials.
4. Save employee replacements, team/device references, revision increment, audit event, configured job notifications and live invalidation in one transaction. Lock the job and verify its revision before writing. Validate the selected team's revision and lock selected resources against concurrent disabling or suspension. Reopening is required before editing a closed job. No-op saves do not create history.
5. Use one shared assignment card in the map panel and list Sheet. Display individuals first, followed by quieter GPS information; team information appears only in the editor. Use a text-only action beside the single-line summary heading. The სამუშაოზე დამატება modal places GPS first, then the selected employees and an employee picker matching teams with avatars, Add actions, role filters, search and a bounded scrolling list. Team selection is in a collapsed additional-options Accordion. Force the shared blurred backdrop for nested use. Editing uses one complete draft with explicit Save and Cancel. Preserve the draft on errors; stale revisions require reviewing current assignments before retrying. Keep the Dialog mounted through its closing transition.
6. Include employee assignments in `mine` and `related` filters consistently across jobs, markers and totals. Show assignment counts in table rows and map result cards using one batched count query.

Assignment history displays two lines for the employee count and GPS name, omitting team information. Existing entries use their saved assignment snapshot to display the current format; full before/after evidence remains stored and is not sent to the client.

## Verification and rollout

Tests cover role restrictions and denials, Zod bounds and duplicates, direct service authorization, active-resource eligibility, revision conflicts, atomic audit rollback, relationship scopes, team selection, draft cancellation and conflict review. Run the jobs suite, authorization tests, TypeScript, targeted lint/format, migration checks and a production build. Inspect the card/editor at desktop and narrow widths in both themes using explicitly labeled isolated fixtures if no signed-in review session is available.

Apply migration `0053_job_assignments.sql` through the normal deployment migration process before serving the updated application. Existing jobs retain empty planned crews and unchanged execution assignees. No employee or team memberships are backfilled or changed.
