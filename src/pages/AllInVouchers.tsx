import { useCallback, useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, Barcode, CheckCircle2, ClipboardList, Clock3, FileClock, Gift,
  ListFilter, Loader2, PackageCheck, PackagePlus, RefreshCw, ShieldAlert,
  ShieldCheck, Truck, X, Ban, Search, ChevronRight, ChevronLeft, ChevronDown, CalendarDays,
} from "lucide-react";

const VOUCHER_PICS = {
  HU: "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/voucher-HU.png",
  RO: "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/voucher-RO.png",
};
const ROOT = "/api/aif/vouchers";
const STORE_LABELS: Record<string, string> = {
  admin_storage: "Központi utalványkészlet",
  main_warehouse: "Csíkszereda",
  magazin_targu_secuiesc: "Kézdivásárhely",
};
type Role = "admin" | "shop";
type Tab = "overview" | "receive-stock" | "transfers" | "list" | "preview" | "issue" | "ledger";
type Lang = "HU" | "RO";
type VoucherStatus = "blank" | "in_transfer" | "active" | "partial" | "redeemed" | "blocked" | "void";
type Voucher = {
  id: string; code: string; language: Lang; location_code: string; status: VoucherStatus;
  issued_value: string | number; balance: string | number; created_by?: string | null;
  created_at: string; updated_at: string; buyer_name?: string | null;
  recipient_name?: string | null; expires_on?: string | null;
};
type SummaryRow = { location_code: string; language: Lang; status: VoucherStatus; quantity: number; issued_value: string | number; outstanding: string | number };
type Summary = {
  totals: { physical: number; blank: number; in_transfer: number; active: number; partial: number; redeemed: number; blocked: number; void: number; issued_value: number; outstanding: number };
  rows: SummaryRow[];
  incoming?: { transfers: number; awaiting: number };
};
type Transfer = { id: string; from_location: string; to_location: string; status: string; note?: string | null;
  created_by?: string | null; created_at: string; total: number; received: number };
type TransferLine = { code: string; language: Lang; accepted_at?: string | null; accepted_by?: string | null };
type VoucherTxn = {id:string;code:string;language:Lang;kind:"issue"|"redeem"|"restore";
  location_code:string;method:string|null;amount:number|string;sale_number?:string|null;
  reference?:string|null;actor:string;created_at:string;};
type VoucherTxSummary = {kind:string;method:string;count:number;total:string|number};
const EMPTY_SUMMARY: Summary = {
  totals: { physical: 0, blank: 0, in_transfer: 0, active: 0, partial: 0, redeemed: 0, blocked: 0, void: 0, issued_value: 0, outstanding: 0 },
  rows: [], incoming: {transfers: 0,awaiting:0},
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ROOT}${path}`, {
    credentials: "include", cache: "no-store", ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.ok === false) throw new Error(String(json?.error || `Szerverhiba: HTTP ${response.status}`));
  return json as T;
}
const money = (amount: unknown) => `${Number(amount || 0).toLocaleString("ro-RO", {minimumFractionDigits:2,maximumFractionDigits:2})} RON`;
const date = (value?: string | null) => value ? new Date(value).toLocaleString("hu-HU", {timeZone:"Europe/Bucharest",dateStyle:"short",timeStyle:"short"}) : "–";
const shortCode = (code: string) => code.length > 22 ? `${code.slice(0, 12)}…${code.slice(-7)}` : code;
function cleanCode(code: string) {return code.trim().toUpperCase();}
function statusLabel(status: VoucherStatus | string) {
  return ({blank:"Üres",in_transfer:"Átadás alatt",active:"Aktív",partial:"Részben beváltva",
    redeemed:"Felhasználva",blocked:"Blokkolva",void:"Érvénytelen"} as Record<string,string>)[status] || status;
}
function Pill({children,green=false}:{children:ReactNode;green?:boolean}) {
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] ${green ? "border-[#75dad5]/40 bg-[#2a8d8b]/20 text-[#d6fffd]" : "border-white/16 bg-white/[0.06] text-white/60"}`}>{children}</span>;
}
function Kpi({label,value,sub}:{label:string;value:string;sub?:string}) {
  return <div className="rounded-2xl border border-white/12 bg-[#344256] p-4">
    <p className="text-[10px] uppercase tracking-[.12em] text-white/48">{label}</p>
    <p className="mt-2 text-2xl tabular-nums text-white">{value}</p>
    {sub && <p className="mt-1 text-xs text-white/48">{sub}</p>}
  </div>;
}

// A raktári WarehouseSingleSelect mintáját követő, képernyőhöz igazodó legördülő.
// A lista portálba kerül, ezért nem vágja le a kártya és lefelé/felfelé is nyílhat.
type VoucherSelectOption = { value: string; label: string };

function VoucherSelect({
  label, value, options, onChange, className = "",
}: {
  label: string;
  value: string;
  options: VoucherSelectOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const selected = options.find((option) => option.value === value);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect || typeof window === "undefined") return;
    const edge = 10;
    const gap = 6;
    const width = Math.min(Math.max(rect.width, 210), window.innerWidth - edge * 2);
    const desiredHeight = Math.min(340, options.length * 39 + 12);
    const below = Math.max(0, window.innerHeight - rect.bottom - edge);
    const above = Math.max(0, rect.top - edge);
    const upward = below < Math.min(desiredHeight, 190) && above > below;
    const height = Math.min(desiredHeight, Math.max(90, (upward ? above : below) - gap));
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    setPosition({
      position: "fixed", left, width, maxHeight: height,
      top: upward ? Math.max(edge, rect.top - gap) : Math.min(window.innerHeight - edge, rect.bottom + gap),
      transform: upward ? "translateY(-100%)" : "none",
      zIndex: 2147483200,
    });
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside, true);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return <div className={`min-w-0 ${className}`}>
    <button
      ref={triggerRef} type="button" aria-label={label} title={selected?.label || label}
      aria-haspopup="listbox" aria-expanded={open}
      className={`flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border bg-[#344257] px-3 text-left text-xs text-white outline-none transition hover:bg-[#405067] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/20 ${open ? "border-[#7bd7d4]/65 bg-[#3b5266]" : "border-white/18"}`}
      onClick={() => { if (!open) updatePosition(); setOpen((current) => !current); }}
    >
      <span className="min-w-0 truncate">{selected?.label || label}</span>
      <ChevronDown size={15} className={`shrink-0 text-white/65 transition-transform ${open ? "rotate-180 text-[#d7fffd]" : ""}`} />
    </button>
    {open && typeof document !== "undefined" && createPortal(
      <div
        ref={popoverRef} style={position} role="listbox" aria-label={label}
        className="min-h-0 overflow-y-auto overscroll-contain rounded-2xl border border-[#7bd7d4]/32 bg-[#293344] p-1.5 text-white shadow-[0_24px_65px_rgba(0,0,0,0.55)]"
      >
        {options.map((option) => {
          const active = option.value === value;
          return <button
            key={option.value} type="button" role="option" aria-selected={active}
            className={`mb-1 flex min-h-9 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition last:mb-0 ${active ? "border-[#7bd7d4]/55 bg-[#2a8d8b] text-white" : "border-transparent bg-[#354153] text-white/80 hover:border-white/10 hover:bg-[#425166]"}`}
            onClick={() => { onChange(option.value); setOpen(false); }}
          ><span className="min-w-0 truncate">{option.label}</span>{active && <CheckCircle2 size={14} className="shrink-0 text-[#d7fffd]" />}</button>;
        })}
      </div>,
      document.body,
    )}
  </div>;
}

const VOUCHER_MONTHS = [
  "január", "február", "március", "április", "május", "június",
  "július", "augusztus", "szeptember", "október", "november", "december",
];
const VOUCHER_WEEKDAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];
type VoucherLedgerPreset = "all" | "today" | "yesterday" | "week" | "month30" | "thisMonth" | "custom";

function voucherTodayIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function voucherParsedIso(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day, date };
}
function voucherUtcIso(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function voucherShiftDays(iso: string, amount: number) {
  const parsed = voucherParsedIso(iso);
  if (!parsed) return iso;
  const next = new Date(parsed.date);
  next.setUTCDate(next.getUTCDate() + amount);
  return voucherUtcIso(next);
}
function voucherDateLabel(iso: string) {
  const parsed = voucherParsedIso(iso);
  return parsed ? `${parsed.year}. ${String(parsed.month).padStart(2, "0")}. ${String(parsed.day).padStart(2, "0")}.` : "Dátum választása";
}

// A pénzügyi naplóban magyar, hétfővel kezdődő, böngészőfüggetlen naptár.
function VoucherDatePicker({
  label, value, onChange, open, onOpen, onClose,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const today = voucherTodayIso();
  const initial = voucherParsedIso(value) || voucherParsedIso(today)!;
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month - 1);
  const [yearMode, setYearMode] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});

  const updatePosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect || typeof window === "undefined") return;
    const edge = 10, gap = 6;
    const width = Math.min(326, window.innerWidth - edge * 2);
    const desiredHeight = 415;
    const below = window.innerHeight - rect.bottom - edge;
    const above = rect.top - edge;
    const upward = below < desiredHeight && above > below;
    const room = Math.max(130, Math.min(desiredHeight, (upward ? above : below) - gap));
    setPosition({
      position: "fixed", left: Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge)),
      top: upward ? Math.max(edge, rect.top - gap) : rect.bottom + gap,
      transform: upward ? "translateY(-100%)" : "none",
      width, maxHeight: room, zIndex: 2147483300,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const selected = voucherParsedIso(value) || voucherParsedIso(voucherTodayIso())!;
    setViewYear(selected.year);
    setViewMonth(selected.month - 1);
    setYearMode(false);
    updatePosition();
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      onClose();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("mousedown", outside, true);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, onClose, updatePosition]);

  const first = new Date(Date.UTC(viewYear, viewMonth, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - offset);
  const dates = Array.from({length: 42}, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d;
  });
  const chosen = voucherParsedIso(value);
  const shift = (delta: number) => {
    if (yearMode) setViewYear((year) => year + delta * 12);
    else {
      const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1, 12));
      setViewYear(next.getUTCFullYear());
      setViewMonth(next.getUTCMonth());
    }
  };
  const choose = (next: string) => { onChange(next); onClose(); };

  return <div className="min-w-0">
    <span className="mb-1.5 block text-[10px] text-white/58">{label}</span>
    <button
      ref={buttonRef} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
      className={`flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border bg-[#344257] px-3 text-xs text-white outline-none transition hover:bg-[#405067] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/20 ${open ? "border-[#7bd7d4]/65" : "border-white/18"}`}
      onClick={() => { if (open) onClose(); else { updatePosition(); onOpen(); } }}
    >
      <span className="flex min-w-0 items-center gap-2"><CalendarDays size={15} className="shrink-0 text-[#93e4df]"/><span className="truncate">{voucherDateLabel(value)}</span></span>
      <ChevronDown size={14} className={`shrink-0 text-white/55 transition-transform ${open ? "rotate-180" : ""}`}/>
    </button>
    {open && typeof document !== "undefined" && createPortal(
      <div ref={popupRef} role="dialog" aria-label={`${label} naptár`} style={position}
        className="overflow-y-auto overscroll-contain rounded-[20px] border border-[#7bd7d4]/40 bg-[#253246] p-3 text-white shadow-[0_28px_80px_rgba(0,0,0,0.64)]">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#344257] p-1.5">
          <button type="button" aria-label="Előző hónap vagy év" onClick={() => shift(-1)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/80 hover:bg-white/10"><ChevronLeft size={16}/></button>
          <button type="button" onClick={() => setYearMode((current) => !current)} className="min-w-0 flex-1 rounded-lg px-2 py-1 text-center text-sm hover:bg-white/10" title="Év kiválasztása">{viewYear}. {yearMode ? "Évválasztás" : VOUCHER_MONTHS[viewMonth]} <ChevronDown size={12} className="ml-1 inline text-white/55"/></button>
          <button type="button" aria-label="Következő hónap vagy év" onClick={() => shift(1)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/80 hover:bg-white/10"><ChevronRight size={16}/></button>
        </div>
        {yearMode ? <div className="mt-3 grid grid-cols-4 gap-1.5">{Array.from({length: 12}, (_, i) => viewYear - 5 + i).map((year) => <button
          type="button" key={year} onClick={() => {setViewYear(year);setYearMode(false);}}
          className={`h-9 rounded-lg border text-xs ${year===viewYear ? "border-[#7bd7d4]/55 bg-[#2a8d8b]" : "border-white/10 bg-[#344257] hover:bg-[#405067]"}`}>{year}</button>)}</div>
        : <>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-white/46">{VOUCHER_WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">{dates.map((day) => {
            const iso = voucherUtcIso(day);
            const inMonth = day.getUTCMonth() === viewMonth;
            const selected = Boolean(chosen && chosen.year === day.getUTCFullYear() && chosen.month === day.getUTCMonth()+1 && chosen.day === day.getUTCDate());
            return <button key={iso} type="button" onClick={() => choose(iso)} aria-label={voucherDateLabel(iso)} aria-pressed={selected}
              className={`relative h-9 rounded-lg border text-xs transition ${selected ? "border-[#b6f5ef]/65 bg-[#2a8d8b] text-white" : inMonth ? "border-transparent bg-[#344257] text-white/85 hover:border-[#7bd7d4]/28 hover:bg-[#42556a]" : "border-transparent text-white/30 hover:bg-white/10"}`}>
              {day.getUTCDate()}{iso === today && !selected && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#7bd7d4]"/>}
            </button>;
          })}</div>
        </>}
        <div className="mt-3 flex justify-between gap-2 border-t border-white/10 pt-2.5">
          <button type="button" onClick={() => choose("")} className="h-8 rounded-lg border border-white/12 px-3 text-[11px] text-white/65 hover:bg-white/10">Törlés</button>
          <button type="button" onClick={() => choose(today)} className="h-8 rounded-lg border border-[#7bd7d4]/35 bg-[#2a8d8b]/25 px-3 text-[11px] text-[#d7fffd] hover:bg-[#2a8d8b]/45">Ma</button>
        </div>
      </div>, document.body,
    )}
  </div>;
}

const VOUCHER_EXPORT_ICONS = {
  pdf: "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/adobe-acrobat-reader-icon-free-png.webp",
  xlsx: "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/excel_icon_4.jpg",
};
function VoucherExportButtons({ section, params }: { section: "items" | "transactions"; params: URLSearchParams }) {
  const base = section === "items" ? `${ROOT}/export` : `${ROOT}/transactions/export`;
  const query = params.toString();
  return <div className="flex items-center gap-2">
    {(["pdf","xlsx"] as const).map(format => <a key={format}
      href={`${base}.${format}${query ? `?${query}` : ""}`}
      title={`${section === "items" ? "Utalványok" : "Pénzügyi napló"} exportálása ${format === "pdf" ? "PDF" : "Excel"} formátumban`}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/16 bg-[#354153] px-3 text-[12px] text-white transition hover:border-[#7bd7d4]/40 hover:bg-[#405267] focus:outline-none focus:ring-2 focus:ring-[#7bd7d4]/30">
      <img src={VOUCHER_EXPORT_ICONS[format]} alt="" className="h-[22px] w-[22px] shrink-0 rounded-[4px] bg-white object-contain p-[2px]" />
      {format === "pdf" ? "PDF" : "Excel"}
    </a>)}
  </div>;
}

export default function AllInVouchers({ actor, role, locationCode }: {
  actor: string; role: Role; locationCode?: string;
}) {
  const admin = role === "admin";
  const ownLocation = admin ? "" : locationCode === "magazin_targu_secuiesc" ? "magazin_targu_secuiesc" : "main_warehouse";
  const [tab,setTab] = useState<Tab>("overview");
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [summary,setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [items,setItems] = useState<Voucher[]>([]);
  const [transfers,setTransfers] = useState<Transfer[]>([]);
  const [registerLanguage,setRegisterLanguage] = useState<Lang>("HU");
  const [registerCode,setRegisterCode] = useState("");
  const [registeredSession,setRegisteredSession] = useState(0);
  const [intakePending,setIntakePending] = useState(0);
  const [intakeFailed,setIntakeFailed] = useState<string[]>([]);
  const intakeQueueRef = useRef<Array<{code:string;language:Lang}>>([]);
  const intakeProcessingRef = useRef(false);
  const registerRef = useRef<HTMLInputElement>(null);
  const [destination,setDestination] = useState("main_warehouse");
  const [transferCode,setTransferCode] = useState("");
  const [draftCodes,setDraftCodes] = useState<string[]>([]);
  const transferRef = useRef<HTMLInputElement>(null);
  const [activeTransfer,setActiveTransfer] = useState<Transfer | null>(null);
  const [transferLines,setTransferLines] = useState<TransferLine[]>([]);
  const [receiveCode,setReceiveCode] = useState("");
  const [receivePending,setReceivePending] = useState(0);
  const receiveQueueRef = useRef<Array<{code:string;transferId:string;destination:string}>>([]);
  const receiveProcessingRef = useRef(false);
  const receiveRef = useRef<HTMLInputElement>(null);
  const [locationFilter,setLocationFilter] = useState("");
  const [langFilter,setLangFilter] = useState("");
  const [statusFilter,setStatusFilter] = useState("");
  const [search,setSearch] = useState("");
  const [searchApplied,setSearchApplied] = useState("");
  const [detail,setDetail] = useState<Voucher|null>(null);
  const [events,setEvents] = useState<Array<{kind:string;actor:string;from_location:string;to_location:string;created_at:string}>>([]);
  const [previewLang,setPreviewLang] = useState<Lang>("HU");
  const [financeEnabled,setFinanceEnabled] = useState(false);
  const [financeLoading,setFinanceLoading] = useState(true);
  const [issueLocation,setIssueLocation] = useState("main_warehouse");
  const [issueCode,setIssueCode] = useState("");
  const [issueAmount,setIssueAmount] = useState("");
  const [issueBuyer,setIssueBuyer] = useState("");
  const [issueRecipient,setIssueRecipient] = useState("");
  const [issueReference,setIssueReference] = useState("");
  const [issueMethod,setIssueMethod] = useState<"cash"|"card"|"bank_transfer">("cash");
  const [issuePaymentConfirmed,setIssuePaymentConfirmed] = useState(false);
  const [issueBusy,setIssueBusy] = useState(false);
  const [issueItem,setIssueItem] = useState<Voucher|null>(null);
  const [issueSuccess,setIssueSuccess] = useState<string|null>(null);
  const issueKeyRef=useRef("");
  const issueRef=useRef<HTMLInputElement>(null);
  const [ledgerFrom,setLedgerFrom] = useState("");
  const [ledgerTo,setLedgerTo] = useState("");
  const [ledgerRows,setLedgerRows] = useState<VoucherTxn[]>([]);
  const [ledgerSummary,setLedgerSummary] = useState<VoucherTxSummary[]>([]);
  const [ledgerBusy,setLedgerBusy] = useState(false);
  const [ledgerError,setLedgerError] = useState("");
  const [ledgerPeriod,setLedgerPeriod] = useState<VoucherLedgerPreset>("all");
  const [ledgerCalendarOpen,setLedgerCalendarOpen] = useState<"from" | "to" | null>(null);
  const closeLedgerCalendar = useCallback(() => setLedgerCalendarOpen(null), []);

  const listLocation = admin ? locationFilter : ownLocation;
  const issueAt=admin?issueLocation:ownLocation;
  useEffect(()=>{
    let alive=true;
    void request<{enabled:boolean}>("/finance-status").then(r=>{if(alive)setFinanceEnabled(r.enabled===true);})
      .catch(()=>{if(alive)setFinanceEnabled(false);})
      .finally(()=>{if(alive)setFinanceLoading(false);});
    try{
      const code=(sessionStorage.getItem('allin:vouchers:scan')||'').trim().toUpperCase();
      if(code){setTab('issue');setIssueCode(code);sessionStorage.removeItem('allin:vouchers:scan');}
    }catch{}
    return()=>{alive=false;};
  },[]);
  useEffect(()=>{setIssueItem(null);setIssuePaymentConfirmed(false);issueKeyRef.current='';},[issueCode,issueLocation]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearchApplied(search.trim()), 260);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const listParams = new URLSearchParams();
      if (listLocation) listParams.set("location", listLocation);
      if (langFilter) listParams.set("language", langFilter);
      if (statusFilter) listParams.set("status", statusFilter);
      if (searchApplied) listParams.set("search", searchApplied);
      listParams.set("limit", "200");
      const allParams = new URLSearchParams();
      if (ownLocation) allParams.set("location", ownLocation);
      const [s,i,t] = await Promise.all([
        request<Summary>(`/summary?${allParams}`),
        request<{items:Voucher[]}>(`/items?${listParams}`),
        request<{items:Transfer[]}>(`/transfers?${allParams}`),
      ]);
      setSummary(s);setItems(i.items);setTransfers(t.items);
    } catch (e) { setError(e instanceof Error ? e.message : "Az utalvány-adatok nem tölthetők be."); }
    finally {setLoading(false);}
  },[listLocation,langFilter,statusFilter,searchApplied,ownLocation]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{if(tab==="receive-stock") window.setTimeout(()=>registerRef.current?.focus(),70);},[tab]);

  function goBack() {
    if ((intakePending || receivePending) &&
        !window.confirm("Vannak még feldolgozás alatt álló beolvasások. Biztosan elhagyod az oldalt?")) return;

    const returnKey = "allin:vouchers:return";
    // A korabban eltarolt oldal egy masik bejelentkezesbol is megmaradhat.
    // Adminnal soha nem lehet a bolti elado oldalara visszairanyitani.
    if (admin) {
      try { window.sessionStorage.removeItem(returnKey); } catch {}
      window.location.hash = "home";
      return;
    }

    // Az elado csak a sajat uzlete oldalaira lephet vissza.
    const targu = ownLocation === "magazin_targu_secuiesc";
    const fallback = targu ? "magazintargusale" : "magazinciucsale";
    const allowed = targu
      ? ["magazintargusale", "magazintargu", "shopsale", "shopadmin"]
      : ["magazinciucsale", "magazinciuc", "shopsale", "shopadmin"];
    let target = fallback;
    try {
      const stored = (window.sessionStorage.getItem(returnKey) || "")
        .trim().replace(/^#/, "").toLowerCase();
      if (allowed.includes(stored)) target = stored;
      window.sessionStorage.removeItem(returnKey);
    } catch {}
    window.location.hash = target;
  }
  // A vonalkodolvaso gyorsabb lehet a Rendernel: a beolvasas nem blokkolodik
  // egyetlen valaszra. A szerveroldali UNIQUE esemeny az igazsag forrasa.
  function register(){
    if(!admin)return;
    const code=cleanCode(registerCode);
    if(!code)return;
    if(!/^[A-Z0-9][A-Z0-9._-]{7,63}$/.test(code)){
      setError(`${code}: érvénytelen sorszám (8–64 karakter).`);return;
    }
    if(intakeQueueRef.current.some(x=>x.code===code)){
      setError(`${code}: a beolvasási sorban már szerepel.`);setRegisterCode("");return;
    }
    intakeQueueRef.current.push({code,language:registerLanguage});
    setIntakePending(intakeQueueRef.current.length+Number(intakeProcessingRef.current));
    setRegisterCode("");setError("");
    window.setTimeout(()=>registerRef.current?.focus(),0);
    if(!intakeProcessingRef.current) void processIntakeQueue();
  }
  async function processIntakeQueue(){
    if(intakeProcessingRef.current)return;
    intakeProcessingRef.current=true;
    try{
      while(intakeQueueRef.current.length){
        const next=intakeQueueRef.current.shift()!;
        setIntakePending(intakeQueueRef.current.length+1);
        try{
          await request(`/register`,{method:"POST",body:JSON.stringify(next)});
          setRegisteredSession(x=>x+1);
          setNotice(`${next.code} bevételezve (${next.language}); értéke 0 RON.`);
        }catch(e){
          setIntakeFailed(x=>[`${next.code}: ${e instanceof Error?e.message:"Szerverhiba"}`,...x].slice(0,30));
          setError(`${next.code}: ${e instanceof Error?e.message:"Bevételezési hiba."}`);
        }
      }
    }finally{
      intakeProcessingRef.current=false;
      setIntakePending(0);
      await refresh();
      window.setTimeout(()=>registerRef.current?.focus(),50);
    }
  }
  function addTransferCode(){
    const code=cleanCode(transferCode);
    if(!code)return;
    if(draftCodes.includes(code)){setError(`${code}: már szerepel az átadási listában.`);return;}
    setDraftCodes(x=>[...x,code]);setTransferCode("");setError("");
    window.setTimeout(()=>transferRef.current?.focus(),30);
  }
  async function createTransfer(){
    if(!admin||!draftCodes.length)return;
    setBusy(true);setError("");
    try{
      const response=await request<{id:string;total:number}>(`/transfers`,{method:"POST",body:JSON.stringify({toLocation:destination,codes:draftCodes})});
      setDraftCodes([]);setTransferCode("");setNotice(`${response.total} db átadásra előkészítve. Az üzlet az átvételi beolvasással fogja készletre venni.`);
      setTab("transfers");await refresh();
    }catch(e){setError(e instanceof Error?e.message:"Az átadás nem sikerült.");}
    finally{setBusy(false);}
  }
  async function openTransfer(t:Transfer){
    setBusy(true);setError("");
    try{
      const r=await request<{items:TransferLine[]}>(`/transfers/${t.id}/items${ownLocation?`?location=${ownLocation}`:""}`);
      setActiveTransfer(t);setTransferLines(r.items);setReceiveCode("");
      window.setTimeout(()=>receiveRef.current?.focus(),60);
    }catch(e){setError(e instanceof Error?e.message:"Átadás nem tölthető be.");}
    finally{setBusy(false);}
  }
  // Az uzleti atvetel is folyamatos csippantast tamogat.
  function receive(){
    if(!activeTransfer||!receiveCode.trim())return;
    const code=cleanCode(receiveCode);
    if(!/^[A-Z0-9][A-Z0-9._-]{7,63}$/.test(code)){
      setError(`${code}: érvénytelen vonalkód.`);return;
    }
    receiveQueueRef.current.push({code,transferId:activeTransfer.id,destination:ownLocation||activeTransfer.to_location});
    setReceivePending(receiveQueueRef.current.length+Number(receiveProcessingRef.current));
    setReceiveCode("");setError("");
    window.setTimeout(()=>receiveRef.current?.focus(),0);
    if(!receiveProcessingRef.current) void processReceiveQueue();
  }
  async function processReceiveQueue(){
    if(receiveProcessingRef.current)return;
    receiveProcessingRef.current=true;
    let lastTransferId="";
    try{
      while(receiveQueueRef.current.length){
        const next=receiveQueueRef.current.shift()!;
        lastTransferId=next.transferId;
        setReceivePending(receiveQueueRef.current.length+1);
        try{
          const r=await request<{duplicate?:boolean;total?:number;received?:number}>(`/transfers/${next.transferId}/receive`,{
            method:"POST",body:JSON.stringify({code:next.code,location:next.destination}),
          });
          setNotice(r.duplicate ? `${next.code}: már átvették; nem számoltuk kétszer.` : `${next.code} átvéve. ${r.received}/${r.total} db.`);
          setTransferLines(x=>x.map(y=>y.code===next.code?{...y,accepted_at:y.accepted_at||new Date().toISOString()}:y));
        }catch(e){
          setError(`${next.code}: ${e instanceof Error?e.message:"Átvételi hiba."}`);
        }
      }
    }finally{
      receiveProcessingRef.current=false;
      setReceivePending(0);
      await refresh();
      if(lastTransferId){
        try{
          const r=await request<{items:TransferLine[]}>(`/transfers/${lastTransferId}/items${ownLocation?`?location=${ownLocation}`:""}`);
          setTransferLines(r.items);
        }catch{}
      }
      window.setTimeout(()=>receiveRef.current?.focus(),50);
    }
  }
  async function cancelTransfer(id:string){
    if(!admin||!window.confirm("Biztosan visszavonod a még át nem vett utalványok átadását?")) return;
    setBusy(true);setError("");
    try{await request(`/transfers/${id}/cancel`,{method:"POST",body:"{}"});setNotice("A még át nem vett sorszámok visszakerültek a központba.");await refresh();}
    catch(e){setError(e instanceof Error?e.message:"Nem sikerült a visszavonás.");}
    finally{setBusy(false);}
  }
  async function openVoucher(item:Voucher){
    setDetail(item);setEvents([]);
    try{const r=await request<{events:typeof events}>(`/items/${encodeURIComponent(item.code)}/events${ownLocation?`?location=${ownLocation}`:""}`);setEvents(r.events);}
    catch{/* A részletek akkor is látszanak, ha a napló lekérése átmenetileg sikertelen. */}
  }
  // A szerver szur, nem csak az elso N betoltott sor: a regi sorszamok is kereshetok.
  const visibleItems=items;
  const getQty=(loc:string,lang:Lang,status="blank")=>summary.rows.filter(x=>x.location_code===loc&&x.language===lang&&x.status===status).reduce((a,x)=>a+Number(x.quantity),0);

  async function checkIssueCode(){
    const code=cleanCode(issueCode);
    if(!code)return;
    setIssueBusy(true);setError("");setIssueSuccess(null);
    try{
      const data=await request<{item:Voucher}>(`/balance/${encodeURIComponent(code)}`);
      if(data.item.status!=='blank')throw new Error('Ez az utalvany mar aktivalva, atadas alatt vagy ervenytelen.');
      if(data.item.location_code!==issueAt)throw new Error('Az utalvany nincs a kivalasztott uzlet ures keszleteben.');
      setIssueItem(data.item);
    }catch(e){setIssueItem(null);setError(e instanceof Error?e.message:'Utalvanyellenorzesi hiba.');}
    finally{setIssueBusy(false);}
  }
  async function activateVoucher(){
    if(!issueItem||!financeEnabled||issueBusy)return;
    const raw=String(issueAmount).trim().replace(',','.');
    if(!/^\d{1,6}(?:\.\d{1,2})?$/.test(raw)||Number(raw)<=0||Number(raw)>100000){setError('0,01 es 100 000 RON kozotti erteket adj meg.');return;}
    if(!issuePaymentConfirmed){setError('Ellenorizd es igazold vissza a fizetes bevetelét.');return;}
    setIssueBusy(true);setError('');setIssueSuccess(null);
    if(!issueKeyRef.current) issueKeyRef.current=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`voucher-issue-${Date.now()}`;
    try{
      const result=await request<{duplicate?:boolean;item:{code:string;amount:number}}>(`/issue`,{
        method:'POST',headers:{'Idempotency-Key':issueKeyRef.current},
        body:JSON.stringify({code:issueItem.code,amount:Number(raw),paymentMethod:issueMethod,
          location:issueAt,paymentConfirmed:true,buyerName:issueBuyer.trim()||null,
          recipientName:issueRecipient.trim()||null,reference:issueReference.trim()||null,idempotencyKey:issueKeyRef.current}),
      });
      setIssueSuccess(`${result.item.code} • ${money(result.item.amount)} • ${result.duplicate?'korabbi aktivacio igazolva':'sikeresen aktivalva'}`);
      setIssueCode('');setIssueItem(null);setIssueAmount('');setIssueBuyer('');setIssueRecipient('');
      setIssueReference('');setIssuePaymentConfirmed(false);issueKeyRef.current='';
      await refresh();
      window.setTimeout(()=>issueRef.current?.focus(),50);
    }catch(e){setError(e instanceof Error?e.message:'Az aktivacio nem sikerult. Ellenorizd a naplot mielott ujra probalod.');}
    finally{setIssueBusy(false);}
  }
  async function loadLedger(){
    setLedgerBusy(true);setLedgerError('');
    try{
      const args=new URLSearchParams();
      if(!admin)args.set('location',ownLocation);
      if(ledgerFrom)args.set('from',ledgerFrom);
      if(ledgerTo)args.set('to',ledgerTo);
      const data=await request<{items:VoucherTxn[];summary:VoucherTxSummary[]}>(`/transactions?${args}`);
      setLedgerRows(data.items||[]);setLedgerSummary(data.summary||[]);
    }catch(e){setLedgerError(e instanceof Error?e.message:'Nem sikerult betolteni a penznaplot.');}
    finally{setLedgerBusy(false);}
  }
  useEffect(()=>{if(tab==='ledger')void loadLedger();},[tab,ledgerFrom,ledgerTo,admin,ownLocation]);

  function changeLedgerFrom(next: string) {
    setLedgerFrom(next);
    setLedgerTo((current) => next && current && current < next ? next : current);
    setLedgerPeriod("custom");
  }
  function changeLedgerTo(next: string) {
    setLedgerTo(next);
    setLedgerFrom((current) => next && current && current > next ? next : current);
    setLedgerPeriod("custom");
  }
  function applyLedgerPeriod(preset: VoucherLedgerPreset) {
    if (preset === "custom") {
      setLedgerPeriod("custom");
      setLedgerCalendarOpen("from");
      return;
    }
    const today = voucherTodayIso();
    const from = preset === "all" ? "" : preset === "today" ? today : preset === "yesterday"
      ? voucherShiftDays(today, -1) : preset === "week" ? voucherShiftDays(today, -6)
      : preset === "month30" ? voucherShiftDays(today, -29) : `${today.slice(0, 7)}-01`;
    const to = preset === "all" ? "" : preset === "yesterday" ? from : today;
    setLedgerFrom(from);
    setLedgerTo(to);
    setLedgerPeriod(preset);
    setLedgerCalendarOpen(null);
  }

  const nav:Array<{id:Tab;label:string;icon:typeof Gift}> = [
    {id:"overview",label:"Áttekintés",icon:ClipboardList},
    ...(admin?[{id:"receive-stock" as Tab,label:"Bevételezés",icon:PackagePlus}]:[]),
    {id:"transfers",label:admin?"Átadások":"Átvételek",icon:Truck},
    {id:"list",label:"Utalványok",icon:ListFilter},
    {id:"issue",label:"Értékesítés / aktiválás",icon:Gift},
    {id:"ledger",label:"Pénzügyi napló",icon:FileClock},
    {id:"preview",label:"HU / RO előnézet",icon:Gift},
  ];

  const voucherListExportParams = new URLSearchParams();
  if(listLocation) voucherListExportParams.set("location",listLocation);
  if(langFilter) voucherListExportParams.set("language",langFilter);
  if(statusFilter) voucherListExportParams.set("status",statusFilter);
  if(searchApplied) voucherListExportParams.set("search",searchApplied);
  const voucherLedgerExportParams = new URLSearchParams();
  if(!admin && ownLocation) voucherLedgerExportParams.set("location",ownLocation);
  if(ledgerFrom) voucherLedgerExportParams.set("from",ledgerFrom);
  if(ledgerTo) voucherLedgerExportParams.set("to",ledgerTo);

  return <main className="min-h-screen bg-gradient-to-br from-[#626d7d] via-[#555f71] to-[#414d5e] px-3 py-5 text-white sm:px-5">
    <div className="mx-auto max-w-[1480px] space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-[25px] border border-white/20 bg-[#303a4c] px-5 py-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-[#3a4558]"><Gift className="text-[#a9f0eb]" size={27} strokeWidth={1.7}/></span>
          <div><p className="text-[10px] uppercase tracking-[.2em] text-white/50">AllInFashion • önálló nyilvántartás</p>
            <h1 className="mt-1 text-2xl tracking-tight">Ajándékutalvány központ</h1>
            <p className="mt-0.5 text-xs text-white/55">{admin?"Adminisztráció":STORE_LABELS[ownLocation]} • {actor}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill>{financeLoading?'Pénztári állapot ellenőrzése…':financeEnabled?'Pénzügyi funkció aktív':'Pénzügyi funkció zárolva'}</Pill>
          <button type="button" onClick={()=>void refresh()} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/18 bg-white/[0.06] px-3 text-sm hover:bg-white/10 disabled:opacity-50"><RefreshCw size={16} className={loading?"animate-spin":""}/> Frissítés</button>
          <button type="button" onClick={goBack} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#8be0da]/42 bg-[#2a8d8b] px-3 text-sm hover:bg-[#319c99]"><ArrowLeft size={16}/> Vissza</button>
        </div>
      </header>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/12 bg-[#303a4c] p-2">
        {nav.map(({id,label,icon:Icon})=><button key={id} type="button" onClick={()=>{setTab(id);setError("");setNotice("");}}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm transition ${tab===id?"border-[#b3f3ec]/48 bg-[#2a8d8b]":"border-white/10 bg-[#354153] text-white/72 hover:bg-white/10"}`}><Icon size={17}/>{label}</button>)}
      </div>
      {error&&<div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-300/40 bg-[#762d39]/65 px-4 py-3 text-sm text-white"><ShieldAlert size={19} className="shrink-0"/>{error}<button onClick={()=>setError("")} className="ml-auto"><X size={15}/></button></div>}
      {notice&&<div className="flex items-start gap-2 rounded-2xl border border-[#8ddfd9]/40 bg-[#285b5d]/70 px-4 py-3 text-sm text-white"><CheckCircle2 size={19} className="shrink-0"/>{notice}</div>}

      {tab==="overview"&&<div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Üres utalványok" value={`${summary.totals.blank} db`} sub="Még nincs pénzbeli értékük"/>
          <Kpi label="Átadás alatt" value={`${summary.totals.in_transfer} db`} sub="A bolt csak átvételi csippantás után látja készleten"/>
          <Kpi label="Aktív / részben felhasznált" value={`${summary.totals.active+summary.totals.partial} db`} sub="Kiadott és még költhető egyenlegek"/>
          <Kpi label="Fennálló utalványegyenleg" value={money(summary.totals.outstanding)} sub="Nem termékforgalom"/>
        </div>
        <section className="rounded-[22px] border border-white/14 bg-[#303a4c] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">Fizikai utalványkészlet • HU / RO</h2><Pill>{admin?"Minden készlethely":"Saját üzlet"}</Pill></div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-white/46"><tr className="border-b border-white/12"><th className="px-3 py-3 font-normal">Készlethely</th><th className="px-3 py-3 text-right font-normal">HU üres</th><th className="px-3 py-3 text-right font-normal">RO üres</th><th className="px-3 py-3 text-right font-normal">Összesen</th></tr></thead>
            <tbody>{(admin?["admin_storage","main_warehouse","magazin_targu_secuiesc"]:[ownLocation]).map(loc=><tr key={loc} className="border-b border-white/8"><td className="px-3 py-3">{STORE_LABELS[loc]}</td><td className="px-3 py-3 text-right tabular-nums">{getQty(loc,"HU")}</td><td className="px-3 py-3 text-right tabular-nums">{getQty(loc,"RO")}</td><td className="px-3 py-3 text-right tabular-nums text-[#b5f7f2]">{getQty(loc,"HU")+getQty(loc,"RO")}</td></tr>)}</tbody>
          </table></div>
          {summary.totals.physical > 0 && (admin?["main_warehouse","magazin_targu_secuiesc"]:[ownLocation]).some(loc=>getQty(loc,"HU")+getQty(loc,"RO")<5) &&
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-300/28 bg-amber-400/10 p-3 text-xs text-amber-100"><ShieldAlert size={17}/> Figyelem: legalább egy üzletben 5 db alá csökkent az üres utalványok készlete.</div>}
          <p className="mt-3 text-xs leading-relaxed text-white/52">Az üres utalványok bevezetési értéke 0 RON. A rendszer nem módosítja a ruhakészletet, eladásokat vagy a napi kasszát.</p>
        </section>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={()=>setTab(admin?"receive-stock":"transfers")} className="rounded-[20px] border border-[#a5e8e3]/32 bg-[#29535b] p-5 text-left hover:bg-[#2b6267]"><div className="flex items-center gap-2 text-lg"><PackageCheck size={21}/>{admin?"Üres utalványok bevételezése":"Átvétel vonalkóddal"}<ChevronRight className="ml-auto"/></div><p className="mt-2 text-sm text-white/58">{admin?"HU és RO papírok gyors, soronkénti csippantása":"Átadott utalványok tényleges beolvasása"}</p></button>
          <button type="button" onClick={()=>setTab("list")} className="rounded-[20px] border border-white/16 bg-[#344256] p-5 text-left hover:bg-[#3c4b61]"><div className="flex items-center gap-2 text-lg"><Search size={21}/> Sorszám ellenőrzése <ChevronRight className="ml-auto"/></div><p className="mt-2 text-sm text-white/58">Korábbi bevezetés, aktuális készlethely, életút naplózva</p></button>
        </div>
      </div>}

      {tab==="receive-stock"&&admin&&<section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="rounded-[22px] border border-white/14 bg-[#303a4c] p-5">
          <h2 className="flex items-center gap-2 text-lg"><Barcode size={21}/> Üres utalvány bevételezése</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/55">A nyelv addig marad kiválasztva, amíg át nem állítod. A sorszámot nem a rendszer generálja, hanem a már kinyomtatott papírról olvassa be.</p>
          <div className="mt-4 flex items-center gap-2">{(["HU","RO"] as Lang[]).map(lang=><button key={lang} type="button" onClick={()=>setRegisterLanguage(lang)}
            className={`h-12 min-w-24 rounded-xl border text-sm ${registerLanguage===lang?"border-[#adf4ed]/65 bg-[#2a8d8b]":"border-white/16 bg-[#354153] hover:bg-white/10"}`}>{lang}</button>)}</div>
          <form onSubmit={e=>{e.preventDefault();void register();}} className="mt-4 flex flex-wrap gap-2">
            <input ref={registerRef} value={registerCode} onChange={e=>setRegisterCode(e.target.value)} autoComplete="off"
              placeholder="Csippantsd be az utalvány sorszámát…" className="h-14 min-w-0 flex-1 rounded-xl border border-[#8bded9]/32 bg-[#233145] px-4 text-lg outline-none focus:border-[#9ef4ef]"/>
            <button type="submit" disabled={!registerCode.trim()} className="h-14 rounded-xl border border-[#a7ece6]/40 bg-[#2a8d8b] px-5 text-sm disabled:opacity-40">Bevezetés</button>
          </form>
          <p className="mt-3 text-xs text-white/55">Dupla sorszámot az adatbázis is tiltja. Bevezetéskor az érték mindig 0,00 RON. <span className="text-[#b6f5ee]">Feldolgozás alatt: {intakePending} db.</span></p>
        </div>
        <div className="rounded-[22px] border border-white/14 bg-[#344256] p-5"><p className="text-[11px] uppercase tracking-wider text-white/50">Ebben a munkamenetben</p><p className="mt-3 text-5xl tabular-nums">{registeredSession}</p><p className="mt-2 text-sm text-white/58">új, egyedi sorszám rögzítve</p><div className="mt-5 border-t border-white/12 pt-4 text-sm text-white/65">Kiválasztott nyelv: <span className="text-[#b4f5ef]">{registerLanguage}</span><p className="mt-1 text-xs text-white/46">Ez számláló, nem pénzösszeg.</p></div>
          {intakeFailed.length>0&&<div className="mt-4 max-h-36 overflow-y-auto rounded-xl border border-rose-300/25 bg-rose-500/10 p-3 text-xs text-rose-100"><p className="mb-2">Nem rögzített beolvasások: {intakeFailed.length}</p>{intakeFailed.map((msg,i)=><p key={i} className="py-1">{msg}</p>)}</div>}
        </div>
      </section>}

      {tab==="transfers"&&<div className="space-y-4">
        {admin&&<section className="rounded-[22px] border border-white/14 bg-[#303a4c] p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-lg"><Truck size={21}/> Átadás előkészítése</h2>
          <p className="mt-1 text-sm text-white/55">Csak üres, központi utalványok adhatók át. Az üzlet átvétele külön, egyenkénti beolvasással történik.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-xs text-white/65">Célüzlet</span>
            <VoucherSelect label="Célüzlet" value={destination} onChange={setDestination} className="w-full sm:w-[235px]"
              options={[{value:"main_warehouse",label:"Csíkszereda"},{value:"magazin_targu_secuiesc",label:"Kézdivásárhely"}]}/>
            <Pill>{draftCodes.length} darab a csomagban</Pill>
          </div>
          <form onSubmit={e=>{e.preventDefault();addTransferCode();}} className="mt-3 flex gap-2">
            <input ref={transferRef} value={transferCode} onChange={e=>setTransferCode(e.target.value)} className="h-12 min-w-0 flex-1 rounded-xl border border-white/20 bg-[#253144] px-4 text-sm outline-none focus:border-[#8fe9e4]" placeholder="Üres utalvány vonalkódja"/>
            <button type="submit" className="h-12 rounded-xl border border-white/20 bg-[#354d60] px-4 text-sm">Hozzáadás</button>
          </form>
          {draftCodes.length>0&&<div className="mt-3 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">{draftCodes.map(code=><button title="Eltávolítás" type="button" key={code} onClick={()=>setDraftCodes(x=>x.filter(y=>y!==code))} className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs">{shortCode(code)}<X size={13}/></button>)}</div>}
          <button type="button" disabled={busy||!draftCodes.length} onClick={()=>void createTransfer()} className="mt-4 h-12 rounded-xl border border-[#b1e8e5]/45 bg-[#2a8d8b] px-5 text-sm disabled:opacity-40">Átadás létrehozása • {draftCodes.length} db</button>
        </section>}
        <section className="rounded-[22px] border border-white/14 bg-[#303a4c] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">{admin?"Átadási napló":"Beérkező utalványok"}</h2><Pill>{transfers.length} átadás</Pill></div>
          <div className="mt-3 grid gap-2">{transfers.map(t=><div key={t.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/12 bg-[#344256] p-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/12 bg-[#253548]"><Truck size={21}/></span>
            <div className="min-w-0 flex-1"><p className="text-sm">{STORE_LABELS[t.from_location]} → {STORE_LABELS[t.to_location]}</p>
              <p className="mt-1 text-[11px] text-white/48">{date(t.created_at)} • {t.created_by||"–"} • {t.status}</p></div>
            <Pill green={t.received===t.total}>{t.received}/{t.total} db átvéve</Pill>
            <button type="button" disabled={receivePending>0} onClick={()=>void openTransfer(t)} className="h-11 rounded-xl border border-[#99e5e1]/30 bg-[#2a8d8b]/40 px-3 text-sm disabled:opacity-40">{t.status==="completed"?"Megtekintés":"Átvétel"}</button>
            {admin&&["pending","receiving"].includes(t.status)&&<button type="button" disabled={busy} onClick={()=>void cancelTransfer(t.id)} title="Át nem vett utalványok visszavonása" className="h-11 rounded-xl border border-rose-300/26 px-3 text-rose-100"><Ban size={16}/></button>}
          </div>)}{!transfers.length&&<p className="py-8 text-center text-sm text-white/45">Még nincs átadás.</p>}</div>
        </section>
        {activeTransfer&&<section className="rounded-[22px] border border-[#9be9e5]/38 bg-[#29414f] p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><div><h2 className="text-lg">Átvétel vonalkódonként</h2><p className="mt-1 text-xs text-white/58">{STORE_LABELS[activeTransfer.to_location]} • {transferLines.filter(x=>x.accepted_at).length}/{transferLines.length} db</p></div><button onClick={()=>{if(!receivePending)setActiveTransfer(null);}} disabled={receivePending>0} className="rounded-lg border border-white/18 p-2 disabled:opacity-30"><X size={18}/></button></div>
          {activeTransfer.status!=="cancelled"&&<form onSubmit={e=>{e.preventDefault();void receive();}} className="mt-3 flex gap-2"><input ref={receiveRef} value={receiveCode} onChange={e=>setReceiveCode(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-xl border border-[#9be9e5]/32 bg-[#223245] px-4 py-3 text-sm outline-none focus:border-[#a5ede8]" placeholder="Az átvett papír sorszáma…"/><button type="submit" disabled={!receiveCode.trim()} className="rounded-xl border border-[#99e5df]/36 bg-[#2a8d8b] px-4 text-sm disabled:opacity-50">Átveszem</button></form>}
          <p className="mt-2 text-xs text-white/55">Feldolgozás alatt: {receivePending} beolvasás</p>
          <div className="mt-3 grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{transferLines.map(x=><div key={x.code} className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#303a4c] px-3 py-2"><span className={x.accepted_at?"text-[#a8f0ea]":"text-white/30"}>{x.accepted_at?<CheckCircle2 size={15}/>:<Clock3 size={15}/>}</span><span className="min-w-0 flex-1 truncate text-xs" title={x.code}>{x.code}</span><Pill>{x.language}</Pill></div>)}</div>
        </section>}
      </div>}

      {tab==="list"&&<section className="rounded-[22px] border border-white/14 bg-[#303a4c] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">Sorszámozott utalványok</h2>
          {admin&&<VoucherExportButtons section="items" params={voucherListExportParams} />}
        </div><p className="mt-1 text-xs text-white/55">Egy sorszám csak egyszer hozható létre. A névérték és egyenleg az értékesítésig 0 RON.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {admin&&<VoucherSelect label="Készlethely szűrése" value={locationFilter} onChange={setLocationFilter} className="w-full sm:w-[220px]"
            options={[{value:"",label:"Minden készlethely"},...Object.entries(STORE_LABELS).map(([value,label])=>({value,label}))]}/>}
          <VoucherSelect label="Nyelv szűrése" value={langFilter} onChange={setLangFilter} className="w-full sm:w-[145px]"
            options={[{value:"",label:"HU és RO"},{value:"HU",label:"Magyar (HU)"},{value:"RO",label:"Román (RO)"}]}/>
          <VoucherSelect label="Állapot szűrése" value={statusFilter} onChange={setStatusFilter} className="w-full sm:w-[205px]"
            options={[{value:"",label:"Minden állapot"},{value:"blank",label:"Üres"},{value:"in_transfer",label:"Átadás alatt"},{value:"active",label:"Aktív"},{value:"partial",label:"Részben beváltva"},{value:"redeemed",label:"Felhasználva"},{value:"blocked",label:"Blokkolva"}]}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} className="h-11 min-w-[190px] flex-1 rounded-xl border border-white/15 bg-[#293548] px-3 text-sm outline-none focus:border-[#8be2dc]" placeholder="Sorszám keresése…"/>
        </div>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-[10px] uppercase tracking-wider text-white/45"><tr className="border-b border-white/12">{["Kód","Nyelv","Készlethely","Állapot","Egyenleg","Rögzítve",""].map(x=><th key={x} className="px-3 py-3 font-normal">{x}</th>)}</tr></thead>
          <tbody>{visibleItems.map(x=><tr key={x.id} className="border-b border-white/8 hover:bg-white/[0.035]"><td className="px-3 py-3 font-mono text-xs" title={x.code}>{shortCode(x.code)}</td><td className="px-3 py-3">{x.language}</td><td className="px-3 py-3 text-xs">{STORE_LABELS[x.location_code]}</td><td className="px-3 py-3 text-xs">{statusLabel(x.status)}</td><td className="px-3 py-3 tabular-nums">{money(x.balance)}</td><td className="px-3 py-3 text-xs text-white/48">{date(x.created_at)}</td><td className="px-3 py-3"><button onClick={()=>void openVoucher(x)} className="h-9 rounded-lg border border-white/16 bg-white/[0.06] px-3 text-xs hover:bg-white/10">Részletek</button></td></tr>)}
          </tbody></table>{!visibleItems.length&&<p className="py-10 text-center text-sm text-white/44">Nincs találat a szűrésre.</p>}</div>
          {items.length>=200&&<p className="mt-3 text-xs text-amber-100">Az első 200 találat jelenik meg. A pontos sorszámra keresés az egész adatbázist vizsgálja.</p>}
      </section>}

      {tab==="issue"&&<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_345px]">
        <section className="rounded-[22px] border border-white/14 bg-[#303a4c] p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-xl"><Gift size={23}/> Ajándékutalvány értékesítése</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">Csak a már bevezetett és a boltba átvett, üres utalvány adható el. A kód egyetlen egyszer aktiválható.</p>
          {!financeEnabled&&<div className="mt-3 rounded-xl border border-amber-200/28 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">A pénzügyi funkció jelenleg szerveroldalon zárolva van. A sorszám ellenőrizhető, de valódi pénzmozgás még nem rögzíthető.</div>}
          {admin&&<div className="mt-4 grid max-w-[380px] gap-1.5"><span className="text-xs text-white/65">Melyik üzletben történik az értékesítés?</span>
            <VoucherSelect label="Értékesítő üzlet" value={issueLocation} onChange={setIssueLocation}
              options={[{value:"main_warehouse",label:"Csíkszereda"},{value:"magazin_targu_secuiesc",label:"Kézdivásárhely"}]}/>
          </div>}
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="grid gap-1 text-xs text-white/65">Üres utalvány vonalkódja
              <input ref={issueRef} value={issueCode} onChange={e=>{setIssueCode(e.target.value);setError('');}}
                onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void checkIssueCode();}}}
                className="h-13 min-w-0 rounded-xl border border-[#a5ece5]/32 bg-[#253144] px-4 text-base text-white outline-none focus:border-[#a5ece5]" placeholder="Csippantsd be a sorszámot…"/></label>
            <button type="button" disabled={issueBusy||!issueCode.trim()} onClick={()=>void checkIssueCode()} className="mt-5 inline-flex h-13 items-center gap-2 rounded-xl border border-[#a5ece5]/42 bg-[#2a8d8b] px-4 text-sm disabled:opacity-40">
              {issueBusy?<Loader2 size={17} className="animate-spin"/>:<Barcode size={17}/>} Ellenőrzés
            </button>
          </div>
          {issueItem&&<div className="mt-4 space-y-4 rounded-2xl border border-[#9be9e5]/30 bg-[#263a4e] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-xs text-[#d5fffc]">{issueItem.code}</span><Pill green>{issueItem.language} • Üres</Pill></div>
            <label className="grid gap-1.5 text-sm text-white/80">Az utalvány értéke (RON)
              <input value={issueAmount} onChange={e=>{setIssueAmount(e.target.value.replace(/[^0-9.,]/g,''));issueKeyRef.current='';}}
                inputMode="decimal" placeholder="500,00" className="h-14 rounded-xl border border-[#a5ece5]/35 bg-[#192c40] px-4 text-right text-2xl text-white outline-none focus:border-[#a5ece5]"/></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs text-white/65">Ki vásárolta? (opcionális)
                <input value={issueBuyer} onChange={e=>{setIssueBuyer(e.target.value);issueKeyRef.current='';}} className="h-11 rounded-lg border border-white/16 bg-[#253144] px-3 text-sm"/></label>
              <label className="grid gap-1 text-xs text-white/65">Kinek szól? (opcionális)
                <input value={issueRecipient} onChange={e=>{setIssueRecipient(e.target.value);issueKeyRef.current='';}} className="h-11 rounded-lg border border-white/16 bg-[#253144] px-3 text-sm"/></label>
            </div>
            <div className="grid grid-cols-3 gap-2">{([
              ['cash','Készpénz'],['card','Bankkártya'],['bank_transfer','Átutalás'],
            ] as const).map(([method,label])=><button type="button" key={method} onClick={()=>{setIssueMethod(method);issueKeyRef.current='';}}
              className={`h-11 rounded-lg border px-2 text-xs ${issueMethod===method?'border-[#a5ece5]/60 bg-[#2a8d8b]':'border-white/16 bg-[#354153]'}`}>{label}</button>)}</div>
            <label className="grid gap-1 text-xs text-white/65">Bizonylat / POS referencia (opcionális)
              <input value={issueReference} onChange={e=>{setIssueReference(e.target.value);issueKeyRef.current='';}} className="h-11 rounded-lg border border-white/16 bg-[#253144] px-3 text-sm"/></label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/16 bg-[#354153] p-3 text-xs leading-5 text-white/85">
              <input type="checkbox" checked={issuePaymentConfirmed} onChange={e=>setIssuePaymentConfirmed(e.target.checked)} className="h-5 w-5 accent-[#108D8B]"/>
              Az összeget ténylegesen átvettük. Az utalvány aktiválható.
            </label>
            <button type="button" disabled={!financeEnabled||issueBusy||!issuePaymentConfirmed||!issueAmount.trim()}
              onClick={()=>void activateVoucher()} className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-[#a5ece5]/55 bg-[#2a8d8b] text-sm text-white disabled:cursor-not-allowed disabled:opacity-35">
              <CheckCircle2 size={19}/> Utalvány végleges aktiválása
            </button>
          </div>}
          {issueSuccess&&<div role="status" className="mt-4 rounded-xl border border-[#9be9e5]/36 bg-[#2a8d8b]/20 p-4 text-sm text-[#d7fffd]">{issueSuccess}</div>}
        </section>
        <aside className="rounded-[22px] border border-white/14 bg-[#344256] p-5">
          <h3 className="text-lg">Elszámolási szabály</h3>
          <p className="mt-3 text-sm leading-6 text-white/62">Utalványértékesítéskor nem csökken ruhakészlet, és nem keletkezik ruházati eladási sor. A beszedett pénz külön utalványnaplóba kerül, a beváltásig az egyenleg nyitott marad.</p>
          <div className="mt-4 space-y-2 rounded-xl border border-white/12 bg-black/10 p-3 text-xs text-white/75">
            <p>• Új sorszámot csak bevételezéskor rögzítünk.</p>
            <p>• Az aktiválást nem lehet megismételni.</p>
            <p>• A napzárást és a műszakátadást az aktuális pénzmozgások alapján ellenőrizzük.</p>
          </div>
        </aside>
      </div>}

      {tab==="ledger"&&<section className="rounded-[22px] border border-white/14 bg-[#303a4c] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">Utalvány pénzügyi napló</h2>
          <div className="flex flex-wrap gap-2">
            {admin&&<VoucherExportButtons section="transactions" params={voucherLedgerExportParams} />}
            <button type="button" onClick={()=>void loadLedger()} disabled={ledgerBusy} className="h-10 rounded-lg border border-white/20 bg-[#354153] px-3 text-xs disabled:opacity-40">Frissítés</button>
          </div></div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#354153]/55 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              ["today","Ma"],["yesterday","Tegnap"],["week","7 nap"],
              ["month30","30 nap"],["thisMonth","E havi"],["custom","Egyedi"],["all","Összes"],
            ] as Array<[VoucherLedgerPreset,string]>).map(([key,label])=><button key={key} type="button"
              onClick={()=>applyLedgerPeriod(key)} aria-pressed={ledgerPeriod===key}
              className={`h-8 rounded-lg border px-3 text-[11px] transition ${ledgerPeriod===key ? "border-[#93e7e1]/55 bg-[#2a8d8b] text-white" : "border-white/14 bg-[#303a4c] text-white/67 hover:border-[#7bd7d4]/30 hover:text-white"}`}>
              {label}
            </button>)}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-[455px]">
            <VoucherDatePicker label="Dátumtól" value={ledgerFrom} onChange={changeLedgerFrom}
              open={ledgerCalendarOpen==="from"} onOpen={()=>setLedgerCalendarOpen("from")} onClose={closeLedgerCalendar}/>
            <VoucherDatePicker label="Dátumig" value={ledgerTo} onChange={changeLedgerTo}
              open={ledgerCalendarOpen==="to"} onOpen={()=>setLedgerCalendarOpen("to")} onClose={closeLedgerCalendar}/>
          </div>
          <p className="mt-2 text-[10px] text-white/40">A dátumok magyar formátumban jelennek meg, a szűrés a romániai időzónát használja.</p>
        </div>
        {ledgerError&&<p role="alert" className="mt-3 text-xs text-rose-200">{ledgerError}</p>}
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{ledgerSummary.map(r=><Kpi key={r.kind+r.method} label={`${r.kind==='issue'?'Értékesítés':r.kind==='restore'?'Visszaírás':'Beváltás'} · ${r.method||'–'} · ${r.count} db`} value={money(r.total)}/>)}</div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead><tr className="border-b border-white/20 text-left text-[10px] uppercase text-white/48">{['Dátum','Kód','Esemény','Üzlet','Mód / bizonylat','Összeg','Rögzítette'].map(x=><th key={x} className="px-3 py-2 font-normal">{x}</th>)}</tr></thead>
          <tbody>{ledgerRows.map(r=><tr key={r.id} className="border-b border-white/10"><td className="px-3 py-3 text-xs">{date(r.created_at)}</td><td title={r.code} className="px-3 py-3 font-mono text-xs">{shortCode(r.code)}</td><td className="px-3 py-3">{r.kind==='issue'?'Eladás / aktiválás':r.kind==='restore'?'Visszáru · jóváírás':'Beváltás'}</td><td className="px-3 py-3 text-xs">{STORE_LABELS[r.location_code]}</td><td className="px-3 py-3 text-xs">{r.sale_number||r.reference||r.method||'–'}</td><td className="px-3 py-3 text-right tabular-nums">{money(r.amount)}</td><td className="px-3 py-3 text-xs">{r.actor}</td></tr>)}</tbody></table>
          {!ledgerRows.length&&<p className="py-10 text-center text-sm text-white/45">{ledgerBusy?'Pénznapló betöltése…':'Nincs rögzített utalványtranzakció.'}</p>}</div>
      </section>}

      {tab==="preview"&&<section className="mx-auto w-full max-w-[690px] rounded-[22px] border border-white/14 bg-[#303a4c] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base">Ajándékutalvány minta</h2>
          <div className="flex gap-1.5">{(["HU","RO"] as Lang[]).map(x=><button key={x} type="button" onClick={()=>setPreviewLang(x)}
            className={`h-9 min-w-12 rounded-lg border px-3 text-xs transition ${previewLang===x?"border-[#a4e7e4]/55 bg-[#2a8d8b]":"border-white/15 bg-[#354153] hover:bg-[#415167]"}`}>{x}</button>)}</div>
        </div>
        <div className="mt-3 flex items-center justify-center rounded-2xl border border-white/10 bg-[#263346] p-3">
          <img src={VOUCHER_PICS[previewLang]} alt={`${previewLang} ajándékutalvány minta`}
            className="block max-h-[405px] w-full max-w-[620px] rounded-lg border border-white/12 bg-white object-contain" />
        </div>
      </section>}

    </div>

    {detail&&<div className="fixed inset-0 z-[400] grid place-items-center bg-[#0a1524]/85 p-3 backdrop-blur-sm" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(null);}}>
      <section className="max-h-[90vh] w-full max-w-[720px] overflow-y-auto rounded-[25px] border border-[#9dece7]/32 bg-[#303a4c] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-2"><div><p className="text-xs text-white/45">Ajándékutalvány részletei</p><h2 className="mt-1 break-all font-mono text-xl">{detail.code}</h2></div><button onClick={()=>setDetail(null)} className="rounded-xl border border-white/16 p-2"><X size={18}/></button></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2"><Kpi label="Nyelv / állapot" value={`${detail.language} · ${statusLabel(detail.status)}`}/><Kpi label="Nyilvántartott egyenleg" value={money(detail.balance)}/></div>
        <p className="mt-4 text-sm text-white/65">Készlethely: {STORE_LABELS[detail.location_code]}. Rögzítés: {date(detail.created_at)}.</p>
        <h3 className="mt-5 text-sm">Sorszám előzményei</h3><div className="mt-2 max-h-60 space-y-2 overflow-y-auto">{events.map((e,i)=><div key={i} className="rounded-xl border border-white/10 bg-[#354153] px-3 py-2 text-xs"><span className="text-white">{e.kind}</span> <span className="text-white/50">· {date(e.created_at)} · {e.actor||"–"}</span><p className="mt-1 text-white/45">{[e.from_location&&STORE_LABELS[e.from_location],e.to_location&&STORE_LABELS[e.to_location]].filter(Boolean).join(" → ")}</p></div>)}{!events.length&&<p className="py-3 text-xs text-white/44">Nem érhető el mozgásnapló.</p>}</div>
      </section>
    </div>}
  </main>;
}
