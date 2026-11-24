# Team Adwings VPS production reference

Use this reference to provision or inventory Team Adwings on the VPS. It describes the Nginx deployment at `https://team.adwings.ge` using the repository configuration and previously observed host settings. Confirm the live release, port bindings, network, and database role before maintenance. The [VPS deployment runbook](vps-deployment.md) covers release procedures, and the [initial host setup](../docker/deploy/production-setup-7-step-guide.md) covers VPS and GitHub setup. Its Nginx examples use `beta.adwings.ge`. Use the production hostname and its certificate when configuring the live virtual host.

## Host, paths, and containers

The deployment user is `team-adwings-deploy`. An administrator can switch to it with `sudo -iu team-adwings-deploy`. That account owns `/var/www/team-adwings` and runs Docker. The observed Docker platform is `linux/amd64`.

| VPS path                                                      | Contents and ownership                                                                                                                                                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/var/www/team-adwings/.env.docker`                           | Private web, migration, database, and backup settings. Managed on the host.                                                                                                                                             |
| `/var/www/team-adwings/.env.gps`                              | Private receiver settings. Managed on the host.                                                                                                                                                                         |
| `/var/www/team-adwings/compose.gps.yaml`                      | Receiver Compose definition uploaded from the repo.                                                                                                                                                                     |
| `/var/www/team-adwings/compose.gps.database.yaml`             | Receiver override that attaches it to the existing application database network.                                                                                                                                        |
| `/var/www/team-adwings/releases/<sha>-<run>-<attempt>/`       | GitHub Actions bundle with `compose.yaml`, `compose.vps.yaml`, `compose.nginx.yaml`, and deployment and backup scripts. The release script writes `images.env` with `BLUE_IMAGE`, `GREEN_IMAGE`, and `MIGRATION_IMAGE`. |
| `/var/www/team-adwings/current`                               | Symlink to the active release. Use its files for maintenance on the deployed version.                                                                                                                                   |
| `/var/www/team-adwings/.deploy/`                              | Generated `caddy/Caddyfile`, shared `public/assets/`, `backup.sh`, and `release.lock`. The Caddyfile records the active slot.                                                                                           |
| `/var/www/team-adwings/backups/`                              | Private database archives. Keep an off-VPS copy as well.                                                                                                                                                                |
| `/etc/nginx/sites-available/` and `/etc/nginx/sites-enabled/` | Host-managed production virtual host and its enabled entry. Verify the actual filename on the VPS.                                                                                                                      |

| Compose project    | Service         | Purpose and network                                                                                                                                                                                  |
| ------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `team-adwings`     | `blue`, `green` | Web slots on container port `3000` over `team-adwings_backend`. Caddy routes to the active slot. An older slot can remain during release rollback.                                                   |
| `team-adwings`     | `edge`          | Caddy on container port `8080`, published to host `127.0.0.1:3006` for Nginx.                                                                                                                        |
| `team-adwings`     | `db`            | PostgreSQL 18 with PostGIS. Private `db:5433`, with data in `team-adwings_postgres_data` mounted at `/var/lib/postgresql`.                                                                           |
| `team-adwings`     | `migrate`       | One-off migration image for `pnpm db:migrate` and first-owner provisioning.                                                                                                                          |
| `team-adwings`     | `backup`        | Scheduled logical dumps to `backups/`. Runs daily at 05:00 Asia/Tbilisi by default, with seven days of completed archive retention.                                                                  |
| `team-adwings-gps` | `gps`           | Receiver on VPS TCP `15505` mapped to container TCP `5505`. Joins the app backend for PostgreSQL writes. Its separate `team-adwings-gps_gps_data` volume stores the rotating raw journal at `/data`. |

Point production DNS at the VPS and serve the matching TLS certificate from Nginx. Public website traffic uses ports `80` and `443`. Nginx forwards to `127.0.0.1:3006` and sets the forwarded scheme and client IP headers used by the web app. The tracker connects to the VPS on `15505/TCP` directly. Keep PostgreSQL private. Check provider firewall rules and Docker port bindings for GPS exposure. For production database administration, use `docker exec` on the VPS or an approved SSH tunnel to an endpoint reachable from the VPS. The local dev database port `55433` is not a VPS port. The shop stack and Traccar, if still running, have their own database and deployment lifecycle.

## Private configuration files

Save the files with mode `0600` and ownership by `team-adwings-deploy`. Replace every `REPLACE_...` value privately. Keep production and dev credentials separate. Use independently generated secrets for the database, application authentication, and GPS authentication. Use a hex database password for a new installation because Compose embeds it directly in the connection URL. For the GPS URL, percent-encode reserved characters in an existing password when needed. Changing `POSTGRES_PASSWORD` in `.env.docker` alone does not change the login password in an initialized database. Coordinate any credential rotation with PostgreSQL and the containers using it.

### `/var/www/team-adwings/.env.docker`

```dotenv
APP_DOMAIN=team.adwings.ge
APP_URL=https://team.adwings.ge
POSTGRES_DB=team_adwings
POSTGRES_USER=team_adwings
POSTGRES_PORT=5433
POSTGRES_PASSWORD=REPLACE_WITH_WEB_DB_PASSWORD
BETTER_AUTH_SECRET=REPLACE_WITH_WEB_AUTH_SECRET
BACKUP_RETENTION_DAYS=7
REDIS_URL=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=
```

The production Compose files derive `DATABASE_URL` and `BETTER_AUTH_URL` from these fields. Keep `BETTER_AUTH_SECRET` stable across normal releases. Leave `REDIS_URL` empty for the documented deployment. The Compose files pass through the optional SMTP settings, but the current owner invitation flow uses a privately shared activation code. Turning on SMTP settings alone does not enable email delivery. Local-only port settings such as `MAILPIT_UI_PORT` and `APP_PORT` are unnecessary for this deployment.

### `/var/www/team-adwings/.env.gps`

```dotenv
GPS_PUBLIC_PORT=15505
GPS_PROTOCOL=jt808
GPS_REPLY=true
GPS_DEVICE_IDS=
GPS_AUTH_SECRET=REPLACE_WITH_GPS_AUTH_SECRET
GPS_DATABASE_URL=postgresql://gps_receiver:REPLACE_WITH_GPS_DB_PASSWORD@db:5433/team_adwings
GPS_DATABASE_NETWORK=team-adwings_backend
GPS_UTC_OFFSET_MINUTES=0
GPS_JOURNAL_BYTES=10485760
GPS_JOURNAL_FILES=5
```

The website registry controls allowed trackers in PostgreSQL mode. `GPS_DEVICE_IDS` can stay empty in that mode. `GPS_AUTH_SECRET` must be at least 32 characters when replies are enabled. Preserve the existing secret across receiver rebuilds and database resets. The GPS timestamp offset describes the timestamp encoded by the tracker. Confirm it with a real fix before changing it. `compose.gps.database.yaml` attaches the receiver to the existing backend network and uses the same `team_adwings` database as the web app.

### GitHub Actions and image access

In the GitHub environment `team-adwings-production`, configure the values read by the [deployment workflow](../.github/workflows/deploy.yml).

| Type     | Key                            | Expected value                                                                              |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| Variable | `TEAM_ADWINGS_DEPLOY_TARGET`   | `nginx`                                                                                     |
| Variable | `TEAM_ADWINGS_COMPOSE_PROJECT` | `team-adwings`                                                                              |
| Secret   | `TEAM_ADWINGS_VPS_HOST`        | VPS hostname or IP                                                                          |
| Secret   | `TEAM_ADWINGS_VPS_USER`        | `team-adwings-deploy`                                                                       |
| Secret   | `TEAM_ADWINGS_VPS_PORT`        | `22` or the actual SSH port                                                                 |
| Secret   | `TEAM_ADWINGS_VPS_SSH_KEY`     | Dedicated Actions deployment private key with the matching public key authorized on the VPS |
| Secret   | `TEAM_ADWINGS_VPS_KNOWN_HOSTS` | Verified VPS SSH host key entry                                                             |

Allow the deploy account on the VPS to pull both GHCR images. The workflow checks pull requests and publishes and deploys an eligible `main` run by immutable image digest. The release script applies migrations, starts and checks the candidate slot, and switches Caddy. For GPS receiver code, build the Linux image from the deployed commit and follow the [separate receiver release procedure](vps-deployment.md#release-the-web-app-and-gps-receiver). For receiver environment or Compose-only changes, recreate GPS using the loaded image. A routine web-only release does not require rebuilding GPS.

## PostgreSQL roles and GPS grants

`team_adwings` is the database owner used by the current web, migration, and backup configuration. `gps_receiver` is a separate PostgreSQL login for the GPS worker. The application's `owner` account is a website identity and has no PostgreSQL login of its own.

On a new PostgreSQL cluster, create `gps_receiver` once as the database administrator. Set its password interactively in `psql` with `\password gps_receiver`, then put the same credential in `.env.gps` privately. If the current cluster already has this login, keep it. After creating or restoring a fresh `team_adwings` database, run migrations and apply the grants to the newly created objects. The role survives a replacement database in the same cluster. The old tables' grants stay with the old objects.

```sql
-- Run this statement only if the role is absent in the PostgreSQL cluster.
CREATE ROLE gps_receiver LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
```

```sql
-- Connect to team_adwings as the database owner after migrations succeed.
BEGIN;
GRANT CONNECT ON DATABASE team_adwings TO gps_receiver;
GRANT USAGE ON SCHEMA public TO gps_receiver;
GRANT SELECT, UPDATE (last_contact_at)
  ON TABLE public.gps_device TO gps_receiver;
