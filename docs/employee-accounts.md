# Employee accounts

Employees cannot create accounts themselves. An authorized employee manager provisions
one company employee and one linked Better Auth identity in a transaction. The
employee then sets their own password using a one-time activation code.

## Initial owner

Apply migrations with `pnpm db:migrate`. On the server, from the workspace root, run:

```powershell
pnpm exec tsx scripts/bootstrap-owner.ts --code owner-code --name "Your name"
```

An optional `--email "name@example.com"` stores a real contact email. The command
refuses to create an owner if any owner or administrator already exists. It uses a
database advisory lock so two operators cannot bootstrap separate owners concurrently.

The command deliberately displays a new activation code once to the operator. Treat
this output as a credential; do not capture it in shared logs or commit it. Open
`/auth/register`, enter that code, and choose a password of at least 8 characters.
Then log in with the username and that password. No initial password is shared.

If the original owner code expires or the owner loses access, a database operator
can recover the existing owner rather than create a duplicate:

```powershell
pnpm exec tsx scripts/bootstrap-owner.ts --recover --code owner-code --reason "Verified owner identity in person"
```

This operator-only path revokes existing sessions and challenges, restores the same
owner identity, audits the reason, and displays an activation or reset code once.
It is never exposed by an HTTP route or server function.

## Employee management workflow

Employee creation and account management live under the management sidebar group. HR, administrators, and owners can use this workflow. HR can assign employee roles and manage accounts within its scope. Assigning or removing the accountant or administrator role requires platform role-assignment authority. The owner role uses protected platform administration or bootstrap. Company schedule changes require `attendance.configure`. The `$employeeId` route parameter carries the linked auth user ID.

Open `/manage/employees`. The route and every server function independently require
`manage.access` and `employees.manage`. Enter the full name, optional email, job
title and phone number. Ordinary employee access is selected by default. Additional
access presets are available in the collapsed `სისტემაში წვდომა` section, whose
summary shows the selected presets. This section explains the difference between
the position and system permissions and opens automatically for validation errors.
At least one access preset is required. The employee sets their
username during activation. Authorized profile editors can change the assigned access in the same collapsed
section. A position change never infers permissions. The `employee.job_title` and
`user.roles` columns are both required; this form change needs no database migration.
The server checks the current role set before saving, records an audit event and
revokes active sessions when the roles change.

Usernames are normalized to lowercase. Migration `0010_employee_username.sql` renames `employee.code` to `employee.username`, including its unique index and normalization constraint, without recreating employee records. Better Auth's username plugin is already enabled on the server, provisioning instance, and client; its auth-owned `user.username` column and typed SDK require no regeneration for this employee-table rename. Existing administrative request/response keys named `code` remain compatibility aliases for the username; activation and reset codes remain separate secrets.
Database constraints enforce unique usernames in each table, one employee record
per auth account, and one credential record per auth account. Do not assign a new
username to an existing person returning to work; restore their original record.
An administrator can still mistakenly enter the same person under another username;
the employee roster remains the source for identifying people, not email addresses.

The first activation code expires after 24 hours. It is shown only in the response
dialog and is not persisted in Query or browser storage. Close the dialog to discard
the UI copy. Deliver the code privately after verifying the employee's identity.

Codes are 12 characters from a 32-symbol alphabet without look-alikes (no I, O, 0, 1),
about 60 bits of randomness, displayed as `XXXX-XXXX-XXXX`. Employees may type them in
lowercase, with or without dashes or spaces. That is ample because a code is single-use,
stored only as a SHA-256 hash, expires within hours, and the redeem endpoints are
rate limited. The rules live in `access.rules.ts`.

- An invited employee can receive a replacement activation code.
- An active employee can receive a password-reset code that expires after 15 minutes.
- Issuing either code invalidates the previous code for that account.
- Suspending login access revokes sessions and outstanding codes and immediately
  makes application session guards deny access. It does not terminate employment.
- Restoring access reuses the same employee and auth identity. An account that has
  never activated still needs a new activation code. Inactive employment independently
  blocks login, activation, and password reset; account restoration cannot override it.
- An administrator cannot suspend or reset themselves through this administrative
  interface. Acting on an owner account requires an owner. Platform account administrators may manage other administrators; HR cannot. The operator
  recovery command is the emergency route for an inaccessible sole owner.

Privileged operations re-read and lock the acting account and target account.
Changes and their audit rows commit together. Audit rows contain actor, target,
action, reason, and timestamps; they contain neither codes nor passwords.

## Employee workflow

Use `/auth/register` to activate and `/auth/reset-password` to redeem a reset code.
These pages do not accept employee IDs, names, roles, or email to choose an identity.
The hashed code binds the request to the administrator-created account. Codes are
deleted atomically with the password update, and expiration and workflow status are
rechecked while the account is locked. Concurrent consumption can succeed only once.

Better Auth hashes passwords and remains the session and cookie authority. Custom
activation/reset endpoints use its native origin/CSRF middleware and shared
database-backed rate limits. Successful password resets revoke existing sessions.
The main auth handler keeps public signup, public identity updates, and
username-availability lookup disabled. Self-service password change remains under
Better Auth's existing credential checks.

The login page accepts a username or email through Better Auth's native sign-in methods.
New accounts with email use the normalized email as their auth identity as well as contact email.
Better Auth enforces email uniqueness; activation is still required before either sign-in method works.
Existing accounts retain their current auth email; older contact-only addresses are not silently promoted to login identities.
Email is not marked verified by provisioning. Email delivery is not configured; recovery still uses administrator-issued codes.

