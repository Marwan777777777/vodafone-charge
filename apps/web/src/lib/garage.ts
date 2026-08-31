import { identity } from "./session";

export type Led = "green" | "red" | "off" | "amber";
export type SlotStatus = "available" | "charging" | "reserved" | "maintenance";
export type ChargeKind = "fast" | "slow";
export type Paint = "white" | "graphite" | "silver";
export type Facing = "up" | "down" | "left" | "right";

export type Booking = {
  id: string;
  name: string;
  start: string;
  durationMin: number;
  window: string;
};

export type Slot = {
  id: string;
  bay: string;
  kind: ChargeKind;
  kw: number;
  connector: string;
  durationMin: number;
  led: Led;
  status: SlotStatus;
  occupant?: string;
  start?: string;
  window?: string;
  note?: string;
  est: string;
  paint?: Paint;
  facing: Facing;
  leftMin?: number;
  occupied?: boolean;
  queue: Booking[];
};

export const ME_PAINT: Paint = "white";
export function ME() {
  return identity.name || "You";
}

export const START_OPTIONS = ["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];

export function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function windowFor(start: string, durationMin: number): string {
  const end = toMin(start) + durationMin;
  const eh = Math.floor(end / 60) % 24;
  const em = end % 60;
  return `${start} – ${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

export function overlaps(aStart: string, aDur: number, bStart: string, bDur: number) {
  const a0 = toMin(aStart);
  const a1 = a0 + aDur;
  const b0 = toMin(bStart);
  const b1 = b0 + bDur;
  return a0 < b1 && b0 < a1;
}

export function sortedQueue(s: Slot) {
  return [...(s.queue ?? [])].sort((a, b) => toMin(a.start) - toMin(b.start));
}

export function freeStarts(s: Slot, durationMin: number, ignoreName?: string) {
  const q = sortedQueue(s).filter((b) => b.name !== ignoreName);
  return START_OPTIONS.filter((t) => !q.some((b) => overlaps(t, durationMin, b.start, b.durationMin)));
}

export function kindLabel(kind: ChargeKind) {
  return kind === "fast" ? "Fast" : "Slow";
}

export function maxDuration(kind: ChargeKind) {
  return kind === "fast" ? 30 : 60;
}

export function statusLabel(s: Slot) {
  if (s.status === "available") return "Available";
  if (s.status === "charging") return "Charging";
  if (s.status === "reserved") return "Booked";
  return "Closed";
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function isSelfName(name: string) {
  return name === ME() || name === "You";
}

export function isMine(s: Slot) {
  const me = ME();
  return s.queue.some((b) => b.name === me) || s.occupant === me || s.occupant === "You";
}

export function myBooking(s: Slot) {
  return s.queue.find((b) => b.name === ME());
}

export function hasCar(s: Slot) {
  return s.status === "charging";
}

export function waitCount(s: Slot) {
  if (s.status === "charging") return Math.max(0, s.queue.length - 1);
  if (s.status === "reserved") return s.queue.length;
  return s.queue.length;
}
