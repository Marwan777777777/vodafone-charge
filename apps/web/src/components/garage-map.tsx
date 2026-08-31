import { Clock, Zap } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  hasCar,
  isMine,
  statusLabel,
  waitCount,
  type Facing,
  type Led,
  type Paint,
  type Slot,
  type SlotStatus,
} from "@/lib/garage";

type Props = {
  slots: Slot[];
  onOpen: (id: string) => void;
  highlightId?: string;
  compact?: boolean;
  filter?: SlotStatus | "all";
};

const CAR: Record<Paint, string> = {
  white: "/cars/ev-white.png",
  silver: "/cars/ev-white.png",
  graphite: "/cars/ev-graphite.png",
};

export function GarageMap({ slots, onOpen, highlightId, compact, filter = "all" }: Props) {
  const byId = Object.fromEntries(slots.map((s) => [s.id, s]));
  const { t } = useI18n();
  if (!byId.a1 || !byId.a2 || !byId.b1 || !byId.b2 || !byId.b3) {
    return <div className="garage-shell" />;
  }

  return (
    <div className={"garage-shell" + (compact ? " is-compact" : "")}>
      <div className="garage-curb">
        <div className="garage-floor">
          <div className="garage-grid">
            <BayCell slot={byId.a1} onOpen={onOpen} highlight={highlightId === "a1"} dim={filter !== "all" && byId.a1.status !== filter} />
            <BayCell slot={byId.a2} onOpen={onOpen} highlight={highlightId === "a2"} dim={filter !== "all" && byId.a2.status !== filter} />
            <BayCell slot={byId.b3} onOpen={onOpen} highlight={highlightId === "b3"} dim={filter !== "all" && byId.b3.status !== filter} />
            <DrivePad />
            <BayCell slot={byId.b1} onOpen={onOpen} highlight={highlightId === "b1"} dim={filter !== "all" && byId.b1.status !== filter} />
            <BayCell slot={byId.b2} onOpen={onOpen} highlight={highlightId === "b2"} dim={filter !== "all" && byId.b2.status !== filter} />
          </div>
        </div>
      </div>
      {compact && (
        <p className="garage-you">
          {t("youAreHere")} · {byId[highlightId ?? ""]?.bay ?? ""}
        </p>
      )}
    </div>
  );
}

function DrivePad() {
  const { t } = useI18n();
  return (
    <div className="garage-pad" aria-hidden="true">
      <div className="garage-lane" />
      <img src="/speechmark-white.svg" alt="" className="garage-decal" />
      <p className="garage-level">Level −1</p>
      <div className="garage-legend">
        <Legend led="green" label={t("free")} />
        <Legend led="amber" label={t("booked")} />
        <Legend led="red" label={t("charging")} />
        <Legend led="off" label={t("closed")} />
      </div>
    </div>
  );
}

function BayCell({
  slot,
  onOpen,
  highlight,
  dim,
}: {
  slot: Slot;
  onOpen: (id: string) => void;
  highlight: boolean;
  dim: boolean;
}) {
  const { t } = useI18n();
  const mine = isMine(slot);
  const occupied = hasCar(slot);
  const closed = slot.status === "maintenance";
  const reserved = slot.status === "reserved";
  const charging = slot.status === "charging";
  const landscape = slot.facing === "left" || slot.facing === "right";
  const queued = waitCount(slot);
  const tone = closed ? "closed" : charging ? "charging" : reserved ? "booked" : "free";

  return (
    <div className={`bay-cell bay-${slot.id}` + (dim ? " is-dim" : "")}>
      <button
        type="button"
        onClick={() => onOpen(slot.id)}
        className={
          "bay-hit is-" +
          tone +
          (mine ? " is-mine " : " ") +
          (highlight ? "is-highlight " : "") +
          (landscape ? "is-landscape" : "is-portrait")
        }
        aria-label={`${slot.bay} ${statusLabel(slot)}`}
      >
        <Pillar led={slot.led} facing={slot.facing} />
        <span className="bay-stop" />
        {!occupied && !reserved && <span className="bay-paint">{slot.bay}</span>}
        {reserved && (
          <span className="bay-hold">
            <Clock className="size-4" strokeWidth={2.2} />
          </span>
        )}
        {occupied && slot.paint && (
          <div className={"bay-car face-" + slot.facing}>
            <img src={CAR[slot.paint]} alt="" className="bay-car-img" />
          </div>
        )}
        {charging && <span className="bay-cable" />}
      </button>
      <div className={"bay-chip is-" + tone}>
        <LedDot color={slot.led} />
        {reserved && <Clock className="size-2.5" />}
        {charging && <Zap className="size-2.5" />}
        <span className="font-semibold">{slot.bay}</span>
        <span>
          {closed ? t("closed") : charging ? t("charging") : reserved ? t("booked") : t("free")}
        </span>
        {queued > 0 && charging && <span className="chip-wait">+{queued}</span>}
        {mine && <span className="chip-you">{t("you")}</span>}
      </div>
    </div>
  );
}

function Pillar({ led, facing }: { led: Led; facing: Facing }) {
  return (
    <span className={"bay-pillar pillar-" + facing}>
      <span className={"bay-led led-" + led} />
    </span>
  );
}

function LedDot({ color }: { color: Led }) {
  return <span className={"led-pip led-" + color} />;
}

function Legend({ led, label }: { led: Led; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <LedDot color={led} />
      {label}
    </span>
  );
}