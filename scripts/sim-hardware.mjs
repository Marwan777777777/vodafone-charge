#!/usr/bin/env node
/**
 * Posts fake ultrasonic/LED telemetry so the garage UI can be tested
 * without the real pillar adapter. Requires GARAGE_API_KEY.
 *
 *   GARAGE_API_KEY=... API_URL=http://localhost:4000 node scripts/sim-hardware.mjs
 */
const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const KEY = process.env.GARAGE_API_KEY ?? "";
if (!KEY) {
  console.error("GARAGE_API_KEY is required");
  process.exit(1);
}

const BAY = process.env.BAY_ID ?? "a2";
let occupied = true;

async function tick() {
  occupied = !occupied;
  const body = {
    bayId: BAY,
    occupied,
    led: occupied ? "red" : "green",
    source: "sim-hardware",
  };
  const res = await fetch(`${API_URL}/v1/integrations/telemetry`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  console.log(new Date().toISOString(), res.status, body, json);
}

console.log(`sim-hardware → ${API_URL} bay ${BAY} (20s interval)`);
tick().catch(console.error);
setInterval(() => tick().catch(console.error), 20_000);
