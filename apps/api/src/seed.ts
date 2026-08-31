import { query } from "./db.js";
import { hashPassword } from "./auth.js";

const STAFF = [
  { id: "e1", name: "Amira Hassan", username: "amira.hassan", phone: "+20 100 441 2201", department: "Network Ops", role: "employee" },
  { id: "e2", name: "Karim Nabil", username: "karim.nabil", phone: "+20 122 880 4410", department: "Field Engineering", role: "employee" },
  { id: "e3", name: "Sara El-Masry", username: "sara.elmasry", phone: "+20 111 230 9981", department: "People", role: "admin" },
  { id: "e4", name: "Youssef Adel", username: "youssef.adel", phone: "+20 155 019 3344", department: "IT", role: "employee" },
  { id: "e5", name: "Nour Saleh", username: "nour.saleh", phone: "+20 106 772 1188", department: "Retail", role: "employee" },
] as const;

const BAYS = [
  { id: "a1", bay: "A1", kind: "fast", kw: 50, connector: "CCS2", facing: "down", status: "available", led: "green", occupied: false, est: "+25 kWh · ~40% on 60 kWh", paint: null, note: null },
  { id: "a2", bay: "A2", kind: "fast", kw: 50, connector: "CCS2", facing: "down", status: "charging", led: "red", occupied: true, est: "+25 kWh · ~40% on 60 kWh", paint: "graphite", note: null },
  { id: "b1", bay: "B1", kind: "slow", kw: 22, connector: "Type 2", facing: "left", status: "reserved", led: "amber", occupied: false, est: "+22 kWh · ~37% on 60 kWh", paint: "white", note: null },
  { id: "b2", bay: "B2", kind: "slow", kw: 7.4, connector: "Type 2", facing: "up", status: "available", led: "green", occupied: false, est: "+7.4 kWh · ~12% on 60 kWh", paint: null, note: null },
  { id: "b3", bay: "B3", kind: "slow", kw: 7.4, connector: "Type 2", facing: "right", status: "maintenance", led: "off", occupied: false, est: "+7.4 kWh · ~12% on 60 kWh", paint: null, note: "Connector lock — under repair" },
];

export async function seedIfEmpty() {
  const [{ n }] = await query<{ n: string }>("select count(*)::text as n from users");
  if (Number(n) > 0) return;

  const hash = await hashPassword(process.env.SEED_PASSWORD ?? "Charge#22");
  for (const u of STAFF) {
    await query(
      `insert into users (id, name, username, password_hash, phone, department, role)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [u.id, u.name, u.username, hash, u.phone, u.department, u.role],
    );
  }
  for (const b of BAYS) {
    await query(
      `insert into bays (id, bay, kind, kw, connector, facing, status, led, occupied, note, est, paint)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [b.id, b.bay, b.kind, b.kw, b.connector, b.facing, b.status, b.led, b.occupied, b.note, b.est, b.paint],
    );
  }
  await query(
    `insert into reservations (id, bay_id, user_id, start_local, duration_min, status)
     values
       ('r-a2-karim', 'a2', 'e2', '14:10', 30, 'charging'),
       ('r-a2-youssef', 'a2', 'e4', '14:40', 30, 'queued'),
       ('r-b1-amira', 'b1', 'e1', '15:00', 60, 'active')`,
  );
  await query(
    `insert into event_log (kind, text) values
      ('notification', 'KN — A2 charge ends in 5 min.'),
      ('reminder', 'AH — B1 reservation starts in 5 min.'),
      ('system', 'KN started fast charge on A2.'),
      ('system', 'Admin closed B3 for connector lock repair.')`,
  );
}