GRANT INSERT, SELECT (device_id, fingerprint)
  ON TABLE public.gps_position TO gps_receiver;
GRANT SELECT, INSERT, UPDATE (received_at, error_code)
  ON TABLE public.gps_device_diagnostic TO gps_receiver;
COMMIT;
```

The receiver needs these three tables. Keep employee, account, payroll, job, and audit access outside its grants. Before starting GPS, run the [receiver database login check](vps-deployment.md#4-load-the-image-and-check-postgresql) from the receiver's Docker network. Expect `gps_receiver` and `team_adwings`. A fresh tracker report on the website verifies the write path as well as the login.

## Fresh database and production handover

1. For a new install, deploy `main` and let the release run migrations. For a reset on the current VPS, use a maintenance window. Pause releases, stop both web slots, GPS, and backups, close database clients, then create and verify a final backup. Keep the PostgreSQL volume. Rename the old database for rollback, create a fresh `team_adwings` database owned by `team_adwings`, enable required extensions such as PostGIS, and run the deployed migration image.
2. Confirm migrations succeeded, then apply the GPS grants above. If the old database is retained for rollback, keep it offline until the new deployment and backups have been verified. Plan permanent removal separately.
3. Bootstrap the first owner with the following command on the VPS as the deploy user. Replace `owner` and `Lado` with the intended username and display name.

   ```bash
   cd /var/www/team-adwings
   docker compose -p team-adwings --profile release \
     --project-directory "$PWD" --env-file .env.docker --env-file current/images.env \
     -f current/compose.yaml -f current/compose.vps.yaml -f current/compose.nginx.yaml \
     run --rm --no-deps migrate pnpm exec tsx scripts/bootstrap-owner.ts \
     --code owner --name 'Lado'
   ```

   Share the printed activation code privately with the owner. Open `https://team.adwings.ge/auth/register`, activate the account, and set its password. The script refuses bootstrap when an owner or admin already exists. Use authenticated account management for subsequent accounts.

