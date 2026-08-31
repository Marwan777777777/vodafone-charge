import { query } from "../db.js";
import { logEvent } from "../garage.js";

let lastRemind = new Set<string>();
let lastNotify = new Set<string>();

function hmNow() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function startAlertLoop() {
  setInterval(() => {
    tick().catch((err) => console.error("alert tick", err));
  }, 30_000);
  tick().catch(() => undefined);
}

async function tick() {
  const settings = await query<{ key: string; value: string }>("select key, value from settings");
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const now = toMin(hmNow());

  if (map.remind_on !== "false") {
    const rows = await query<{ id: string; bay: string; name: string; start_local: string }>(
      `select r.id, b.bay, u.name, r.start_local
       from reservations r
       join bays b on b.id = r.bay_id
       join users u on u.id = r.user_id
       where r.status in ('queued','active')`,
    );
    for (const r of rows) {
      if (toMin(r.start_local) - now === 5 && !lastRemind.has(r.id)) {
        lastRemind.add(r.id);
        await logEvent("reminder", `${r.name} — ${r.bay} reservation starts in 5 min.`);
      }
    }
  }

  if (map.notify_on !== "false") {
    const rows = await query<{ id: string; bay: string; name: string; start_local: string; duration_min: number }>(
      `select r.id, b.bay, u.name, r.start_local, r.duration_min
       from reservations r
       join bays b on b.id = r.bay_id
       join users u on u.id = r.user_id
       where r.status = 'charging'`,
    );
    for (const r of rows) {
      const end = toMin(r.start_local) + r.duration_min;
      if (end - now === 5 && !lastNotify.has(r.id)) {
        lastNotify.add(r.id);
        await logEvent("notification", `${r.name} — ${r.bay} charge ends in 5 min.`);
      }
    }
  }
}
