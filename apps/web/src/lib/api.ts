import type { Slot } from "./garage";
import type { SessionUser } from "./session";

const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

function readToken() {
  try {
    return localStorage.getItem("vc_token") ?? "";
  } catch {
    return "";
  }
}

let token = readToken();

export function setToken(next: string) {
  token = next;
  try {
    if (next) localStorage.setItem("vc_token", next);
    else localStorage.removeItem("vc_token");
  } catch {
    /* ignore quota / private mode */
  }
}

export function hasToken() {
  return Boolean(token);
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export type GarageSnapshot = {
  slots: Slot[];
  settings: { remindOn: boolean; notifyOn: boolean };
  log: { t: string; kind: string; text: string }[];
  me: SessionUser;
};

export type StaffRow = SessionUser;

export const api = {
  login: (username: string, password: string) =>
    req<{ token: string; user: SessionUser }>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => req<{ user: SessionUser }>("/v1/auth/me"),
  forgot: (username: string) =>
    req<{ ok: boolean }>("/v1/auth/forgot", { method: "POST", body: JSON.stringify({ username }) }),
  garage: () => req<GarageSnapshot>("/v1/garage"),
  reserve: (bayId: string, start: string, durationMin: number) =>
    req<{ id: string }>("/v1/reservations", {
      method: "POST",
      body: JSON.stringify({ bayId, start, durationMin }),
    }),
  cancelMine: () => req<{ ok: boolean }>("/v1/reservations/me", { method: "DELETE" }),
  maintenance: (id: string, closed: boolean) =>
    req<{ ok: boolean }>(`/v1/bays/${id}/maintenance`, { method: "PATCH", body: JSON.stringify({ closed }) }),
  staff: () => req<{ staff: StaffRow[] }>("/v1/staff"),
  addStaff: (body: Record<string, string>) => req<{ id: string }>("/v1/staff", { method: "POST", body: JSON.stringify(body) }),
  updateStaff: (id: string, body: Record<string, string>) =>
    req<{ ok: boolean }>(`/v1/staff/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteStaff: (id: string) => req<{ ok: boolean }>(`/v1/staff/${id}`, { method: "DELETE" }),
  settings: (body: { remindOn?: boolean; notifyOn?: boolean }) =>
    req<{ ok: boolean }>("/v1/settings", { method: "PATCH", body: JSON.stringify(body) }),
  report: () =>
    req<{ sessions: number; energyKwh: number; avgSessionMin: number; utilisationPct: number; date: string }>(
      "/v1/reports/today",
    ),
};