## Editing details after creation

Who may change what:

- **Employee managers** (`manage.access` and `employees.manage`) use the `რედაქტირება` button on
  `/manage/employees/$employeeId` to edit full name, username, email, job title and phone. On other
  employees' accounts, changes to system access and the work schedule follow their own permission
  rules. The server records the actor, target and timestamp as `account.details_updated`.
- **Owners, administrators and HR managers** with employee-management access can use the same
  button on their own employee page to edit those five profile fields. They can also set their own
  working days and hours with `attendance.configure`. Self-edits to system access and account
  status are blocked.
- **Employees** edit only their own phone number on `/settings/profile`. The subject is always
  the signed-in account; no identifier is accepted from the browser.
- **Email** changes require employee-management access because email is not verified yet. For accounts that
  sign in with email, the login email follows the contact email, must stay unique, and cannot be
  removed. For email-less accounts the address is stored as contact information only.
- **Passwords** are changed by the employee on `/settings/security` (current password required,
  other devices are signed out, five attempts per minute). A forgotten password goes through
  `/auth/forgot-password`: the administrator issues a reset code and the employee redeems it on
  `/auth/reset-password`.

## Assigned working week

New employees inherit the effective company schedule by default. An employee manager with
`attendance.configure` may instead assign a complete seven-day recurring week during creation.
Each day specifies start/end hours or explicitly marks a day off. The company timezone
remains authoritative, and an active company schedule must exist before a custom assignment.
The assignment and account are saved in one transaction, with the assigning actor retained.
For example, office staff can work Monday through Friday while another employee inherits Saturday work.
Existing employees without an assignment continue using company defaults. Open sessions retain
their original expected times.

An employee manager with `attendance.configure` can later replace the week, or return the employee
to the company schedule, from "რედაქტირება" on the account page `/manage/employees/$employeeId`. The
change records the authenticated actor, target account, timestamp and a fixed server-owned description
as `account.schedule_updated` only when the
week really changed. Administrators without that permission do not see the schedule section and
the server rejects the attempt. The account page shows the effective week as a seven-day strip,
labelled "ინდივიდუალური" or "კომპანიის განრიგი". Employees see their own effective week, with
today highlighted, on `/schedule`; it is read-only and is served for the signed-in account only.

### On-site and remote work

Working days default to ადგილზე (on-site), including existing employee schedules. During creation
or editing, an employee manager with `attendance.configure` can mark individual weekdays as
დისტანციურად (remote). The work location is independent of working hours, so employees can still
inherit the company hours. Managers can set a date-specific work location on an existing employee's
profile, or restore the recurring choice for that date. The date is interpreted in the company
timezone. A dated change applies to a scheduled workday and takes precedence over the recurring
choice. The employee sees the recurring work locations and upcoming exceptions on `/schedule`.

The account audit records who assigned remote weekdays or changed a dated exception. Owners,
administrators and HR managers with `attendance.configure` can edit their own hours, working days,
and recurring or dated work locations. See [attendance security](attendance-security.md) for the
clock-in and clock-out rules on remote days.

## Required auth email field

Better Auth still requires an email-shaped protocol identifier. Newly provisioned
employees without email receive a random `employee-<identifier>@accounts.teamwork.invalid`. The reserved `.invalid`
domain cannot deliver mail and is never presented as an employee contact address.
Real optional contact email lives on the employee record, and the application actor
projection exposes that value or null. Do not send verification or recovery email
to the internal identifier.

The private provisioning SDK instance has signup enabled only inside the authorized
database transaction. It is never mounted as an HTTP handler, never auto-signs in,
and generates a discarded random initial password. The committed account remains
invited and cannot authenticate until activation. The application auth instance
continues to reject public signup.

## Tests and migration

Migration `0002_amused_red_hulk.sql` adds employee records, hashed challenges, audit
rows, username/lifecycle fields, and Better Auth's rate-limit storage. Existing auth
IDs and passwords remain unchanged. Legacy accounts stay active and retain email
login; their activation timestamp is backfilled. Legacy accounts without an employee
record need an intentional reviewed linkage before employee-account actions can
target them. The current local database had no legacy accounts.

Run normal tests with `pnpm test`. To exercise real database constraints, concurrent
creation/activation, password resets, suspension, HTTP origin checks, and throttling:

```powershell
$env:RUN_ACCOUNT_DB_TESTS='1'
pnpm test src/features/access/server/access.integration.test.ts
```

The integration suite requires a local PostgreSQL connection with permission to
create databases. It creates a uniquely named test database, applies all migrations,
and drops that database afterward. It refuses remote database hosts and does not
provision test employees in the development employee roster.

## Platform account controls

Employee creation and HR profile management remain under `/manage/employees`. Administrators use `/admin/access` for all login identities, their role memberships and individual permission exceptions, suspension/restoration, and session revocation. This is an access directory, not a duplicate employee profile workflow. Owner accounts and self-access are protected. Apply migration `0016_user_permission_overrides.sql` before deploying these controls. It was applied to the verified local development database; other environments must run their normal reviewed migrations.

Employee role choices use the shared authorization schema: თანამშრომელი, წარმოების სპეციალისტი, წარმოების უფროსი, გაყიდვების მენეჯერი, and HR, in that order. Admin and protected owner roles are excluded from employee creation and remain available only through their existing privileged workflows. The retired operations role is no longer accepted by provisioning or access administration.
