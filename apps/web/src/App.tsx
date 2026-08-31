import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Clock,
  Eye,
  EyeOff,
  FileDown,
  Lock,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Sun,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";
import { GarageMap } from "@/components/garage-map";
import { I18nProvider, LangToggle, useI18n } from "@/lib/i18n";
import { api, hasToken, setToken } from "@/lib/api";
import { setIdentity, type SessionUser } from "@/lib/session";
import {
  ME,
  freeStarts,
  initials,
  isMine,
  isSelfName,
  kindLabel,
  maxDuration,
  myBooking,
  sortedQueue,
  statusLabel,
  waitCount,
  windowFor,
  type Slot,
  type SlotStatus,
} from "@/lib/garage";

type Screen = "login" | "garage" | "admin";
type Overlay = null | "about" | "forgot" | "slot" | "employee" | "cancel" | "edit";
type LogKind = "reminder" | "notification" | "system";

type Employee = {
  id: string;
  name: string;
  username: string;
  phone: string;
  department: string;
  role: "Admin" | "Employee";
};

type LogItem = { t: string; kind: LogKind; text: string };

type Report = {
  date: string;
  sessions: number;
  energyKwh: number;
  avgSessionMin: number;
  utilisationPct: number;
};

function toUiRole(role: string): Employee["role"] {
  return role === "admin" ? "Admin" : "Employee";
}

function toApiRole(role: Employee["role"]) {
  return role === "Admin" ? "admin" : "employee";
}

function who(name: string, t: (k: "you") => string) {
  return isSelfName(name) ? t("you") : initials(name);
}

export default function ChargeApp() {
  return (
    <I18nProvider>
      <App />
    </I18nProvider>
  );
}

