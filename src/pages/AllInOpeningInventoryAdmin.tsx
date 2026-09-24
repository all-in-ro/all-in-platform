import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  History,
  Loader2,
  PackageSearch,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  apiAifApplyOpeningInventory,
  apiAifCancelOpeningInventory,
  apiAifCloseOpeningInventory,
  apiAifGetOpeningInventory,
  apiAifListOpeningInventorySessions,
  apiAifMeta,
  apiAifReconcileOpeningInventoryUnknown,
  apiAifReopenOpeningInventory,
  apiAifStartOpeningInventory,
  type AifLocation,
  type AifOpeningInventoryAdminDetail,
  type AifOpeningInventoryAdminLine,
  type AifOpeningInventorySession,
} from "../lib/aif/api";

type Props = { actor?: string; role?: string };
type LineFilter = "all" | "missing" | "awaiting" | "untracked" | "system" | "ok";
type Notice = { tone: "success" | "error" | "info"; text: string };
type ConfirmAction = "close" | "reopen" | "apply" | "cancel" | null;

const LOCATION_STORAGE_KEY = "allin:opening-inventory:location";

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return new Intl.NumberFormat("hu-HU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n(value));
}

function qty(value: unknown) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(n(value));
}

function localDateInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDateTime(value?: string | null) {
  if (!value) return "–";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}

function statusLabel(status?: string) {
  if (status === "draft") return "Előkészítve";
  if (status === "counting") return "Számolás alatt";
  if (status === "review") return "Ellenőrzés";
  if (status === "applied") return "Készletre alkalmazva";
  if (status === "cancelled") return "Megszakítva";
  return status || "–";
}

function lineTone(line: AifOpeningInventoryAdminLine) {
  if (line.status === "missing") return "border-red-300/28 bg-red-500/8";
  if (line.status === "awaiting_known") return "border-amber-200/24 bg-amber-500/7";
  if (line.status === "untracked") return "border-sky-200/22 bg-sky-500/7";
  if (line.status === "ok") return "border-[#8ce7e2]/24 bg-[#108D8B]/8";
  return "border-white/10 bg-white/[0.025]";
}

function lineStatusLabel(line: AifOpeningInventoryAdminLine) {
  if (line.status === "missing") return "BIZTOS HIÁNY";
  if (line.status === "awaiting_known") return "MÉG NEM TALÁLTÁK";
  if (line.status === "untracked") return "RÉGI / NEM NYILVÁNTARTOTT";
  if (line.status === "ok") return "RENDBEN";
  return "MÉG NEM SZÁMOLT";
}

