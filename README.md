# MiniOpenFX

[![CI](https://github.com/tanmaya-rgb/MiniOpenFX_2/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tanmaya-rgb/MiniOpenFX_2/actions/workflows/ci.yml)

MiniOpenFX is an API-first FX quoting and trading service: a client fetches an indicative price,
locks it into a time-boxed quote, executes a trade against that quote, and can view its balances
and trade history — all backed by a real double-entry ledger. It's a take-home assignment, but
it's built the way a small piece of an institutional trading system would be: **trade execution
is transactional and idempotent** (retrying a request never double-executes it), **balances are a
materialized view over an append-only ledger**, not a number that gets mutated directly, **every
DB-level invariant is enforced by real constraints** (unique indexes, Postgres enums), not just
application code, and **indicative pricing is a real cache-aside layer** over a live external
market data feed, with Redis explicitly demoted to "optimization, never source of truth." The
backend is NestJS + PostgreSQL (Drizzle ORM) + Redis, with a small React/Vite frontend
(`apps/web`) for exercising the whole flow in a browser; live prices come from Binance's public
market-data API.

## Architecture

```mermaid
flowchart LR
    subgraph Client
        WEB["apps/web (React + Vite)"]
        CURL["curl / any HTTP client"]
    end

    subgraph API["apps/api (NestJS)"]
        AUTH["ApiKeyAuthGuard\n(global, Bearer token)"]
        PRICING["PricingService"]
        QUOTING["QuotingService"]
        TRADING["TradingService"]
        LEDGER["LedgerService"]
    end

    PG[(PostgreSQL\nclients / balances /\nledger_entries / quotes / trades)]
    REDIS[(Redis\nprice + symbol + quote cache)]
    BINANCE["Binance public REST API\n(data-api.binance.vision)"]

    WEB -->|Bearer dev API key| AUTH
    CURL -->|Bearer dev API key| AUTH
    AUTH --> PRICING & QUOTING & TRADING

    PRICING <-->|cache-aside| REDIS
    PRICING --> BINANCE
    QUOTING --> PRICING
    QUOTING <-->|cache-aside + invalidate| REDIS
    QUOTING --> PG
    TRADING --> QUOTING
    TRADING --> LEDGER
    LEDGER --> PG
```

**Pricing** (`apps/api/src/pricing/`) — `PricingService.getPrice()` and `.getSymbolBreakdown()`
front a hand-rolled `BinanceClient` (`binance.client.ts`) with a Redis cache-aside layer
(`RedisService`). Binance is treated as the sole authority on which symbols exist and what their
base/quote assets are — there's deliberately no local allow-list; a malformed symbol is rejected
by a loose format regex (`domain/symbol.ts`) before ever hitting the network, but a well-formed,
non-existent symbol is only ever rejected by Binance's own response.

**Quoting** (`apps/api/src/quoting/`) — `POST /v1/quotes` locks a live price into a time-boxed row
(`quoting.service.ts`, pricing math in `quote-pricing.ts`). A quote's `status` in the database is
only ever `ACTIVE` or `EXECUTED`; `EXPIRED` is a display-only value computed at read time
(`quote.mapper.ts`) by comparing `expiresAt` to `now()` — there is no background expiry sweep.

**Trading & Ledger** (`apps/api/src/trading/`, `apps/api/src/ledger/`) — `POST /v1/trades`
executes a locked quote inside one DB transaction: lock the quote row, validate status/expiry,
lock both balance rows involved in one canonically-ordered statement
(`LedgerService.lockBalanceRows`), debit/credit them, insert the trade, and flip the quote to
`EXECUTED`. Every debit/credit also writes an immutable `ledger_entries` row —
`ledger_entries` is the source of truth for money movement, `balances` is a cache over it, updated
in the same transaction. Idempotency is enforced by a DB unique constraint on
`(client_id, idempotency_key)`, checked both before the transaction (fast path) and via Postgres
error code `23505` after it (race backstop).

**Auth & error handling** (`apps/api/src/common/`) — `ApiKeyAuthGuard` is registered globally via
`APP_GUARD`, so every route requires `Authorization: Bearer <key>` by default; a route opts out
with `@Public()` (only `GET /v1/health` does). Every error response, from a validation failure to
an unhandled exception, is normalized by `AllExceptionsFilter` into `{"error": {"code",
"message"}}`.

## Database schema

Five tables (`apps/api/src/db/schema.ts`, Drizzle ORM), migrated via `drizzle-kit`
(`apps/api/src/db/migrations/`). All money columns are `bigint` integer minor units — see
[Amount semantics](#amount-semantics) — never `numeric`/`float`.

```mermaid
erDiagram
    CLIENTS ||--o{ BALANCES : "owns"
    CLIENTS ||--o{ LEDGER_ENTRIES : "owns"
    CLIENTS ||--o{ QUOTES : "owns"
    CLIENTS ||--o{ TRADES : "owns"
    QUOTES ||--o| TRADES : "executed as (0 or 1)"

    CLIENTS {
        uuid id PK
        text name UK "clients_name_unique"
        text api_key_hash
        timestamptz created_at
    }
    BALANCES {
        uuid id PK
        uuid client_id FK
        text currency
        bigint available_minor "default 0"
        timestamptz updated_at
    }
    LEDGER_ENTRIES {
        uuid id PK
        uuid client_id FK
        text currency
        bigint delta_minor "signed: +credit / -debit"
        enum reason "DEPOSIT | TRADE"
        text ref_type "polymorphic discriminator"
        uuid ref_id "trade/deposit id, no FK"
        timestamptz created_at
    }
    QUOTES {
        uuid id PK
        uuid client_id FK
        text symbol
        enum side "BUY | SELL"
        text base_currency
        text quote_currency
        bigint base_amount_minor
        text price "decimal string"
        bigint quote_amount_minor
        enum status "ACTIVE | EXECUTED"
        timestamptz expires_at
        timestamptz created_at
    }
    TRADES {
        uuid id PK
        uuid client_id FK
        uuid quote_id FK,UK "trades_quote_id_unique"
        text symbol
        enum side "BUY | SELL"
        text base_currency
        text quote_currency
        bigint base_amount_minor
        bigint quote_amount_minor
        text price "decimal string"
        enum status "FILLED | REJECTED"
        text idempotency_key
        timestamptz created_at
    }
```

### `clients`

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | not null | `gen_random_uuid()` | PK |
| `name` | `text` | not null | — | **`UNIQUE`** (`clients_name_unique`) |
| `api_key_hash` | `text` | not null | — | bcrypt hash of the client's Bearer API key |
| `created_at` | `timestamptz` | not null | `now()` | |

`UNIQUE(name)` isn't a business rule about client names being human-readable-unique so much as
the mechanism that makes `db:seed` idempotent: it seeds one fixed-name demo client via
`INSERT ... ON CONFLICT (name) DO NOTHING`, so re-running the seed script never creates a second
client or errors.

### `balances`

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | not null | `gen_random_uuid()` | PK |
| `client_id` | `uuid` | not null | — | FK → `clients.id` |
| `currency` | `text` | not null | — | |
| `available_minor` | `bigint` | not null | `0` | integer minor units |
| `updated_at` | `timestamptz` | not null | `now()` | |

`UNIQUE(client_id, currency)` (`balances_client_currency_unique`) guarantees at most one balance
row per client per currency. This is the invariant `LedgerService.lockBalanceRows` leans on: it
does a batched `INSERT ... ON CONFLICT (client_id, currency) DO NOTHING` to guarantee a lockable
zero-balance row exists for every currency a trade touches, then locks all of them in one
`SELECT ... FOR UPDATE ... ORDER BY currency` statement. **`balances` is a materialized cache over
`ledger_entries`, never written to directly outside the ledger service** — every debit/credit
updates a `balances` row and inserts a `ledger_entries` row in the same transaction.

### `ledger_entries`

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | not null | `gen_random_uuid()` | PK |
| `client_id` | `uuid` | not null | — | FK → `clients.id` |
| `currency` | `text` | not null | — | |
| `delta_minor` | `bigint` | not null | — | signed minor units: positive = credit, negative = debit |
| `reason` | `ledger_reason` (Postgres `ENUM`: `DEPOSIT`, `TRADE`) | not null | — | |
| `ref_type` | `text` | not null | — | `'TRADE'` or `'DEPOSIT'` — polymorphic discriminator paired with `ref_id` |
| `ref_id` | `uuid` | not null | — | id of the trade or deposit that caused this entry — **not** a DB foreign key, since it's polymorphic across two source tables (a deposit has no row of its own to point at) |
| `created_at` | `timestamptz` | not null | `now()` | |

No unique constraints here by design — it's an append-only log, and a client can (and does)
accumulate many entries for the same currency over time. **This table is the source of truth for
all money movement**; every trade execution writes exactly two rows (one debit leg, one credit
leg) inside the same transaction that updates `balances` and inserts the `trades` row. There's no
index beyond the primary key today — there's no "ledger history per client" read endpoint yet, so
a `(client_id, created_at)` index wasn't added speculatively; it would be the first thing to add
if such an endpoint landed.

### `quotes`

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | not null | `gen_random_uuid()` | PK |
| `client_id` | `uuid` | not null | — | FK → `clients.id` |
| `symbol` | `text` | not null | — | e.g. `BTCUSDT`; loosely shape-checked at the DTO layer, validated for real by Binance |
| `side` | `trade_side` (Postgres `ENUM`: `BUY`, `SELL`) | not null | — | |
| `base_currency` | `text` | not null | — | from Binance `/exchangeInfo`, never guessed from a suffix list |
| `quote_currency` | `text` | not null | — | |
| `base_amount_minor` | `bigint` | not null | — | |
| `price` | `text` | not null | — | decimal string, not minor units — Binance prices need more precision than a fixed-8dp bigint gives |
| `quote_amount_minor` | `bigint` | not null | — | `baseAmount × price`, house-favored rounding |
| `status` | `quote_status` (Postgres `ENUM`: `ACTIVE`, `EXECUTED`) | not null | `'ACTIVE'` | see note below |
| `expires_at` | `timestamptz` | not null | — | |
| `created_at` | `timestamptz` | not null | `now()` | |

No unique constraints — many quotes per client is the expected case, including expired/unused
ones. No index beyond the primary key; quotes are only ever looked up by `id`.

**On `status` and `EXPIRED`:** the `quote_status` enum genuinely only holds `ACTIVE` and
`EXECUTED` today. It briefly included `EXPIRED` (migration `0001_lazy_maximus.sql`) before a
Phase 4 hardening pass deliberately removed it again (migration `0003_faithful_bloodscream.sql`,
confirmed by reading both migration files directly, not just PLAN.md's summary of that phase) —
`EXPIRED` was never actually written by any code path, so a DB value with a real write path that
never gets written invites a future query like `WHERE status = 'EXPIRED'` to silently return
nothing forever. What the API returns as `status` is `QuoteDisplayStatus`
(`apps/api/src/quoting/quote.mapper.ts`), a TypeScript-only union (`QuoteStatus | 'EXPIRED'`)
computed at read time in `toQuoteResponse()`: if the stored status is still `ACTIVE` but
`now() >= expiresAt`, the response reports `'EXPIRED'` without ever touching the row. This is a
deliberate split, not an oversight — there is no background expiry sweep, and trade execution
independently re-checks `now() >= expiresAt` inside its own transaction rather than trusting a
possibly-stale persisted status.

### `trades`

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | not null | `gen_random_uuid()` | PK |
| `client_id` | `uuid` | not null | — | FK → `clients.id` |
| `quote_id` | `uuid` | not null | — | FK → `quotes.id`; **`UNIQUE`** (`trades_quote_id_unique`) |
| `symbol` | `text` | not null | — | |
| `side` | `trade_side` (Postgres `ENUM`: `BUY`, `SELL`) | not null | — | |
| `base_currency` | `text` | not null | — | |
| `quote_currency` | `text` | not null | — | |
| `base_amount_minor` | `bigint` | not null | — | |
| `quote_amount_minor` | `bigint` | not null | — | |
| `price` | `text` | not null | — | decimal string, snapshotted from the quote |
| `status` | `trade_status` (Postgres `ENUM`: `FILLED`, `REJECTED`) | not null | — | in practice always `FILLED` — a rejected attempt throws instead of inserting a row |
| `idempotency_key` | `text` | not null | — | client-supplied via the `Idempotency-Key` header, trimmed once and reused everywhere |
| `created_at` | `timestamptz` | not null | `now()` | |

- **`UNIQUE(quote_id)`** (`trades_quote_id_unique`) — enforces "a quote executes at most once" at
  the DB level, not just via an application check-then-insert.
- **`UNIQUE(client_id, idempotency_key)`** (`trades_client_idempotency_key_unique`) — makes a
  retried `POST /v1/trades` call safe to replay: the service checks for an existing row before
  opening a transaction (fast path), and also catches Postgres `23505` on this constraint after a
  failed insert (race backstop) rather than erroring.
- **Known gap, found while writing this section:** `GET /v1/trades`' keyset pagination
  (`TradesService.getTradeHistory`) queries `WHERE client_id = ? AND (created_at, id) < (?, ?)
  ORDER BY created_at DESC, id DESC`, but no migration ever added a composite index matching that
  shape — `trades` only has its primary key (`id`) plus the two unique indexes above to lean on.
  At this project's data volume it doesn't matter, but a real deployment expecting real trade
  volume would want `CREATE INDEX ON trades (client_id, created_at DESC, id DESC)` before relying
  on this query pattern staying fast.

## Setup & run

Requires Node.js 20+, Docker, and Docker Compose.

```bash
# 1. Clone and install (npm workspaces — installs both apps/api and apps/web)
git clone https://github.com/tanmaya-rgb/MiniOpenFX_2.git
cd MiniOpenFX_2
npm install

# 2. Start Postgres + Redis
docker compose up -d

# 3. Configure the backend
cp apps/api/.env.example apps/api/.env
# defaults in .env.example work as-is against the docker-compose services

# 4. Migrate + seed (creates one demo client, funded with 10,000 USDT + 1 BTC,
#    and prints the API key that was just seeded — or confirms it already exists)
npm run db:migrate
npm run db:seed

# 5. Run the backend (http://localhost:3000, routes under /v1)
npm run start:dev
```

In a second terminal, to run the frontend:

```bash
# Configure the frontend — VITE_API_KEY must match SEEDED_API_KEY from apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local

npm run dev:web
# → http://localhost:5173
```

Sanity check:

```bash
curl http://localhost:3000/v1/health
# {"status":"ok","postgres":true,"redis":true}
```

## API reference

Every route except `GET /v1/health` requires `Authorization: Bearer <SEEDED_API_KEY>`. All
examples below use the dev default from `apps/api/.env.example`
(`SEEDED_API_KEY=dev-local-api-key`) and were run against a live local instance.

```bash
export API=http://localhost:3000
export KEY=dev-local-api-key
```

**Health** (public)

```bash
curl $API/v1/health
# {"status":"ok","postgres":true,"redis":true}
```

**Indicative price**

```bash
curl -H "Authorization: Bearer $KEY" "$API/v1/prices?symbol=BTCUSDT"
# {"symbol":"BTCUSDT","bid":"75989.11000000","ask":"75989.12000000","timestamp":1789558082836,"source":"binance"}
```

**Create a quote** — `side: BUY` prices at the ask (what you'd pay to acquire `baseCurrency`);
`side: SELL` prices at the bid.

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","side":"BUY","baseAmount":"0.001"}' \
  $API/v1/quotes
# {"id":"90b2e4c0-6f24-471f-af8e-bd582c37cd3c","symbol":"BTCUSDT","side":"BUY",
#  "baseCurrency":"BTC","quoteCurrency":"USDT","baseAmount":"0.001",
#  "price":"75989.12000000","quoteAmount":"75.98912","status":"ACTIVE",
#  "expiresAt":"2026-09-16T11:29:08.414Z","createdAt":"2026-09-16T11:28:08.414Z"}
```

**Fetch a quote** — `status` becomes `"EXPIRED"` once `expiresAt` passes, computed at read time
(the underlying DB row never changes to reflect this).

```bash
curl -H "Authorization: Bearer $KEY" $API/v1/quotes/90b2e4c0-6f24-471f-af8e-bd582c37cd3c
# {"id":"90b2e4c0-6f24-471f-af8e-bd582c37cd3c", ... "status":"ACTIVE", ...}
```

**Execute a trade** — requires a client-generated `Idempotency-Key`; replaying the same key
against the same quote returns `200` with the original trade instead of executing again.

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"quoteId":"90b2e4c0-6f24-471f-af8e-bd582c37cd3c"}' \
  $API/v1/trades
# HTTP 201
# {"id":"4cbedc0a-b59d-4ea5-ac1c-6953bd77739b","quoteId":"90b2e4c0-...",
#  "symbol":"BTCUSDT","side":"BUY","baseCurrency":"BTC","quoteCurrency":"USDT",
#  "baseAmount":"0.001","quoteAmount":"75.98912","price":"75989.12000000",
#  "status":"FILLED","createdAt":"2026-09-16T11:28:14.442Z"}
```

**Balances**

```bash
curl -H "Authorization: Bearer $KEY" $API/v1/balances
# [{"currency":"BTC","available":"1.5848"},{"currency":"ETH","available":"100"},
#  {"currency":"EUR","available":"501.02"},{"currency":"USDT","available":"3803.269528"}]
```

**Trade history** — cursor-paginated (`nextCursor` is opaque; pass it back as `?cursor=`).

```bash
curl -H "Authorization: Bearer $KEY" "$API/v1/trades?limit=2"
# {"trades":[{...},{...}],"nextCursor":"eyJjcmVhdGVkQXQiOi..."}
```

**Deposit** (demo-only funding — see trade-offs below)

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"currency":"USDT","amount":"100"}' \
  $API/v1/deposits
# [{"currency":"BTC","available":"1.5848"}, ... {"currency":"USDT","available":"3803.269528"}]
```

**Error shape** — every non-2xx response looks like this, regardless of route:

```bash
curl $API/v1/balances
# HTTP 401
# {"error":{"code":"UNAUTHORIZED","message":"Missing or malformed Authorization header"}}
```

| Status | Meaning                                                              |
| ------ | --------------------------------------------------------------------- |
| 400    | invalid input (bad symbol, precision, amount, ttl, malformed cursor) |
| 401    | missing/invalid API key                                              |
| 404    | not found, or belongs to another client (never leaks existence)      |
| 409    | conflict (quote already executed, idempotency key reused on a different quote) |
| 410    | quote has expired                                                    |
| 422    | insufficient balance                                                 |
| 502/504| Binance unavailable / timed out                                      |

## Amount semantics

All amounts are stored as **integer minor units** (`bigint`), fixed at **8 decimal places for
every currency** (`apps/api/src/domain/money.ts`) — a deliberate simplification; a real system
varies decimals per currency (USD = 2, BTC = 8, etc.).

- **`BUY`**: the client pays `quoteCurrency` and receives `baseCurrency`, priced at the **ask**.
- **`SELL`**: the client gives up `baseCurrency` and receives `quoteCurrency`, priced at the
  **bid**.

A quote's `quoteAmount` is computed as `baseAmount × price`, which usually has more precision
than 8 decimal places — rounding is **house-favored**: amounts the client *owes* round **up**,
amounts the client *receives* round **down**, so fractional minor units never leak either way
(`roundToMinorUnits` in `money.ts`).

**Worked example** — BUY 0.00033333 BTC at a live ask of 75989.12:

```
raw = 0.00033333 × 75989.12         = 25.3294533696
BUY  quoteAmount (round UP, 8dp)    = 25.32945337   ← client owes this, rounded in the house's favor
SELL quoteAmount (round DOWN, 8dp)  = 25.32945336   ← client would receive this instead, for a SELL of the same size
```

## Trade-offs (deliberate simplifications)

- **Redis is an optimization layer, never the source of truth.** Every `RedisService` method
  (`getJson`/`setJson`/`del`) fails soft — a cache outage degrades to a cache miss, never breaks
  a request. Every cached value (price, symbol breakdown, quote) is reconstructible from
  Postgres/Binance; nothing is ever written to Redis first.
- **Single seeded client / static Bearer API key**, on both the backend (`db/seed.ts` seeds
  exactly one client) and the frontend (`apps/web/.env.local`'s `VITE_API_KEY` is a static dev
  value, no login flow). A real multi-tenant system needs per-client key issuance/rotation and a
  real session/auth flow; out of scope for this assignment's single-tenant demo.
- **`ApiKeyAuthGuard` scans every client row and runs `bcrypt.compare` per request**
  (`common/guards/api-key-auth.guard.ts`) rather than looking a key up by an indexed hash. With
  exactly one seeded client this is O(1) in practice; it would need to change (e.g. a keyed lookup
  table) before this pattern could support real multi-tenant traffic.
- **No background quote-expiry job.** A quote's DB `status` only ever moves `ACTIVE` →
  `EXECUTED`; `EXPIRED` is computed at read time (`quote.mapper.ts`) and at trade-execution time
  (`trading.service.ts` checks `now() >= expiresAt` inside the transaction). Simpler and
  sufficient for correctness, at the cost of never having a queryable "all expired quotes" view
  without a real sweep.
- **`POST /v1/deposits` is a demo-only funding endpoint**, not a real payment rail — there's no
  bank transfer, card, or on-chain deposit integration in scope. It reuses the same
  `LedgerService.credit` path as the seed script and accepts any syntactically valid currency
  code (2–10 alphanumeric characters) with no real-currency allow-list, since there's no external
  authority to validate a *deposit* currency against the way Binance validates a *trading* symbol.
- **All currencies share one fixed precision (8 decimal places)**, including fiat like EUR/USD
  that would realistically use 2. Simpler ledger math at the cost of not matching real-world
  currency precision conventions.
- **Quote pricing has no spread/fee layered on top of Binance's raw bid/ask** — the "house edge"
  in this system is entirely the bid/ask spread plus favorable rounding, not an explicit fee.
- **Quote TTL is a fixed server-side default (15 seconds, `DEFAULT_QUOTE_TTL_SECONDS` in
  `apps/api/src/quoting/quoting.service.ts`), not client-configurable.** `POST /v1/quotes` used to
  accept a `ttlSeconds` field; it was deliberately removed. A client picking its own quote lifetime
  is a client-trust surface a quoting system shouldn't need — how long a price lock stays valid is
  arguably a platform policy decision, not a caller's choice, and removing the field also
  simplifies the request DTO and this demo's error-surface for no real loss of functionality.
- **The manual migration step on Render's free tier (see Deployment below) is itself a deliberate
  trade-off, not an oversight.** Automating it would need Render's Pre-Deploy Command, which is a
  paid-only feature; running `npm run db:migrate` by hand via the Shell tab after a
  schema-changing deploy was the correct trade for a free-tier demo deployment rather than paying
  for automation this project doesn't otherwise need.

## Testing & CI

```bash
npm run lint          # oxlint, both workspaces
npm run typecheck      # tsc --noEmit, both workspaces
npm test                # unit tests (apps/api, vitest) — 58 tests
npm run test:e2e        # e2e tests (apps/api, vitest + supertest, real Postgres/Redis) — 59 tests
npm run build            # production build, both workspaces
```

E2e tests run against the real local Postgres/Redis containers (no DB mocking) and cover explicit
failure paths, not just the happy path: expired quotes, insufficient balance, duplicate
idempotency keys, mismatched idempotency-key/quote pairs, bad symbols, and missing/invalid auth.

CI (`.github/workflows/ci.yml`) runs the same sequence — lint → typecheck → migrate → seed → unit
tests → e2e tests → build, across both workspaces — against real Postgres 16 and Redis 7 service
containers on every push/PR to `main`. See the badge at the top of this README for current status.

## Deployment

**Hosting:** [Render](https://render.com), free tier for both the Postgres instance and the Key
Value (Redis) instance.

| Component | URL |
| --- | --- |
| `apps/api` | **TODO** — not yet deployed |
| `apps/web` | **TODO** — not yet deployed |

Caveats of the free tier, stated plainly rather than left for someone to discover the hard way:

- **The free Postgres instance expires ~30 days after creation.** Render deletes it automatically;
  a fresh instance (and a re-run of migrate + seed) is needed after that window, this isn't a
  one-time setup that lasts indefinitely.
- **Free-tier compute has cold starts and slower builds than a paid plan.** The API service spins
  down when idle and takes several seconds to respond to the first request after a period of
  inactivity — expected behavior, not a bug, if the live demo feels slow on first hit.
- **Migrations are applied manually, not automatically on deploy.** Render's Pre-Deploy Command
  (the natural place to run `npm run db:migrate` before each deploy) is a paid-only feature. On
  this free-tier setup, migrations are run by hand from Render's **Shell** tab on the `apps/api`
  service:
  ```bash
  npm run db:migrate
  ```
  **This must be re-run manually after any future deploy that changes the schema** — a deploy
  alone will not apply new migrations, and forgetting this step will surface as the app hitting
  columns/tables that don't exist yet.
- **Found while writing this section:** `apps/api/src/main.ts` currently hardcodes CORS to a
  single origin, `http://localhost:5173` (`app.enableCors({ origin: 'http://localhost:5173', ... })`).
  That's correct for local dev but will reject the deployed `apps/web` origin as-is — this needs
  to become an env-driven origin (or an allow-list of both) before `apps/web` can actually reach a
  deployed `apps/api` from the browser. Flagging this now since it isn't done yet, not fixing it
  silently — it's a deployment-readiness gap, not a README inaccuracy.