4. Verify site health and owner login. Configure production company settings, such as scheduling, leave, and payroll settings if payroll is enabled. Register each GPS tracker in `/manage/gps` before testing live reporting. Check the tracker fix timestamp and telemetry in the website. Confirm the backup worker writes a new archive, copy archives off the VPS, and test a restore into a separate database.

Scheduled backups contain one database and exclude access grants. Preserve role and grant setup separately for disaster recovery. Protect the production environment files and the GPS journal separately from the database backups. Web rollback switches the application image. If a fresh-database cutover fails, stop database clients again, move the fresh database aside, restore the retained database to the name `team_adwings`, and re-enable its connections before starting the services. The original tables retain their original grants.

## VPS compared with local development

| Concern            | Production VPS                                                                                   | Local development                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source and startup | GitHub Actions bundles under `releases/`, pinned runtime and migration images, `current` symlink | Full Git checkout, usually on `dev`, and `pnpm dev` on the host                                                                                       |
| Web access         | `https://team.adwings.ge` via Nginx and Caddy                                                    | `http://localhost:3005` via Vite                                                                                                                      |
| Compose files      | `compose.yaml`, `compose.vps.yaml`, `compose.nginx.yaml` from `current/`                         | `compose.yaml` and `compose.dev.yaml`. `compose.prod.yaml` is available for a single-container production-style preview                               |
| PostgreSQL         | `db:5433` on the private backend network                                                         | `127.0.0.1:55433` with `.env.docker.example` defaults. Check the actual local Docker binding                                                          |
| Environment        | `.env.docker` and `.env.gps` in the deployment root, plus generated `current/images.env`         | `.env.docker` for Docker, `.env` or exported variables for host-side tools such as Drizzle, and a separate local GPS env file if testing the receiver |
| Email tooling      | Mailpit stays off                                                                                | Mailpit available through `--profile dev`, with local SMTP on `1025` and UI on `8026` by default                                                      |
| Data               | Production accounts, GPS reports, and scheduled backups                                          | Separate development data and credentials. Restore a VPS copy only into the intended local database                                                   |

