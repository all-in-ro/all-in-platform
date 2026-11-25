import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle, Archive, ArrowLeft, ArrowUpRight, CalendarDays, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Download, Eye, Facebook, FileText, Gift,
  History, Info, Loader2, Lock, Pencil, Play, Plus, Printer, RefreshCw, Search,
  ShieldCheck, Sparkles, Trophy, Upload, Users, X,
} from "lucide-react";
import {
  drawCsv, formatGiveawayActor, formatGiveawayDate, giveawayPrintHtml,
  parseParticipantInput, safeHttpsUrl,
  type GiveawayDetail, type GiveawayDraw, type GiveawayGame,
  type GiveawayParticipant, type GiveawaySelection, type GiveawayStatus,
} from "./AllInGiveaways.helpers";
import "./AllInGiveaways.css";

const API = `${String((import.meta as any).env?.VITE_API_BASE || "/api").replace(/\/+$/, "")}/aif/giveaways`;
const STATUS: Record<GiveawayStatus, { label: string; short: string }> = {
  draft: { label: "Előkészítés", short: "Piszkozat" },
  open: { label: "Nyitott", short: "Nyitott" },
  locked: { label: "Lezárt lista", short: "Sorsolásra kész" },
  drawn: { label: "Kisorsolva", short: "Kisorsolva" },
  archived: { label: "Archivált", short: "Archivált" },
};
const numberText = (value: number) => new Intl.NumberFormat("hu-HU").format(value || 0);
const isEditable = (game: GiveawayGame) => game.status === "draft" || game.status === "open";

