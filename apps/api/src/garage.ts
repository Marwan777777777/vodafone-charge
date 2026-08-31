import { query } from "./db.js";
import type { AuthedUser } from "./auth.js";

export type Booking = {
  id: string;
  name: string;
  start: string;
  durationMin: number;
  window: string;
};

function windowFor(start: string, durationMin: number) {
  const [h, m] = start.split(":").map(Number);
  const end = h * 60 + m + durationMin;
  return `${start} – ${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(aStart: string, aDur: number, bStart: string, bDur: number) {
  const a0 = toMin(aStart);
  const a1 = a0 + aDur;
  const b0 = toMin(bStart);
  const b1 = b0 + bDur;
  return a0 < b1 && b0 < a1;
}

const STARTS = ["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];

export async function logEvent(kind: string, text: string) {
  await query("insert into event_log (kind, text) values ($1,$2)", [kind, text]);
}

export async function listSlots() {
  const bays = await query<{
    id: string;
    bay: string;
    kind: "fast" | "slow";
    kw: string;
    connector: string;
    facing: string;
    status: string;
    led: string;
    occupied: boolean;
    note: string | null;
    est: string;
    paint: string | null;
  }>("select * from bays order by bay");
  const res = await query<{
    id: string;
    bay_id: string;
    start_local: string;
    duration_min: number;
    status: string;
    name: string;
  }>(
    `select r.id, r.bay_id, r.start_local, r.duration_min, r.status, u.name
     from reservations r join users u on u.id = r.user_id
     where r.status in ('queued','active','charging')
     order by r.start_local`,
  );

  return bays.map((b) => {
    const queue: Booking[] = res
      .filter((r) => r.bay_id === b.id)
      .map((r) => ({
        id: r.id,
        name: r.name,
        start: r.start_local,
        durationMin: r.duration_min,
        window: windowFor(r.start_local, r.duration_min),
      }));
    const head = queue[0];
    return {
      id: b.id,
      bay: b.bay,
      kind: b.kind,
      kw: Number(b.kw),
      connector: b.connector,
      durationMin: head?.durationMin ?? (b.kind === "fast" ? 30 : 60),
      led: b.led,
      status: b.status,
      occupant: head?.name,
      start: head?.start,
      window: head?.window,
      note: b.note ?? undefined,
      est: b.est,
      paint: b.paint ?? undefined,
      facing: b.facing,
      occupied: b.occupied,
      queue,
    };
  });
}

export async function refreshBay(bayId: string) {
  const queue = await query<{ status: string; name: string }>(
    `select r.status, u.name from reservations r join users u on u.id = r.user_id
     where r.bay_id = $1 and r.status in ('queued','active','charging')
     order by r.start_local`,
    [bayId],
  );
  const bay = (await query<{ status: string; occupied: boolean }>("select status, occupied from bays where id = $1", [bayId]))[0];
  if (!bay || bay.status === "maintenance") return;

  if (queue.length === 0) {
    await query("update bays set status='available', led='green', paint=null where id=$1", [bayId]);
    return;
  }
  const charging = queue[0].status === "charging" || bay.occupied;
  if (charging) {
    await query("update bays set status='charging', led='red' where id=$1", [bayId]);
    await query(
      "update reservations set status='charging' where bay_id=$1 and status in ('active','charging') and start_local = (select min(start_local) from reservations where bay_id=$1 and status in ('queued','active','charging'))",
      [bayId],
    );
  } else {
    await query("update bays set status='reserved', led='amber' where id=$1", [bayId]);
  }
}

export async function book(user: AuthedUser, bayId: string, start: string, durationMin: number) {
  const bay = (await query<{ id: string; kind: string; status: string; bay: string }>("select id, kind, status, bay from bays where id=$1", [bayId]))[0];
  if (!bay) throw Object.assign(new Error("Bay not found"), { status: 404 });
  if (bay.status === "maintenance") throw Object.assign(new Error("Bay is closed"), { status: 409 });
  const cap = bay.kind === "fast" ? 30 : 60;
  if (durationMin > cap) throw Object.assign(new Error("Duration too long for this charger"), { status: 400 });

  const mine = await query<{ id: string; bay_id: string }>(
    "select id, bay_id from reservations where user_id=$1 and status in ('queued','active','charging')",
    [user.id],
  );
  for (const row of mine) {
    await query("update reservations set status='cancelled' where id=$1", [row.id]);
    await refreshBay(row.bay_id);
  }

  const others = await query<{ start_local: string; duration_min: number }>(
    "select start_local, duration_min from reservations where bay_id=$1 and status in ('queued','active','charging')",
    [bayId],
  );
  if (others.some((o) => overlaps(start, durationMin, o.start_local, o.duration_min))) {
    throw Object.assign(new Error("That window is taken"), { status: 409 });
  }

  const id = `r-${bayId}-${user.id}-${Date.now()}`;
  const status = bay.status === "charging" ? "queued" : "active";
  await query(
    `insert into reservations (id, bay_id, user_id, start_local, duration_min, status) values ($1,$2,$3,$4,$5,$6)`,
    [id, bayId, user.id, start, durationMin, status],
  );
  if (status === "active") {
    await query("update bays set paint = coalesce(paint, 'white') where id=$1", [bayId]);
  }
  await refreshBay(bayId);
  await logEvent("system", `${user.name} booked ${bay.bay} · ${durationMin} min`);
  return { id };
}

export async function cancelMine(user: AuthedUser) {
  const mine = await query<{ id: string; bay_id: string }>(
    "select id, bay_id from reservations where user_id=$1 and status in ('queued','active','charging')",
    [user.id],
  );
  for (const row of mine) {
    await query("update reservations set status='cancelled' where id=$1", [row.id]);
    await refreshBay(row.bay_id);
  }
  if (mine.length) await logEvent("system", `${user.name} cancelled a reservation`);
}

export async function setMaintenance(bayId: string, closed: boolean, adminName: string) {
  const bay = (await query<{ bay: string }>("select bay from bays where id=$1", [bayId]))[0];
  if (!bay) throw Object.assign(new Error("Bay not found"), { status: 404 });
  if (closed) {
    await query("update reservations set status='cancelled' where bay_id=$1 and status in ('queued','active')", [bayId]);
    await query(
      "update bays set status='maintenance', led='off', occupied=false, note='Manually closed', paint=null where id=$1",
      [bayId],
    );
    await logEvent("system", `${adminName} closed ${bay.bay} for maintenance.`);
  } else {
    await query("update bays set status='available', led='green', note=null where id=$1", [bayId]);
    await refreshBay(bayId);
    await logEvent("system", `${adminName} reopened ${bay.bay}.`);
  }
}

export async function applyTelemetry(input: { bayId: string; led?: string; occupied?: boolean; source?: string }) {
  const bay = (await query<{ id: string; status: string }>("select id, status from bays where id=$1", [input.bayId]))[0];
  if (!bay) throw Object.assign(new Error("Bay not found"), { status: 404 });
  if (bay.status === "maintenance") {
    await query("insert into telemetry (bay_id, led, occupied, source, raw) values ($1,$2,$3,$4,$5)", [
      input.bayId,
      input.led ?? null,
      input.occupied ?? null,
      input.source ?? "hardware",
      JSON.stringify(input),
    ]);
    return;
  }
  if (typeof input.occupied === "boolean") {
    await query("update bays set occupied=$2 where id=$1", [input.bayId, input.occupied]);
  }
  if (input.led) {
    await query("update bays set led=$2 where id=$1", [input.bayId, input.led]);
  }
  if (input.occupied === true) {
    await query(
      "update bays set status='charging', led=coalesce($2, 'red'), paint=coalesce(paint, 'graphite') where id=$1",
      [input.bayId, input.led ?? "red"],
    );
    const head = await query<{ id: string }>(
      "select id from reservations where bay_id=$1 and status in ('queued','active','charging') order by start_local limit 1",
      [input.bayId],
    );
    if (head[0]) await query("update reservations set status='charging' where id=$1", [head[0].id]);
  } else if (input.occupied === false) {
    const charging = await query<{ id: string }>(
      "select id from reservations where bay_id=$1 and status='charging'",
      [input.bayId],
    );
    for (const r of charging) await query("update reservations set status='completed' where id=$1", [r.id]);
    await refreshBay(input.bayId);
  }
  await query("insert into telemetry (bay_id, led, occupied, source, raw) values ($1,$2,$3,$4,$5)", [
    input.bayId,
    input.led ?? null,
    input.occupied ?? null,
    input.source ?? "hardware",
    JSON.stringify(input),
  ]);
}

export function freeStarts(queue: Booking[], durationMin: number, ignoreName?: string) {
  const q = queue.filter((b) => b.name !== ignoreName);
  return STARTS.filter((t) => !q.some((b) => overlaps(t, durationMin, b.start, b.durationMin)));
}
