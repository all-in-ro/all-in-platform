import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BellRing,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  MessageSquareText,
  Send,
  Trash2,
  X,
} from "lucide-react";

type VacationRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type VacationRequestKind = "vacation" | "short";

type VacationRequestItem = {
  id: string;
  employeeName: string;
  shopId?: string | null;
  kind: VacationRequestKind;
  dayFrom: string;
  dayTo: string;
  hoursOff?: number | null;
  note?: string | null;
  status: VacationRequestStatus;
  requestedAt?: string | null;
  requestedBy?: string | null;
  decidedAt?: string | null;
  decidedBy?: string | null;
  decisionNote?: string | null;
  employeeSeenAt?: string | null;
};

type ApprovedEvent = {
  id: string;
  day: string;
  kind: VacationRequestKind;
  hoursOff?: number | null;
  note?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
};

type VacationOverview = {
  ok: true;
  employeeName: string;
  year: number;
  items: VacationRequestItem[];
  events: ApprovedEvent[];
  summary: {
    pending: number;
    approved: number;
    rejected: number;
    cancelled: number;
    unseen: number;
    vacationDays: number;
    shortDays: number;
    shortHours: number;
  };
};

type Props = {
  open: boolean;
  actor: string;
  locationName: string;
  apiBase?: string;
  onClose: () => void;
};

function normalizeBase(value?: string) {
  return String(value || "/api").replace(/\/+$/, "");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "–";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: VacationRequestStatus) {
  if (status === "approved") return "Elfogadva";
  if (status === "rejected") return "Elutasítva";
  if (status === "cancelled") return "Visszavonva";
  return "Elbírálás alatt";
}

function statusClass(status: VacationRequestStatus) {
  if (status === "approved") return "border-emerald-300/35 bg-emerald-500/15 text-emerald-50";
  if (status === "rejected") return "border-rose-300/35 bg-rose-500/15 text-rose-50";
  if (status === "cancelled") return "border-white/15 bg-white/[0.05] text-white/55";
  return "border-amber-200/35 bg-amber-500/14 text-amber-50";
}

function periodLabel(item: VacationRequestItem) {
  if (item.kind === "short") return `${formatDate(item.dayFrom)} • ${item.hoursOff || 0} óra`;
  return item.dayFrom === item.dayTo
    ? formatDate(item.dayFrom)
    : `${formatDate(item.dayFrom)} – ${formatDate(item.dayTo)}`;
}