class ApiProblem extends Error {
  status: number;
  code?: string;
  names: string[];
  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = "ApiProblem";
    this.status = status;
    this.code = typeof data?.code === "string" ? data.code : undefined;
    this.names = Array.isArray(data?.names) ? data.names.filter((name: unknown) => typeof name === "string") : [];
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
  try {
    const response = await fetch(`${API}${path}`, {
      method: options.method || "GET", credentials: "include", signal: controller.signal,
      headers: { Accept: "application/json", ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    if (response.status === 401) throw new ApiProblem("A bejelentkezés lejárt. Jelentkezz be újra, majd nyisd meg a játékot; az elmentett adatok megmaradnak.", 401, null);
    if (response.status === 403) throw new ApiProblem("Ehhez a művelethez adminisztrátori vagy titkársági jogosultság szükséges.", 403, null);
    let data: any;
    try { data = await response.json(); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      throw new ApiProblem("A szerver nem értelmezhető választ küldött. Frissítsd az adatokat, mielőtt újra próbálod.", response.status, null);
    }
    if (!response.ok || data?.ok === false) {
      throw new ApiProblem(typeof data?.error === "string" ? data.error : "A művelet nem sikerült. Próbáld újra az adatok frissítése után.", response.status, data);
    }
    return data as T;
  } catch (error) {
    if (timedOut) throw new Error("A szerver válasza késik. A művelet közben elmentődhetett; ellenőrizd a mentett állapotot az újrapróbálás előtt.");
    if ((error as Error)?.name === "AbortError") throw error;
    if (error instanceof ApiProblem) throw error;
    throw new Error("Nem sikerült elérni a szervert. Ellenőrizd a kapcsolatot, majd frissítsd az adatokat.");
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

function newRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function StatusBadge({ status }: { status: GiveawayStatus }) {
  return <span className={`aif-gw-status aif-gw-status--${status}`}><span aria-hidden="true" />{STATUS[status]?.short || status}</span>;
}

function PrizeVisual({ imageUrl, title, large = false }: { imageUrl?: string | null; title: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);
  const url = safeHttpsUrl(imageUrl);
  return <div className={`aif-gw-prize-visual${large ? " aif-gw-prize-visual--large" : ""}`}>
    {url && !failed ? <img src={url} alt={title} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> :
      <div className="aif-gw-trophy-art" aria-hidden="true"><span className="aif-gw-trophy-orbit" /><span className="aif-gw-trophy-orbit aif-gw-trophy-orbit--two" /><Trophy strokeWidth={1.25} /><span className="aif-gw-trophy-pedestal" /><i /><b /></div>}
  </div>;
}

function Alert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "info" | "success" }) {
  return <div className={`aif-gw-alert aif-gw-alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
    {tone === "success" ? <CheckCircle2 size={18} /> : tone === "info" ? <Info size={18} /> : <AlertCircle size={18} />}<div>{children}</div>
  </div>;
}

function Modal({ title, eyebrow, children, onClose, busy = false, wide = false, full = false }: {
  title: string; eyebrow?: string; children: React.ReactNode; onClose: () => void;
  busy?: boolean; wide?: boolean; full?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const target = panel.current;
    const focusables = () => Array.from(target?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]') || [])
      .filter((element) => !element.hidden && element.getClientRects().length > 0);
    const focusTimer = window.setTimeout(() => (focusables()[0] || target)?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (!busyRef.current) closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = focusables();
      if (!elements.length) { event.preventDefault(); target?.focus(); return; }
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !target?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !target?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(<div className={`aif-gw-root aif-gw-modal-backdrop${full ? " aif-gw-modal-backdrop--full" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`aif-gw-modal${wide ? " aif-gw-modal--wide" : ""}${full ? " aif-gw-modal--full" : ""}`}>
      <header className="aif-gw-modal-header"><div>{eyebrow && <p className="aif-gw-eyebrow">{eyebrow}</p>}<h2 id={titleId}>{title}</h2></div><button type="button" className="aif-gw-icon-btn" onClick={onClose} disabled={busy} aria-label="Ablak bezárása"><X size={21} /></button></header>
      {children}
    </div>
  </div>, document.body);
}

function SubmitButton({ busy, children, className = "aif-gw-btn aif-gw-btn--primary", disabled = false }: { busy: boolean; children: React.ReactNode; className?: string; disabled?: boolean }) {
  return <button type="submit" className={className} disabled={busy || disabled}>{busy && <Loader2 size={17} className="aif-gw-spin" />}{children}</button>;
}

type EditableFields = {
  title: string; description: string; prize_title: string; prize_image_url: string;
  winners_count: number; reserves_count: number; closes_at_local: string; facebook_post_url: string;
};

function GameEditor({ game, onClose, onSaved }: { game: GiveawayGame | null; onClose: () => void; onSaved: (game: GiveawayGame) => void }) {
  const [form, setForm] = useState<EditableFields>(() => ({
    title: game?.title || "", description: game?.description || "", prize_title: game?.prize_title || "",
    prize_image_url: game?.prize_image_url || "", winners_count: game?.winners_count || 1,
    reserves_count: game?.reserves_count ?? 1, closes_at_local: game?.closes_at_local || "",
    facebook_post_url: game?.facebook_post_url || "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const change = (key: keyof EditableFields, value: string | number) => setForm((previous) => ({ ...previous, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    setError("");
    if (form.prize_image_url && !safeHttpsUrl(form.prize_image_url)) { setError("A nyereményképhez érvényes HTTPS-hivatkozást adj meg."); return; }
    if (form.facebook_post_url) {
      const url = safeHttpsUrl(form.facebook_post_url);
      if (!url || !["facebook.com", "fb.com", "fb.watch"].some((host) => new URL(url).hostname === host || new URL(url).hostname.endsWith(`.${host}`))) { setError("A bejegyzéshez érvényes Facebook HTTPS-hivatkozást adj meg."); return; }
    }
    setBusy(true);
    try {
      const result = await request<{ item: GiveawayGame }>(game ? `/${game.id}` : "/", { method: game ? "PATCH" : "POST", body: {
        ...form, title: form.title.trim(), description: form.description.trim(), prize_title: form.prize_title.trim(),
        prize_image_url: form.prize_image_url.trim() || null, facebook_post_url: form.facebook_post_url.trim() || null,
        closes_at_local: form.closes_at_local || null, ...(game ? { expected_revision: game.revision } : {}),
      } });
      if (mounted.current) onSaved(result.item);
    } catch (problem) { if (mounted.current) setError((problem as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <Modal title={game ? "Játék szerkesztése" : "Új nyereményjáték"} eyebrow="A következő örömteli pillanat" onClose={onClose} busy={busy} wide>
    <form onSubmit={submit} className="aif-gw-form"><div className="aif-gw-modal-body">
      {error && <Alert>{error}</Alert>}
      <div className="aif-gw-editor-layout"><div className="aif-gw-field-stack">
        <label className="aif-gw-field"><span>Játék neve <em>*</em></span><input autoComplete="off" required maxLength={160} value={form.title} onChange={(event) => change("title", event.target.value)} placeholder="Például: Ünnepi nyereményjáték" /></label>
        <label className="aif-gw-field"><span>Nyeremény <em>*</em></span><input required maxLength={200} value={form.prize_title} onChange={(event) => change("prize_title", event.target.value)} placeholder="Mit nyerhetnek a résztvevők?" /></label>
        <label className="aif-gw-field"><span>Leírás és feltételek</span><textarea rows={4} maxLength={10000} value={form.description} onChange={(event) => change("description", event.target.value)} placeholder="A játék részletei, a részvétel feltételei és az átvétel módja…" /></label>
      </div><div className="aif-gw-editor-preview"><PrizeVisual imageUrl={form.prize_image_url} title={form.prize_title || "Nyeremény"} large /><label className="aif-gw-field"><span>Nyereménykép hivatkozása</span><input type="url" maxLength={2048} value={form.prize_image_url} onChange={(event) => change("prize_image_url", event.target.value)} placeholder="https://…" /><small>Opcionális HTTPS-kép. Üresen az elegáns trófea jelenik meg.</small></label></div></div>
      <div className="aif-gw-form-grid aif-gw-form-grid--three">
        <label className="aif-gw-field"><span>Nyertesek száma</span><input type="number" min={1} max={20} required value={form.winners_count} onChange={(event) => change("winners_count", event.target.value === "" ? "" : Number(event.target.value))} /></label>
        <label className="aif-gw-field"><span>Tartalékok száma</span><input type="number" min={0} max={20} required value={form.reserves_count} onChange={(event) => change("reserves_count", event.target.value === "" ? "" : Number(event.target.value))} /></label>
        <label className="aif-gw-field"><span>Jelentkezési határidő</span><input type="datetime-local" value={form.closes_at_local} onChange={(event) => change("closes_at_local", event.target.value)} /><small>Bukaresti helyi idő. A lista lezárása kézzel történik.</small></label>
      </div>
      <label className="aif-gw-field"><span>Facebook-bejegyzés hivatkozása</span><input type="url" maxLength={2048} value={form.facebook_post_url} onChange={(event) => change("facebook_post_url", event.target.value)} placeholder="https://www.facebook.com/…" /><small>Hivatkozásként mentjük; résztvevőket jelenleg kézi listából vagy CSV-ből lehet hozzáadni.</small></label>
    </div><footer className="aif-gw-modal-footer"><button type="button" className="aif-gw-btn aif-gw-btn--ghost" onClick={onClose} disabled={busy}>Mégse</button><SubmitButton busy={busy}><Check size={17} />{game ? "Módosítások mentése" : "Játék létrehozása"}</SubmitButton></footer></form>
  </Modal>;
}

function ParticipantImport({ game, onClose, onImported }: { game: GiveawayGame; onClose: () => void; onImported: (detail: GiveawayDetail, message: string) => void }) {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [duplicateNames, setDuplicateNames] = useState<string[]>([]);
  const [confirmNames, setConfirmNames] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const parsed = useMemo(() => parseParticipantInput(text), [text]);
  const changeText = (value: string) => { setText(value); setDuplicateNames([]); setConfirmNames(false); setError(""); };
  const readFile = async (file: File | undefined) => {
    if (!file || busy || reading) return;
    if (file.size > 2_000_000) { setError("A fájl legfeljebb 2 MB lehet. Oszd több kisebb listára."); return; }
    setReading(true); setError("");
    try { const value = await file.text(); if (mounted.current) { changeText(value); setFilename(file.name); } }
    catch { if (mounted.current) setError("A fájl nem olvasható. Próbáld UTF-8 kódolású CSV-ként menteni."); }
    finally { if (mounted.current) setReading(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || reading || !parsed.rows.length || parsed.errors.length || (duplicateNames.length > 0 && !confirmNames)) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ added: number; duplicates: number; details: GiveawayDetail }>(`/${game.id}/participants`, {
        method: "POST", body: { participants: parsed.rows, ...(duplicateNames.length && confirmNames ? { allow_name_duplicates: true } : {}) },
      });
      if (mounted.current) onImported(result.details, `${numberText(result.added)} résztvevő hozzáadva.${result.duplicates ? ` ${numberText(result.duplicates)} ismétlődő azonosítót kihagytunk.` : ""}`);
    } catch (problem) {
      if (!mounted.current) return;
      if (problem instanceof ApiProblem && problem.code === "duplicate_names") { setDuplicateNames(problem.names); setConfirmNames(false); }
      setError((problem as Error).message);
    } finally { if (mounted.current) setBusy(false); }
  };
  return <Modal title="Résztvevők hozzáadása" eyebrow={game.title} onClose={onClose} busy={busy || reading} wide>
    <form onSubmit={submit}><div className="aif-gw-modal-body">
      <div className="aif-gw-import-intro"><div><p className="aif-gw-section-kicker">Kézi vagy CSV-lista</p><p>Illeszd be a neveket soronként, vagy válassz egy UTF-8 CSV-fájlt. A listát importálás előtt itt ellenőrizheted.</p></div><button className="aif-gw-btn aif-gw-btn--secondary" type="button" onClick={() => fileInput.current?.click()} disabled={busy || reading}>{reading ? <Loader2 size={17} className="aif-gw-spin" /> : <Upload size={17} />}Fájl kiválasztása</button></div>
      <input ref={fileInput} className="aif-gw-visually-hidden" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" aria-label="Résztvevőlista fájl" onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ""; }} />
      {filename && <p className="aif-gw-file-name"><FileText size={15} />{filename}</p>}
      <label className="aif-gw-field"><span>Lista</span><textarea className="aif-gw-import-textarea" rows={7} value={text} onChange={(event) => { changeText(event.target.value); setFilename(""); }} disabled={busy || reading} placeholder={'Név;Azonosító;Megjegyzés\nKiss Anna;profil-123;\nNagy Bence;profil-456;'} /><small>Fejléc: Név;Azonosító;Megjegyzés. A vessző, pontosvessző és tabulátor is használható. Az azonosító és a megjegyzés opcionális. Egyszerre legfeljebb 2000 sor.</small></label>
      {error && <Alert>{error}</Alert>}
      {!!parsed.errors.length && <Alert><ul>{parsed.errors.map((item) => <li key={item}>{item}</li>)}</ul></Alert>}
      {!!parsed.warnings.length && <Alert tone="info"><ul>{parsed.warnings.map((item) => <li key={item}>{item}</li>)}</ul></Alert>}
      {!!duplicateNames.length && <div className="aif-gw-duplicate-box"><h3>Azonos nevű résztvevők ellenőrzése</h3><p>{duplicateNames.slice(0, 20).join(" · ")}{duplicateNames.length > 20 ? ` · és további ${duplicateNames.length - 20} név` : ""}</p><p>Azonos név önmagában nem bizonyítja, hogy ugyanarról az emberről van szó. Javítsd a listát, adj meg egyedi azonosítókat, vagy erősítsd meg, hogy különböző személyek.</p><label className="aif-gw-check"><input type="checkbox" checked={confirmNames} onChange={(event) => setConfirmNames(event.target.checked)} disabled={busy} /><span>Ellenőriztem: az azonos nevű bejegyzések különböző személyekhez tartoznak.</span></label></div>}
      {!!parsed.rows.length && <section className="aif-gw-import-preview"><div className="aif-gw-section-title"><h3>Előnézet</h3><span className="aif-gw-soft-badge">{numberText(parsed.rows.length)} sor</span></div><div className="aif-gw-preview-table"><table><thead><tr><th>Név</th><th>Azonosító</th><th>Megjegyzés</th></tr></thead><tbody>{parsed.rows.slice(0, 12).map((row, index) => <tr key={index}><td>{row.display_name || "Hiányzó név"}</td><td>{row.external_id || "—"}</td><td>{row.note || "—"}</td></tr>)}</tbody></table></div>{parsed.rows.length > 12 && <p className="aif-gw-muted">Az első 12 sor látható. Mind a(z) {numberText(parsed.rows.length)} sor bekerül az ellenőrzésbe.</p>}</section>}
      <p className="aif-gw-small-note"><ShieldCheck size={16} />Ez adminisztrátor által összeállított lista. Az import nem ellenőrzi a Facebook-részvételi feltételeket.</p>
    </div><footer className="aif-gw-modal-footer"><button type="button" className="aif-gw-btn aif-gw-btn--ghost" onClick={onClose} disabled={busy || reading}>Mégse</button><SubmitButton busy={busy} disabled={reading || !parsed.rows.length || parsed.errors.length > 0 || (duplicateNames.length > 0 && !confirmNames)}><Plus size={17} />{numberText(parsed.rows.length)} résztvevő importálása</SubmitButton></footer></form>
  </Modal>;
}

function EligibilityModal({ game, participant, onClose, onSaved }: { game: GiveawayGame; participant: GiveawayParticipant; onClose: () => void; onSaved: (detail: GiveawayDetail) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || (participant.eligible && !reason.trim())) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ details: GiveawayDetail }>(`/${game.id}/participants/${participant.id}`, { method: "PATCH", body: { eligible: !participant.eligible, reason: reason.trim() } });
      if (mounted.current) onSaved(result.details);
    } catch (problem) { if (mounted.current) setError((problem as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <Modal title={participant.eligible ? "Résztvevő kizárása" : "Résztvevő visszaengedése"} onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="aif-gw-modal-body"><div className="aif-gw-person-highlight"><Users size={24} /><div><strong>{participant.display_name}</strong><span>{participant.external_id || "Nincs külön azonosító"}</span></div></div>
      <p>{participant.eligible ? "A résztvevő megmarad a listában és az előzményekben, de nem vesz részt a sorsolásban." : "A résztvevő újra bekerül a sorsolásra jogosult személyek közé."}</p>
      {participant.exclusion_reason && <p className="aif-gw-muted">Korábbi indok: {participant.exclusion_reason}</p>}
      <label className="aif-gw-field"><span>Indoklás{participant.eligible && <em> *</em>}</span><textarea rows={3} maxLength={1000} required={participant.eligible} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={participant.eligible ? "Miért nem jogosult a részvételre?" : "Miért engeded vissza? (opcionális)"} /></label>{error && <Alert>{error}</Alert>}
    </div><footer className="aif-gw-modal-footer"><button className="aif-gw-btn aif-gw-btn--ghost" type="button" onClick={onClose} disabled={busy}>Mégse</button><SubmitButton busy={busy} className={participant.eligible ? "aif-gw-btn aif-gw-btn--danger" : "aif-gw-btn aif-gw-btn--primary"}>{participant.eligible ? "Kizárás megerősítése" : "Visszaengedés"}</SubmitButton></footer></form>
  </Modal>;
}

function LockModal({ detail, onClose, onSaved }: { detail: GiveawayDetail; onClose: () => void; onSaved: (detail: GiveawayDetail) => void }) {
  const game = detail.item;
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const early = Boolean(game.closes_at && new Date(game.closes_at).getTime() > Date.now());
  const needed = game.winners_count + game.reserves_count;
  const enough = game.eligible_count >= needed;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || !confirmed || !enough || (early && !reason.trim())) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ details: GiveawayDetail }>(`/${game.id}/lock`, { method: "POST", body: { expected_revision: game.revision, confirm_eligibility: true, ...(reason.trim() ? { reason: reason.trim() } : {}) } });
      if (mounted.current) onSaved(result.details);
    } catch (problem) { if (mounted.current) setError((problem as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <Modal title="Lista ellenőrzése és lezárása" eyebrow="Utolsó ellenőrzés a sorsolás előtt" onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="aif-gw-modal-body">
      <div className="aif-gw-review-prize"><Gift size={24} /><div><span>Nyeremény</span><strong>{game.prize_title}</strong></div></div>
      <div className="aif-gw-review-grid"><div><strong>{numberText(game.eligible_count)}</strong><span>jogosult résztvevő</span></div><div><strong>{numberText(game.excluded_count)}</strong><span>kizárt résztvevő</span></div><div><strong>{game.winners_count}</strong><span>nyertes</span></div><div><strong>{game.reserves_count}</strong><span>tartalék</span></div></div>
      <Alert tone="info">Lezárás után a résztvevőlista és a nyertesek száma végleges. Ezután indítható a sorsolás.</Alert>
      {!enough && <Alert>Legalább {needed} jogosult résztvevő szükséges a {game.winners_count} nyertes és {game.reserves_count} külön tartalék kisorsolásához.</Alert>}
      {early && <label className="aif-gw-field"><span>Korábbi lezárás indoka <em>*</em></span><textarea rows={3} required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Miért zárod le a megadott határidő előtt?" /><small>Tervezett határidő: {formatGiveawayDate(game.closes_at)}</small></label>}
      <label className="aif-gw-check aif-gw-check--panel"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} /><span>Ellenőriztem a résztvevőket és a részvételi feltételeket. A jogosultak listája teljes, a játék beállításai helyesek.</span></label>
      {error && <Alert>{error}</Alert>}
    </div><footer className="aif-gw-modal-footer"><button className="aif-gw-btn aif-gw-btn--ghost" type="button" onClick={onClose} disabled={busy}>Vissza az ellenőrzéshez</button><SubmitButton busy={busy} disabled={!confirmed || !enough || (early && !reason.trim())}><Lock size={16} />Lista végleges lezárása</SubmitButton></footer></form>
  </Modal>;
}

function ArchiveModal({ game, onClose, onSaved }: { game: GiveawayGame; onClose: () => void; onSaved: (detail: GiveawayDetail) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const requireReason = game.status !== "drawn";
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || (requireReason && !reason.trim())) return;
    setBusy(true); setError("");
    try {
      const result = await request<{ details: GiveawayDetail }>(`/${game.id}/archive`, { method: "POST", body: { ...(reason.trim() ? { reason: reason.trim() } : {}) } });
      if (mounted.current) onSaved(result.details);
    } catch (problem) { if (mounted.current) setError((problem as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <Modal title="Játék archiválása" onClose={onClose} busy={busy}>
    <form onSubmit={submit}><div className="aif-gw-modal-body"><p><strong>{game.title}</strong></p><p>A résztvevők, a mentett eredmény és az előzmények megmaradnak. Az archivált játék már nem módosítható és nem sorsolható.</p><label className="aif-gw-field"><span>Indoklás{requireReason && <em> *</em>}</span><textarea rows={3} maxLength={1000} required={requireReason} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={requireReason ? "Miért archiválod sorsolás nélkül?" : "Opcionális megjegyzés az előzményekhez"} /></label>{error && <Alert>{error}</Alert>}</div><footer className="aif-gw-modal-footer"><button type="button" className="aif-gw-btn aif-gw-btn--ghost" onClick={onClose} disabled={busy}>Mégse</button><SubmitButton busy={busy} className="aif-gw-btn aif-gw-btn--secondary"><Archive size={17} />Archiválás</SubmitButton></footer></form>
  </Modal>;
}

function SelectionList({ items, reserves = false, showIdentifiers = true }: { items: GiveawaySelection[]; reserves?: boolean; showIdentifiers?: boolean }) {
  return <ol className={`aif-gw-selection-list${reserves ? " aif-gw-selection-list--reserves" : ""}`}>{items.map((person) => <li key={person.participant_id}><span className="aif-gw-selection-rank">{reserves ? person.rank : <Trophy size={19} />}</span><div><span className="aif-gw-selection-label">{person.rank}. {reserves ? "tartalék" : "nyertes"}</span><strong>{person.display_name}</strong>{showIdentifiers && person.external_id && <small>{person.external_id}</small>}</div>{!reserves && <CheckCircle2 className="aif-gw-selection-check" size={18} />}</li>)}</ol>;
}

function DrawReveal({ game, draw, error, recovering, eligibleNames, onClose, onRecover }: {
  game: GiveawayGame; draw: GiveawayDraw | null; error: string; recovering: boolean;
  eligibleNames: string[];
  onClose: () => void; onRecover: () => void;
}) {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(false);
  const [rollStep, setRollStep] = useState(0);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!draw) { setVisible(false); return; }
    if (reduced) { setVisible(true); return; }
    setVisible(false); setRollStep(0);
    // This is a presentation of the already committed result, never a winner-selection algorithm.
    const delays = [60, 65, 70, 80, 90, 100, 110, 130, 150, 180, 210, 250, 300, 360, 430, 500];
    let index = 0;
    let timer: number;
    const tick = () => {
      setRollStep((step) => step + 1);
      if (index >= delays.length) { setVisible(true); return; }
      timer = window.setTimeout(tick, delays[index++]);
    };
    timer = window.setTimeout(tick, delays[index++]);
    return () => window.clearTimeout(timer);
  }, [draw?.id, reduced]);
  return <Modal title={visible ? "Megvannak a nyertesek!" : "A nagy pillanat"} eyebrow={game.title} onClose={onClose} full>
    <div className={`aif-gw-reveal${visible ? " aif-gw-reveal--visible" : ""}`}>
      {visible && !reduced && <div className="aif-gw-confetti" aria-hidden="true">{Array.from({ length: 22 }, (_, index) => <i key={index} style={{ "--i": index, "--x": `${(index * 43) % 100}%`, "--delay": `${(index % 6) * 0.08}s`, "--turn": `${((index % 5) - 2) * 75}deg` } as React.CSSProperties} />)}</div>}
      <div className="aif-gw-reveal-center">
        <div className="aif-gw-reveal-trophy"><Trophy strokeWidth={1.15} /></div>
        {!visible ? <><p className="aif-gw-eyebrow">{draw ? "Az eredmény bemutatása" : error ? "Kapcsolat ellenőrzése" : "Sorsolás folyamatban"}</p><h3>{draw ? "Valakinek most szebb lesz a napja." : error ? "Nézzük meg a mentett állapotot." : "Egy pillanat türelmet…"}</h3><p className="aif-gw-reveal-prize">{game.prize_title}</p>
          {draw && !reduced && eligibleNames.length > 0 && <div className="aif-gw-name-stage" aria-hidden="true"><span>{eligibleNames[(rollStep + eligibleNames.length - 1) % eligibleNames.length]}</span><strong key={rollStep}>{eligibleNames[(rollStep) % eligibleNames.length]}</strong><span>{eligibleNames[(rollStep + 1) % eligibleNames.length]}</span></div>}
          {error ? <div className="aif-gw-reveal-error"><Alert>{error}</Alert><p>A kapcsolat hibája mellett a sorsolás már elmentődhetett. A mentett állapot ellenőrzésével biztonságosan folytathatod.</p><button type="button" className="aif-gw-btn aif-gw-btn--primary" onClick={onRecover} disabled={recovering}>{recovering ? <Loader2 className="aif-gw-spin" size={18} /> : <RefreshCw size={18} />}Mentett eredmény ellenőrzése</button></div> : draw ? <button type="button" className="aif-gw-btn aif-gw-btn--ghost" onClick={() => setVisible(true)}>Eredmény mutatása<ArrowUpRight size={17} /></button> : <Loader2 size={25} className="aif-gw-spin aif-gw-reveal-loader" />}
        </> : <><p className="aif-gw-eyebrow">Gratulálunk!</p><h3>{draw!.winners.length === 1 ? "A nyeremény gazdára talált." : "Íme a szerencsés nyertesek."}</h3><p className="aif-gw-reveal-prize">{game.prize_title}</p><div className="aif-gw-reveal-winners" aria-live="polite"><SelectionList items={draw!.winners} showIdentifiers={false} /></div>{draw!.reserves.length > 0 && <p className="aif-gw-muted">{draw!.reserves.length} tartalék sorrendje az eredményoldalon található.</p>}<button type="button" className="aif-gw-btn aif-gw-btn--primary" onClick={onClose}><Check size={18} />Tovább az eredményekhez</button><p className="aif-gw-reveal-saved"><ShieldCheck size={15} />Mentett eredmény · {formatGiveawayDate(draw!.drawn_at)}</p></>}
      </div>
    </div>
  </Modal>;
}

function GameCard({ game, onOpen }: { game: GiveawayGame; onOpen: () => void }) {
  return <article className={`aif-gw-game-card aif-gw-game-card--${game.status}`}>
    <button type="button" className="aif-gw-card-open" onClick={onOpen} aria-label={`${game.title} megnyitása`}>
      <div className="aif-gw-card-visual"><PrizeVisual imageUrl={game.prize_image_url} title={game.prize_title} /><StatusBadge status={game.status} />{game.drawn_at && <span className="aif-gw-card-seal"><CheckCircle2 size={15} />Eredmény elmentve</span>}</div>
      <div className="aif-gw-card-body"><p className="aif-gw-section-kicker">{game.prize_title}</p><h3>{game.title}</h3><p className="aif-gw-card-description">{game.description || "A játék részletei és résztvevői a megnyitás után kezelhetők."}</p><div className="aif-gw-card-metrics"><span><Users size={16} /><strong>{numberText(game.participant_count)}</strong> résztvevő</span><span><Trophy size={16} /><strong>{game.winners_count}</strong> nyertes</span></div><div className="aif-gw-card-footer"><span><CalendarDays size={14} />{game.closes_at ? formatGiveawayDate(game.closes_at) : "Határidő nélkül"}</span><span className="aif-gw-card-arrow"><ArrowUpRight size={19} /></span></div></div>
    </button>
  </article>;
}

function ParticipantsPanel({ detail, onImport, onEligibility }: { detail: GiveawayDetail; onImport: () => void; onEligibility: (participant: GiveawayParticipant) => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "eligible" | "excluded">("all");
  const [page, setPage] = useState(1);
  useEffect(() => { setSearch(""); setFilter("all"); setPage(1); }, [detail.item.id]);
  useEffect(() => setPage(1), [search, filter]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("hu");
    return detail.participants.filter((person) => (filter === "all" || (filter === "eligible" ? person.eligible : !person.eligible)) && (!term || `${person.display_name} ${person.external_id || ""} ${person.note || ""}`.toLocaleLowerCase("hu").includes(term)));
  }, [detail.participants, search, filter]);
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * 50, currentPage * 50);
  const editable = isEditable(detail.item);
  return <section className="aif-gw-panel aif-gw-participants"><div className="aif-gw-panel-heading"><div><p className="aif-gw-eyebrow">A játék közössége</p><h2>Résztvevők <span className="aif-gw-count">{numberText(detail.item.participant_count)}</span></h2></div>{editable && <button type="button" className="aif-gw-btn aif-gw-btn--primary" onClick={onImport}><Plus size={17} />Résztvevők hozzáadása</button>}</div>
    {detail.participants.length ? <><div className="aif-gw-participant-tools"><label className="aif-gw-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Keresés név vagy azonosító alapján…" aria-label="Résztvevők keresése" /></label><div className="aif-gw-tabs aif-gw-tabs--small" role="group" aria-label="Résztvevők állapota">{([["all", "Összes"], ["eligible", "Jogosult"], ["excluded", "Kizárt"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
      <div className="aif-gw-participant-table"><table><thead><tr><th>Résztvevő</th><th>Megjegyzés</th><th>Részvétel</th><th><span className="aif-gw-visually-hidden">Művelet</span></th></tr></thead><tbody>{rows.map((person) => <tr key={person.id} className={!person.eligible ? "is-excluded" : ""}><td><div className="aif-gw-participant-name"><span className="aif-gw-avatar" aria-hidden="true">{person.display_name.trim().charAt(0).toLocaleUpperCase("hu") || "?"}</span><div><strong>{person.display_name}</strong><small>{person.external_id || "Egyedi azonosító nélkül"}</small></div></div></td><td data-label="Megjegyzés"><span>{person.note || "—"}</span>{person.exclusion_reason && <small className="aif-gw-exclusion-reason">Kizárás: {person.exclusion_reason}</small>}</td><td data-label="Részvétel"><span className={`aif-gw-eligibility${person.eligible ? "" : " aif-gw-eligibility--excluded"}`}>{person.eligible ? <CheckCircle2 size={14} /> : <X size={14} />}{person.eligible ? "Jogosult" : "Kizárt"}</span></td><td className="aif-gw-participant-action">{editable ? <button type="button" className="aif-gw-text-btn" onClick={() => onEligibility(person)}>{person.eligible ? "Kizárás" : "Visszaengedés"}</button> : <Lock size={14} className="aif-gw-muted" aria-label="Lezárt lista" />}</td></tr>)}</tbody></table></div>
      {!rows.length && <div className="aif-gw-inline-empty"><Search size={26} /><p>Nincs találat ebben a szűrésben.</p></div>}<div className="aif-gw-pagination"><span>{numberText(filtered.length)} találat · {currentPage}/{pages}. oldal</span><div><button type="button" className="aif-gw-icon-btn" aria-label="Előző oldal" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><button type="button" className="aif-gw-icon-btn" aria-label="Következő oldal" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div></div>
    </> : <div className="aif-gw-inline-empty aif-gw-inline-empty--roomy"><div className="aif-gw-empty-icon"><Users size={29} /></div><h3>Még nincs résztvevő.</h3><p>{editable ? "Adj hozzá neveket kézzel vagy importálj CSV-listát. Mentés előtt minden sort ellenőrizhetsz." : "Ehhez a játékhoz nem rögzítettek résztvevőket."}</p>{editable && <button type="button" className="aif-gw-btn aif-gw-btn--secondary" onClick={onImport}><Upload size={17} />Lista feltöltése</button>}</div>}
  </section>;
}

const EVENT_LABELS: Record<string, string> = {
  created: "Játék létrehozva", game_created: "Játék létrehozva", updated: "Beállítások módosítva", game_updated: "Beállítások módosítva",
  opened: "Játék megnyitva", game_opened: "Játék megnyitva", participants_imported: "Résztvevők importálva", imported: "Résztvevők importálva",
  participant_excluded: "Résztvevő kizárva", participant_reincluded: "Résztvevő visszaengedve", participant_updated: "Részvétel módosítva",
  participant_eligibility_changed: "Részvétel módosítva", eligibility_changed: "Részvétel módosítva",
  locked: "Lista véglegesen lezárva", game_locked: "Lista véglegesen lezárva", participants_locked: "Lista véglegesen lezárva", drawn: "Sorsolás elmentve", draw_completed: "Sorsolás elmentve",
  archived: "Játék archiválva", game_archived: "Játék archiválva",
};

function eventSummary(event: GiveawayDetail["events"][number]): string {
  const data = event.details || {};
  const reason = typeof data.reason === "string" ? data.reason : "";
  const person = typeof data.display_name === "string" ? data.display_name : "";
  switch (event.event_type) {
    case "game_created": return typeof data.prize_title === "string" ? `Nyeremény: ${data.prize_title}` : "A játék előkészítése elkezdődött.";
    case "game_updated": {
      const fields: Record<string, string> = { title: "játék neve", description: "leírás", prize_title: "nyeremény", prize_image_url: "nyereménykép", winners_count: "nyertesek száma", reserves_count: "tartalékok száma", closes_at: "határidő", closes_at_local: "határidő", facebook_post_url: "Facebook-bejegyzés" };
      const changed = Array.isArray(data.fields) ? Array.from(new Set(data.fields.map((field) => fields[String(field)]).filter(Boolean))) : [];
      return changed.length ? `Módosított adatok: ${changed.join(", ")}.` : "A játék beállításai frissültek.";
    }
    case "game_opened": return "A résztvevőlista bővíthető a végleges lezárásig.";
    case "participants_imported": return `${numberText(Number(data.added) || 0)} résztvevő hozzáadva${Number(data.duplicates) ? `, ${numberText(Number(data.duplicates))} ismétlődő azonosító kihagyva` : ""}.${data.name_duplicates_confirmed ? " Az azonos nevű személyek különbözőségét az adminisztrátor megerősítette." : ""}`;
    case "participant_excluded":
    case "participant_reincluded": return [person, reason].filter(Boolean).join(" · ");
    case "participants_locked": return `${numberText(Number(data.eligible_count) || 0)} jogosult résztvevő véglegesítve.${data.early_close ? " Lezárás a megadott határidő előtt." : ""}${reason ? ` Indok: ${reason}` : ""}`;
    case "draw_completed": return `${Array.isArray(data.winner_ids) ? data.winner_ids.length : "—"} nyertes és ${Array.isArray(data.reserve_ids) ? data.reserve_ids.length : "—"} tartalék eredménye elmentve.`;
    case "game_archived": return reason || "A játék és a hozzá tartozó adatok megőrizve.";
    default: return reason;
  }
}

function HistoryPanel({ detail }: { detail: GiveawayDetail }) {
  const [limit, setLimit] = useState(12);
  useEffect(() => setLimit(12), [detail.item.id]);
  const events = useMemo(() => [...detail.events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [detail.events]);
  return <section className="aif-gw-panel aif-gw-history"><div className="aif-gw-panel-heading"><div><p className="aif-gw-eyebrow">Visszakövethető lépések</p><h2><History size={20} />Legutóbbi események</h2></div><span className="aif-gw-soft-badge">{numberText(events.length)} esemény</span></div>{events.length ? <ol className="aif-gw-timeline">{events.slice(0, limit).map((event) => <li key={event.id}><span className="aif-gw-timeline-dot" /><div className="aif-gw-timeline-head"><strong>{EVENT_LABELS[event.event_type] || "Játék adatainak módosítása"}</strong><time dateTime={event.created_at}>{formatGiveawayDate(event.created_at)}</time></div><p>{formatGiveawayActor(event.actor)}</p>{eventSummary(event) && <p className="aif-gw-timeline-summary">{eventSummary(event)}</p>}</li>)}</ol> : <p className="aif-gw-muted aif-gw-panel-padding">Még nincs megjeleníthető esemény.</p>}{events.length > limit && <button type="button" className="aif-gw-btn aif-gw-btn--ghost aif-gw-history-more" onClick={() => setLimit((value) => value + 20)}>További előzmények</button>}</section>;
}

type ModalState = { kind: "editor"; game: GiveawayGame | null } | { kind: "import" } | { kind: "eligibility"; participant: GiveawayParticipant } | { kind: "lock" } | { kind: "archive" } | null;

export default function AllInGiveaways({ onBack }: { onBack: () => void }) {
  const [games, setGames] = useState<GiveawayGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GiveawayDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"all" | GiveawayStatus>("all");
  const [search, setSearch] = useState("");
  const [listVersion, setListVersion] = useState(0);
  const [detailVersion, setDetailVersion] = useState(0);
  const [modal, setModal] = useState<ModalState>(null);
  const [actionBusy, setActionBusy] = useState("");
  const [reveal, setReveal] = useState<{ game: GiveawayGame; draw: GiveawayDraw | null; error: string } | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [metaError, setMetaError] = useState(false);
  const mounted = useRef(true);
  const mutationInFlight = useRef(false);
  const revealGeneration = useRef(0);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setListError("");
    request<{ items: GiveawayGame[] }>("/", { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setGames(result.items);
    }).catch((error) => { if (!controller.signal.aborted) setListError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    request<{ facebook: { connected: boolean; available: boolean } }>("/meta", { signal: controller.signal }).then(() => { if (!controller.signal.aborted) setMetaError(false); }).catch(() => { if (!controller.signal.aborted) setMetaError(true); });
    return () => controller.abort();
  }, [listVersion]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailError(""); setDetailLoading(false); return; }
    const controller = new AbortController();
    setDetailLoading(true); setDetailError("");
    request<GiveawayDetail>(`/${selectedId}`, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setDetail(result);
    }).catch((error) => { if (!controller.signal.aborted) setDetailError(error.message); }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, detailVersion]);

  const updateGame = useCallback((game: GiveawayGame) => setGames((previous) => previous.some((item) => item.id === game.id) ? previous.map((item) => item.id === game.id ? game : item) : [game, ...previous]), []);
  const applyDetail = useCallback((value: GiveawayDetail, message = "") => {
    updateGame(value.item);
    if (selectedRef.current !== value.item.id) return;
    setDetail(value); if (message) setNotice(message); setDetailError("");
  }, [updateGame]);
  const selectGame = (id: string) => { setSelectedId(id); setDetail(null); setNotice(""); setDetailError(""); window.scrollTo({ top: 0, behavior: "auto" }); };
  const closeModal = () => setModal(null);
  const modalSaved = (value: GiveawayDetail, message: string) => { applyDetail(value, message); setModal(null); };
  const filteredGames = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("hu");
    return games.filter((game) => (filter === "all" || game.status === filter) && (!term || `${game.title} ${game.prize_title} ${game.description}`.toLocaleLowerCase("hu").includes(term)));
  }, [games, filter, search]);
  const activeGames = games.filter((game) => game.status === "open" || game.status === "locked").length;
  const allParticipants = games.reduce((sum, game) => sum + game.participant_count, 0);
  const completedGames = games.filter((game) => Boolean(game.drawn_at)).length;
  const current = detail?.item;
  const busy = Boolean(actionBusy);

  const openGame = async () => {
    if (!current || mutationInFlight.current) return;
    mutationInFlight.current = true; setActionBusy("open"); setDetailError("");
    try {
      const result = await request<{ item: GiveawayGame }>(`/${current.id}/open`, { method: "POST", body: { expected_revision: current.revision } });
      if (mounted.current) { updateGame(result.item); setDetail((value) => value && value.item.id === result.item.id ? { ...value, item: result.item } : value); setDetailVersion((version) => version + 1); setNotice("A játék megnyitva. A résztvevőlista tovább bővíthető a lezárásig."); }
    } catch (error) { if (mounted.current) setDetailError((error as Error).message); }
    finally { mutationInFlight.current = false; if (mounted.current) setActionBusy(""); }
  };
  const drawGame = async () => {
    if (!current || current.status !== "locked" || mutationInFlight.current) return;
    mutationInFlight.current = true; setActionBusy("draw"); setDetailError("");
    const generation = ++revealGeneration.current;
    setReveal({ game: current, draw: null, error: "" });
    try {
      const result = await request<{ draw: GiveawayDraw; details: GiveawayDetail }>(`/${current.id}/draw`, { method: "POST", body: { request_id: newRequestId() } });
      if (mounted.current) { applyDetail(result.details); if (revealGeneration.current === generation) setReveal({ game: result.details.item, draw: result.draw, error: "" }); }
    } catch (error) {
      if (mounted.current) {
        if (revealGeneration.current === generation) setReveal((value) => value ? { ...value, error: (error as Error).message } : value);
        else setDetailError((error as Error).message);
      }
    }
    finally { mutationInFlight.current = false; if (mounted.current) setActionBusy(""); }
  };
  const recoverDraw = async () => {
    if (!reveal || recovering) return;
    setRecovering(true);
    const generation = revealGeneration.current;
    try {
      const result = await request<GiveawayDetail>(`/${reveal.game.id}`);
      if (!mounted.current) return;
      applyDetail(result);
      if (revealGeneration.current !== generation) return;
      if (result.draw) setReveal({ game: result.item, draw: result.draw, error: "" });
      else setReveal((value) => value ? { ...value, error: "Még nincs mentett eredmény. Visszatérhetsz a játékhoz, és újra indíthatod a sorsolást; a rendszer ugyanahhoz a játékhoz egy eredményt rögzít." } : value);
    } catch (error) { if (mounted.current && revealGeneration.current === generation) setReveal((value) => value ? { ...value, error: (error as Error).message } : value); }
    finally { if (mounted.current && revealGeneration.current === generation) setRecovering(false); }
  };
  const exportCsv = () => {
    if (!detail?.draw) return;
    const url = URL.createObjectURL(new Blob([drawCsv(detail.item, detail.draw)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `AllInFashion_nyeremenyjatek_${detail.item.id.slice(0, 8)}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const printReport = () => {
    if (!detail?.draw) return;
    const popup = window.open("", "_blank", "width=960,height=800");
    if (!popup) { setDetailError("A böngésző letiltotta a jegyzőkönyv ablakát. Engedélyezd a felugró ablakot, majd próbáld újra."); return; }
    popup.opener = null;
    popup.document.open(); popup.document.write(giveawayPrintHtml(detail.item, detail.draw)); popup.document.close();
    popup.focus(); window.setTimeout(() => { if (!popup.closed) popup.print(); }, 250);
  };

  return <div className="aif-gw-root aif-gw-page"><main className="aif-gw-shell">
    <header className="aif-gw-header"><div className="aif-gw-header-left"><button type="button" className="aif-gw-back" onClick={() => { if (selectedId) { setSelectedId(null); setNotice(""); } else onBack(); }} disabled={busy} aria-label={selectedId ? "Vissza a játékokhoz" : "Vissza a kezdőlapra"}><ArrowLeft size={20} /></button><div><p className="aif-gw-eyebrow">ALLINFASHION</p><h1>Nyereményjáték</h1></div></div><div className="aif-gw-header-actions"><button type="button" className="aif-gw-icon-btn" aria-label="Adatok frissítése" title="Adatok frissítése" onClick={() => selectedId ? setDetailVersion((value) => value + 1) : setListVersion((value) => value + 1)} disabled={loading || detailLoading || busy}><RefreshCw size={18} className={loading || detailLoading ? "aif-gw-spin" : ""} /></button>{!selectedId && <button type="button" className="aif-gw-btn aif-gw-btn--primary" onClick={() => setModal({ kind: "editor", game: null })}><Plus size={17} />Új játék</button>}</div></header>
    {!!notice && <div className="aif-gw-notice"><CheckCircle2 size={18} /><span>{notice}</span><button type="button" className="aif-gw-icon-btn" onClick={() => setNotice("")} aria-label="Értesítés bezárása"><X size={16} /></button></div>}
    {!selectedId ? <>
      <section className="aif-gw-hero"><div className="aif-gw-hero-copy"><p className="aif-gw-eyebrow"><Sparkles size={14} /> EGY KIS IZGALOM. EGY NAGY MOSOLY.</p><h2>Adj teret a<br /><span>szerencsés pillanatoknak.</span></h2><p>Játékok, résztvevők és az a bizonyos nagy pillanat —<br className="aif-gw-wide-only" /> minden egy helyen, átláthatóan.</p><button type="button" className="aif-gw-btn aif-gw-btn--light" onClick={() => setModal({ kind: "editor", game: null })}><Plus size={17} />Nyereményjáték létrehozása<ArrowUpRight size={17} /></button></div><div className="aif-gw-hero-art"><PrizeVisual title="Nyereményjáték" large /><span className="aif-gw-hero-art-label"><Trophy size={14} /> A következő nyertes itt kezdődik.</span></div></section>
      <section className="aif-gw-overview" aria-label="Játékok áttekintése"><div className="aif-gw-overview-stat"><span className="aif-gw-stat-icon"><Gift size={20} /></span><div><strong>{loading ? "—" : numberText(games.length)}</strong><span>létrehozott játék</span></div></div><div className="aif-gw-overview-stat"><span className="aif-gw-stat-icon aif-gw-stat-icon--teal"><Play size={19} /></span><div><strong>{loading ? "—" : numberText(activeGames)}</strong><span>aktív játék</span></div></div><div className="aif-gw-overview-stat"><span className="aif-gw-stat-icon"><Users size={20} /></span><div><strong>{loading ? "—" : numberText(allParticipants)}</strong><span>rögzített részvétel</span></div></div><div className="aif-gw-overview-stat"><span className="aif-gw-stat-icon aif-gw-stat-icon--gold"><Trophy size={20} /></span><div><strong>{loading ? "—" : numberText(completedGames)}</strong><span>mentett sorsolás</span></div></div></section>
      <div className="aif-gw-games-heading"><div><p className="aif-gw-eyebrow">Minden játékod egy helyen</p><h2>Játékok</h2></div><label className="aif-gw-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Játék vagy nyeremény keresése…" aria-label="Játék keresése" /></label></div>
      <div className="aif-gw-tabs aif-gw-game-filters" role="group" aria-label="Játékok állapota">{(["all", "draft", "open", "locked", "drawn", "archived"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "Összes" : STATUS[value].label}<span>{value === "all" ? games.length : games.filter((game) => game.status === value).length}</span></button>)}</div>
      {listError && <Alert>{listError}<button type="button" className="aif-gw-text-btn" onClick={() => setListVersion((value) => value + 1)}>Újrapróbálás</button></Alert>}
      {loading ? <div className="aif-gw-loading" role="status"><Loader2 className="aif-gw-spin" size={27} /><p>Játékok betöltése…</p></div> : filteredGames.length ? <div className="aif-gw-game-grid">{filteredGames.map((game) => <GameCard key={game.id} game={game} onOpen={() => selectGame(game.id)} />)}</div> : !listError && <section className="aif-gw-empty-state"><div className="aif-gw-empty-icon"><Gift size={33} /></div><p className="aif-gw-eyebrow">{games.length ? "Nincs találat" : "Itt kezdődik az első játék"}</p><h2>{games.length ? "Erre a szűrésre nincs játék." : "Egy nyeremény már elég a kezdéshez."}</h2><p>{games.length ? "Válassz másik állapotot, vagy módosítsd a keresést." : "Hozd létre a játékot, állítsd össze a résztvevőlistát, majd ünnepeljük meg együtt a nyerteseket."}</p>{games.length ? <button type="button" className="aif-gw-btn aif-gw-btn--secondary" onClick={() => { setFilter("all"); setSearch(""); }}>Szűrés törlése</button> : <button type="button" className="aif-gw-btn aif-gw-btn--primary" onClick={() => setModal({ kind: "editor", game: null })}><Plus size={17} />Első játék létrehozása</button>}</section>}
      <aside className="aif-gw-facebook-panel"><span className="aif-gw-facebook-icon"><Facebook size={22} /></span><div><h3>Facebook-kapcsolat <span className="aif-gw-soft-badge">Nincs csatlakoztatva</span></h3><p>A Facebook-résztvevők automatikus beolvasása egy későbbi fázisban érkezik. Most ellenőrzött kézi vagy CSV-listával dolgozhatsz.{metaError ? " A kapcsolat állapotának lekérdezése jelenleg nem sikerült." : ""}</p></div><span className="aif-gw-upcoming">Később</span></aside>
    </> : <>
      {detailError && <Alert>{detailError}<button type="button" className="aif-gw-text-btn" onClick={() => setDetailVersion((value) => value + 1)} disabled={busy}>Adatok frissítése</button></Alert>}
      {detailLoading ? <div className="aif-gw-loading" role="status"><Loader2 className="aif-gw-spin" size={27} /><p>A játék betöltése…</p></div> : detail && current ? <>
        <div className="aif-gw-breadcrumb"><button type="button" onClick={() => { setSelectedId(null); setNotice(""); }} disabled={busy}>Játékok</button><ChevronRight size={13} /><span>{current.title}</span></div>
        <section className="aif-gw-detail-hero"><div className="aif-gw-detail-prize"><PrizeVisual imageUrl={current.prize_image_url} title={current.prize_title} large /></div><div className="aif-gw-detail-copy"><div className="aif-gw-detail-top"><StatusBadge status={current.status} /><span className="aif-gw-muted"><CalendarDays size={14} />{current.closes_at ? formatGiveawayDate(current.closes_at) : "Határidő nélkül"}</span></div><h2>{current.title}</h2><p className="aif-gw-detail-prize-title"><Gift size={18} />{current.prize_title}</p>{current.description && <p className="aif-gw-detail-description">{current.description}</p>}<div className="aif-gw-detail-counts"><span><strong>{numberText(current.participant_count)}</strong> résztvevő</span><span><strong>{numberText(current.eligible_count)}</strong> jogosult</span><span><strong>{current.winners_count}</strong> nyertes</span><span><strong>{current.reserves_count}</strong> tartalék</span></div><div className="aif-gw-detail-actions">
          {current.status === "draft" && <button type="button" className="aif-gw-btn aif-gw-btn--primary" onClick={() => void openGame()} disabled={busy}>{actionBusy === "open" ? <Loader2 size={17} className="aif-gw-spin" /> : <Play size={17} />}Játék megnyitása</button>}
          {current.status === "open" && <button type="button" className="aif-gw-btn aif-gw-btn--primary" onClick={() => setModal({ kind: "lock" })} disabled={busy}><ShieldCheck size={17} />Ellenőrzés és lezárás</button>}
          {current.status === "locked" && <button type="button" className="aif-gw-btn aif-gw-btn--gold" onClick={() => void drawGame()} disabled={busy}><Sparkles size={18} />Sorsolás indítása</button>}
          {detail.draw && <button type="button" className="aif-gw-btn aif-gw-btn--gold" onClick={() => { revealGeneration.current += 1; setReveal({ game: current, draw: detail.draw, error: "" }); }}><Eye size={17} />Eredmény bemutatása</button>}
          {isEditable(current) && <button type="button" className="aif-gw-btn aif-gw-btn--secondary" onClick={() => setModal({ kind: "editor", game: current })} disabled={busy}><Pencil size={16} />Szerkesztés</button>}
          {safeHttpsUrl(current.facebook_post_url) && <a href={safeHttpsUrl(current.facebook_post_url)!} target="_blank" rel="noopener noreferrer" className="aif-gw-btn aif-gw-btn--ghost"><Facebook size={16} />Bejegyzés<ArrowUpRight size={14} /></a>}
        </div></div></section>
        <div className="aif-gw-workflow" aria-label="Játék folyamat"><div className={current.status === "draft" ? "is-current" : "is-done"}><span>{current.status === "draft" ? "1" : <Check size={15} />}</span><p>Előkészítés</p></div><i /><div className={current.status === "open" ? "is-current" : current.locked_at ? "is-done" : ""}><span>{current.locked_at ? <Check size={15} /> : "2"}</span><p>Résztvevők</p></div><i /><div className={current.status === "locked" ? "is-current" : current.drawn_at ? "is-done" : ""}><span>{current.drawn_at ? <Check size={15} /> : "3"}</span><p>Sorsolás</p></div><i /><div className={detail.draw ? "is-done" : ""}><span>{detail.draw ? <Check size={15} /> : "4"}</span><p>Eredmény</p></div></div>
        {current.status === "locked" && <div className="aif-gw-locked-note"><Lock size={20} /><div><strong>A lista lezárva. Minden készen áll.</strong><p>{numberText(current.eligible_count)} jogosult résztvevőből {current.winners_count} nyertest és {current.reserves_count} külön tartalékot sorsolunk. Az eredményt a bemutatás előtt elmentjük.</p></div><button type="button" className="aif-gw-btn aif-gw-btn--gold" onClick={() => void drawGame()} disabled={busy}><Play size={17} />Indulhat a sorsolás</button></div>}
        {current.status === "archived" && <Alert tone="info">Ez a játék archivált. A résztvevők, az előzmények és a korábban mentett eredmény továbbra is megtekinthetők.</Alert>}
        {detail.draw && <section className="aif-gw-panel aif-gw-results"><div className="aif-gw-panel-heading"><div><p className="aif-gw-eyebrow">Egy emlékezetes pillanat</p><h2><Trophy size={22} />A sorsolás eredménye</h2><p>{formatGiveawayDate(detail.draw.drawn_at)} · {numberText(detail.draw.eligible_count)} jogosult résztvevő</p></div><div className="aif-gw-result-actions"><button type="button" className="aif-gw-btn aif-gw-btn--secondary" onClick={printReport}><Printer size={16} />Jegyzőkönyv / PDF</button><button type="button" className="aif-gw-btn aif-gw-btn--ghost" onClick={exportCsv}><Download size={16} />CSV</button></div></div><div className="aif-gw-results-grid"><div><h3 className="aif-gw-result-label"><Trophy size={16} />Nyertesek</h3><SelectionList items={detail.draw.winners} /></div>{detail.draw.reserves.length > 0 && <div><h3 className="aif-gw-result-label aif-gw-result-label--muted"><Users size={16} />Tartalékok, sorrendben</h3><SelectionList items={detail.draw.reserves} reserves /></div>}</div><div className="aif-gw-result-proof"><ShieldCheck size={16} /><div><strong>Az eredmény véglegesen elmentve.</strong><span>A bemutatás újra megnyitható; ugyanennek a sorsolásnak az eredményét mutatja.</span><details><summary>Ellenőrzési adatok</summary><dl><dt>Sorsolás azonosítója</dt><dd>{detail.draw.id}</dd><dt>Lezárt lista ellenőrzőazonosítója</dt><dd>{detail.draw.snapshot_hash}</dd><dt>Rögzítette</dt><dd>{formatGiveawayActor(detail.draw.actor)}</dd></dl></details></div></div></section>}
        <ParticipantsPanel detail={detail} onImport={() => setModal({ kind: "import" })} onEligibility={(participant) => setModal({ kind: "eligibility", participant })} />
        <HistoryPanel detail={detail} />
        <footer className="aif-gw-detail-footer"><p><ShieldCheck size={16} />Kézzel vagy CSV-ből összeállított, adminisztrátor által ellenőrzött résztvevőlista.</p>{current.status !== "archived" && <button type="button" className="aif-gw-btn aif-gw-btn--ghost" onClick={() => setModal({ kind: "archive" })} disabled={busy}><Archive size={16} />Játék archiválása</button>}</footer>
      </> : !detailError && <div className="aif-gw-loading" role="status"><Loader2 className="aif-gw-spin" size={26} /><p>A játék betöltése…</p></div>}
    </>}
    <footer className="aif-gw-page-footer"><span>ALLINFASHION</span><p>Egy játék. Egy lezárt lista. Egy mentett eredmény.</p><span><ShieldCheck size={14} />Átlátható sorsolás</span></footer>
  </main>
    {modal?.kind === "editor" && <GameEditor game={modal.game} onClose={closeModal} onSaved={(game) => { updateGame(game); setModal(null); setNotice(modal.game ? "A játék módosításai elmentve." : "A játék létrehozva. Jöhetnek a résztvevők."); if (selectedId === game.id) { setDetail((value) => value ? { ...value, item: game } : value); setDetailVersion((version) => version + 1); } else selectGame(game.id); }} />}
    {modal?.kind === "import" && detail && <ParticipantImport game={detail.item} onClose={closeModal} onImported={(value, message) => modalSaved(value, message)} />}
    {modal?.kind === "eligibility" && detail && <EligibilityModal game={detail.item} participant={modal.participant} onClose={closeModal} onSaved={(value) => modalSaved(value, "A részvételi állapot elmentve.")} />}
    {modal?.kind === "lock" && detail && <LockModal detail={detail} onClose={closeModal} onSaved={(value) => modalSaved(value, "A résztvevőlista lezárva. A sorsolás indítható.")} />}
    {modal?.kind === "archive" && detail && <ArchiveModal game={detail.item} onClose={closeModal} onSaved={(value) => modalSaved(value, "A játék archiválva. Az adatok megmaradtak.")} />}
    {reveal && <DrawReveal game={reveal.game} draw={reveal.draw} error={reveal.error} recovering={recovering} eligibleNames={(detail?.participants || []).filter((person) => person.eligible).map((person) => person.display_name)} onRecover={() => void recoverDraw()} onClose={() => { revealGeneration.current += 1; setReveal(null); setRecovering(false); }} />}
  </div>;
}
