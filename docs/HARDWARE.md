# Hardware adapter

The HQ garage pillars expose an LED and an ultrasonic occupancy sensor per bay. This app does **not** talk Modbus/MQTT directly. A small adapter on the garage network translates those signals into HTTPS.

Auth is a shared secret, not a staff login.

```
X-API-Key: <GARAGE_API_KEY>
Content-Type: application/json
```

Give this key to the hardware / building-management team. Rotate it on Railway (`GARAGE_API_KEY`) and in the adapter at the same time.

## Bay IDs

| Bay | Charger | `bayId` |
| --- | --- | --- |
| A1 | 50 kW CCS2 fast | `a1` |
| A2 | 50 kW CCS2 fast | `a2` |
| B1 | 22 kW Type 2 | `b1` |
| B2 | 7.4 kW Type 2 | `b2` |
| B3 | 7.4 kW Type 2 | `b3` |

## POST `/v1/integrations/telemetry`

Called whenever LED or occupancy changes. Partial updates are allowed.

```bash
curl -X POST "$API_URL/v1/integrations/telemetry" \
  -H "X-API-Key: $GARAGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"bayId":"a2","occupied":true,"led":"red","source":"ultrasonic"}'
```

```json
{ "bayId": "a1", "led": "green", "occupied": false, "source": "pillar" }
```

| `led` | Meaning on the pillar |
| --- | --- |
| `green` | free |
| `amber` | reserved, stall empty |
| `red` | car present / charging |
| `off` | closed for maintenance (or unpowered) |

Rules the API already enforces:

- Maintenance bays ignore occupancy (the row is still logged).
- `occupied: true` → status `charging`, LED red unless you send another colour.
- `occupied: false` while charging → reservation `completed`, waitlist promoted.
- Booking state is **not** inferred from the LED. A booked empty bay is amber until the car arrives.

## GET `/v1/integrations/garage`

Snapshot for the adapter or a wall display.

```bash
curl "$API_URL/v1/integrations/garage" -H "X-API-Key: $GARAGE_API_KEY"
```

## Recommended adapter behaviour

1. Poll ultrasonics every 1–2 seconds.
2. Debounce occupancy ~3 seconds so walking past a stall does not flip the bay.
3. POST only on change (occupied edge, LED change).
4. Retry with backoff on HTTP 5xx. On 401, the key is wrong — do not retry in a tight loop.
5. Keep `HARDWARE_MODE=sim` on the API until this adapter is in production, then switch to `live`.

## Simulator

Until the adapter exists:

```bash
GARAGE_API_KEY=dev-garage-key-change-me API_URL=http://localhost:4000 node scripts/sim-hardware.mjs
```

It flips A2 occupied every 20 seconds so you can watch the floor update.