export default function AllInShopVacations({ open, actor, locationName, apiBase, onClose }: Props) {
  const base = useMemo(() => normalizeBase(apiBase), [apiBase]);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [overview, setOverview] = useState<VacationOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelBusyId, setCancelBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState<VacationRequestKind>("vacation");
  const [dayFrom, setDayFrom] = useState(todayIso());
  const [dayTo, setDayTo] = useState(todayIso());
  const [hoursOff, setHoursOff] = useState(4);
  const [note, setNote] = useState("");

  async function fetchJson(path: string, init?: RequestInit) {
    const response = await fetch(`${base}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
    return body;
  }

  async function loadOverview(targetYear = year) {
    setLoading(true);
    setError("");
    try {
      const body = await fetchJson(`/admin/vacations/my/requests?year=${encodeURIComponent(String(targetYear))}`);
      setOverview(body as VacationOverview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A szabadságadataid nem tölthetők be.");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setYear(currentYear);
    setError("");
    setNotice("");
    setKind("vacation");
    setDayFrom(todayIso());
    setDayTo(todayIso());
    setHoursOff(4);
    setNote("");
    void loadOverview(currentYear);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, open, saving]);

  async function submitRequest() {
    if (!dayFrom || !dayTo) {
      setError("A dátum megadása kötelező.");
      return;
    }
    if (dayTo < dayFrom) {
      setError("A záró dátum nem lehet a kezdő dátum előtt.");
      return;
    }
    if (kind === "short" && (hoursOff < 1 || hoursOff > 12)) {
      setError("Az elkérés 1 és 12 óra között lehet.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body = await fetchJson("/admin/vacations/my/requests", {
        method: "POST",
        body: JSON.stringify({
          employeeName: actor,
          kind,
          dayFrom,
          dayTo: kind === "short" ? dayFrom : dayTo,
          hoursOff: kind === "short" ? hoursOff : null,
          note: note.trim() || null,
        }),
      });
      setNotice(body?.duplicate ? "Ez a kérés már elbírálás alatt van." : "A szabadságkérés elküldve a vezetőnek.");
      setNote("");
      await loadOverview(year);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A szabadságkérés elküldése nem sikerült.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelRequest(id: string) {
    setCancelBusyId(id);
    setError("");
    setNotice("");
    try {
      await fetchJson(`/admin/vacations/my/requests/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      setNotice("A még el nem bírált kérés visszavonva.");
      await loadOverview(year);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kérés visszavonása nem sikerült.");
    } finally {
      setCancelBusyId("");
    }
  }

  async function markDecisionsSeen() {
    setError("");
    try {
      await fetchJson("/admin/vacations/my/requests/seen", { method: "POST" });
      await loadOverview(year);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az értesítés lezárása nem sikerült.");
    }
  }

  if (!open || typeof document === "undefined") return null;

  const summary = overview?.summary || {
    pending: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    unseen: 0,
    vacationDays: 0,
    shortDays: 0,
    shortHours: 0,
  };
  const unseenItems = (overview?.items || []).filter(
    (item) => ["approved", "rejected"].includes(item.status) && !item.employeeSeenAt,
  );

  return createPortal(
    <div className="fixed inset-0 z-[270] flex items-center justify-center bg-[#101827]/84 p-3 backdrop-blur-sm sm:p-5">
      <section className="flex max-h-[95vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/40 bg-[#303a4c] text-white shadow-[0_38px_120px_rgba(0,0,0,0.58)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#1e4f54] via-[#247b79] to-[#2a8d8b] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/28 bg-white/12 text-white">
              <CalendarDays size={24} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/62">Saját távollétek</p>
              <h2 className="mt-1 truncate text-xl">Szabadságok és elkérések</h2>
              <p className="mt-1 truncate text-xs text-white/68">{actor} • {locationName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-white/22 bg-black/10 px-3 text-xs">
              Év
              <select
                value={year}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setYear(next);
                  void loadOverview(next);
                }}
                className="h-8 rounded-lg border border-white/18 bg-[#24585c] px-2 text-xs text-white outline-none"
              >
                {Array.from({ length: 6 }, (_, index) => currentYear - index).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/22 bg-black/10 text-white hover:bg-white/12"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {unseenItems.length ? (
            <div className="mb-4 rounded-[22px] border border-emerald-200/38 bg-gradient-to-r from-emerald-600/22 to-[#2a8d8b]/22 p-4 shadow-[0_12px_34px_rgba(16,185,129,0.12)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-200/30 bg-emerald-400/14 text-emerald-50"><BellRing size={21} /></span>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-50/65">Új vezetői döntés</p>
                    <h3 className="mt-1 text-lg text-white">{unseenItems.length} szabadságkérésedet elbírálták</h3>
                    <div className="mt-2 space-y-1 text-sm text-white/72">
                      {unseenItems.slice(0, 3).map((item) => (
                        <p key={item.id}>{periodLabel(item)} • <span className={item.status === "approved" ? "text-emerald-100" : "text-rose-100"}>{statusLabel(item.status)}</span>{item.decisionNote ? ` • ${item.decisionNote}` : ""}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => void markDecisionsSeen()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200/35 bg-emerald-500/20 px-4 text-xs text-emerald-50 hover:bg-emerald-500/28"><CheckCircle2 size={16} /> Elolvastam</button>
              </div>
            </div>
          ) : null}

          {error ? <div className="mb-4 rounded-2xl border border-rose-300/35 bg-rose-500/16 px-4 py-3 text-sm text-rose-50">{error}</div> : null}
          {notice ? <div className="mb-4 rounded-2xl border border-emerald-300/30 bg-emerald-500/14 px-4 py-3 text-sm text-emerald-50">{notice}</div> : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-amber-200/24 bg-amber-500/10 p-3"><p className="text-[9px] uppercase tracking-[0.11em] text-amber-100/60">Elbírálás alatt</p><p className="mt-2 text-2xl text-white">{summary.pending}</p></div>
            <div className="rounded-2xl border border-emerald-300/24 bg-emerald-500/10 p-3"><p className="text-[9px] uppercase tracking-[0.11em] text-emerald-100/60">Elfogadott kérelmek</p><p className="mt-2 text-2xl text-white">{summary.approved}</p></div>
            <div className="rounded-2xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 p-3"><p className="text-[9px] uppercase tracking-[0.11em] text-[#d7fffd]/60">{year}. évi szabadság</p><p className="mt-2 text-2xl text-[#d7fffd]">{summary.vacationDays} nap</p></div>
            <div className="rounded-2xl border border-sky-200/20 bg-sky-500/9 p-3"><p className="text-[9px] uppercase tracking-[0.11em] text-sky-100/60">Elkérések</p><p className="mt-2 text-2xl text-white">{summary.shortDays} nap</p></div>
            <div className="rounded-2xl border border-violet-200/20 bg-violet-500/9 p-3"><p className="text-[9px] uppercase tracking-[0.11em] text-violet-100/60">Elkért idő</p><p className="mt-2 text-2xl text-white">{summary.shortHours} óra</p></div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="rounded-[24px] border border-[#7bd7d4]/22 bg-gradient-to-br from-[#35555d] to-[#374357] p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/20 text-[#d7fffd]"><CalendarClock size={21} /></span>
                <div><p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Új kérés</p><h3 className="mt-1 text-lg">Szabadság vagy elkérés igénylése</h3></div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setKind("vacation")} className={`min-h-12 rounded-xl border px-3 text-sm transition ${kind === "vacation" ? "border-[#9be9e5]/55 bg-[#2a8d8b] text-white" : "border-white/14 bg-[#293548] text-white/62 hover:bg-white/[0.08]"}`}><CalendarDays className="mr-2 inline" size={17} /> Szabadság</button>
                <button type="button" onClick={() => { setKind("short"); setDayTo(dayFrom); }} className={`min-h-12 rounded-xl border px-3 text-sm transition ${kind === "short" ? "border-[#9be9e5]/55 bg-[#2a8d8b] text-white" : "border-white/14 bg-[#293548] text-white/62 hover:bg-white/[0.08]"}`}><Clock3 className="mr-2 inline" size={17} /> Órás elkérés</button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Kezdő nap<input type="date" value={dayFrom} onChange={(event) => { const value = event.target.value; setDayFrom(value); if (kind === "short" || dayTo < value) setDayTo(value); }} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]" /></label>
                {kind === "vacation" ? <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Utolsó nap<input type="date" value={dayTo} onChange={(event) => setDayTo(event.target.value)} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]" /></label> : <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Óraszám<input type="number" min={1} max={12} value={hoursOff} onChange={(event) => setHoursOff(Number(event.target.value))} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]" /></label>}
              </div>

              <label className="mt-3 grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Megjegyzés<textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Pl. családi program, orvos, hivatalos ügy…" className="resize-none rounded-xl border border-white/16 bg-[#273243] px-3 py-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/35 focus:border-[#72d8d4]" /></label>

              <div className="mt-4 rounded-2xl border border-[#7bd7d4]/18 bg-[#2a8d8b]/10 px-3 py-3 text-xs leading-relaxed text-[#d7fffd]/72">
                A kérés csak vezetői jóváhagyás után kerül be a hivatalos szabadságnyilvántartásba. Addig elbírálás alatt marad és visszavonható.
              </div>

              <button type="button" disabled={saving} onClick={() => void submitRequest()} className="mt-4 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl border border-[#a4efeb]/50 bg-gradient-to-r from-[#2a8d8b] to-[#207572] px-4 text-sm text-white shadow-[0_10px_24px_rgba(42,141,139,0.22)] hover:brightness-110 disabled:opacity-55">{saving ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}{saving ? "Küldés…" : "Kérés elküldése"}</button>
            </section>

            <section className="rounded-[24px] border border-white/14 bg-[#374357] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3"><span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#d7fffd]"><History size={20} /></span><div><p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Kérések és döntések</p><h3 className="mt-1 text-lg">Saját előzmények</h3></div></div>
                <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/55">{overview?.items.length || 0} kérés</span>
              </div>

              <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {loading ? <div className="flex min-h-[220px] items-center justify-center gap-2 text-white/50"><Loader2 className="animate-spin" size={18} /> Betöltés…</div> : overview?.items.length ? overview.items.map((item) => (
                  <article key={item.id} className={`rounded-2xl border p-3 ${item.status === "pending" ? "border-amber-200/24 bg-amber-500/8" : "border-white/10 bg-[#293548]"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[10px] ${statusClass(item.status)}`}>{statusLabel(item.status)}</span><span className="text-[10px] text-white/38">Beküldve: {formatDateTime(item.requestedAt)}</span></div>
                        <p className="mt-2 text-sm text-white">{item.kind === "vacation" ? "Szabadság" : "Órás elkérés"} • {periodLabel(item)}</p>
                        {item.note ? <p className="mt-1.5 text-xs leading-relaxed text-white/55"><MessageSquareText className="mr-1 inline" size={13} />{item.note}</p> : null}
                        {item.decisionNote ? <p className={`mt-2 rounded-xl border px-3 py-2 text-xs ${item.status === "approved" ? "border-emerald-300/18 bg-emerald-500/8 text-emerald-50" : "border-rose-300/18 bg-rose-500/8 text-rose-50"}`}>Vezetői megjegyzés: {item.decisionNote}</p> : null}
                        {item.decidedAt ? <p className="mt-1.5 text-[10px] text-white/38">Döntés: {formatDateTime(item.decidedAt)} • {item.decidedBy || "Vezető"}</p> : null}
                      </div>
                      {item.status === "pending" ? <button type="button" disabled={cancelBusyId === item.id} onClick={() => void cancelRequest(item.id)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-rose-300/35 bg-rose-500/12 px-2.5 text-[11px] text-rose-50 hover:bg-rose-500/20 disabled:opacity-50">{cancelBusyId === item.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />} Visszavonás</button> : null}
                    </div>
                  </article>
                )) : <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-center text-white/42"><CalendarCheck2 size={32} /><p className="mt-2 text-sm">Még nincs szabadságkérelmed ebben az évben.</p></div>}
              </div>
            </section>
          </div>

          <section className="mt-4 rounded-[24px] border border-white/14 bg-[#374357] p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Hivatalosan rögzített távollétek</p><h3 className="mt-1 text-lg">{year}. évi elfogadott napok</h3></div><span className="rounded-full border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 px-2.5 py-1 text-[10px] text-[#d7fffd]">{overview?.events.length || 0} esemény</span></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {overview?.events.length ? overview.events.slice(0, 24).map((event) => (
                <div key={event.id} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-sm text-white">{formatDate(event.day)}</span>{event.kind === "vacation" ? <CheckCircle2 size={16} className="text-emerald-300" /> : <Clock3 size={16} className="text-sky-300" />}</div>
                  <p className="mt-1 text-xs text-white/52">{event.kind === "vacation" ? "Szabadság" : `${event.hoursOff || 0} óra elkérés`}</p>
                  {event.note ? <p className="mt-2 truncate text-[10px] text-white/38">{event.note}</p> : null}
                </div>
              )) : <div className="col-span-full flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-white/12 text-sm text-white/42">Ebben az évben még nincs hivatalosan rögzített távollét.</div>}
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-end border-t border-white/12 bg-[#293548] px-5 py-4">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm text-white hover:bg-white/[0.09]"><X size={17} /> Bezárás</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
