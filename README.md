# Vodafone Charge

Internal staff app for the **HQ garage EV bays** — five employee chargers, live occupancy, timed reservations, and a facilities admin console.

This repo is the production app: a **Vite + React** web client (Vercel) and a **Hono + Postgres** API (Railway). The garage hardware system authenticates with `GARAGE_API_KEY` and posts LED / occupancy telemetry.

Vodafone, the Speechmark, and Vodafone Red are trademarks of Vodafone Group. This is an internal HQ garage tool, not a consumer product.

---

## Architecture

```
[Staff phones]  →  Vercel (apps/web)
                        │  Bearer JWT
                        ▼
                   Railway (apps/api)  →  Postgres
                        ▲
                        │  X-API-Key
[Garage hardware / sibling system]
```

| App | Stack | Deploy |
| --- | --- | --- |
| `apps/web` | React 19, Vite, Tailwind v4 | Vercel |
| `apps/api` | Hono, Postgres, JWT (jose), bcrypt | Railway |

Hardware LED, ultrasonic occupancy, and bookings are **three separate signals**. Do not collapse them.

---

## Product rules

- White-first UI, Vodafone Red as the accent (`#E60000`).
- Courtyard garage: A1 + A2 north, B3 left, B1 right, B2 entrance.
- Fast bays (A1, A2, 50 kW CCS2) are **30 minutes only**. Slow bays 30 or 60.
- **One active booking per person.** Booking another bay moves the existing one.
- Employees can edit (bay / start / duration) or cancel.
- Admin map is **view-only**. Close / Open lives under the map.
- Forgot password is **not email** — staff request a reset, admin sets a temporary password.
- Only two automatic alerts: **T−5 reservation start** and **T−5 charge end**.
- Times are `HH:MM` strings in `Africa/Cairo`.

---

## Local development

Requires Node 22+ and Docker (for Postgres).

```bash
cp .env.example .env
docker compose up db -d
# in apps/api the server will migrate + seed on boot
npm install
npm run dev:api
npm run dev:web
```

Web: `http://localhost:5173`  
API: `http://localhost:4000/health`

Vite proxies `/v1` to the API when `VITE_API_URL` is empty.

### Seed accounts

Password for every seed user: `Charge#22`

| Username | Role |
| --- | --- |
| `amira.hassan` | Employee |
| `karim.nabil` | Employee |
| `sara.elmasry` | Admin |
| `youssef.adel` | Employee |
| `nour.saleh` | Employee |

Change `SEED_PASSWORD` before first boot if you do not want the demo password.

---

## Deploy

You deploy this — not Grok. Two services.

### 1. Railway — API + Postgres

1. New project → **Postgres** plugin (copy `DATABASE_URL`).
2. New service from this GitHub repo.
3. **Root directory:** `apps/api`
4. Railway will use `apps/api/Dockerfile`.
5. Variables:

| Name | Example |
| --- | --- |
| `DATABASE_URL` | from the Postgres plugin |
| `JWT_SECRET` | 32+ random characters |
| `GARAGE_API_KEY` | the key the hardware team gives you |
| `CORS_ORIGIN` | `https://your-app.vercel.app` |
| `TZ_NAME` | `Africa/Cairo` |
| `HARDWARE_MODE` | `live` once sensors are on the network, else `sim` |
| `SEED_PASSWORD` | first-boot admin/staff password |
| `PORT` | Railway sets this |

6. Confirm `https://<api>.up.railway.app/health` returns `{ "ok": true }`.

The API runs migrations and seeds empty databases on boot. Seeding is skipped once users exist.

### 2. Vercel — web

1. Import this GitHub repo.
2. **Root directory:** `apps/web`
3. Framework: Vite.
4. Environment variable (**Production**, at **build** time):

| Name | Example |
| --- | --- |
| `VITE_API_URL` | `https://<api>.up.railway.app` |

5. Deploy. Then set Railway `CORS_ORIGIN` to the Vercel URL and redeploy the API if needed.

---

## Hardware / API key integration

The garage system (LED pillars + ultrasonic occupancy) is a **sibling service**. It never uses staff JWT. It uses a shared secret:

```
X-API-Key: <GARAGE_API_KEY>
```

### Ingest occupancy / LED

`POST /v1/integrations/telemetry`

```json
{
  "bayId": "a2",
  "occupied": true,
  "led": "red",
  "source": "ultrasonic"
}
```

| Field | Notes |
| --- | --- |
| `bayId` | `a1` `a2` `b1` `b2` `b3` |
| `occupied` | ultrasonic: car present |
| `led` | `green` `amber` `red` `off` — pillar lamp |
| `source` | free text, stored on the telemetry row |

A reserved empty bay stays **amber / booked**. Only `occupied: true` flips the stall to **charging** (red LED + car). `occupied: false` completes the charging reservation and frees or promotes the waitlist.

### Read live garage (hardware / ops)

`GET /v1/integrations/garage`  
Same `X-API-Key` header.

### Simulate until hardware is live

```bash
GARAGE_API_KEY=dev-garage-key-change-me \
  API_URL=http://localhost:4000 \
  node scripts/sim-hardware.mjs
```

Set `HARDWARE_MODE=live` on Railway when the real adapter is posting.

Full contract: [docs/HARDWARE.md](docs/HARDWARE.md)

---

## Staff API (JWT)

Login: `POST /v1/auth/login` `{ "username", "password" }` → `{ token, user }`

Then `Authorization: Bearer <token>` on:

| Method | Path | Who |
| --- | --- | --- |
| GET | `/v1/auth/me` | staff |
| POST | `/v1/auth/forgot` | public (queues an admin reset) |
| GET | `/v1/garage` | staff |
| POST | `/v1/reservations` | staff (one booking per user; moves if needed) |
| DELETE | `/v1/reservations/me` | staff |
| PATCH | `/v1/bays/:id/maintenance` | admin |
| GET/POST/PATCH/DELETE | `/v1/staff` | admin |
| PATCH | `/v1/settings` | admin (`remindOn`, `notifyOn`) |
| GET | `/v1/reports/today` | admin |
| GET | `/v1/admin/resets` | admin |

---

## Repo layout

```
apps/web          Vercel SPA
apps/api          Railway API
  sql/001_init.sql
  src/index.ts    HTTP
  src/garage.ts   booking + telemetry
  src/jobs/alerts.ts
docs/HARDWARE.md
```

---

*Internal HQ garage tool. Not a Vodafone consumer product.*
