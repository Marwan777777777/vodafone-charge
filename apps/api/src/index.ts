import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { env } from "./env.js";
import { migrate } from "./migrate.js";
import { seedIfEmpty } from "./seed.js";
import { query } from "./db.js";
import {
  apiKeyOk,
  bearer,
  hashPassword,
  readToken,
  signToken,
  type AuthedUser,
  verifyPassword,
} from "./auth.js";
import {
  applyTelemetry,
  book,
  cancelMine,
  listSlots,
  logEvent,
  setMaintenance,
} from "./garage.js";
import { startAlertLoop } from "./jobs/alerts.js";

process.env.TZ = env.timezone;

const app = new Hono();

app.use("*", logger());
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: env.corsOrigin === "*" ? "*" : env.corsOrigin.split(",").map((s) => s.trim()),
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || "Server error" }, 500);
});

app.get("/health", (c) =>
  c.json({ ok: true, service: "vodafone-charge-api", hardwareMode: env.hardwareMode }),
);

async function requireUser(c: { req: { header: (n: string) => string | undefined } }) {
  const token = bearer(c.req.header("authorization"));
  if (!token) return null;
  return readToken(token);
}

function deny() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

function httpError(err: unknown) {
  const e = err as Error & { status?: 400 | 404 | 409 };
  return { message: e.message || "Request failed", status: e.status ?? (400 as const) };
}

const loginHits = new Map<string, { n: number; t: number }>();

function loginLimited(ip: string) {
  const now = Date.now();
  const row = loginHits.get(ip);
  if (!row || now - row.t > 15 * 60_000) {
    loginHits.set(ip, { n: 1, t: now });
    return false;
  }
  row.n += 1;
  return row.n > 20;
}

app.post("/v1/auth/login", async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (loginLimited(ip)) return c.json({ error: "Too many attempts. Try again later." }, 429);
  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({ username: z.string().min(1), password: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid credentials payload" }, 400);
  const rows = await query<AuthedUser & { password_hash: string }>(
    "select id, name, username, role, department, phone, password_hash from users where username=$1",
    [parsed.data.username.trim().toLowerCase()],
  );
  const user = rows[0];
  if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
    return c.json({ error: "Invalid username or password" }, 401);
  }
  const token = await signToken(user);
  const { password_hash: _, ...safe } = user;
  return c.json({ token, user: safe });
});

app.get("/v1/auth/me", async (c) => {
  const user = await requireUser(c);
  if (!user) return deny();
  return c.json({ user });
});

app.post("/v1/auth/forgot", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = String((body as { username?: string }).username ?? "").trim().toLowerCase();
  if (!username) return c.json({ error: "Username required" }, 400);
  await query("insert into password_resets (username) values ($1)", [username]);
  await logEvent("system", `Password reset requested for ${username}`);
  return c.json({ ok: true });
});

app.get("/v1/garage", async (c) => {
  const user = await requireUser(c);
  if (!user) return deny();
  const [slots, settings, logs] = await Promise.all([
    listSlots(),
    query<{ key: string; value: string }>("select key, value from settings"),
    query<{ kind: string; text: string; created_at: string }>(
      "select kind, text, to_char(created_at, 'HH24:MI') as created_at from event_log order by id desc limit 20",
    ),
  ]);
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return c.json({
    slots,
    settings: { remindOn: map.remind_on !== "false", notifyOn: map.notify_on !== "false" },
    log: logs.map((l) => ({ t: l.created_at, kind: l.kind, text: l.text })),
    me: user,
  });
});

app.post("/v1/reservations", async (c) => {
  const user = await requireUser(c);
  if (!user) return deny();
  const parsed = z
    .object({ bayId: z.string(), start: z.string(), durationMin: z.number().int().positive() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid reservation" }, 400);
  try {
    const result = await book(user, parsed.data.bayId, parsed.data.start, parsed.data.durationMin);
    return c.json(result);
  } catch (err) {
    const e = httpError(err);
    return c.json({ error: e.message }, e.status);
  }
});

app.delete("/v1/reservations/me", async (c) => {
  const user = await requireUser(c);
  if (!user) return deny();
  await cancelMine(user);
  return c.json({ ok: true });
});

app.patch("/v1/bays/:id/maintenance", async (c) => {
  const user = await requireUser(c);
  if (!user) return deny();
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);
  const closed = Boolean((await c.req.json().catch(() => ({})) as { closed?: boolean }).closed);
  try {
    await setMaintenance(c.req.param("id"), closed, user.name);
    return c.json({ ok: true });
  } catch (err) {
    const e = httpError(err);
    return c.json({ error: e.message }, e.status);
  }
});

app.get("/v1/staff", async (c) => {
  const user = await requireUser(c);
  if (!user) return deny();
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);
  const rows = await query("select id, name, username, phone, department, role from users order by name");
  return c.json({ staff: rows });
});