function App() {
  const { dir, theme } = useI18n();
  const [screen, setScreen] = useState<Screen>("login");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [log, setLog] = useState<LogItem[]>([]);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [remindOn, setRemindOn] = useState(true);
  const [notifyOn, setNotifyOn] = useState(true);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(hasToken());
  const [report, setReport] = useState<Report | null>(null);

  const selected = slots.find((s) => s.id === activeSlot) ?? null;
  const mine = slots.find(isMine) ?? null;
  const counts = useMemo(
    () => ({
      free: slots.filter((s) => s.status === "available").length,
      busy: slots.filter((s) => s.status === "charging" || s.status === "reserved").length,
      down: slots.filter((s) => s.status === "maintenance").length,
    }),
    [slots],
  );

  function flash(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(null), 2400);
  }

  async function refresh() {
    const snap = await api.garage();
    setSlots(snap.slots);
    setLog(snap.log as LogItem[]);
    setRemindOn(snap.settings.remindOn);
    setNotifyOn(snap.settings.notifyOn);
    setIdentity(snap.me);
    setMe(snap.me);
    if (snap.me.role === "admin") {
      const [{ staff }, today] = await Promise.all([api.staff(), api.report().catch(() => null)]);
      setEmployees(
        staff.map((s) => ({
          id: s.id,
          name: s.name,
          username: s.username,
          phone: s.phone,
          department: s.department,
          role: toUiRole(s.role),
        })),
      );
      if (today) setReport(today);
    }
  }

  useEffect(() => {
    if (!hasToken()) {
      setBooting(false);
      return;
    }
    api
      .me()
      .then(async ({ user }) => {
        setIdentity(user);
        setMe(user);
        await refresh();
        setScreen(user.role === "admin" ? "admin" : "garage");
      })
      .catch(() => {
        setToken("");
        setIdentity(null);
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (screen === "login") return;
    const id = window.setInterval(() => {
      refresh().catch((err) => {
        if (String(err.message).toLowerCase().includes("unauthorized")) signOut();
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, [screen]);

  function openSlot(id: string) {
    setActiveSlot(id);
    setOverlay("slot");
  }

  function signOut() {
    setToken("");
    setIdentity(null);
    setMe(null);
    setSlots([]);
    setEmployees([]);
    setLog([]);
    setScreen("login");
    setOverlay(null);
  }

  async function handleLogin(username: string, password: string) {
    setBusy(true);
    setLoginError(null);
    try {
      const res = await api.login(username, password);
      setToken(res.token);
      setIdentity(res.user);
      setMe(res.user);
      await refresh();
      setScreen(res.user.role === "admin" ? "admin" : "garage");
    } catch (err) {
      setLoginError((err as Error).message || "Invalid username or password");
    } finally {
      setBusy(false);
    }
  }

  async function moveMineTo(next: Slot, start: string, durationMin: number) {
    try {
      await api.reserve(next.id, start, durationMin);
      await refresh();
    } catch (err) {
      flash((err as Error).message);
    }
  }

  async function toggleMaintenance(id: string) {
    const s = slots.find((x) => x.id === id);
    const closing = s?.status !== "maintenance";
    try {
      await api.maintenance(id, closing);
      await refresh();
      flash(closing ? `${s?.bay} closed` : `${s?.bay} reopened`);
    } catch (err) {
      flash((err as Error).message);
    }
  }

  async function removeEmployee(id: string) {
    const e = employees.find((x) => x.id === id);
    try {
      await api.deleteStaff(id);
      await refresh();
      flash(`Removed ${e?.name}`);
    } catch (err) {
      flash((err as Error).message);
    }
  }

  async function cancelMine() {
    try {
      await api.cancelMine();
      await refresh();
      setOverlay(null);
      flash("Reservation cancelled");
    } catch (err) {
      flash((err as Error).message);
    }
  }

  async function saveEmployee(e: Employee, password?: string) {
    try {
      const body: Record<string, string> = {
        name: e.name,
        username: e.username,
        phone: e.phone,
        department: e.department,
        role: toApiRole(e.role),
      };
      if (password) body.password = password;
      if (employees.some((x) => x.id === e.id)) await api.updateStaff(e.id, body);
      else {
        if (!password) {
          flash("Temporary password is required");
          return;
        }
        await api.addStaff({ ...body, password });
      }
      await refresh();
      setOverlay(null);
      flash(editing ? `Updated ${e.name}` : `Added ${e.name}`);
    } catch (err) {
      flash((err as Error).message);
    }
  }

  async function saveSettings(next: { remindOn?: boolean; notifyOn?: boolean }) {
    try {
      await api.settings(next);
      if (next.remindOn !== undefined) setRemindOn(next.remindOn);
      if (next.notifyOn !== undefined) setNotifyOn(next.notifyOn);
    } catch (err) {
      flash((err as Error).message);
    }
  }

  function printReport() {
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      flash("Allow pop-ups to save the PDF");
      return;
    }
    const rows = slots
      .map(
        (s) =>
          `<tr><td>${s.bay}</td><td>${statusLabel(s)}</td><td>${s.occupant ?? "—"}</td><td>${s.window ?? "—"}</td></tr>`,
      )
      .join("");
    w.document.write(`<!doctype html><html><head><title>HQ Garage Charge Report</title>
      <style>
        body{font-family:Outfit,Arial,sans-serif;padding:32px;color:#1a1a1a}
        h1{color:#e60000;font-size:22px;margin:0}
        p{color:#4a4d4e}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
        th,td{border:1px solid #e6e6e6;padding:8px 10px;text-align:left}
        th{background:#f3f3f4}
        .k{display:flex;gap:24px;margin-top:16px}
        .k div{background:#f3f3f4;padding:12px 16px;border-radius:12px}
      </style></head><body>
      <h1>Vodafone Charge · HQ garage report</h1>
      <p>${report?.date ?? new Date().toISOString().slice(0, 10)} · Level −1</p>
      <div class="k">
        <div><b>${report?.sessions ?? 0}</b><br>Sessions</div>
        <div><b>${report?.energyKwh ?? 0} kWh</b><br>Energy</div>
        <div><b>${report?.avgSessionMin ?? 0} min</b><br>Avg session</div>
        <div><b>${report?.utilisationPct ?? 0}%</b><br>Utilisation</div>
      </div>
      <table><thead><tr><th>Bay</th><th>Status</th><th>Occupant</th><th>Window</th></tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  if (booting) {
    return (
      <div className="app-root grid place-items-center bg-vf-mist text-vf-ink" dir={dir} data-theme={theme}>
        <p className="text-sm font-medium text-vf-abbey">Vodafone Charge</p>
      </div>
    );
  }

  return (
    <div className="app-root text-vf-ink" dir={dir} data-theme={theme}>
      {screen === "login" && (
        <LoginScreen
          error={loginError}
          busy={busy}
          onEnter={handleLogin}
          onAbout={() => setOverlay("about")}
          onForgot={() => setOverlay("forgot")}
        />
      )}
      {screen === "garage" && (
        <GarageScreen
          slots={slots}
          counts={counts}
          mine={mine}
          remindOn={remindOn}
          notifyOn={notifyOn}
          onOpen={openSlot}
          onEdit={() => setOverlay("edit")}
          onCancel={() => setOverlay("cancel")}
          onOut={signOut}
        />
      )}
      {screen === "admin" && (
        <AdminScreen
          slots={slots}
          employees={employees}
          log={log}
          counts={counts}
          remindOn={remindOn}
          notifyOn={notifyOn}
          report={report}
          onRemind={(v) => saveSettings({ remindOn: v })}
          onNotify={(v) => saveSettings({ notifyOn: v })}
          onOpen={openSlot}
          onToggle={toggleMaintenance}
          onEdit={(e) => {
            setEditing(e);
            setOverlay("employee");
          }}
          onAdd={() => {
            setEditing(null);
            setOverlay("employee");
          }}
          onDelete={removeEmployee}
          onPdf={printReport}
          onOut={signOut}
        />
      )}

      {overlay === "about" && <AboutModal onClose={() => setOverlay(null)} />}
      {overlay === "forgot" && (
        <ForgotModal
          onClose={() => setOverlay(null)}
          onSent={async (username) => {
            try {
              await api.forgot(username);
              setOverlay(null);
              flash("Reset request sent to garage admin");
            } catch (err) {
              flash((err as Error).message);
            }
          }}
        />
      )}
      {overlay === "slot" && selected && (
        <SlotModal
          slot={selected}
          slots={slots}
          role={me?.role === "admin" ? "admin" : "employee"}
          mine={mine}
          onClose={() => setOverlay(null)}
          onReserve={async (start, durationMin) => {
            await moveMineTo(selected, start, durationMin);
            setOverlay(null);
            flash(`Reserved ${selected.bay} · ${durationMin} min`);
          }}
          onEditMine={() => setOverlay("edit")}
          onToggle={() => {
            toggleMaintenance(selected.id);
            setOverlay(null);
          }}
        />
      )}
      {overlay === "edit" && mine && (
        <EditReservationModal
          slots={slots}
          mine={mine}
          onClose={() => setOverlay(null)}
          onSave={async (bayId, start, durationMin) => {
            const next = slots.find((s) => s.id === bayId);
            if (!next) return;
            await moveMineTo(next, start, durationMin);
            setOverlay(null);
            flash(`Updated · ${next.bay}`);
          }}
          onCancel={() => setOverlay("cancel")}
        />
      )}
      {overlay === "cancel" && (
        <ConfirmModal
          titleKey="cancelTitle"
          body={mine ? mine.bay : ""}
          onClose={() => setOverlay(null)}
          onConfirm={cancelMine}
        />
      )}
      {overlay === "employee" && (
        <EmployeeModal
          employee={editing}
          onClose={() => setOverlay(null)}
          onSave={(e, password) => saveEmployee(e, password)}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-vf-ink px-4 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function LoginScreen({
  onEnter,
  onAbout,
  onForgot,
  error,
  busy,
}: {
  onEnter: (username: string, password: string) => void;
  onAbout: () => void;
  onForgot: () => void;
  error: string | null;
  busy: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("amira.hassan");
  const [password, setPassword] = useState("Charge#22");
  const { t, theme, toggleTheme } = useI18n();

  return (
    <div className="phone-shell is-scroll login-shell">
      <section className="login-panel">
        <div className="login-bar">
          <LangToggle variant="pill" />
          <button type="button" className="login-moon" onClick={toggleTheme} aria-label="Theme">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>

        <div className="login-brand">
          <div className="login-hero">
            <img src="/vf-mascot.png" alt="" className="login-hero-img" />
          </div>
          <p className="login-wordmark">vodafone</p>
          <p className="login-tag">{t("evLine")}</p>
        </div>

        <div className="login-form-col">
          <p className="mt-6 text-[11px] font-semibold tracking-[0.2em] text-vf-red uppercase">{t("welcome")}</p>
          <h2 className="mt-1 text-[30px] font-semibold tracking-[-0.035em]">{t("signInTitle")}</h2>
          <p className="mt-1 text-sm text-vf-abbey">{t("signInSub")}</p>

          <form
            className="mt-6 space-y-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              onEnter(username.trim(), password);
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">{t("username")}</span>
              <div className="login-field">
                <User className="login-ico" strokeWidth={1.8} />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="login-input"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">{t("password")}</span>
              <div className="login-field">
                <Lock className="login-ico" strokeWidth={1.8} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="login-input has-eye"
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </label>
            {error && <p className="text-sm font-medium text-vf-red">{error}</p>}
            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? "…" : t("signIn")}
              <ArrowRight className="size-4" />
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button type="button" onClick={onForgot} className="font-medium text-vf-red">
              {t("forgot")}
            </button>
            <button type="button" onClick={onAbout} className="font-medium text-vf-abbey">
              {t("about")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function GarageScreen({
  slots,
  counts,
  mine,
  remindOn,
  notifyOn,
  onOpen,
  onEdit,
  onCancel,
  onOut,
}: {
  slots: Slot[];
  counts: { free: number; busy: number; down: number };
  mine: Slot | null;
  remindOn: boolean;
  notifyOn: boolean;
  onOpen: (id: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onOut: () => void;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<SlotStatus | "all">("all");
  const bookedN = slots.filter((s) => s.status === "reserved").length;
  const chargingN = slots.filter((s) => s.status === "charging").length;
  const alert =
    mine?.status === "reserved" && remindOn
      ? { kind: "reminder" as const, title: t("reservedStarts"), detail: `${t("slot")} ${mine.bay} · ${mine.window}` }
      : mine?.status === "charging" && notifyOn
        ? { kind: "notification" as const, title: t("chargeEnds"), detail: `${t("slot")} ${mine.bay} · ${mine.kw} kW` }
        : null;
  const booking = mine ? myBooking(mine) : undefined;
  const filters: { id: SlotStatus | "all"; n: number; label: string; tone: string }[] = [
    { id: "all", n: slots.length, label: t("all"), tone: "all" },
    { id: "available", n: counts.free, label: t("free"), tone: "free" },
    { id: "reserved", n: bookedN, label: t("booked"), tone: "booked" },
    { id: "charging", n: chargingN, label: t("charging"), tone: "charging" },
    { id: "maintenance", n: counts.down, label: t("closed"), tone: "closed" },
  ];

  return (
    <div className="phone-shell is-ops">
      <header className="ops-head">
        <img src="/speechmark-white.svg" alt="" className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-none">{t("brand")}</p>
          <p className="mt-0.5 text-[11px] text-white/50">{t("hq")}</p>
        </div>
        <LangToggle />
        <button type="button" onClick={onOut} className="grid size-11 place-items-center text-white/70" aria-label={t("signOut")}>
          <LogOut className="size-4" />
        </button>
      </header>

      <div className="ops-filters" role="tablist" aria-label={t("status")}>
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter((cur) => (cur === f.id ? "all" : f.id))}
            className={"ops-chip is-" + f.tone + (filter === f.id ? " is-on" : "")}
          >
            <span>{f.n}</span> {f.label}
          </button>
        ))}
      </div>

      <div className="floor-body">
        <div className="floor-map">
          <GarageMap slots={slots} onOpen={onOpen} filter={filter} />
        </div>
        <div className="floor-dock">
          {alert && (
            <div className="ops-alert">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-vf-red uppercase">
                {alert.kind === "reminder" ? t("reminder") : t("notification")}
              </p>
              <p className="text-sm font-medium">{alert.title}</p>
            </div>
          )}
          {mine ? (
            <div className="ops-res">
              <p className="ops-kicker">{mine.status === "charging" && mine.occupant === ME() ? t("yourSession") : t("yourReservation")}</p>
              <p className="ops-res-title">
                {mine.status === "reserved" ? <Clock className="size-4 text-led-amber" /> : <Zap className="size-4 text-vf-red" />}
                {mine.bay} · {kindLabel(mine.kind)} · {(booking ?? mine).durationMin} {t("min")}
              </p>
              <p className="text-xs text-white/55">{(booking ?? mine).window}</p>
              <div className="ops-res-actions">
                <button type="button" onClick={onEdit} className="ops-btn-primary">
                  {t("edit")}
                </button>
                <button type="button" onClick={onCancel} className="ops-btn-ghost">
                  {t("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-white/60">{t("tapBay")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminScreen({
  slots,
  employees,
  log,
  counts,
  remindOn,
  notifyOn,
  onRemind,
  onNotify,
  onOpen,
  onToggle,
  onEdit,
  onAdd,
  onDelete,
  onPdf,
  onOut,
  report,
}: {
  slots: Slot[];
  employees: Employee[];
  log: LogItem[];
  counts: { free: number; busy: number; down: number };
  remindOn: boolean;
  notifyOn: boolean;
  report: { sessions: number; energyKwh: number; avgSessionMin: number; utilisationPct: number; date: string } | null;
  onRemind: (v: boolean) => void;
  onNotify: (v: boolean) => void;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onEdit: (e: Employee) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onPdf: () => void;
  onOut: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"floor" | "staff" | "reports">("floor");

  return (
    <div className="phone-shell is-ops">
      <header className="ops-head">
        <img src="/speechmark-white.svg" alt="" className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-none">{t("admin")}</p>
          <p className="mt-0.5 text-[11px] text-white/50">{t("hq")}</p>
        </div>
        <LangToggle />
        <button type="button" onClick={onOut} className="grid size-11 place-items-center text-white/70" aria-label={t("signOut")}>
          <LogOut className="size-4" />
        </button>
      </header>
      <div className="ops-tabs">
        {(["floor", "staff", "reports"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={"ops-tab " + (tab === id ? "is-on" : "")}
          >
            {t(id)}
          </button>
        ))}
      </div>

      {tab === "floor" && (
        <div className="admin-floor desk-split">
          <div className="admin-garage">
            <GarageMap slots={slots} onOpen={onOpen} />
          </div>
          <div className="admin-side px-4 pb-5">
            <p className="ops-kicker">{t("bayOverride")}</p>
            <div className="mt-2 space-y-2">
              {slots.map((s) => (
                <div key={s.id} className="ops-row">
                  <div>
                    <p className="ops-name">{s.bay}</p>
                    <p className="ops-meta">
                      {statusLabel(s)}
                      {waitCount(s) > 0 ? ` · ${waitCount(s)} ${t("inQueue")}` : ""}
                    </p>
                  </div>
                  <button type="button" onClick={() => onToggle(s.id)} className="ops-btn-ghost h-11 px-3">
                    {s.status === "maintenance" ? t("open") : t("close")}
                  </button>
                </div>
              ))}
            </div>
            <p className="ops-kicker mt-4">Live</p>
            <ul className="mt-2 space-y-1.5">
              {log.slice(0, 5).map((item, i) => (
                <li key={i} className="flex gap-2 text-xs text-white/70">
                  <span className="tabular-nums text-white/40">{item.t}</span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === "staff" && (
        <div className="admin-floor desk-list px-4 pb-6">
          <div className="flex items-center justify-between py-2">
            <p className="ops-name">{employees.length} {t("staff")}</p>
            <button type="button" onClick={onAdd} className="ops-btn-primary h-11 px-4 text-xs">
              <Plus className="size-3.5" />
              {t("add")}
            </button>
          </div>
          <ul className="space-y-2">
            {employees.map((e) => (
              <li key={e.id} className="ops-row">
                <div className="min-w-0 flex-1">
                  <p className="ops-name">{e.name}</p>
                  <p className="ops-meta">
                    {e.department} · {e.phone}
                  </p>
                </div>
                <button type="button" onClick={() => onEdit(e)} className="grid size-11 place-items-center text-white/60" aria-label={t("edit")}>
                  <Pencil className="size-4" />
                </button>
                <button type="button" onClick={() => onDelete(e.id)} className="grid size-11 place-items-center text-vf-red" aria-label={t("cancel")}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "reports" && (
        <div className="admin-floor desk-list px-4 pb-6">
          <p className="py-2 text-sm font-semibold">{t("reportTitle")}</p>
          <p className="text-xs text-white/50">{t("today")} · {counts.free} {t("free")} · {counts.busy} {t("busy")}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat k={t("sessions")} v={String(report?.sessions ?? 0)} />
            <Stat k={t("energy")} v={`${report?.energyKwh ?? 0} kWh`} />
            <Stat k={t("avgSession")} v={`${report?.avgSessionMin ?? 0} min`} />
            <Stat k={t("utilisation")} v={`${report?.utilisationPct ?? 0}%`} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <AlertToggle on={remindOn} label={t("reminder")} detail={t("remindDetail")} onToggle={() => onRemind(!remindOn)} />
            <AlertToggle on={notifyOn} label={t("notification")} detail={t("notifyDetail")} onToggle={() => onNotify(!notifyOn)} />
          </div>
          <button type="button" onClick={onPdf} className="ops-btn-primary mt-6 w-full">
            <FileDown className="size-4" />
            {t("savePdf")}
          </button>
        </div>
      )}
    </div>
  );
}

function AlertToggle({ on, label, detail, onToggle }: { on: boolean; label: string; detail: string; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="ops-row text-start">
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-[11px] font-semibold">{label}</span>
        <span className={"h-4 w-7 rounded-full " + (on ? "bg-vf-red" : "bg-white/20")}>
          <span className={"block size-4 rounded-full bg-white shadow-sm transition-transform " + (on ? "translate-x-3" : "")} />
        </span>
      </span>
      <span className="mt-0.5 block text-[10px] text-white/50">{detail}</span>
    </button>
  );
}

function SlotModal({
  slot,
  slots,
  role,
  mine,
  onClose,
  onReserve,
  onEditMine,
  onToggle,
}: {
  slot: Slot;
  slots: Slot[];
  role: "employee" | "admin";
  mine: Slot | null;
  onClose: () => void;
  onReserve: (start: string, durationMin: number) => void;
  onEditMine: () => void;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const isOwn = isMine(slot);
  const cap = maxDuration(slot.kind);
  const durations = cap === 30 ? [30] : [30, 60];
  const [duration, setDuration] = useState(Math.min(slot.durationMin || cap, cap));
  const opens = slot.status === "maintenance" ? [] : freeStarts(slot, duration, ME());
  const [start, setStart] = useState(opens[0] ?? "15:00");
  const canJoin = role === "employee" && !isOwn && slot.status !== "maintenance" && opens.length > 0;
  const window = windowFor(start, duration);
  const queue = sortedQueue(slot);
  const cta = slot.status === "available" ? t("reserve") : t("joinWaitlist");
  const tone = slot.status === "available" ? "free" : slot.status === "charging" ? "charging" : slot.status === "reserved" ? "booked" : "closed";
  const current = queue[0];
  const waiting = waitCount(slot);

  return (
    <Modal onClose={onClose} tone="ops">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-vf-red uppercase">
            {t("slot")} {slot.bay}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            {slot.kw} kW · {slot.kind === "fast" ? t("fast") : t("slow")}
          </h2>
        </div>
        <span className={"status-badge is-" + tone}>{statusLabel(slot)}</span>
      </div>

      <div className="mt-4">
        <GarageMap slots={slots} onOpen={() => {}} highlightId={slot.id} compact />
      </div>

      <Section k={t("bayStatus")}>
        <p className="text-sm font-semibold">{statusLabel(slot)}</p>
        <p className="text-xs text-vf-abbey">
          {slot.led === "off" ? t("ledOff") : slot.led === "green" ? t("ledGreen") : slot.led === "amber" ? t("ledAmber") : t("ledRed")}
          {waiting > 0 ? ` · ${waiting} ${t("inQueue")}` : ""}
        </p>
      </Section>

      <Section k={t("currentUser")}>
        <p className="text-sm font-semibold">
          {current ? who(current.name, t) : t("noneHere")}
          {current && isSelfName(current.name) ? "" : ""}
        </p>
        {current && <p className="text-xs text-vf-abbey">{current.window}</p>}
      </Section>

      <Section k={t("connector")}>
        <p className="text-sm font-semibold">{slot.connector} · {slot.kw} kW</p>
      </Section>

      <Section k={t("estimate")}>
        <p className="text-sm font-semibold">{slot.est}</p>
      </Section>

      {queue.length > 0 && (
        <Section k={t("waitlist")}>
          <ol className="queue-list">
            {queue.map((b, i) => {
              const chargingNow = slot.status === "charging" && i === 0;
              const isNext = slot.status === "charging" ? i === 1 : i === 0;
              const roleLabel = chargingNow ? t("queueNow") : isNext ? t("queueNext") : t("queueThen");
              const self = isSelfName(b.name);
              return (
                <li key={b.id} className={self ? "is-you" : ""}>
                  <span className="queue-n">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{who(b.name, t)}</span>
                    <span className="block text-[11px] text-vf-abbey">
                      {roleLabel} · {b.window}
                    </span>
                  </span>
                  {chargingNow ? <Zap className="size-3.5 text-vf-red" /> : <Clock className="size-3.5 text-led-amber" />}
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      {canJoin && (
        <Section k={t("duration")}>
          <div className="flex gap-1.5">
            {durations.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDuration(d);
                  const next = freeStarts(slot, d, ME());
                  if (next[0]) setStart(next[0]);
                }}
                className={"h-11 rounded-full px-4 text-xs font-semibold " + (duration === d ? "bg-vf-red text-white" : "border border-vf-line text-vf-abbey")}
              >
                {d} {t("min")}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-xs font-semibold tracking-[0.14em] text-vf-abbey uppercase">{t("start")}</span>
            <select
              value={opens.includes(start) ? start : opens[0]}
              onChange={(e) => setStart(e.target.value)}
              className="h-11 w-full rounded-[12px] border border-vf-line bg-white px-3"
            >
              {opens.map((time) => (
                <option key={time}>{time}</option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-sm font-medium">
            {slot.bay} · {window} · {duration} {t("min")}
          </p>
        </Section>
      )}

      {slot.note && <p className="mt-4 rounded-[12px] bg-vf-mist px-3 py-2 text-sm">{slot.note}</p>}

      <div className="mt-6 flex flex-col gap-2">
        {role === "employee" && isOwn && (
          <button type="button" onClick={onEditMine} className="h-11 rounded-full bg-vf-red text-sm font-semibold text-white">
            {t("editReservation")}
          </button>
        )}
        {role === "admin" && (
          <button type="button" onClick={onToggle} className="h-11 rounded-full bg-vf-red text-sm font-semibold text-white">
            {slot.status === "maintenance" ? t("reopen") : t("closeMaint")}
          </button>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-full border border-vf-line text-sm font-semibold">
            {t("close")}
          </button>
          {canJoin && (
            <button
              type="button"
              onClick={() => onReserve(opens.includes(start) ? start : opens[0], duration)}
              className="h-11 flex-1 rounded-full bg-vf-red text-sm font-semibold text-white"
            >
              {cta}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Section({ k, children }: { k: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-vf-abbey uppercase">{k}</p>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function EditReservationModal({
  slots,
  mine,
  onClose,
  onSave,
  onCancel,
}: {
  slots: Slot[];
  mine: Slot;
  onClose: () => void;
  onSave: (bayId: string, start: string, durationMin: number) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const mineBook = myBooking(mine);
  const movable = slots.filter((s) => s.status !== "maintenance");
  const [bayId, setBayId] = useState(mine.id);
  const [start, setStart] = useState(mineBook?.start ?? mine.start ?? "15:00");
  const chosen = slots.find((s) => s.id === bayId) ?? mine;
  const cap = maxDuration(chosen.kind);
  const [duration, setDuration] = useState(Math.min(mineBook?.durationMin ?? mine.durationMin, cap));
  const durations = cap === 30 ? [30] : [30, 60];
  const opens = freeStarts(chosen, duration, ME());

  return (
    <Modal onClose={onClose} tone="ops">
      <h2 className="text-2xl font-semibold tracking-tight">{t("editReservation")}</h2>
      <div className="mt-4">
        <GarageMap slots={slots} onOpen={() => {}} highlightId={bayId} compact />
      </div>
      <p className="mt-5 text-xs font-semibold tracking-[0.14em] text-vf-abbey uppercase">{t("slot")}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {movable.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setBayId(s.id);
              const nextCap = maxDuration(s.kind);
              const nextDur = Math.min(duration, nextCap);
              setDuration(nextDur);
              const times = freeStarts(s, nextDur, ME());
              if (times[0]) setStart(times[0]);
            }}
            className={"h-11 rounded-full px-4 text-xs font-semibold " + (bayId === s.id ? "bg-vf-red text-white" : "border border-vf-line text-vf-abbey")}
          >
            {s.bay} · {s.kw} kW
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs font-semibold tracking-[0.14em] text-vf-abbey uppercase">{t("duration")}</p>
      <div className="mt-2 flex gap-1.5">
        {durations.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              setDuration(d);
              const times = freeStarts(chosen, d, ME());
              if (times[0]) setStart(times[0]);
            }}
            className={"h-11 rounded-full px-4 text-xs font-semibold " + (duration === d ? "bg-vf-red text-white" : "border border-vf-line text-vf-abbey")}
          >
            {d} {t("min")}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-xs font-semibold tracking-[0.14em] text-vf-abbey uppercase">{t("start")}</span>
        <select
          value={opens.includes(start) ? start : opens[0] ?? start}
          onChange={(e) => setStart(e.target.value)}
          className="h-11 w-full rounded-[12px] border border-vf-line bg-white px-3"
        >
          {opens.map((time) => (
            <option key={time}>{time}</option>
          ))}
        </select>
      </label>
      <p className="mt-4 rounded-[12px] bg-vf-mist px-3 py-2 text-sm">
        {chosen.bay} · {windowFor(opens.includes(start) ? start : opens[0] ?? start, duration)} · {duration} {t("min")}
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          disabled={opens.length === 0}
          onClick={() => onSave(bayId, opens.includes(start) ? start : opens[0], duration)}
          className="h-11 rounded-full bg-vf-red text-sm font-semibold text-white disabled:bg-vf-line disabled:text-vf-abbey"
        >
          {t("saveChanges")}
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-full border border-vf-line text-sm font-semibold">
            {t("back")}
          </button>
          <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-full border border-vf-line text-sm font-semibold text-vf-red">
            {t("cancelBooking")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal onClose={onClose}>
      <img src="/vf-mascot.png" alt="" className="mx-auto h-28 w-auto object-contain" />
      <p className="login-wordmark mt-2">vodafone</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight">{t("brand")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-vf-abbey">{t("aboutBody")}</p>
      <p className="mt-4 text-sm text-vf-abbey">{t("facilities")}</p>
      <button type="button" onClick={onClose} className="mt-6 h-11 w-full rounded-full bg-vf-red text-sm font-semibold text-white">
        {t("close")}
      </button>
    </Modal>
  );
}

function ForgotModal({ onClose, onSent }: { onClose: () => void; onSent: (username: string) => void }) {
  const { t } = useI18n();
  const [username, setUsername] = useState("amira.hassan");
  return (
    <Modal onClose={onClose}>
      <h2 className="text-2xl font-semibold tracking-tight">{t("forgotTitle")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-vf-abbey">{t("forgotBody")}</p>
      <label className="mt-5 block">
        <span className="mb-1 block text-xs font-medium">{t("username")}</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} className="h-11 w-full rounded-[12px] border border-vf-line px-3 text-sm" />
      </label>
      <button type="button" onClick={() => onSent(username.trim())} className="mt-5 h-11 w-full rounded-full bg-vf-red text-sm font-semibold text-white">
        {t("requestReset")}
      </button>
      <button type="button" onClick={onClose} className="mt-2 h-11 w-full rounded-full border border-vf-line text-sm font-semibold">
        {t("back")}
      </button>
    </Modal>
  );
}

function ConfirmModal({
  titleKey,
  body,
  onClose,
  onConfirm,
}: {
  titleKey: "cancelTitle";
  body: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal onClose={onClose} tone="ops">
      <h2 className="text-2xl font-semibold tracking-tight">{t(titleKey)}</h2>
      <p className="mt-2 text-sm text-vf-abbey">{body}</p>
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={onClose} className="h-11 flex-1 rounded-full border border-vf-line text-sm font-semibold">
          {t("keep")}
        </button>
        <button type="button" onClick={onConfirm} className="h-11 flex-1 rounded-full bg-vf-red text-sm font-semibold text-white">
          {t("cancelBooking")}
        </button>
      </div>
    </Modal>
  );
}

function EmployeeModal({
  employee,
  onClose,
  onSave,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSave: (e: Employee, password?: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(employee?.name ?? "");
  const [username, setUsername] = useState(employee?.username ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [department, setDepartment] = useState(employee?.department ?? "");
  const [role, setRole] = useState<Employee["role"]>(employee?.role ?? "Employee");
  const [password, setPassword] = useState("");

  return (
    <Modal onClose={onClose} tone="ops">
      <h2 className="text-2xl font-semibold tracking-tight">{employee ? t("editEmployee") : t("addEmployee")}</h2>
      <div className="mt-4 space-y-3">
        <Field label={t("name")} value={name} onChange={setName} />
        <Field label={t("username")} value={username} onChange={setUsername} />
        <Field label={t("phone")} value={phone} onChange={setPhone} />
        <Field label={t("department")} value={department} onChange={setDepartment} />
        <label className="block">
          <span className="mb-1 block text-xs font-medium">{t("role")}</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Employee["role"])} className="h-11 w-full rounded-[12px] border border-vf-line px-3 text-sm">
            <option>Employee</option>
            <option>Admin</option>
          </select>
        </label>
        <Field label={t("tempPassword")} value={password} onChange={setPassword} />
      </div>
      <button
        type="button"
        onClick={() =>
          onSave(
            {
              id: employee?.id ?? `e${Date.now()}`,
              name,
              username,
              phone,
              department,
              role,
            },
            password || undefined,
          )
        }
        className="mt-5 h-11 w-full rounded-full bg-vf-red text-sm font-semibold text-white"
      >
        {t("save")}
      </button>
      <button type="button" onClick={onClose} className="mt-2 h-11 w-full rounded-full border border-vf-line text-sm font-semibold">
        {t("back")}
      </button>
    </Modal>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-[12px] border border-vf-line px-3 text-sm" />
    </label>
  );
}

function Modal({ onClose, children, tone }: { onClose: () => void; children: ReactNode; tone?: "ops" }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 p-3 md:items-center" onClick={onClose}>
      <div className={"sheet" + (tone === "ops" ? " is-ops" : "")} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="sheet-close absolute end-3 top-3 grid size-11 place-items-center text-vf-abbey" aria-label="Close">
          <X className="size-4" />
        </button>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="ops-row flex-col items-start">
      <p className="text-[11px] text-white/50">{k}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight">{v}</p>
    </div>
  );
}
