# Authorization

Team Adwings uses Better Auth 1.7.15 for session identity and its `better-auth/plugins/access` helpers for fixed RBAC roles. The existing `user.roles` column remains the only role source. It is a server-assigned, comma-separated field with `input: false`. Migration `0016_user_permission_overrides.sql` adds validated per-user allow/deny exceptions to the auth user.

## Roles and permission checks

`announcements.manage` grants announcement publishing to HR, administrators, and the protected owner. `/manage/announcements` also inherits `manage.access`. All authenticated active accounts can voluntarily read company announcements; acknowledgements derive the recipient from the authenticated actor. Publishing rechecks current grants transactionally and cannot trust client role data. See [announcements](announcements.md).

`src/lib/authorization/permissions.ts` defines the permission vocabulary, Georgian role labels, and Better Auth role objects. Existing route permission identifiers remain stable. The `team-adwings` access-control resource groups those identifiers without introducing a second permission vocabulary.

- `hasPermission(roles, permission)` checks one grant.
- `hasEveryPermission(roles, permissions)` requires all grants, including grants combined across roles. Empty requirements deny access.
- `hasAnyPermission(roles, permissions)` requires at least one grant. Empty requirements deny access.
- `assertPermission(actor, permission)` and `assertPermissions(actor, permissions)` throw a safe Georgian `AuthorizationError` on denial.

Management access comes from the account's assigned roles. Each management page and its operations also require feature permissions.

| Role | Management workspace |
| --- | --- |
| Production supervisor | გუნდები and GPS მოწყობილობები |
| Accountant | ხელფასები |
| HR | დასწრებები, თანამშრომლები, GPS მოწყობილობები, დასწრების მოწყობილობები, შვებულება & ბიულეტინი, სამუშაო განრიგი, განცხადებების მართვა, საჩივრების მართვა, and რეპორტები |
| Employee, production specialist, sales manager | Personal workspace |
| Administrator | All working management pages, subject to each operation's grants |
| Owner | All declared permissions, subject to resource policies |

Reports currently display a placeholder. Supervisors continue to manage supported jobs from the shared jobs workspace. GPS reads require `gps.read` and registry updates additionally require `gps.manage`. Both grants belong to supervisors, HR, administrators, and owners.

Account roles combine across assignments. Authorized employee managers can select one or more roles when creating or editing an employee. Assigning or removing the accountant or administrator role requires `admin.access`, `users.manage`, and `roles.manage`. The owner role is managed through protected platform administration or bootstrap. Employee role edits verify the previous role set under lock, audit changes and revoke sessions. Self-access edits are forbidden.

UI checks only determine presentation. Never use client roles or an actor supplied by a request as proof of authority.

## Entry points

HR managers, administrators, and owners have the explicit `attendance.read.all` permission. Together with `manage.access`, it permits read-only company-wide attendance and timesheet views through `/manage/attendance` and the selected employee's `/manage/attendance/$userId` detail tabs. These reads include all employee records without reviewer assignments. This grant does not confer attendance review, correction, self-approval, or company-wide write access. Management review endpoints retain their permission and assignment checks.

| Entry point                            | Protection                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Page `beforeLoad`                      | `ensureSession()` or `requirePagePermission({ data: { permission } })`; anonymous navigation redirects to login |
| Self-service server function           | `.middleware([authenticatedMiddleware])`; anonymous direct calls return 401                                     |
| Restricted server function             | `.middleware([permissionMiddleware('attendance.read.team')])`                                                   |
| Several required permissions           | `.middleware([permissionsMiddleware('manage.access', 'attendance.read.team')])`                                 |
| HTTP server handler                    | `await requireActor()` or `await requirePermissions('attendance.read.team')` inside the handler                 |
| Feature policy at a transport boundary | `await enforcePolicy(() => service(...))` maps policy denials to 403 and preserves other errors                 |

Middleware lives in `src/lib/auth/auth.middleware.ts`. Server-only HTTP guards and error mapping live in `src/lib/authorization/guards.server.ts`. Services/policies throw `AuthorizationError`; they do not need HTTP response APIs. Add Zod validation before consuming request input. A read uses GET; mutations use POST.

`readActor()` always asks Better Auth for a current session with `disableCookieCache: true`; auth configuration also disables cookie caching. The current database-backed setup returns current role grants on subsequent requests and recognizes revoked sessions. It returns only the actor projection and marks responses private/no-store. Keep this guarantee if secondary storage or session caching is introduced later. In-flight writes still need transactional authorization/workflow checks when mutable conditions matter.

## Resource policies and ABAC

Job crew assignment uses `jobs.assign`, explicitly granted to administrators, owners and production supervisors. Assignment services require one of those current roles as well as the permission, honor individual denials and reload current identity/employment inside the transaction. Sales managers cannot assign employees, teams or GPS devices through their job-management grant. Minimal job assignment labels do not grant GPS telemetry access. See [job assignments](job-assignments.md).