app.post("/v1/staff", async (c) => {
  const user = await requireUser(c);
  if (!user) return deny();
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);
  const parsed = z
    .object({
      name: z.string().min(1),
      username: z.string().min(1),
      phone: z.string().default(""),
      department: z.string().default(""),
      role: z.enum(["admin", "employee"]).default("employee"),
      password: z.string().min(8),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid staff payload" }, 400);
  const id = `e${Date.now()}`;
  const hash = await hashPassword(parsed.data.password);
  try {
    await query(
      `insert into users (id, name, username, password_hash, phone, department, role)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, parsed.data.name, parsed.data.username.trim().toLowerCase(), hash, parsed.data.phone, parsed.data.department, parsed.data.role],
    );
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "23505") return c.json({ error: "Username already exists" }, 409);
    throw err;
  }
  await logEvent("system", `${user.name} added ${parsed.data.name}`);
  return c.json({ id });
});

app.patch("/v1/staff/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return deny();
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);
  const body = z
    .object({
      name: z.string().min(1),
      username: z.string().min(1),
      phone: z.string().default(""),
      department: z.string().default(""),
      role: z.enum(["admin", "employee"]),
      password: z.string().min(8).optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Invalid staff payload" }, 400);
  await query("update users set name=$2, username=$3, phone=$4, department=$5, role=$6 where id=$1", [
    c.req.param("id"),
    body.data.name,
    body.data.username.trim().toLowerCase(),
    body.data.phone,
    body.data.department,
    body.data.role,
  ]);
  if (body.data.password) {
    await query("update users set password_hash=$2 where id=$1", [c.req.param("id"), await hashPassword(body.data.password)]);
  }
  return c.json({ ok: true });
});

app.delete("/v1/staff/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return deny();
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);
  if (c.req.param("id") === user.id) return c.json({ error: "Cannot delete yourself" }, 400);
  await query("delete from reservations where user_id=$1", [c.req.param("id")]);
  await query("delete from users where id=$1", [c.req.param("id")]);
  return c.json({ ok: true });
});

app.patch("/v1/settings", async (c) => {
  const user = await requireUser(c);
  if (!user) return deny();
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);
  const body = z
    .object({ remindOn: z.boolean().optional(), notifyOn: z.boolean().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Invalid settings" }, 400);
  if (body.data.remindOn !== undefined) {
    await query("insert into settings (key,value) values ('remind_on',$1) on conflict (key) do update set value=$1", [
      String(body.data.remindOn),
    ]);
  }
  if (body.data.notifyOn !== undefined) {
    await query("insert into settings (key,value) values ('notify_on',$1) on conflict (key) do update set value=$1", [
      String(body.data.notifyOn),
    ]);
  }
  return c.json({ ok: true });
});

app.get("/v1/admin/resets", async (c) => {
  const user = await requireUser(c);
  if (!user) return deny();
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);
  const rows = await query<{ id: string; username: string; created_at: string; handled: boolean }>(
    "select id::text, username, to_char(created_at, 'HH24:MI') as created_at, handled from password_resets order by id desc limit 50",
  );
  return c.json({ resets: rows });
});

app.patch("/v1/admin/resets/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return deny();
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);
  await query("update password_resets set handled=true where id=$1", [c.req.param("id")]);
  return c.json({ ok: true });
});

app.get("/v1/reports/today", async (c) => {
  const user = await requireUser(c);
  if (!user) return deny();
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);
  const [sessions, energy] = await Promise.all([
    query<{ n: string }>("select count(*)::text as n from reservations where created_at::date = current_date"),
    query<{ n: string }>("select coalesce(sum(duration_min),0)::text as n from reservations where status in ('completed','charging') and created_at::date = current_date"),
  ]);
  const sessionCount = Number(sessions[0]?.n ?? 0);
  const minutes = Number(energy[0]?.n ?? 0);
  const slots = await listSlots();
  return c.json({
    date: new Date().toISOString().slice(0, 10),
    sessions: sessionCount,
    energyKwh: Math.round(minutes * 0.35),
    avgSessionMin: sessionCount ? Math.round(minutes / Math.max(sessionCount, 1)) : 0,
    utilisationPct: Math.round(((slots.filter((s) => s.status === "charging" || s.status === "reserved").length) / Math.max(slots.length, 1)) * 100),
    bays: slots.map((s) => ({ bay: s.bay, status: s.status, occupant: s.occupant ?? null })),
  });
});

/** Hardware / sibling-system ingest. Authenticate with X-API-Key, not staff JWT. */
app.post("/v1/integrations/telemetry", async (c) => {
  if (!apiKeyOk(c.req.header("x-api-key"))) return c.json({ error: "Invalid API key" }, 401);
  const parsed = z
    .object({
      bayId: z.string(),
      led: z.enum(["green", "red", "amber", "off"]).optional(),
      occupied: z.boolean().optional(),
      source: z.string().optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid telemetry" }, 400);
  try {
    await applyTelemetry(parsed.data);
    return c.json({ ok: true });
  } catch (err) {
    const e = httpError(err);
    return c.json({ error: e.message }, e.status);
  }
});

app.get("/v1/integrations/garage", async (c) => {
  if (!apiKeyOk(c.req.header("x-api-key"))) return c.json({ error: "Invalid API key" }, 401);
  return c.json({ slots: await listSlots(), hardwareMode: env.hardwareMode });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

async function boot() {
  if (!env.databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  await migrate();
  await seedIfEmpty();
  startAlertLoop();
  serve({ fetch: app.fetch, port: env.port, hostname: "0.0.0.0" });
  console.log(`vodafone-charge api on :${env.port}`);
}

boot().catch((err) => {
  console.error(err);
  process.exit(1);
});
