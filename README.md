# URL Shortener & Analytics Platform

A URL shortener where shortening is the easy part — the interesting engineering is
everything that happens _after_ a link is clicked.

```text
Long URL:  https://example.com/some/really/long/path?campaign=summer
Short URL: https://yourapp.com/aB72x
```

When someone opens `/aB72x`, the API resolves the destination and redirects them.
At the same time a click event is published, and a separate worker turns it into
analytics: totals, daily series, countries, devices, browsers and referrers.

## Architecture

```text
              ┌──────────────────┐
              │ React dashboard  │  Vite + Tailwind + TanStack Query
              └────────┬─────────┘
                       │  Authorization: Bearer <access token>
                       ▼
                ┌──────────────┐
                │  API Server  │  Fastify + Zod
                └──┬────────┬──┘
                   │        │
        ┌──────────┘        └────────────┐
        ▼                                ▼
 ┌─────────────┐                 ┌──────────────┐
 │    Redis    │                 │  PostgreSQL  │
 │ redirect +  │                 └──────▲───────┘
 │ preview     │                        │
 │ caches +    │                        │ clicks
 │ click stream│                        │
 └──────┬──────┘                        │
        │ click events                  │
        ▼                               │
 ┌─────────────┐                        │
 │  Analytics  │────────────────────────┘
 │   worker    │
 └─────────────┘
```

The codebase is a **modular monolith**. The API and worker run as separate
processes sharing one organized codebase (and deploy as separate containers):

```text
apps/api/src/
├── modules/
│   ├── auth/         # register / login / refresh / logout, tokens, guard
│   ├── api-keys/     # X-API-Key creation, listing, revocation
│   ├── users/        # user repository
│   ├── links/        # create / list / read / update / delete + previews
│   ├── analytics/    # click capture, UA/geo parsing, aggregates
│   └── redirects/    # public GET /:shortCode + cache-aside resolver
├── cache/            # Redis redirect + preview caches
├── queue/            # Redis Streams click-event producer and consumer
├── plugins/          # cross-cutting Fastify concerns (errors, health)
├── lib/              # hashing and IP helpers
├── types/            # Fastify request augmentation
├── generated/prisma/ # generated Prisma client (gitignored)
├── app.ts            # buildApp() — wiring
├── server.ts         # API process entrypoint
├── worker.ts         # analytics worker entrypoint
├── logger.ts         # structured pino logger (with redaction)
├── config.ts         # env validation (Zod)
├── db.ts             # Prisma client factory
└── schemas.ts        # shared API schemas
```

The React dashboard lives in `apps/web`:

```text
apps/web/src/
├── components/   # shadcn/ui primitives, layout, link + analytics widgets
├── lib/          # api client, auth store, query hooks, formatters
├── pages/        # login, register, dashboard, analytics, API keys
├── App.tsx       # routes + session bootstrap
└── main.tsx      # providers

apps/web/e2e/     # Playwright end-to-end specs
```

## Tech stack

| Layer            | Choice                                       |
| ---------------- | -------------------------------------------- |
| Runtime          | Node.js 20+ (TypeScript, ESM)                |
| HTTP             | Fastify 5                                    |
| Validation       | Zod 4 + `fastify-type-provider-zod`          |
| Auth             | `jose` (JWT HS256) + `@node-rs/argon2`       |
| Analytics        | `ua-parser-js` + `geoip-lite` (CDN headers first) |
| Cache            | Redis 7 + `ioredis` (cache-aside + Streams)  |
| Rate limiting    | `@fastify/rate-limit` backed by Redis        |
| API docs         | `@fastify/swagger` + Swagger UI (`/docs`)    |
| Logging          | pino (structured JSON, redaction)            |
| Database         | PostgreSQL 16                                |
| ORM              | Prisma 7 (with `@prisma/adapter-pg`)         |
| Frontend         | React 19 + Vite + Tailwind CSS v4            |
| UI components    | shadcn/ui (Radix), light/dark via next-themes |
| Frontend data    | TanStack Query + Recharts + sonner           |
| Testing          | Vitest (unit + integration) + Playwright (E2E)|
| Build            | tsup (API) + Vite (web)                      |
| Containers       | Docker + Docker Compose                      |
| CI               | GitHub Actions                               |
| Workspaces       | npm workspaces                               |

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Start infrastructure (PostgreSQL + Redis)

Requires Docker Desktop.

```bash
npm run infra:up
```