Attendance and timesheet reads use direct employee-to-reviewer assignments from `attendance_reviewer`, independently from role grants. Attendance review services recheck persisted access, lock assignments and subjects for writes, exclude self-review, and enforce session workflow rules. Company-wide read permissions remain separate from review or correction rights.

Production team management uses `teams.manage` independently of attendance reviewer assignments. The `.team` attendance permissions refer to direct assignments. See [production teams](teams.md).

## Better Auth plugins and provisioning

Shared company pins are readable by every active account. Claiming pending work requires `jobs.claim`, granted to production specialists, administrators and owners. Supervisors and sales managers keep their explicit job management grants in the shared jobs workspace. Job policies reload current account and employment state and grants inside their transactions. See [jobs map workflow](jobs-map.md).

Migration `0026_consolidate_employee_roles.sql` retires `operations_manager` from role validation and all assignment controls. Existing accounts retain any other roles, or become `employee` when none remain. Their former grants move to individual allow exceptions, respecting existing denials and retaining invalid exceptions as fail-closed data. This avoids promoting former operations accounts to attendance reviewers. Affected sessions are revoked. Apply this migration together with the application release; administrators can subsequently assign the appropriate current role through the audited access workflow. Existing owner protection and bootstrap/recovery remain unchanged.

The [Admin plugin](https://better-auth.com/docs/plugins/admin) provides account-management endpoints in addition to roles. It is not required to use Better Auth's access-control evaluator. This application retains its existing role storage and audited provisioning service instead of exposing the plugin's separate account-management endpoints. Impersonation remains unavailable. There is no organization plugin or tenant model for this single-company application.

Invitation acceptance remains unavailable. Role assignment and individual allow/deny permissions are available through `/admin/access`. These are audited service workflows with server validation, explicit grant authority, no self-access changes, protected owner assignment, and session/cache invalidation. Bootstrap the first privileged account through a separately authorized operational process. Existing deployments still need the earlier `0001_user_roles.sql` migration if it has not yet been applied.

## Workspace navigation

`/dashboard` remains the shared personal workspace for every authenticated role. The shared sidebar shows personal and permitted management links. Company attendance, timesheets, and attendance rules appear in management alongside employees. A separate administration group contains working account-access controls, the role permission matrix, and clearly marked future-work pages for platform concerns. The `/admin/*` layout requires the server-validated `admin.access` permission, granted only to admins and owners. It has no landing page. Employee list/detail pages and their server functions require `manage.access` and `employees.manage`. Obsolete admin employee routes and their redirects have been deleted. The obsolete overview screen has been removed; see the [route audit](application-routes.md#route-audit-2026-11-09) for retained unfinished workflows.

Daily team operations belong under `/manage/*`, independently guarded by `manage.access` and each operation's permission. Administration configures the platform and workflow rules; it does not perform attendance approval or job assignment. Attendance exceptions are linked from the team-attendance section. Job creation opens in the shared jobs workspace; its service permission checks remain intact. Administrators retain explicit employee-management grants but no implicit attendance review or other operational grants; assign any additional management role through an authorized provisioning process rather than bypassing guards or granting new roles automatically.

## Account access administration

`/admin/access` lists every login identity, including accounts without employee profiles. The route and endpoints require `admin.access` and `users.manage`; authorization updates additionally require `roles.manage`. Server-side search, status filters, sorting, and pagination use validated URL state. `/admin/roles` shows the fixed role permission matrix; custom role definitions remain outside this implementation.

Per-user exceptions are stored in `user.permission_overrides` as validated `allow` and `deny` arrays. A denial takes precedence over a role grant. Individual allows cannot expand management access beyond the assigned roles of non-administrators. Invalid stored exceptions deny privileged operations. The trusted actor includes these exceptions; attendance, jobs, scheduling, navigation, and common guards use the same evaluation rules. Domain services reload current roles and exceptions from the database rather than retaining client projections. Record ownership, reviewer assignments, and self-review rules still apply to an allowed permission.

Access mutations serialize before taking actor/target locks, recheck active actor access, protect owner and self accounts, audit the action with its required reason, and revoke sessions and outstanding setup codes atomically. Role/exception edits compare the displayed snapshot with current persisted grants, rejecting stale edits. Only owners can grant the owner role or manage another owner. Platform administration does not remove the existing employee or workflow scope restrictions.

## Unified attendance workspace

The management attendance layout requires any of `attendance.read.all`, `attendance.read.team`, or `timesheets.review.team`, in addition to the inherited `manage.access` check. This is navigation protection only. Directory/detail services reload current access from persistence. Company readers see all authorized accounts; other readers require active employment and direct reviewer assignments. Assignment predicates also constrain search, totals, pagination and detail lookup, and exclude the reviewer's own account.

Employee detail returns independent attendance/hour capabilities. Hours-only readers receive subject metadata but no attendance sessions. The monthly-hours service falls back to assignment-scoped SQL for actors without company-wide read access. Review/correction controls use persisted assignment facts plus attendance read/review grants and exclude self-review. Mutation services still recheck active access, assignment locks, revisions and workflow state atomically. Retired management pages and their list server-function wrappers are removed.