export default function AllInOpeningInventoryAdmin({ actor = "ADMIN" }: Props) {
  const [locations, setLocations] = useState<AifLocation[]>([]);
  const [location, setLocation] = useState("");
  const [sessions, setSessions] = useState<AifOpeningInventorySession[]>([]);
  const [detail, setDetail] = useState<AifOpeningInventoryAdminDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LineFilter>("all");
  const [salesTrustedFrom, setSalesTrustedFrom] = useState(localDateInput());
  const [legacyRetailValue, setLegacyRetailValue] = useState("");
  const [note, setNote] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const activeSession = useMemo(
    () => sessions.find((item) => ["draft", "counting", "review"].includes(item.status)) || null,
    [sessions],
  );

  const loadSessions = useCallback(async (locationValue: string, silent = false) => {
    if (!locationValue) return;
    if (!silent) setLoading(true);
    try {
      const response = await apiAifListOpeningInventorySessions({ location: locationValue, limit: 30 });
      setSessions(response.items || []);
      const active = (response.items || []).find((item) => ["draft", "counting", "review"].includes(item.status));
      if (active) {
        const full = await apiAifGetOpeningInventory(active.id);
        setDetail(full);
      } else if (detail && detail.session.location_code !== locationValue && detail.session.location_id !== locationValue) {
        setDetail(null);
      }
      setLastRefresh(new Date());
      if (!silent) setNotice(null);
    } catch (error) {
      if (!silent) setNotice({ tone: "error", text: error instanceof Error ? error.message : "A nyitó leltár adatai nem tölthetők be." });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [detail]);

  const refreshDetail = useCallback(async (silent = false) => {
    const id = detail?.session.id || activeSession?.id;
    if (!id) return;
    try {
      const response = await apiAifGetOpeningInventory(id);
      setDetail(response);
      setLastRefresh(new Date());
      if (!silent) setNotice({ tone: "success", text: "Nyitó leltár frissítve." });
    } catch (error) {
      if (!silent) setNotice({ tone: "error", text: error instanceof Error ? error.message : "A nyitó leltár frissítése nem sikerült." });
    }
  }, [activeSession?.id, detail?.session.id]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const meta = await apiAifMeta();
        const activeLocations = (meta.locations || []).filter((item) => item.is_active !== false);
        setLocations(activeLocations);
        const kezdi = activeLocations.find((item) => item.code === "magazin_targu_secuiesc");
        const first = kezdi || activeLocations.find((item) => item.location_type === "shop") || activeLocations[0];
        const next = first?.code || first?.id || "";
        setLocation(next);
      } catch (error) {
        setNotice({ tone: "error", text: error instanceof Error ? error.message : "A helyszínek nem tölthetők be." });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!location) return;
    setDetail(null);
    void loadSessions(location);
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = detail?.session.id || activeSession?.id;
    if (!id || !["draft", "counting", "review"].includes(detail?.session.status || activeSession?.status || "")) return;
    const timer = window.setInterval(() => void refreshDetail(true), 4000);
    return () => window.clearInterval(timer);
  }, [activeSession?.id, activeSession?.status, detail?.session.id, detail?.session.status, refreshDetail]);

  useEffect(() => {
    if (!confirmAction) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setConfirmAction(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmAction, busy]);

  const lines = detail?.lines || [];
  const unresolvedUnknown = (detail?.unknown || []).filter((item) => !item.resolved_at && n(item.qty) > 0);
  const summary = detail?.summary;

  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((line) => {
      if (filter === "missing" && line.status !== "missing") return false;
      if (filter === "awaiting" && !["awaiting_known", "uncounted"].includes(line.status)) return false;
      if (filter === "untracked" && line.status !== "untracked") return false;
      if (filter === "system" && Math.abs(n(line.system_correction_qty)) < 0.0001) return false;
      if (filter === "ok" && line.status !== "ok") return false;
      if (!q) return true;
      const haystack = [
        line.product.title,
        line.product.brandName,
        line.product.barcode,
        line.product.internalSku,
        line.product.modelCode,
        line.product.productCode,
        line.product.colorName,
        line.product.size,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [filter, lines, search]);

  async function startInventory() {
    if (!location || !salesTrustedFrom) {
      setNotice({ tone: "error", text: "A helyszín és az eladások kezdő dátuma kötelező." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await apiAifStartOpeningInventory({
        location,
        salesTrustedFrom,
        legacyRetailValue: legacyRetailValue.trim() ? legacyRetailValue.trim().replace(",", ".") : null,
        note: note.trim() || null,
      });
      setDetail(response);
      setNotice({ tone: "success", text: "Nyitó leltár elindítva. A csippogtatás és az eladás mehet párhuzamosan." });
      await loadSessions(location, true);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "A nyitó leltár indítása nem sikerült." });
    } finally {
      setBusy(false);
    }
  }

  async function reconcileUnknown() {
    if (!detail) return;
    setBusy(true);
    try {
      const response = await apiAifReconcileOpeningInventoryUnknown(detail.session.id);
      setDetail(response);
      setNotice({ tone: response.resolution?.remaining ? "info" : "success", text: response.resolution?.remaining ? `${response.resolution.resolved} kód rendezve, ${response.resolution.remaining} továbbra is ellenőrzendő.` : "Az ismeretlen kódok egyeztetése kész." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Az ismeretlen kódok egyeztetése nem sikerült." });
    } finally {
      setBusy(false);
    }
  }

  async function runConfirmedAction() {
    if (!detail || !confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    setBusy(true);
    setNotice(null);
    try {
      let response: any = null;
      if (action === "close") response = await apiAifCloseOpeningInventory(detail.session.id);
      if (action === "reopen") response = await apiAifReopenOpeningInventory(detail.session.id);
      if (action === "apply") response = await apiAifApplyOpeningInventory(detail.session.id);
      if (action === "cancel") {
        await apiAifCancelOpeningInventory(detail.session.id);
        setDetail(null);
        setNotice({ tone: "success", text: "A nyitó leltár megszakítva. A készlethez nem nyúlt." });
        await loadSessions(location, true);
        return;
      }
      if (response) setDetail(response);
      if (action === "close") setNotice({ tone: "success", text: "A bolti beolvasás lezárva. Az üzlet továbbra is árulhat." });
      if (action === "reopen") setNotice({ tone: "success", text: "A leltár újranyitva. Kézdin újra lehet csippogtatni." });
      if (action === "apply") setNotice({ tone: "success", text: "A nyitó leltár készletre alkalmazva, a közbeni mozgásokkal együtt." });
      await loadSessions(location, true);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "A művelet nem sikerült." });
    } finally {
      setBusy(false);
    }
  }

  function openShopView() {
    if (!location) return;
    try { window.sessionStorage.setItem(LOCATION_STORAGE_KEY, location); } catch {}
    window.location.hash = "openinginventoryshop";
  }

  function openHistorySession(item: AifOpeningInventorySession) {
    setBusy(true);
    void apiAifGetOpeningInventory(item.id)
      .then((response) => { setDetail(response); setNotice(null); })
      .catch((error) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "A korábbi leltár nem tölthető be." }))
      .finally(() => setBusy(false));
  }

  const activeDetail = detail && ["draft", "counting", "review"].includes(detail.session.status);

  return (
    <main className="min-h-screen bg-[#4b5362] px-3 py-4 text-white sm:px-4 sm:py-5">
      <div className="mx-auto max-w-[1580px] space-y-3">
        <header className="rounded-[22px] border border-white/16 bg-[#303a4c] px-4 py-3 shadow-[0_16px_42px_rgba(15,23,42,0.24)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#8ce7e2]/38 bg-[#108D8B]/20 text-[#d7fffd]"><ShieldCheck size={24} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/45">ALL IN • helyreállító készlet</p>
              <h1 className="mt-1 text-2xl font-normal">Kézdi nyitó leltár</h1>
              <p className="mt-1 text-xs text-white/52">Kézdivásárhely • {actor}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { window.location.hash = "home"; }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/18 bg-[#354153] px-3 text-xs text-white hover:bg-[#405066]"><ArrowLeft size={15} /> Főmenü</button>
              <button type="button" onClick={openShopView} disabled={!activeDetail} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#8ce7e2]/35 bg-[#108D8B] px-3 text-xs text-white hover:bg-[#149b98] disabled:opacity-40"><Eye size={15} /> Bolti nézet</button>
            </div>
          </div>
        </header>

        {notice ? (
          <div className={`rounded-xl border px-4 py-3 text-sm ${notice.tone === "success" ? "border-[#8ce7e2]/32 bg-[#108D8B]/17 text-[#d7fffd]" : notice.tone === "info" ? "border-amber-200/28 bg-amber-500/10 text-amber-50" : "border-red-300/36 bg-red-600/18 text-red-50"}`}>
            {notice.text}
          </div>
        ) : null}

        <section className="rounded-[20px] border border-white/14 bg-[#354153] p-3 shadow-lg">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)] lg:items-end">
            <label className="grid gap-1.5 text-xs text-white/58">
              Helyszín
              <select value={location} onChange={(event) => setLocation(event.target.value)} disabled={Boolean(activeDetail)} className="h-11 rounded-xl border border-white/16 bg-[#293649] px-3 text-sm text-white outline-none focus:border-[#8ce7e2]/55 disabled:opacity-55">
                <option value="">Válassz üzletet</option>
                {locations.map((item) => <option key={item.id} value={item.code || item.id}>{item.name}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-white/42">
              <span>{lastRefresh ? `Utolsó frissítés: ${lastRefresh.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}</span>
              <button type="button" onClick={() => activeDetail ? void refreshDetail() : void loadSessions(location)} disabled={busy || !location} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-3 text-xs text-white hover:bg-white/[0.09] disabled:opacity-45">
                <RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Frissítés
              </button>
            </div>
          </div>
        </section>

        {!activeDetail && (!detail || ["applied", "cancelled"].includes(detail.session.status)) ? (
          <section className="rounded-[22px] border border-white/14 bg-[#354153] p-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#8ce7e2]/30 bg-[#108D8B]/16 text-[#d7fffd]"><Play size={20} /></span>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.13em] text-white/42">Első nagy leltár</p>
                  <h2 className="mt-1 text-xl font-normal">Új nyitó leltár</h2>
                </div>
              </div>
              <span className="rounded-xl border border-[#8ce7e2]/26 bg-[#108D8B]/12 px-3 py-2 text-[11px] text-[#d7fffd]">Az üzlet közben is árulhat</span>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[220px_260px_minmax(260px,1fr)_auto] lg:items-end">
              <label className="grid gap-1.5 text-xs text-white/58">
                Valódi eladások ettől
                <input type="date" value={salesTrustedFrom} onChange={(event) => setSalesTrustedFrom(event.target.value)} className="h-11 rounded-xl border border-white/16 bg-[#293649] px-3 text-sm text-white outline-none focus:border-[#8ce7e2]/55" />
              </label>
              <label className="grid gap-1.5 text-xs text-white/58">
                Papír szerinti készletérték (RON)
                <input value={legacyRetailValue} onChange={(event) => setLegacyRetailValue(event.target.value.replace(/[^0-9.,]/g, ""))} inputMode="decimal" placeholder="pl. 190000" className="h-11 rounded-xl border border-white/16 bg-[#293649] px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#8ce7e2]/55" />
              </label>
              <label className="grid gap-1.5 text-xs text-white/58">
                Megjegyzés
                <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="pl. első Kézdi nyitó leltár" className="h-11 rounded-xl border border-white/16 bg-[#293649] px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#8ce7e2]/55" />
              </label>
              <button type="button" onClick={() => void startInventory()} disabled={busy || !location || !salesTrustedFrom} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#8ce7e2]/40 bg-[#108D8B] px-5 text-sm text-white shadow-[0_10px_24px_rgba(16,141,139,0.22)] hover:bg-[#149b98] disabled:opacity-45">
                {busy ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />} Leltár indítása
              </button>
            </div>

            <div className="mt-3 text-[11px] text-white/46">
              Több napon át folytatható. A közben történt eladásokat és készletmozgásokat a rendszer automatikusan rávezeti a leltárra.
            </div>
          </section>
        ) : null}

        {detail ? (
          <>
            <section className="rounded-[22px] border border-white/14 bg-[#354153] p-4 shadow-lg">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/14 bg-white/[0.05] px-2.5 py-1 text-[10px] text-white/60">{detail.session.code}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] ${detail.session.status === "review" ? "border-amber-200/30 bg-amber-500/12 text-amber-50" : detail.session.status === "applied" ? "border-[#8ce7e2]/34 bg-[#108D8B]/18 text-[#d7fffd]" : detail.session.status === "cancelled" ? "border-red-300/28 bg-red-500/12 text-red-50" : "border-sky-200/26 bg-sky-500/10 text-sky-50"}`}>{statusLabel(detail.session.status)}</span>
                    {activeDetail ? <span className="rounded-full border border-[#8ce7e2]/28 bg-[#108D8B]/12 px-2.5 py-1 text-[10px] text-[#d7fffd]">ELADÁS MEHET</span> : null}
                  </div>
                  <h2 className="mt-2 text-xl font-normal">{detail.session.title}</h2>
                  <p className="mt-1 text-xs text-white/45">{detail.session.location_name || detail.session.location?.name || location} • indítva: {formatDateTime(detail.session.started_at || detail.session.startedAt)}</p>
                </div>
                {activeDetail ? (
                  <div className="flex flex-wrap gap-2">
                    {detail.session.status === "review" ? (
                      <button type="button" onClick={() => setConfirmAction("reopen")} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-3 text-xs text-white hover:bg-white/[0.09]"><RotateCcw size={15} /> Újranyitás</button>
                    ) : (
                      <button type="button" onClick={() => setConfirmAction("close")} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-200/30 bg-amber-500/12 px-3 text-xs text-amber-50 hover:bg-amber-500/18"><ClipboardCheck size={15} /> Beolvasás lezárása</button>
                    )}
                    {detail.session.status === "review" ? (
                      <button type="button" onClick={() => setConfirmAction("apply")} disabled={busy || unresolvedUnknown.length > 0} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#8ce7e2]/40 bg-[#108D8B] px-3 text-xs text-white hover:bg-[#149b98] disabled:opacity-45"><CheckCircle2 size={15} /> Készlet alkalmazása</button>
                    ) : null}
                    <button type="button" onClick={() => setConfirmAction("cancel")} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-300/32 bg-red-600/18 px-3 text-xs text-red-50 hover:bg-red-600/26"><X size={15} /> Megszakítás</button>
                  </div>
                ) : null}
              </div>
            </section>

            {summary ? (
              <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
                <Stat label="Leltár szerint most" value={`${qty(summary.counted_qty)} db`} hint={`${qty(summary.counted_lines)} tétel`} />
                <Stat label="Igazolható minimum" value={`${qty(summary.known_min_qty)} db`} hint={`élő mozgás ${n(summary.live_net_qty) > 0 ? "+" : ""}${qty(summary.live_net_qty || 0)} db`} tone="blue" />
                <Stat label="Biztos hiány" value={`${qty(summary.definite_missing_qty)} db`} hint={`${money(summary.definite_missing_retail_value)} RON`} tone="red" />
                <Stat label="Még nem talált minimum" value={`${qty(summary.unseen_known_min_qty)} db`} hint={detail.session.status === "review" ? "lezáráskor ez már 0" : "még keresendő"} tone="amber" />
                <Stat label="Régi / nem nyilvántartott" value={`${qty(summary.untracked_qty)} db`} hint={`${money(summary.untracked_retail_value)} RON`} tone="green" />
                <Stat label="Leltárérték most" value={`${money(summary.counted_retail_value)} RON`} hint={`korrekció: ${money(summary.system_correction_retail_value)} RON`} />
                <Stat label="Könyv szerinti becslés" value={summary.book_expected_retail_value === null || summary.book_expected_retail_value === undefined ? "–" : `${money(summary.book_expected_retail_value)} RON`} hint={summary.book_diff_retail_value === null || summary.book_diff_retail_value === undefined ? "régi érték nélkül nincs összevetés" : `eltérés: ${money(summary.book_diff_retail_value)} RON`} tone={summary.book_diff_retail_value !== null && summary.book_diff_retail_value !== undefined && n(summary.book_diff_retail_value) < 0 ? "red" : "neutral"} />
              </section>
            ) : null}

            {unresolvedUnknown.length ? (
              <section className="rounded-[22px] border border-amber-200/28 bg-[#4b4450] p-4 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.13em] text-amber-100/55">Ellenőrzendő kódok</p>
                    <h3 className="mt-1 text-lg font-normal">{unresolvedUnknown.length} ismeretlen vagy ütköző vonalkód</h3>
                  </div>
                  <button type="button" onClick={() => void reconcileUnknown()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-200/28 bg-amber-500/12 px-3 text-xs text-amber-50 hover:bg-amber-500/18 disabled:opacity-45"><RefreshCw size={15} /> Újraazonosítás</button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {unresolvedUnknown.map((item) => (
                    <div key={item.id} className="rounded-xl border border-white/12 bg-black/10 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm text-white">{item.scan_code}</span><span className="rounded-lg bg-amber-500/14 px-2 py-1 text-xs text-amber-50">{qty(item.qty)} db</span></div>
                      <p className="mt-1 text-[10px] text-white/42">utolsó: {formatDateTime(item.last_scanned_at)} • {item.last_scanned_by || "–"}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="overflow-hidden rounded-[22px] border border-white/14 bg-[#354153] shadow-lg">
              <div className="border-b border-white/10 p-3">
                <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
                  <label className="relative block">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/38" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Keresés termékre, vonalkódra, kódra…" className="h-10 w-full rounded-xl border border-white/15 bg-[#293649] pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#8ce7e2]/55" />
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      ["all", "Mind"], ["missing", "Biztos hiány"], ["awaiting", "Még nem talált"], ["untracked", "Régi készlet"], ["system", "Korrekció"], ["ok", "Rendben"],
                    ] as Array<[LineFilter, string]>).map(([value, label]) => (
                      <button key={value} type="button" onClick={() => setFilter(value)} className={`h-10 rounded-xl border px-3 text-[11px] ${filter === value ? "border-[#8ce7e2]/45 bg-[#108D8B] text-white" : "border-white/14 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]"}`}>{label}</button>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-white/38">{filteredLines.length} / {lines.length} tétel • a közbeni eladások és mozgások automatikusan beleszámítanak.</p>
              </div>

              <div className="max-h-[62vh] overflow-auto">
                <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-[#293548] text-[10px] uppercase tracking-[0.07em] text-white/48">
                    <tr>
                      <th className="px-3 py-2.5">Termék</th>
                      <th className="px-3 py-2.5 text-right">Rendszer most</th>
                      <th className="px-3 py-2.5 text-right">Igazolt nettó</th>
                      <th className="px-3 py-2.5 text-right">Minimum</th>
                      <th className="px-3 py-2.5 text-right">Leltár szerint</th>
                      <th className="px-3 py-2.5 text-right">Biztos hiány</th>
                      <th className="px-3 py-2.5 text-right">Régi / plusz</th>
                      <th className="px-3 py-2.5 text-right">Készletkorrekció</th>
                      <th className="px-3 py-2.5">Állapot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLines.map((line) => (
                      <tr key={line.id} className={`border-t ${lineTone(line)}`}>
                        <td className="px-3 py-2.5">
                          <div className="grid grid-cols-[46px_1fr] items-center gap-2">
                            <div className="grid h-12 w-11 place-items-center overflow-hidden rounded-lg border border-white/12 bg-white">
                              {line.product.imageUrl ? <img src={line.product.imageUrl} alt="" className="h-full w-full object-contain p-0.5" /> : <PackageSearch size={18} className="text-slate-500" />}
                            </div>
                            <div className="min-w-0">
                              <p className="max-w-[360px] truncate text-sm text-white">{line.product.title}</p>
                              <p className="mt-1 max-w-[430px] truncate text-[10px] text-white/43">{[line.product.brandName, line.product.colorName, line.product.size, line.product.productCode, line.product.barcode].filter(Boolean).join(" • ")}</p>
                              {line.last_scanned_at ? <p className="mt-1 text-[9px] text-white/32">{line.last_scanned_by || "–"} • {formatDateTime(line.last_scanned_at)}</p> : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-white/70">{qty(line.current_system_qty ?? line.system_qty_start)}</td>
                        <td className={`px-3 py-2.5 text-right ${n(line.trusted_net_qty) < 0 ? "text-amber-100" : "text-white/70"}`}>{n(line.trusted_net_qty) > 0 ? "+" : ""}{qty(line.trusted_net_qty)}</td>
                        <td className="px-3 py-2.5 text-right text-sky-100">{qty(line.known_min_qty)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {line.counted_qty === null || line.counted_qty === undefined ? "–" : (
                            <>
                              <div className="text-base text-white">{qty(line.counted_qty)}</div>
                              {Math.abs(n(line.movement_after_count_qty)) > 0.0001 ? (
                                <div className="mt-0.5 text-[9px] text-[#bdf8f5]">
                                  számolt {qty(line.physical_counted_qty)} • azóta {n(line.movement_after_count_qty) > 0 ? "+" : ""}{qty(line.movement_after_count_qty)}
                                </div>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-red-100">{line.definite_missing_qty === null || line.definite_missing_qty === undefined ? "–" : qty(line.definite_missing_qty)}</td>
                        <td className="px-3 py-2.5 text-right text-[#bdf8f5]">{line.untracked_qty === null || line.untracked_qty === undefined ? "–" : qty(line.untracked_qty)}</td>
                        <td className={`px-3 py-2.5 text-right ${n(line.system_correction_qty) < 0 ? "text-red-100" : n(line.system_correction_qty) > 0 ? "text-[#bdf8f5]" : "text-white/50"}`}>{line.system_correction_qty === null || line.system_correction_qty === undefined ? "–" : `${n(line.system_correction_qty) > 0 ? "+" : ""}${qty(line.system_correction_qty)}`}</td>
                        <td className="px-3 py-2.5"><span className="rounded-lg border border-white/12 bg-black/10 px-2 py-1 text-[9px] text-white/72">{lineStatusLabel(line)}</span></td>
                      </tr>
                    ))}
                    {!filteredLines.length ? <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-white/40">Nincs tétel ebben a szűrésben.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        {sessions.length ? (
          <section className="rounded-[22px] border border-white/14 bg-[#354153] p-3 shadow-lg">
            <div className="flex items-center gap-2 px-1 pb-2"><History size={15} className="text-white/46" /><span className="text-xs text-white/58">Korábbi / aktuális nyitó leltárak</span></div>
            <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
              {sessions.slice(0, 9).map((item) => (
                <button key={item.id} type="button" onClick={() => openHistorySession(item)} className="rounded-xl border border-white/12 bg-white/[0.035] px-3 py-2.5 text-left hover:bg-white/[0.07]">
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-sm text-white">{item.title}</span><span className="shrink-0 text-[9px] text-white/45">{statusLabel(item.status)}</span></div>
                  <div className="mt-1 text-[10px] text-white/36">{item.code} • {formatDateTime(item.started_at || item.created_at)}</div>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {confirmAction && detail && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[900] grid place-items-center bg-slate-950/78 px-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setConfirmAction(null); }}>
          <section className="w-full max-w-[560px] overflow-hidden rounded-[24px] border border-white/18 bg-[#303a4c] shadow-[0_30px_100px_rgba(0,0,0,0.58)]">
            <header className={`flex items-start justify-between gap-3 border-b px-4 py-3 ${confirmAction === "apply" || confirmAction === "close" ? "border-amber-200/20 bg-[#3d4656]" : confirmAction === "cancel" ? "border-red-300/22 bg-[#4a3941]" : "border-white/10 bg-[#3d4656]"}`}>
              <div className="flex gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/14 bg-white/[0.06]">{confirmAction === "apply" ? <CheckCircle2 size={19} /> : confirmAction === "cancel" ? <AlertTriangle size={19} /> : <ClipboardCheck size={19} />}</span>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Nyitó leltár</p>
                  <h2 className="mt-1 text-lg font-normal">{confirmAction === "close" ? "Beolvasás lezárása" : confirmAction === "reopen" ? "Leltár újranyitása" : confirmAction === "apply" ? "Készlet végleges alkalmazása" : "Leltár megszakítása"}</h2>
                </div>
              </div>
              <button type="button" onClick={() => setConfirmAction(null)} disabled={busy} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/14 bg-white/[0.05] hover:bg-white/[0.1]"><X size={16} /></button>
            </header>
            <div className="space-y-3 p-4 text-sm leading-relaxed text-white/70">
              {confirmAction === "close" ? <p>A bolti beolvasás leáll. Az addig nem beolvasott, de rendszerből ismert tételeket 0 talált darabbal vesszük figyelembe az ellenőrzéshez.</p> : null}
              {confirmAction === "reopen" ? <p>A lezáráskor automatikusan 0-ra tett, nem talált sorok újra „még nem számolt” állapotba kerülnek, és Kézdin folytatható a csippogtatás.</p> : null}
              {confirmAction === "apply" ? <p>A megszámolt mennyiségekre rávezetjük a közben történt eladásokat és készletmozgásokat, majd ezt alkalmazzuk Kézdivásárhely készletére. Minden korrekció naplózódik.</p> : null}
              {confirmAction === "cancel" ? <p>A nyitó leltár megszakad, a beolvasások megmaradnak auditként, de a készlethez nem nyúlunk.</p> : null}
              <div className="rounded-xl border border-white/12 bg-[#283446] px-3 py-2 text-xs text-white/55">{detail.session.title} • {detail.session.location_name || location} • talált {qty(detail.summary.counted_qty)} db</div>
            </div>
            <footer className="flex justify-end gap-2 border-t border-white/10 bg-[#293548] px-4 py-3">
              <button type="button" onClick={() => setConfirmAction(null)} disabled={busy} className="h-10 rounded-xl border border-white/15 bg-white/[0.05] px-4 text-xs text-white hover:bg-white/[0.09]">Mégse</button>
              <button type="button" onClick={() => void runConfirmedAction()} disabled={busy} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-xs text-white disabled:opacity-45 ${confirmAction === "cancel" ? "border-red-300/32 bg-red-600/24 hover:bg-red-600/32" : "border-[#8ce7e2]/38 bg-[#108D8B] hover:bg-[#149b98]"}`}>{busy ? <Loader2 className="animate-spin" size={15} /> : null}{confirmAction === "apply" ? "Készlet alkalmazása" : confirmAction === "close" ? "Lezárás" : confirmAction === "reopen" ? "Újranyitás" : "Megszakítás"}</button>
            </footer>
          </section>
        </div>,
        document.body,
      ) : null}
    </main>
  );
}

function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint?: string; tone?: "neutral" | "red" | "green" | "blue" | "amber" }) {
  const cls = tone === "red" ? "border-red-300/25 bg-red-500/8" : tone === "green" ? "border-[#8ce7e2]/28 bg-[#108D8B]/10" : tone === "blue" ? "border-sky-200/22 bg-sky-500/8" : tone === "amber" ? "border-amber-200/23 bg-amber-500/8" : "border-white/13 bg-[#354153]";
  return (
    <div className={`rounded-[18px] border p-3 shadow-sm ${cls}`}>
      <div className="text-[9px] uppercase tracking-[0.1em] text-white/40">{label}</div>
      <div className="mt-2 text-xl font-normal text-white">{value}</div>
      {hint ? <div className="mt-1 text-[10px] text-white/42">{hint}</div> : null}
    </div>
  );
}