For a typical local setup, copy the committed examples, use a private local password and auth secret, and point the host-side app and migration tools at the loopback database. With the current local Compose defaults, the host-side entries are:

```dotenv
DATABASE_URL=postgresql://team_adwings:REPLACE_WITH_LOCAL_DB_PASSWORD@127.0.0.1:55433/team_adwings
BETTER_AUTH_URL=http://localhost:3005
BETTER_AUTH_SECRET=REPLACE_WITH_LOCAL_AUTH_SECRET
```

```bash
docker compose --env-file .env.docker -f compose.yaml -f compose.dev.yaml --profile dev up -d
pnpm db:migrate
pnpm dev
```

Use the local credentials for migrations and avoid `db:5433` in a host-side connection string. If a local restore reports `role "gps_receiver" does not exist` and you only need the data for web development, restore into an empty local target with **Owner** and **Privileges** excluded. To test the database-backed receiver locally, give it its own local login and grants.

## Read-only VPS inventory

Run as `team-adwings-deploy`. These checks show the active release, service status, ports, Compose networks, and whether private configuration files exist. They do not print environment contents.

```bash
cd /var/www/team-adwings
readlink -f current
stat -c '%a %U %n' .env.docker .env.gps
docker version --format '{{.Server.Os}}/{{.Server.Arch}}'
sed -n 's/^# slot=/Active slot: /p' .deploy/caddy/Caddyfile
docker ps -a --filter label=com.docker.compose.project=team-adwings \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Networks}}'
docker ps -a --filter label=com.docker.compose.project=team-adwings-gps \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Networks}}'
curl -fsS -H 'X-Real-IP: 127.0.0.1' http://127.0.0.1:3006/api/health
curl -fsS https://team.adwings.ge/api/health
```

Check the database owner connection, GPS login, and GPS table names without
reading employee data or device reports. The login should appear once with
`rolcanlogin` true, and the three table columns should all show a name.

```bash
docker exec -i team-adwings-db-1 sh -c \
  'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT current_database(), current_user;
SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = 'gps_receiver';
SELECT to_regclass('public.gps_device') AS devices,
       to_regclass('public.gps_position') AS positions,
       to_regclass('public.gps_device_diagnostic') AS diagnostics;
SQL
```

The health endpoint checks web and database readiness. For production readiness, also verify login, migrations, one real GPS report, and a tested backup restore. Share inventory output with agents when troubleshooting and keep `.env` contents, full connection strings, activation codes, and tracker journals private.