### 3. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
```

Set a real `JWT_ACCESS_SECRET` (at least 32 characters), e.g. `openssl rand -base64 48`.

### 4. Apply the database schema

```bash
npm run db:migrate
```

The database starts empty — create your account from the dashboard or
`POST /api/auth/register`.

### 5. Run the API, worker and dashboard

```bash
npm run dev:all
# API    -> http://localhost:3000
# Worker -> consumes click events from Redis Streams
# Web    -> http://localhost:5173 (proxies /api to the API)
```

Open http://localhost:5173 and register. You can also run the processes
separately with `npm run dev:api`, `npm run dev:worker` and `npm run dev:web`.
Interactive API docs are at http://localhost:3000/docs.

### Or run the whole stack in Docker

One command builds and runs Postgres, Redis, migrations, the API, the worker and
the dashboard (nginx):

```bash
docker compose --profile full up --build
# Dashboard -> http://localhost:8080
# API       -> http://localhost:3000
# Docs      -> http://localhost:8080/docs
```

Set a real secret with `JWT_ACCESS_SECRET=... docker compose --profile full up -d`.
Stop it with `docker compose --profile full down`.

## API

Public:

| Method | Path              | Description                          | Success |
| ------ | ----------------- | ------------------------------------ | ------- |
| `POST` | `/api/auth/register` | Create an account                 | `201`   |
| `POST` | `/api/auth/login`    | Exchange credentials for tokens   | `200`   |
| `POST` | `/api/auth/refresh`  | Rotate a refresh token            | `200`   |
| `POST` | `/api/auth/logout`   | Revoke a refresh token            | `204`   |
| `GET`  | `/:code`             | Redirect to the destination       | `302`   |
| `GET`  | `/health`            | Liveness                          | `200`   |
| `GET`  | `/health/ready`      | Readiness (checks the database)   | `200` / `503` |

Require `Authorization: Bearer <accessToken>` or `X-API-Key: sk_...`:

| Method | Path              | Description                          | Success |
| ------ | ----------------- | ------------------------------------ | ------- |
| `GET`  | `/api/auth/me`    | Current user                         | `200`   |
| `POST` | `/api/links`      | Create a short link                  | `201`   |
| `GET`  | `/api/links`      | List / search / filter / sort links  | `200`   |
| `GET`  | `/api/links/:code`| Fetch metadata for one of your links | `200`   |
| `PATCH`| `/api/links/:code`| Edit destination and/or expiry       | `200`   |
| `DELETE`| `/api/links/:code`| Delete a link and its clicks        | `204`   |
| `GET`  | `/api/links/:code/analytics` | Click analytics for a link (`?days=30`) | `200` |
| `GET`  | `/api/links/:code/preview` | Open Graph preview of the destination | `200` |
| `GET`  | `/api/keys`       | List your API keys (JWT session only)| `200`   |
| `POST` | `/api/keys`       | Create an API key (secret shown once)| `201`   |
| `DELETE` | `/api/keys/:id` | Revoke an API key (JWT session only) | `204`   |

Interactive OpenAPI documentation (generated from the same Zod schemas the API
validates with) is served at `/docs`.

The links list supports `?page` and `?pageSize`, free-text `?q=` (matches alias
or destination), `?status=all|active|expiring|expired` (`expiring` means within
7 days) and `?sort=newest|oldest|clicks|expires` (null expiries last), returning
`{ data, page, pageSize, total }`.

Rate limits: `100 requests / minute / IP` globally, `10 / minute / IP` on
`register`, `login` and `refresh`, and `30 / minute` for previews (they make the
server fetch an external page); requests authenticated with an API key are
counted per key instead of per IP. Exceeding a limit returns `429` with
`Retry-After` and the usual error envelope.

### Authentication flow

```bash
# 1. Register (or log in)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"a-strong-password"}'
```

```json
{
  "user": { "id": "clx...", "email": "you@example.com", "createdAt": "..." },
  "accessToken": "eyJ...",
  "refreshToken": "3f9c...",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

```bash
# 2. Create a link
curl -X POST http://localhost:3000/api/links \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"destinationUrl":"example.com/some/long/path?campaign=summer","customAlias":"summer-sale"}'
```

```json
{
  "id": "clx...",
  "shortCode": "summer-sale",
  "shortUrl": "http://localhost:3000/summer-sale",
  "destinationUrl": "https://example.com/some/long/path?campaign=summer",
  "createdAt": "2026-09-13T15:42:11.000Z",
  "expiresAt": null
}
```

```bash
# 3. When the access token expires (15 min), rotate the refresh token
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"3f9c..."}'
```

Errors use a consistent envelope:

```json
{ "error": { "code": "CONFLICT", "message": "That alias is already taken", "details": { "alias": "summer-sale" } } }
```

## How it works

### Authentication

- **Short-lived JWTs + rotating refresh tokens.** Access tokens expire after
  15 minutes (HS256, verified issuer/audience). Refresh tokens are opaque random
  strings; only their SHA-256 hash is stored, so a database leak exposes no
  usable tokens.
- **Rotation with reuse rejection.** Exchanging a refresh token atomically
  revokes it and issues a replacement (`RefreshToken.replacedByTokenHash`).
  A revoked or unknown token is rejected with `401`, so a stolen token can be
  used at most once.
- **Passwords use Argon2id** (`@node-rs/argon2`) with OWASP-recommended cost
  parameters (19 MiB, t=2, p=1). Login always performs a hash verification —
  even for unknown emails — so response timing does not reveal which accounts
  exist. Emails are normalized to lowercase to avoid duplicate accounts.
- **Authorization is server-side.** All `/api/links` routes require a valid
  bearer token or API key, queries are scoped by `userId`, and reading another
  user's link returns `403 Forbidden`. The redirect endpoint stays public.

### Shortening

- **Base62 short codes.** Randomly generated with rejection sampling so every
  character is uniformly distributed (no modulo bias).
- **Collisions are handled at the database.** `Link.shortCode` is `UNIQUE`; on a
  `P2002` violation the service retries generation up to
  `SHORT_CODE_MAX_ATTEMPTS`, then fails with `409 Conflict`.
- **Custom aliases** are validated (charset/length), checked against a reserved
  set (e.g. `api`, `health`), and rely on the unique constraint to return
  `409 Conflict` if already taken. The short code is permanent once created;
  `PATCH` changes the destination and/or expiry only.
- **Expiration** is checked on read. Expired links return `410 Gone` rather than
  `404` to signal the resource intentionally no longer exists.
- **URL normalization** prepends `https://` when no scheme is given and rejects
  non-http(s) schemes.
- **Validation lives at the edge.** Zod schemas validate request bodies/params
  and serialize responses; the service layer only sees trusted input.

### Redirect path and caching

- **Cache-aside for redirects.** `GET /:code` reads Redis first
  (`redirect:<code>`); on a miss it falls back to PostgreSQL and populates the
  cache. Responses carry an `X-Cache: HIT | MISS | BYPASS` header, which makes
  the behaviour easy to observe (and to benchmark).
- **TTL never outlives the link.** The cached entry's TTL is
  `min(REDIRECT_CACHE_TTL_SECONDS, time until expiry)`, so an expiring link can
  never be served past its `expires_at`. Expired hits are evicted and return
  `410 Gone`.
- **Edits and deletes invalidate explicitly.** Updating a link evicts both
  `redirect:<code>` and `preview:<code>`; deleting evicts them too, so a changed
  link redirects to its new destination immediately and a removed link 404s at
  once instead of waiting for a TTL.
- **The cache is best-effort.** Redis errors are caught and degrade to a
  database read — the redirect still succeeds. Clients use
  `maxRetriesPerRequest: 1` and a short connect timeout so an unreachable Redis
  fails fast instead of stalling requests.
- **Only successful lookups are cached** (no negative caching), so a newly
  created alias is never hidden by a stale 404.

### Click events and the worker

- **Analytics never blocks the redirect.** `GET /:code` only resolves the
  destination (cache-aside) and `XADD`s a click event to a Redis stream; storing
  the click happens in a separate worker. See [Performance](#performance) for
  the measured difference.
- **Redis Streams with a consumer group.** The worker reads with `XREADGROUP`,
  acknowledges only after the click is stored, and reclaims abandoned entries
  (`XPENDING` + `XCLAIM`) from consumers that died. Delivery is at-least-once.
- **Failures are retried and capped.** Attempts are counted in a Redis hash; an
  event that keeps failing is moved to a dead-letter stream
  (`clicks:events:dead`) instead of looping forever.
- **Processing is effectively-once.** Every click stores the stream entry id in
  a `UNIQUE` `eventId` column, so a redelivery after a crash is a no-op rather
  than a duplicate click.
- **The queue is best-effort, never a single point of failure.** If publishing
  fails, the API falls back to inserting the click synchronously so analytics
  aren't silently lost.
- **The worker is its own process** (`npm run dev:worker` / `npm run
  start:worker`) built from the same codebase — a modular monolith that deploys
  as two containers. It can safely run multiple replicas: the consumer group
  shards events between them.

### Analytics

- **No IP addresses are stored.** The raw IP is used transiently to resolve a
  country and then discarded. Resolution order: trusted CDN/proxy headers
  (`cf-ipcountry`, `x-vercel-ip-country`, …) → offline GeoIP database
  (`geoip-lite`) for public IPs → optional `GEOIP_FALLBACK_COUNTRY` for
  private/loopback IPs (local demos), otherwise `Unknown`.
- **Device, browser and bots** are derived from the user agent with
  `ua-parser-js`; mobile browser names are normalized (`Mobile Chrome` → `Chrome`)
  so device and browser remain independent dimensions.
- **Referrers are collapsed to sources** at query time (`www.google.com` and
  `google.com/search` both become `google.com`; absent referrers are `direct`).
- **Aggregates use indexed SQL.** `Click` is indexed by `(linkId, timestamp)` and
  per-dimension `(linkId, country|device|browser)`. The daily series is a
  `date_trunc` group-by that is expanded into a dense, gap-filled range for
  charts.
- **Day boundaries are UTC**, so a click's bucket never depends on server timezone.

### Link previews

- **Server-side Open Graph fetch.** `GET /api/links/:code/preview` fetches the
  destination, parses `og:*` / `twitter:*` / `<title>` / `<meta name="description">`
  and returns a normalized card, cached in Redis for 24 hours and invalidated
  when the link is edited or deleted.
- **SSRF-hardened.** http(s) only; the hostname is resolved via DNS and every
  returned address is checked against private/loopback ranges; `.local` and
  `.internal` hosts are blocked; redirects are followed manually (max 3) with
  the same checks on every hop; 5 second timeout and a 512 KB body cap. A
  destination pointing at `127.0.0.1` returns an empty preview without any
  request being made.
- **No image proxying.** Image URLs are returned as-is and the browser loads
  them with `referrerPolicy="no-referrer"`.

### Frontend

- **Access tokens stay in memory.** Only the refresh token is persisted
  (`localStorage`); it is exchanged once on page load to restore the session, so
  a reload logs you back in without keeping a long-lived access token around.
- **One refresh, then retry.** The API client catches a `401`, performs a
  single-flight token refresh (concurrent 401s share the same refresh), and
  retries the original request once before surfacing the error.
- **The dev server proxies `/api`** to the API, so the browser makes
  same-origin requests and no CORS setup is needed in development.
- **Recharts is code-split.** The analytics view is lazy-loaded so the chart
  code loads on demand.
- **Dashboard search, filters and sorting are server-side.** Search is debounced
  and the previous page stays visible while the next one loads
  (`keepPreviousData`). QR codes are rendered client-side (SVG canvas) and
  exported as PNG from the same dialog.
- **Server state lives in TanStack Query**, which handles caching, retries and
  invalidation (creating, editing or deleting a link refetches the list
  automatically).

### Production hardening

- **Rate limiting is Redis-backed** (`@fastify/rate-limit`) so limits are shared
  across API replicas. Keys are the caller's IP, or a SHA-256 prefix of the API
  key when one is presented — raw credentials never appear in Redis. If the
  store is unreachable, requests fail open (`skipOnError`) and health/docs
  endpoints are exempt.
- **API keys** (`sk_` + 24 random bytes) are hashed with SHA-256 and only the
  hash is stored; the plaintext is returned exactly once. Revocation is a soft
  delete (`revokedAt`), `lastUsedAt` is updated at most every 5 minutes to avoid
  a write per request, and keys cannot manage other keys (JWT session required).
- **API docs are generated, not hand-written.** `@fastify/swagger` transforms
  the same Zod route schemas used for validation into an OpenAPI document, so
  the docs cannot drift from the implementation.
- **Logging is structured** (pino JSON) for both processes, with `authorization`,
  `x-api-key`, cookies, passwords and tokens redacted. Dev uses `pino-pretty`;
  production emits JSON for log aggregation.
- **Docker.** Multi-stage images: the API image carries only production
  dependencies plus the tsup bundle (the worker reuses it with a different
  command), and the web image is built by Vite and served by nginx, which also
  proxies `/api`, `/health` and `/docs`. Compose wires migrations, healthchecks
  and startup ordering; the app services live behind the `full` profile so
  `npm run infra:up` still starts only Postgres and Redis for local dev.

## Performance

Measured locally with `npm run benchmark:redirect` (300 iterations per phase,
Node 24, PostgreSQL and Redis in Docker on the same machine):

| Phase | avg (ms) | p50 (ms) | p95 (ms) |
| ----- | -------- | -------- | -------- |
| Postgres lookup only | 0.74 | 0.73 | 0.87 |
| Cache hit (Redis only) | 0.30 | 0.29 | 0.37 |
| HTTP redirect · cache on · synchronous analytics | 2.12 | 1.98 | 2.42 |
| HTTP redirect · cache on · events | 0.71 | 0.68 | 0.81 |
| HTTP redirect · cache off · events | 1.16 | 1.12 | 1.43 |

- The cache makes destination resolution **~2.5× faster** than Postgres.
- Decoupling analytics cut end-to-end redirect latency from **2.12 ms to
  0.71 ms (3.0×)** — a bigger win than the cache itself, because a synchronous
  insert dominated the original path.

## Data model

```text
users              links                      refresh_tokens               clicks
──────────────     ────────────────────────   ──────────────────────────   ──────────────────────────
id                 id                         id                           id
email (unique)     user_id  → users.id        user_id  → users.id          link_id  → links.id
password_hash      short_code (unique)        token_hash (unique, sha256)  timestamp
created_at         destination_url            expires_at                   country
                   created_at                 revoked_at                   device
                   expires_at                 replaced_by_token_hash       browser
                                              created_at                   referrer
                                                                           event_id (unique)

api_keys
──────────────────
id
user_id  → users.id
name
prefix
key_hash (unique, sha256)
created_at
last_used_at
revoked_at
```

Deleting a user cascades to their links, refresh tokens and API keys; deleting a
link cascades to its clicks. Link previews are cached in Redis only and never
persisted.

## Scripts

| Command                     | Description                                    |
| --------------------------- | ---------------------------------------------- |
| `npm run dev:all`           | Run the API + worker + dashboard together      |
| `npm run dev` / `dev:api`   | Run the API with hot reload                    |
| `npm run dev:worker`        | Run the analytics worker with hot reload       |
| `npm run dev:web`           | Run the dashboard dev server                   |
| `npm run build`             | Build the API, worker and dashboard            |
| `npm start`                 | Run the built API                              |
| `npm run start:worker`      | Run the built analytics worker                 |
| `npm run typecheck`         | Type-check all workspaces                      |
| `npm test` / `test:unit`    | Run all unit tests (API + web)                 |
| `npm run test:integration`  | Run integration tests (requires DB)            |
| `npm run test:e2e`          | Run Playwright end-to-end tests                |
| `npm run benchmark:redirect`| Benchmark redirect latency (Postgres/Redis/events) |
| `npm run infra:up` / `:down`| Start/stop Postgres + Redis                    |
| `npm run db:migrate`        | Create/apply a dev migration                   |
| `npm run db:cleanup-test-data` | Delete e2e test users and their data        |

## Testing

Unit tests run without any infrastructure (133 API + 18 web tests):

```bash
npm run test:unit
```

Integration tests exercise the real API against PostgreSQL and Redis using
`app.inject()` (no network). They cover the auth lifecycle, API key lifecycle,
rate limiting, link ownership isolation, link create/update/delete with cache
invalidation, list search/filter/sort/pagination, preview SSRF guards, expiry,
redirects, click capture, analytics aggregation, cache-aside behaviour including
concurrent redirects, and the event pipeline (stream publishing, at-least-once
processing, dead-lettering and idempotent redelivery) — 43 tests.

**They reset every table in the database they run against**, so always point
them at a dedicated test database, never at your development data. One-time
setup:

```powershell
docker exec -i url_shortener_postgres psql -U postgres -d url_shortener -c "CREATE DATABASE url_shortener_test;"
cd apps/api
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/url_shortener_test?schema=public"
npx prisma migrate deploy
```

Run them from the repo root with:

```powershell
npm run infra:up
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/url_shortener_test?schema=public"
npm run test:integration
```

End-to-end tests drive the real UI in a browser against the API, worker and
dashboard (registration, link create/edit/delete, dashboard search, QR dialog,
redirect + analytics, API key create/use/revoke). Playwright starts the dev stack
automatically — Postgres and Redis must be running and ports `3000`/`5173` free:

```bash
npm run infra:up
npx playwright install chromium   # once
npm run test:e2e
```

E2E runs create throwaway `e2e-*@example.com` accounts in the configured
database; remove them (and all their links, clicks and keys) afterwards with:

```bash
npm run db:cleanup-test-data
```

CI (`.github/workflows/ci.yml`) runs four jobs on every push and pull request:
typecheck + unit + builds, the integration suite against Postgres and Redis
service containers, Playwright end-to-end tests, and a `docker compose --profile
full build` of every image.
