<div align="center">

<img src="app/icon.svg" width="80" alt="WalletHistory logo">

# WalletHistory

**Source-available personal finance tracker you can host yourself**

[**Website**](https://wallethistory.com) | [**Hosted app**](https://my.wallethistory.com) | [**Self-hosting**](#self-hosting)

[![Release](https://img.shields.io/github/v/release/canon4o/wallethistory?label=Release)](https://github.com/canon4o/wallethistory/releases)
[![Release image](https://github.com/canon4o/wallethistory/actions/workflows/release-image.yml/badge.svg)](https://github.com/canon4o/wallethistory/actions/workflows/release-image.yml)
[![Docker image](https://img.shields.io/badge/ghcr.io-canon4o%2Fwallethistory-blue?logo=docker)](https://github.com/canon4o/wallethistory/pkgs/container/wallethistory)
[![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](LICENSE)

</div>

**WalletHistory** keeps track of where your money goes: accounts, income and expenses, budgets, savings goals and reports, for you alone or shared with your household. Your data stays in your own Postgres database.

## Hosted or self-hosted

- **Hosted**: sign up at [my.wallethistory.com](https://my.wallethistory.com). Nothing to install.
- **Self-hosted**: run it on your own server, NAS or home lab with Docker Compose. See [Self-hosting](#self-hosting).

Both run the same code.

## Is WalletHistory for me?

WalletHistory is for you if you...

- want to see your whole financial picture in one place: every account, every transaction
- like setting monthly or weekly budgets and being warned before you overspend
- save towards goals, alone or together with your partner or family
- prefer entering transactions yourself over connecting your bank
- value privacy and want to own your data

## Features

- 💳 **Accounts and transactions**: cash, bank and card accounts with computed balances, income and expenses, transfers between accounts, categories with icons and colors, tags, notes, search and filters
- 🔁 **Recurring transactions**: rules that create entries automatically on schedule
- 🎯 **Budgets**: weekly or monthly limits per expense category, spending pace, history of past periods, and in-app alerts when you get close to a limit
- 🐷 **Savings goals**: deposit to and withdraw from goals, track progress, share goals with your household
- 👨‍👩‍👧 **Households**: invite members, see shared accounts and goals, keep personal data personal
- 📊 **Dashboard and reports**: cash flow, spending by category, period comparison, balance over time, forecast, CSV export
- 🌍 **Your way**: English, Bulgarian and Spanish; light and dark theme; USD, EUR or GBP; your own timezone
- 🛡️ **Admin panel**: users, login history, audit log, announcements
- 🔒 **Secure by default**: bcrypt passwords, database-backed sessions, email verification, rate limiting and account lockout, strict security headers
- 📱 **Mobile first**: works well on a phone, no app store needed

## Self-hosting

An official image, `ghcr.io/canon4o/wallethistory`, is published to GitHub Container Registry on every release, for `linux/amd64` and `linux/arm64`. It applies any new database migrations itself before the app starts.

### Requirements

- Docker with Docker Compose v2, on a server, home lab or NAS

### Run with Docker Compose

1. Download the compose file and the example environment file into a new folder:

   ```bash
   mkdir wallethistory && cd wallethistory
   curl -LO https://raw.githubusercontent.com/canon4o/wallethistory/main/docker-compose.release.yml
   curl -L -o .env https://raw.githubusercontent.com/canon4o/wallethistory/main/.env.docker.example
   ```

2. Edit `.env` and set at least `POSTGRES_PASSWORD` and `REDIS_PASSWORD`:

   ```bash
   openssl rand -base64 24 | tr -d '/+='
   ```

3. Start it:

   ```bash
   docker compose -f docker-compose.release.yml up -d
   ```

4. Open [http://localhost:3000](http://localhost:3000) and log in as `admin@admin.com` / `adminpass`. **Change this password right away** in Profile → Settings.

To build from source instead, clone the repository, copy `.env.docker.example` to `.env`, and run `docker compose up -d --build`.

### Or paste one compose file (NAS, Portainer, Dockge)

If your NAS or Docker UI takes a single compose file, paste this one. Replace every `CHANGE_ME` value first: use the same database password in both places, and the same Redis password in all three. Generate passwords with `openssl rand -base64 24 | tr -d '/+='` or any password manager (letters and digits only).

```yaml
name: wallethistory

services:
  app:
    image: ghcr.io/canon4o/wallethistory:latest
    restart: unless-stopped
    ports:
      - "1314:3000"                     # host port:container port
    environment:
      APP_URL: http://CHANGE_ME:1314    # the address you open in the browser, e.g. http://192.168.0.121:1314
      DATABASE_URL: postgres://wallethistory:CHANGE_ME_DB_PASSWORD@db:5432/wallethistory
      REDIS_URL: redis://:CHANGE_ME_REDIS_PASSWORD@redis:6379
      TRUSTED_PROXY_HOPS: "0"           # 1 if a reverse proxy (HTTPS) is in front
      REQUIRE_EMAIL_VERIFICATION: "false"
      # Optional: real email. Without SMTP_HOST, emails are printed to the app log.
      SMTP_HOST: ""
      SMTP_PORT: "587"
      SMTP_SECURE: "false"
      SMTP_USER: ""
      SMTP_PASS: ""
      SMTP_FROM: "WalletHistory <noreply@example.com>"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: wallethistory
      POSTGRES_PASSWORD: CHANGE_ME_DB_PASSWORD
      POSTGRES_DB: wallethistory
    volumes:
      - pgdata:/var/lib/postgresql/data   # or a NAS folder, e.g. /volume1/docker/wallethistory/db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U wallethistory -d wallethistory"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass CHANGE_ME_REDIS_PASSWORD --maxmemory 128mb --maxmemory-policy allkeys-lru --save "" --appendonly no
    environment:
      REDISCLI_AUTH: CHANGE_ME_REDIS_PASSWORD
    healthcheck:
      test: ["CMD-SHELL", "redis-cli ping | grep -q PONG"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
```

Then open the `APP_URL` address and log in as `admin@admin.com` / `adminpass`, and change the password right away. Exposing the port on all interfaces like this is fine on a home network you trust; for access from the internet use HTTPS (below). With this file, the update and backup commands below are the same without `-f docker-compose.release.yml`, or use your NAS's "pull and redeploy" button.

### Open it from other devices (home network)

To reach WalletHistory on a NAS or home server at, for example, `http://192.168.0.121:1314`, set in `.env`:

```env
APP_URL=http://192.168.0.121:1314
APP_BIND=0.0.0.0
APP_PORT=1314
```

`APP_URL` must match the address you type in the browser. Plain http is fine on a network you trust; never expose that port to the internet.

### Expose it to the internet (HTTPS)

Put a reverse proxy with TLS in front (Caddy, Traefik, nginx, Cloudflare Tunnel), then set:

```env
APP_URL=https://wallet.example.com
TRUSTED_PROXY_HOPS=1
```

The proxy must forward the `Host` and `X-Forwarded-Host` headers unchanged. Also configure SMTP and set `REQUIRE_EMAIL_VERIFICATION=true` if other people will sign up.

Browsers only offer "Install app" / "Add to Home Screen" over HTTPS (or `localhost`), so a plain `http://` address on your LAN works as a website but is not installable. The installed app is just a shortcut with its own window; nothing is cached for offline use.

### Updating

```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

The app applies new database migrations by itself when it starts; if one fails, the container stops and the error is in `docker compose -f docker-compose.release.yml logs app`. Migrations cannot be undone, so **back up first** (see below). Pin a version with `WALLETHISTORY_VERSION=1.2.3` in `.env` (default `latest`).

### Backup and restore

```bash
# Backup
docker compose -f docker-compose.release.yml exec -T db \
  pg_dump -U wallethistory -Fc wallethistory > wallethistory-$(date +%F).dump

# Restore (replaces the current data)
docker compose -f docker-compose.release.yml stop app
docker compose -f docker-compose.release.yml exec -T db \
  pg_restore -U wallethistory -d wallethistory --clean --if-exists < wallethistory-2026-10-22.dump
docker compose -f docker-compose.release.yml start app
```

Redis is only a cache and needs no backup.

### Environment variables

| Name | Default | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | | **Required.** Password of the bundled Postgres database. |
| `REDIS_PASSWORD` | | **Required.** Password of the bundled Redis cache. |
| `APP_URL` | `http://localhost:3000` | The URL you open in the browser. Links in emails are built from it; cookies are marked `Secure` only when it starts with `https://`. |
| `APP_BIND` | `127.0.0.1` | Interface the app is published on. `0.0.0.0` makes it reachable from your network. |
| `APP_PORT` | `3000` | Host port the app is published on. |
| `WALLETHISTORY_VERSION` | `latest` | Image tag to run (`docker-compose.release.yml` only). |
| `TRUSTED_PROXY_HOPS` | `0` | Number of reverse proxies in front of the app, used to find the client IP for login history and rate limits. |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | `true`: new users must confirm their email before they can log in. Needs SMTP. |
| `SMTP_HOST` | | SMTP server. Empty: emails (including reset links) are printed to `docker compose logs app`. |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_SECURE` | `false` | `true` for port 465. |
| `SMTP_USER`, `SMTP_PASS` | | SMTP credentials. Leave empty for a server without authentication. |
| `SMTP_FROM` | `WalletHistory <noreply@example.com>` | Sender address. |

Advanced variables (`DATABASE_URL`, `REDIS_URL`, `DATABASE_POOL_MAX`) are set by the compose file and only need changing if you use your own Postgres or Redis.

### Health check

`GET /api/health` returns `{"status":"ok"}` (200) when the database answers, otherwise 503. The container healthcheck uses it, and you can point an uptime monitor at it.

## Development

Requirements: Node.js 22+ and a Postgres database.

```bash
npm install
cp .env.example .env.local   # set DATABASE_URL and APP_URL
npm run db:migrate
npm run dev                  # http://localhost:3000
```

`npm run lint`, `npm run build` and `npm run test` must pass before a change is merged. Tests need a disposable database in `DATABASE_URL_TEST`.

## Technology

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, PostgreSQL with Drizzle ORM, Redis (optional cache), nodemailer. Custom authentication, no third-party auth service. One app, no separate backend.

## Contributing

Bug reports and ideas are welcome in [Issues](https://github.com/canon4o/wallethistory/issues). For code changes, see [Development](#development); new features come with tests.

## License

WalletHistory is source-available under the [Elastic License 2.0](LICENSE) (ELv2).

- You may use, self-host, modify and share it, for yourself, your family or your organization.
- You may not offer it to others as a hosted or managed service.
- Keep the license and copyright notices.
