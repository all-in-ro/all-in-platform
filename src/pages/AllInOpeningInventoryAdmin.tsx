import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  History,
  Loader2,
  PackageSearch,
  Play,
  Printer,
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
type InventoryMode = "standard" | "recovery";

const LOCATION_STORAGE_KEY = "allin:opening-inventory:location";
const ARCHIVE_PAGE_SIZE = 12;

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

function lineStatusLabel(line: AifOpeningInventoryAdminLine, mode: InventoryMode) {
  if (line.status === "missing") return mode === "recovery" ? "BIZTOS HIÁNY" : "HIÁNY";
  if (line.status === "awaiting_known") return "MÉG NEM TALÁLTÁK";
  if (line.status === "untracked") return mode === "recovery" ? "RÉGI / NEM NYILVÁNTARTOTT" : "TÖBBLET";
  if (line.status === "ok") return "RENDBEN";
  return "MÉG NEM SZÁMOLT";
}



function inventoryModeOf(session?: AifOpeningInventorySession | null): InventoryMode {
  return (session?.inventory_mode || session?.inventoryMode) === "standard" ? "standard" : "recovery";
}

function inventoryModeLabel(mode: InventoryMode) {
  return mode === "recovery" ? "Helyreállító leltár" : "Rendes leltár";
}

function safeFilePart(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90) || "leltar";
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadInventoryCsv(full: AifOpeningInventoryAdminDetail) {
  const session = full.session;
  const summary = full.summary;
  const mode = inventoryModeOf(session);
  const missingLabel = mode === "recovery" ? "Biztos hiány" : "Hiány";
  const extraLabel = mode === "recovery" ? "Régi / nem nyilvántartott" : "Többlet";
  const expectedLabel = mode === "recovery" ? "Igazolható minimum" : "Elvárt";

  const rows: unknown[][] = [
    ["ALL IN - Üzleti leltár"],
    ["Kód", session.code],
    ["Helyszín", session.location_name || session.location?.name || ""],
    ["Állapot", statusLabel(session.status)],
    ["Típus", inventoryModeLabel(mode)],
    ["Indítva", formatDateTime(session.started_at || session.startedAt || session.created_at)],
    ["Beolvasás lezárva", formatDateTime(session.counting_closed_at)],
    ["Készletre alkalmazva", formatDateTime(session.applied_at)],
    ["Megjegyzés", session.note || ""],
    [],
    ["Összesítő"],
    ["Leltár szerint most", `${qty(summary.counted_qty)} db`],
    [expectedLabel, `${qty(summary.known_min_qty)} db`],
    [missingLabel, `${qty(summary.definite_missing_qty)} db`],
    [extraLabel, `${qty(summary.untracked_qty)} db`],
    ["Készletkorrekció", `${n(summary.system_correction_qty) > 0 ? "+" : ""}${qty(summary.system_correction_qty)} db`],
    ["Leltárérték", `${money(summary.counted_retail_value)} RON`],
    ["Hiány értéke", `${money(summary.definite_missing_retail_value)} RON`],
    ["Többlet / régi készlet értéke", `${money(summary.untracked_retail_value)} RON`],
    [],
    [
      "Termék",
      "Márka",
      "Kategória",
      "Szín",
      "Méret",
      "Termékkód",
      "Vonalkód",
      "Belső SKU",
      "Rendszer induláskor",
      "Rendszer most",
      "Igazolt nettó / mozgás",
      expectedLabel,
      "Fizikailag számolt",
      "Leltár szerint most",
      "Számolás utáni mozgás",
      missingLabel,
      extraLabel,
      "Készletkorrekció",
      "Eladási ár",
      "Állapot",
      "Utolsó beolvasás",
      "Beolvasta",
      "Megjegyzés",
    ],
  ];

  for (const line of full.lines || []) {
    rows.push([
      line.product.title,
      line.product.brandName || "",
      line.product.categoryName || "",
      line.product.colorName || line.product.colorCode || "",
      line.product.size || "",
      line.product.productCode || line.product.modelCode || "",
      line.product.barcode || "",
      line.product.internalSku || "",
      qty(line.system_qty_start),
      qty(line.current_system_qty ?? line.system_qty_start),
      `${n(line.trusted_net_qty) > 0 ? "+" : ""}${qty(line.trusted_net_qty)}`,
      qty(line.known_min_qty),
      line.physical_counted_qty === null || line.physical_counted_qty === undefined ? "" : qty(line.physical_counted_qty),
      line.counted_qty === null || line.counted_qty === undefined ? "" : qty(line.counted_qty),
      `${n(line.movement_after_count_qty) > 0 ? "+" : ""}${qty(line.movement_after_count_qty || 0)}`,
      line.definite_missing_qty === null || line.definite_missing_qty === undefined ? "" : qty(line.definite_missing_qty),
      line.untracked_qty === null || line.untracked_qty === undefined ? "" : qty(line.untracked_qty),
      line.system_correction_qty === null || line.system_correction_qty === undefined ? "" : `${n(line.system_correction_qty) > 0 ? "+" : ""}${qty(line.system_correction_qty)}`,
      money(line.sell_price),
      lineStatusLabel(line, mode),
      formatDateTime(line.last_scanned_at),
      line.last_scanned_by || "",
      line.note || "",
    ]);
  }

  const unresolved = (full.unknown || []).filter((item) => !item.resolved_at && n(item.qty) > 0);
  if (unresolved.length) {
    rows.push([], ["Ellenőrzendő / ismeretlen kódok"], ["Kód", "Darab", "Utolsó beolvasás", "Beolvasta"]);
    for (const item of unresolved) {
      rows.push([item.scan_code, qty(item.qty), formatDateTime(item.last_scanned_at), item.last_scanned_by || ""]);
    }
  }

  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = String(session.started_at || session.created_at || "").slice(0, 10) || localDateInput();
  anchor.href = url;
  anchor.download = `${safeFilePart(session.location_name || session.location?.name)}_${date}_${safeFilePart(session.code)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function writeInventoryPrintReport(target: Window, full: AifOpeningInventoryAdminDetail) {
  const session = full.session;
  const summary = full.summary;
  const mode = inventoryModeOf(session);
  const missingLabel = mode === "recovery" ? "Biztos hiány" : "Hiány";
  const extraLabel = mode === "recovery" ? "Régi / nem nyilvántartott" : "Többlet";
  const expectedLabel = mode === "recovery" ? "Igazolható minimum" : "Elvárt";
  const lineRows = (full.lines || []).map((line, index) => {
    const counted = line.counted_qty === null || line.counted_qty === undefined ? "–" : qty(line.counted_qty);
    const missing = line.definite_missing_qty === null || line.definite_missing_qty === undefined ? "–" : qty(line.definite_missing_qty);
    const extra = line.untracked_qty === null || line.untracked_qty === undefined ? "–" : qty(line.untracked_qty);
    const correction = line.system_correction_qty === null || line.system_correction_qty === undefined
      ? "–"
      : `${n(line.system_correction_qty) > 0 ? "+" : ""}${qty(line.system_correction_qty)}`;
    return `<tr>
      <td class="center">${index + 1}</td>
      <td><strong>${escapeHtml(line.product.title)}</strong><br><span>${escapeHtml([line.product.brandName, line.product.colorName, line.product.size].filter(Boolean).join(" • "))}</span><br><span>${escapeHtml([line.product.productCode, line.product.barcode].filter(Boolean).join(" • "))}</span></td>
      <td class="right">${escapeHtml(qty(line.current_system_qty ?? line.system_qty_start))}</td>
      <td class="right">${escapeHtml(qty(line.known_min_qty))}</td>
      <td class="right">${escapeHtml(counted)}</td>
      <td class="right neg">${escapeHtml(missing)}</td>
      <td class="right pos">${escapeHtml(extra)}</td>
      <td class="right">${escapeHtml(correction)}</td>
      <td>${escapeHtml(lineStatusLabel(line, mode))}</td>
      <td>${escapeHtml(formatDateTime(line.last_scanned_at))}<br><span>${escapeHtml(line.last_scanned_by || "")}</span></td>
    </tr>`;
  }).join("");

  const unknownRows = (full.unknown || [])
    .filter((item) => !item.resolved_at && n(item.qty) > 0)
    .map((item) => `<tr><td>${escapeHtml(item.scan_code)}</td><td class="right">${escapeHtml(qty(item.qty))}</td><td>${escapeHtml(formatDateTime(item.last_scanned_at))}</td><td>${escapeHtml(item.last_scanned_by || "–")}</td></tr>`)
    .join("");

  const title = `Üzleti leltár - ${session.code}`;
  const locationName = session.location_name || session.location?.name || "Üzlet";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111827; font-size: 10px; }
    header { display:flex; justify-content:space-between; gap:20px; border-bottom:2px solid #111827; padding-bottom:10px; margin-bottom:10px; }
    h1 { margin:0; font-size:20px; font-weight:600; }
    .meta { margin-top:4px; color:#4b5563; line-height:1.45; }
    .summary { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin:10px 0; }
    .stat { border:1px solid #cbd5e1; border-radius:8px; padding:7px; }
    .stat b { display:block; font-size:13px; margin-top:3px; }
    table { width:100%; border-collapse:collapse; }
    th { background:#1f2937; color:#fff; padding:6px; border:1px solid #1f2937; text-align:left; font-size:9px; }
    td { padding:5px; border:1px solid #d1d5db; vertical-align:top; }
    tr:nth-child(even) td { background:#f8fafc; }
    .right { text-align:right; white-space:nowrap; }
    .center { text-align:center; }
    .neg { color:#b91c1c; }
    .pos { color:#047857; }
    span { color:#6b7280; font-size:8px; }
    h2 { font-size:13px; margin:14px 0 6px; }
    .note { margin-top:8px; border:1px solid #d1d5db; padding:7px; border-radius:8px; }
    footer { margin-top:12px; display:flex; justify-content:space-between; color:#6b7280; font-size:9px; }
  </style></head><body>
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">${escapeHtml(locationName)} • ${escapeHtml(inventoryModeLabel(mode))} • ${escapeHtml(statusLabel(session.status))}</div>
        <div class="meta">Indítva: ${escapeHtml(formatDateTime(session.started_at || session.startedAt || session.created_at))}${session.applied_at ? ` • Alkalmazva: ${escapeHtml(formatDateTime(session.applied_at))}` : ""}</div>
      </div>
      <div class="meta">ALL IN • üzleti készletellenőrzés</div>
    </header>
    <div class="summary">
      <div class="stat">Leltár szerint most<b>${escapeHtml(qty(summary.counted_qty))} db</b></div>
      <div class="stat">${escapeHtml(expectedLabel)}<b>${escapeHtml(qty(summary.known_min_qty))} db</b></div>
      <div class="stat">${escapeHtml(missingLabel)}<b>${escapeHtml(qty(summary.definite_missing_qty))} db</b></div>
      <div class="stat">${escapeHtml(extraLabel)}<b>${escapeHtml(qty(summary.untracked_qty))} db</b></div>
      <div class="stat">Leltárérték<b>${escapeHtml(money(summary.counted_retail_value))} RON</b></div>
      <div class="stat">Készletkorrekció<b>${escapeHtml(`${n(summary.system_correction_qty) > 0 ? "+" : ""}${qty(summary.system_correction_qty)} db`)}</b></div>
    </div>
    ${session.note ? `<div class="note"><strong>Megjegyzés:</strong> ${escapeHtml(session.note)}</div>` : ""}
    <h2>Tételes leltár</h2>
    <table>
      <thead><tr><th>#</th><th>Termék</th><th class="right">Rendszer most</th><th class="right">${escapeHtml(expectedLabel)}</th><th class="right">Leltár szerint</th><th class="right">${escapeHtml(missingLabel)}</th><th class="right">${escapeHtml(extraLabel)}</th><th class="right">Korrekció</th><th>Állapot</th><th>Utolsó beolvasás</th></tr></thead>
      <tbody>${lineRows || `<tr><td colspan="10" class="center">Nincs tétel.</td></tr>`}</tbody>
    </table>
    ${unknownRows ? `<h2>Ellenőrzendő / ismeretlen kódok</h2><table><thead><tr><th>Kód</th><th class="right">Darab</th><th>Utolsó beolvasás</th><th>Beolvasta</th></tr></thead><tbody>${unknownRows}</tbody></table>` : ""}
    <footer><span>${escapeHtml(session.code)}</span><span>Nyomtatva: ${escapeHtml(new Date().toLocaleString("hu-HU"))}</span></footer>
    <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),150));<\/script>
  </body></html>`;

  target.document.open();
  target.document.write(html);
  target.document.close();
}

type SmartSelectOption = { value: string; label: string };

function SmartSelect({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  className = "",
}: {
  value: string;
  options: SmartSelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((item) => item.value === value);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || disabled) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const edge = 10;
    const gap = 8;
    const desiredHeight = Math.min(350, 58 + Math.max(1, options.length) * 46);
    const width = Math.min(Math.max(rect.width, 250), window.innerWidth - edge * 2);
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    const roomBelow = window.innerHeight - rect.bottom - edge;
    const roomAbove = rect.top - edge;
    const openUpward = roomBelow < Math.min(desiredHeight, 240) && roomAbove > roomBelow;

    if (openUpward) {
      setPosition({ left, width, bottom: Math.max(edge, window.innerHeight - rect.top + gap) });
    } else {
      setPosition({ left, width, top: Math.min(window.innerHeight - edge, rect.bottom + gap) });
    }
  }, [disabled, options.length]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const reposition = () => updatePosition();

    document.addEventListener("mousedown", outside, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={`group flex h-11 min-w-0 w-full items-center justify-between gap-2 overflow-hidden rounded-[13px] border px-3 text-left text-sm font-normal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none transition disabled:cursor-not-allowed disabled:opacity-45 ${
          open
            ? "border-[#8ce7e2]/72 bg-gradient-to-b from-[#315268] to-[#2b4054] ring-2 ring-[#7bd7d4]/14"
            : "border-white/18 bg-gradient-to-b from-[#2d394b] to-[#293548] hover:border-[#7bd7d4]/35 hover:from-[#324157] hover:to-[#2c3a4e]"
        }`}
        onClick={() => {
          if (disabled) return;
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-full transition ${
              open
                ? "bg-[#8ff4ee] shadow-[0_0_12px_rgba(123,215,212,0.9)]"
                : value
                  ? "bg-[#63d8d3]"
                  : "bg-white/28"
            }`}
          />
          <span
            title={selected?.label || placeholder}
            className="min-w-0 flex-1 truncate"
            style={{ color: selected?.label ? "#ffffff" : "rgba(255,255,255,0.55)" }}
          >
            {selected?.label || placeholder}
          </span>
        </span>
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition ${
            open
              ? "border-[#9be9e5]/48 bg-[#2a8d8b]/34 text-[#d7fffd]"
              : "border-white/10 bg-white/[0.035] text-white/62 group-hover:border-[#7bd7d4]/25 group-hover:text-white"
          }`}
        >
          <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && position && createPortal(
        <div
          ref={menuRef}
          className="overflow-hidden rounded-[18px] border border-[#7bd7d4]/42 bg-[#202c3d]/[0.99] p-2 shadow-[0_28px_70px_rgba(2,6,23,0.72)] backdrop-blur-xl"
          style={{
            position: "fixed",
            zIndex: 900,
            left: position.left,
            width: position.width,
            top: position.top,
            bottom: position.bottom,
            color: "#ffffff",
          }}
          role="listbox"
        >
          <div className="mb-1.5 flex items-center justify-between gap-3 px-2 py-1.5">
            <span className="text-[9px] uppercase tracking-[0.16em]" style={{ color: "rgba(215,255,253,0.64)" }}>
              Válassz
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[9px]" style={{ color: "rgba(255,255,255,0.52)" }}>
              {options.length} lehetőség
            </span>
          </div>

          <div className="max-h-[310px] space-y-1 overflow-y-auto pr-0.5">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "__empty"}
                  type="button"
                  className={`group/item flex min-h-10 w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-sm font-normal transition ${
                    active
                      ? "border-[#8ce7e2]/44 bg-gradient-to-r from-[#2a8d8b] to-[#287b82] shadow-[0_8px_18px_rgba(42,141,139,0.18)]"
                      : "border-transparent bg-[#2e3b4f] hover:border-white/10 hover:bg-[#3a4a61]"
                  }`}
                  style={{ color: "#ffffff" }}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={active}
                >
                  <span className={`h-6 w-1 shrink-0 rounded-full transition ${active ? "bg-[#bff8f5]" : "bg-white/0 group-hover/item:bg-white/18"}`} />
                  <span className="min-w-0 flex-1 truncate" style={{ color: active ? "#ffffff" : "rgba(255,255,255,0.88)" }}>
                    {option.label}
                  </span>
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
                    {active ? (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#d8fffd] text-[#176b69] shadow-[0_4px_12px_rgba(0,0,0,0.18)]">
                        <Check size={17} strokeWidth={2.8} />
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const HU_MONTHS = [
  "január", "február", "március", "április", "május", "június",
  "július", "augusztus", "szeptember", "október", "november", "december",
] as const;
const HU_WEEKDAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"] as const;

function isoDateParts(value?: string | null) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day, date };
}

function isoFromUtcDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function huDateLabel(value?: string | null) {
  const parsed = isoDateParts(value);
  if (!parsed) return "Dátum választása";
  return `${parsed.year}. ${String(parsed.month).padStart(2, "0")}. ${String(parsed.day).padStart(2, "0")}.`;
}

function HungarianDatePicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const parsed = isoDateParts(value);
  const [viewYear, setViewYear] = useState(parsed?.year || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState((parsed?.month || new Date().getMonth() + 1) - 1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const todayIso = localDateInput();

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const edge = 10;
    const gap = 8;
    const width = Math.min(336, window.innerWidth - edge * 2);
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    const estimatedHeight = 382;
    const roomBelow = window.innerHeight - rect.bottom - edge;
    const roomAbove = rect.top - edge;
    const openUpward = roomBelow < estimatedHeight && roomAbove > roomBelow;
    if (openUpward) {
      setPosition({ left, width, bottom: Math.max(edge, window.innerHeight - rect.top + gap) });
    } else {
      setPosition({ left, width, top: Math.max(edge, rect.bottom + gap) });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const current = isoDateParts(value);
    if (current) {
      setViewYear(current.year);
      setViewMonth(current.month - 1);
    }
    updatePosition();

    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const reposition = () => updatePosition();
    document.addEventListener("mousedown", outside, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition, value]);

  const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1, 12));
  const mondayOffset = (firstOfMonth.getUTCDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(1 - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setUTCDate(gridStart.getUTCDate() + index);
    return day;
  });

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1, 12));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
  }

  function chooseDate(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        className={`group flex h-11 w-full items-center justify-between rounded-[13px] border px-3 text-left text-sm font-normal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none transition ${
          open
            ? "border-[#8ce7e2]/72 bg-gradient-to-b from-[#315268] to-[#2b4054] ring-2 ring-[#7bd7d4]/14"
            : "border-white/18 bg-gradient-to-b from-[#2d394b] to-[#293548] hover:border-[#7bd7d4]/38 hover:from-[#324157] hover:to-[#2c3a4e]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <CalendarDays size={16} className="shrink-0 text-[#8fe9e5]" />
          <span className="truncate tracking-[0.02em]">{huDateLabel(value)}</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 text-white/52 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && position && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label={`${ariaLabel} naptár`}
          className="overflow-hidden rounded-[20px] border border-[#8ce7e2]/42 bg-[#202c3d]/[0.995] p-3 text-white shadow-[0_30px_80px_rgba(2,6,23,0.76)] backdrop-blur-xl"
          style={{
            position: "fixed",
            zIndex: 940,
            left: position.left,
            width: position.width,
            top: position.top,
            bottom: position.bottom,
          }}
        >
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-[#29374b] px-2 py-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/76 transition hover:border-[#7bd7d4]/35 hover:bg-[#2a8d8b]/18 hover:text-white"
              aria-label="Előző hónap"
            >
              <ChevronLeft size={17} />
            </button>
            <div className="text-center">
              <p className="text-[9px] uppercase tracking-[0.16em] text-[#cffffd]/48">Naptár</p>
              <p className="mt-0.5 text-sm font-medium text-white">{viewYear}. {HU_MONTHS[viewMonth]}</p>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/76 transition hover:border-[#7bd7d4]/35 hover:bg-[#2a8d8b]/18 hover:text-white"
              aria-label="Következő hónap"
            >
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {HU_WEEKDAYS.map((day, index) => (
              <div
                key={day}
                className={`py-1 text-center text-[10px] font-medium uppercase tracking-[0.05em] ${index >= 5 ? "text-rose-100/55" : "text-[#cffffd]/60"}`}
              >
                {day}
              </div>
            ))}

            {days.map((day) => {
              const iso = isoFromUtcDate(day);
              const inMonth = day.getUTCMonth() === viewMonth;
              const selected = iso === value;
              const today = iso === todayIso;
              const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => chooseDate(iso)}
                  className={`relative flex h-9 items-center justify-center rounded-lg border text-xs transition ${
                    selected
                      ? "border-[#bff8f5]/70 bg-gradient-to-br from-[#2a9a96] to-[#247b82] font-semibold text-white shadow-[0_6px_16px_rgba(42,141,139,0.30)]"
                      : inMonth
                        ? weekend
                          ? "border-transparent bg-white/[0.025] text-rose-50/72 hover:border-[#7bd7d4]/22 hover:bg-white/[0.08] hover:text-white"
                          : "border-transparent bg-white/[0.025] text-white/88 hover:border-[#7bd7d4]/22 hover:bg-white/[0.08] hover:text-white"
                        : "border-transparent text-white/24 hover:bg-white/[0.04] hover:text-white/48"
                  }`}
                >
                  {day.getUTCDate()}
                  {today && !selected ? <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#7bd7d4]" /> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/8 pt-3">
            <span className="text-[10px] text-white/40">A hét hétfővel kezdődik.</span>
            <button
              type="button"
              onClick={() => chooseDate(todayIso)}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#8ce7e2]/30 bg-[#2a8d8b]/18 px-3 text-[11px] text-[#d8fffd] transition hover:bg-[#2a8d8b]/32"
            >
              <CalendarDays size={13} /> Ma
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
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
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>("standard");
  const [salesTrustedFrom, setSalesTrustedFrom] = useState(localDateInput());
  const [legacyRetailValue, setLegacyRetailValue] = useState("");
  const [note, setNote] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [archiveBusyId, setArchiveBusyId] = useState("");

  const activeSession = useMemo(
    () => sessions.find((item) => ["draft", "counting", "review"].includes(item.status)) || null,
    [sessions],
  );
  const currentLocation = useMemo(
    () => locations.find((item) => item.code === location || item.id === location) || null,
    [locations, location],
  );
  const detailMode: InventoryMode = (detail?.session.inventory_mode || detail?.session.inventoryMode) === "standard" ? "standard" : "recovery";
  const recoveryMode = detail ? detailMode === "recovery" : inventoryMode === "recovery";

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((item) => {
      const haystack = [
        item.code,
        item.title,
        item.location_name,
        item.status,
        statusLabel(item.status),
        inventoryModeLabel(inventoryModeOf(item)),
        item.note,
        item.started_at,
        item.created_at,
        item.applied_at,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [historySearch, sessions]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / ARCHIVE_PAGE_SIZE));
  const visibleHistory = useMemo(() => {
    const start = (historyPage - 1) * ARCHIVE_PAGE_SIZE;
    return filteredHistory.slice(start, start + ARCHIVE_PAGE_SIZE);
  }, [filteredHistory, historyPage]);

  const loadSessions = useCallback(async (locationValue: string, silent = false) => {
    if (!locationValue) return;
    if (!silent) setLoading(true);
    try {
      const historyMap = new Map<string, AifOpeningInventorySession>();
      let offset = 0;
      const limit = 100;
      for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
        const response = await apiAifListOpeningInventorySessions({ location: locationValue, limit, offset });
        const pageItems = response.items || [];
        const before = historyMap.size;
        for (const item of pageItems) historyMap.set(String(item.id), item);
        const added = historyMap.size - before;
        offset += pageItems.length;
        const total = Number(response.total || 0);
        const hasMore = response.hasMore === true || (total > 0 && offset < total);
        if (!pageItems.length || added === 0 || (!hasMore && pageItems.length < limit) || (total > 0 && offset >= total)) break;
      }
      const history = Array.from(historyMap.values());
      setSessions(history);
      const active = history.find((item) => ["draft", "counting", "review"].includes(item.status));
      if (!active) {
        const hasApplied = history.some((item) => item.status === "applied");
        setInventoryMode(hasApplied ? "standard" : locationValue === "magazin_targu_secuiesc" ? "recovery" : "standard");
      }
      if (active) {
        const full = await apiAifGetOpeningInventory(active.id);
        setDetail(full);
      } else if (detail && detail.session.location_code !== locationValue && detail.session.location_id !== locationValue) {
        setDetail(null);
      }
      setLastRefresh(new Date());
      if (!silent) setNotice(null);
    } catch (error) {
      if (!silent) setNotice({ tone: "error", text: error instanceof Error ? error.message : "A leltár adatai nem tölthetők be." });
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
      if (!silent) setNotice({ tone: "success", text: "Leltár frissítve." });
    } catch (error) {
      if (!silent) setNotice({ tone: "error", text: error instanceof Error ? error.message : "A leltár frissítése nem sikerült." });
    }
  }, [activeSession?.id, detail?.session.id]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const meta = await apiAifMeta();
        const activeLocations = (meta.locations || []).filter((item) => item.is_active !== false);
        const storeLocations = activeLocations.filter((item) =>
          item.code === "main_warehouse" || item.code === "magazin_targu_secuiesc"
        );
        const usable = storeLocations.length ? storeLocations : activeLocations.filter((item) => item.location_type === "shop");
        setLocations(usable);
        const kezdi = usable.find((item) => item.code === "magazin_targu_secuiesc");
        const first = kezdi || usable[0];
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
    setHistoryPage(1);
  }, [location, historySearch]);

  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);

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
    if (!location) {
      setNotice({ tone: "error", text: "Válassz üzletet." });
      return;
    }
    if (inventoryMode === "recovery" && !salesTrustedFrom) {
      setNotice({ tone: "error", text: "Helyreállító leltárnál add meg a biztos rendszeres eladások kezdő dátumát." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await apiAifStartOpeningInventory({
        location,
        inventoryMode,
        salesTrustedFrom: inventoryMode === "recovery" ? salesTrustedFrom : undefined,
        legacyRetailValue: inventoryMode === "recovery" && legacyRetailValue.trim()
          ? legacyRetailValue.trim().replace(",", ".")
          : null,
        note: note.trim() || null,
      });
      setDetail(response);
      setNotice({ tone: "success", text: "Leltár elindítva. A számolás és az eladás mehet párhuzamosan." });
      await loadSessions(location, true);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "A leltár indítása nem sikerült." });
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
        setNotice({ tone: "success", text: "A leltár megszakítva. A készlethez nem nyúlt." });
        await loadSessions(location, true);
        return;
      }
      if (response) setDetail(response);
      if (action === "close") setNotice({ tone: "success", text: "A bolti beolvasás lezárva. Az üzlet továbbra is árulhat." });
      if (action === "reopen") setNotice({ tone: "success", text: "A leltár újranyitva. Az üzletben újra lehet csippogtatni." });
      if (action === "apply") setNotice({ tone: "success", text: "A leltár készletre alkalmazva, a közbeni mozgásokkal együtt." });
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

  async function getArchiveDetail(item: AifOpeningInventorySession) {
    if (detail?.session.id === item.id) return detail;
    return apiAifGetOpeningInventory(item.id);
  }

  function openHistorySession(item: AifOpeningInventorySession) {
    setBusy(true);
    void getArchiveDetail(item)
      .then((response) => {
        setDetail(response);
        setNotice(null);
        window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
      })
      .catch((error) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "A korábbi leltár nem tölthető be." }))
      .finally(() => setBusy(false));
  }

  async function downloadHistorySession(item: AifOpeningInventorySession) {
    if (archiveBusyId) return;
    setArchiveBusyId(item.id);
    try {
      const full = await getArchiveDetail(item);
      downloadInventoryCsv(full);
      setNotice({ tone: "success", text: `${item.code} leltár CSV fájlja letöltve.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "A leltár letöltése nem sikerült." });
    } finally {
      setArchiveBusyId("");
    }
  }

  async function printHistorySession(item: AifOpeningInventorySession) {
    if (archiveBusyId) return;
    const popup = window.open("", "_blank");
    if (!popup) {
      setNotice({ tone: "error", text: "A böngésző letiltotta a nyomtatási ablakot. Engedélyezd a felugró ablakokat ennél az oldalnál." });
      return;
    }

    setArchiveBusyId(item.id);
    try {
      const full = await getArchiveDetail(item);
      writeInventoryPrintReport(popup, full);
    } catch (error) {
      try { popup.close(); } catch {}
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "A leltár nyomtatható nézete nem készíthető el." });
    } finally {
      setArchiveBusyId("");
    }
  }

  function downloadCurrentDetail() {
    if (!detail) return;
    downloadInventoryCsv(detail);
    setNotice({ tone: "success", text: `${detail.session.code} leltár CSV fájlja letöltve.` });
  }

  function printCurrentDetail() {
    if (!detail) return;
    const popup = window.open("", "_blank");
    if (!popup) {
      setNotice({ tone: "error", text: "A böngésző letiltotta a nyomtatási ablakot. Engedélyezd a felugró ablakokat ennél az oldalnál." });
      return;
    }
    writeInventoryPrintReport(popup, detail);
  }

  const activeDetail = detail && ["draft", "counting", "review"].includes(detail.session.status);

  return (
    <main className="min-h-screen bg-[#4b5362] px-3 py-4 text-white sm:px-4 sm:py-5">
      <div className="mx-auto max-w-[1580px] space-y-3">
        <header className="rounded-[22px] border border-white/16 bg-[#303a4c] px-4 py-3 shadow-[0_16px_42px_rgba(15,23,42,0.24)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#8ce7e2]/38 bg-[#108D8B]/20 text-[#d7fffd]"><ShieldCheck size={24} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/45">ALL IN • üzleti készletellenőrzés</p>
              <h1 className="mt-1 text-2xl font-normal">Üzleti leltár</h1>
              <p className="mt-1 text-xs text-white/52">{currentLocation?.name || "Üzlet"} • {actor}</p>
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
            <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
              Helyszín
              <SmartSelect
                value={location}
                onChange={setLocation}
                disabled={Boolean(activeDetail)}
                placeholder="Válassz üzletet"
                options={[
                  { value: "", label: "Válassz üzletet" },
                  ...locations.map((item) => ({ value: item.code || item.id, label: item.name })),
                ]}
              />
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
                  <p className="text-[10px] uppercase tracking-[0.13em] text-white/42">Új leltár</p>
                  <h2 className="mt-1 text-xl font-normal">{currentLocation?.name || "Üzlet"}</h2>
                </div>
              </div>
              <span className="rounded-xl border border-[#8ce7e2]/26 bg-[#108D8B]/12 px-3 py-2 text-[11px] text-[#d7fffd]">Eladás közben is működik</span>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[230px_minmax(260px,1fr)_auto] lg:items-end">
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
                Leltár típusa
                <SmartSelect
                  value={inventoryMode}
                  onChange={(value) => setInventoryMode(value as InventoryMode)}
                  placeholder="Leltár típusa"
                  options={[
                    { value: "standard", label: "Rendes leltár" },
                    { value: "recovery", label: "Helyreállító leltár" },
                  ]}
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
                Megjegyzés
                <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="pl. teljes üzleti leltár / cipők / szezonváltás" className="h-11 rounded-xl border border-white/16 bg-[#293649] px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#8ce7e2]/55" />
              </label>
              <button type="button" onClick={() => void startInventory()} disabled={busy || !location || (inventoryMode === "recovery" && !salesTrustedFrom)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#8ce7e2]/40 bg-[#108D8B] px-5 text-sm text-white shadow-[0_10px_24px_rgba(16,141,139,0.22)] hover:bg-[#149b98] disabled:opacity-45">
                {busy ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />} Leltár indítása
              </button>
            </div>

            {inventoryMode === "recovery" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
                  Biztos rendszeres eladások ettől
                  <HungarianDatePicker
                    value={salesTrustedFrom}
                    onChange={setSalesTrustedFrom}
                    ariaLabel="Biztos rendszeres eladások kezdő dátuma"
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
                  Papír szerinti készletérték (RON, opcionális)
                  <input value={legacyRetailValue} onChange={(event) => setLegacyRetailValue(event.target.value.replace(/[^0-9.,]/g, ""))} inputMode="decimal" placeholder="pl. 190000" className="h-11 rounded-xl border border-white/16 bg-[#293649] px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#8ce7e2]/55" />
                </label>
              </div>
            ) : null}
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
                    <span className="rounded-full border border-white/14 bg-white/[0.05] px-2.5 py-1 text-[10px] text-white/60">{detailMode === "recovery" ? "HELYREÁLLÍTÓ" : "RENDES"}</span>
                    {activeDetail ? <span className="rounded-full border border-[#8ce7e2]/28 bg-[#108D8B]/12 px-2.5 py-1 text-[10px] text-[#d7fffd]">ELADÁS MEHET</span> : null}
                  </div>
                  <h2 className="mt-2 text-xl font-normal">{detail.session.title}</h2>
                  <p className="mt-1 text-xs text-white/45">{detail.session.location_name || detail.session.location?.name || location} • indítva: {formatDateTime(detail.session.started_at || detail.session.startedAt)}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={downloadCurrentDetail} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-3 text-xs text-white hover:border-[#8ce7e2]/30 hover:bg-white/[0.09]">
                    <Download size={15} /> CSV
                  </button>
                  <button type="button" onClick={printCurrentDetail} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-3 text-xs text-white hover:border-[#8ce7e2]/30 hover:bg-white/[0.09]">
                    <Printer size={15} /> PDF / nyomtatás
                  </button>
                  {activeDetail ? (
                    <>
                      {detail.session.status === "review" ? (
                        <button type="button" onClick={() => setConfirmAction("reopen")} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-3 text-xs text-white hover:bg-white/[0.09]"><RotateCcw size={15} /> Újranyitás</button>
                      ) : (
                        <button type="button" onClick={() => setConfirmAction("close")} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-200/30 bg-amber-500/12 px-3 text-xs text-amber-50 hover:bg-amber-500/18"><ClipboardCheck size={15} /> Beolvasás lezárása</button>
                      )}
                      {detail.session.status === "review" ? (
                        <button type="button" onClick={() => setConfirmAction("apply")} disabled={busy || unresolvedUnknown.length > 0} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#8ce7e2]/40 bg-[#108D8B] px-3 text-xs text-white hover:bg-[#149b98] disabled:opacity-45"><CheckCircle2 size={15} /> Készlet alkalmazása</button>
                      ) : null}
                      <button type="button" onClick={() => setConfirmAction("cancel")} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-300/32 bg-red-600/18 px-3 text-xs text-red-50 hover:bg-red-600/26"><X size={15} /> Megszakítás</button>
                    </>
                  ) : null}
                </div>
              </div>
            </section>

            {summary ? (
              <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
                <Stat label="Leltár szerint most" value={`${qty(summary.counted_qty)} db`} hint={`${qty(summary.counted_lines)} tétel`} />
                <Stat label={recoveryMode ? "Igazolható minimum" : "Rendszer szerint"} value={`${qty(summary.known_min_qty)} db`} hint={`közbeni mozgás ${n(summary.live_net_qty) > 0 ? "+" : ""}${qty(summary.live_net_qty || 0)} db`} tone="blue" />
                <Stat label={recoveryMode ? "Biztos hiány" : "Hiány"} value={`${qty(summary.definite_missing_qty)} db`} hint={`${money(summary.definite_missing_retail_value)} RON`} tone="red" />
                <Stat label={recoveryMode ? "Még nem talált minimum" : "Még nem számolt"} value={`${qty(summary.unseen_known_min_qty)} db`} hint={detail.session.status === "review" ? "lezáráskor 0-nak számít" : "még ellenőrizendő"} tone="amber" />
                <Stat label={recoveryMode ? "Régi / nem nyilvántartott" : "Többlet"} value={`${qty(summary.untracked_qty)} db`} hint={`${money(summary.untracked_retail_value)} RON`} tone="green" />
                <Stat label="Leltárérték most" value={`${money(summary.counted_retail_value)} RON`} hint={`korrekció: ${money(summary.system_correction_retail_value)} RON`} />
                <Stat label={recoveryMode ? "Könyv szerinti becslés" : "Rendszerérték"} value={summary.book_expected_retail_value === null || summary.book_expected_retail_value === undefined ? "–" : `${money(summary.book_expected_retail_value)} RON`} hint={summary.book_diff_retail_value === null || summary.book_diff_retail_value === undefined ? "–" : `eltérés: ${money(summary.book_diff_retail_value)} RON`} tone={summary.book_diff_retail_value !== null && summary.book_diff_retail_value !== undefined && n(summary.book_diff_retail_value) < 0 ? "red" : "neutral"} />
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
                      ["all", "Mind"], ["missing", recoveryMode ? "Biztos hiány" : "Hiány"], ["awaiting", "Még nem talált"], ["untracked", recoveryMode ? "Régi készlet" : "Többlet"], ["system", "Korrekció"], ["ok", "Rendben"],
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
                      <th className="px-3 py-2.5 text-right">{recoveryMode ? "Igazolt nettó" : "Mozgás"}</th>
                      <th className="px-3 py-2.5 text-right">{recoveryMode ? "Minimum" : "Elvárt"}</th>
                      <th className="px-3 py-2.5 text-right">Leltár szerint</th>
                      <th className="px-3 py-2.5 text-right">{recoveryMode ? "Biztos hiány" : "Hiány"}</th>
                      <th className="px-3 py-2.5 text-right">{recoveryMode ? "Régi / plusz" : "Többlet"}</th>
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
                        <td className="px-3 py-2.5"><span className="rounded-lg border border-white/12 bg-black/10 px-2 py-1 text-[9px] text-white/72">{lineStatusLabel(line, detailMode)}</span></td>
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
          <section className="overflow-hidden rounded-[22px] border border-white/14 bg-[#354153] shadow-lg">
            <div className="border-b border-white/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#8ce7e2]/28 bg-[#108D8B]/14 text-[#d7fffd]"><History size={17} /></span>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.13em] text-white/40">Leltár archívum</p>
                    <h3 className="mt-0.5 text-base font-normal text-white">Minden korábbi és aktuális leltár</h3>
                  </div>
                </div>
                <span className="rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[10px] text-white/50">
                  {filteredHistory.length} leltár
                </span>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <label className="relative block">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/38" />
                  <input
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    placeholder="Keresés kód, dátum, állapot vagy megjegyzés alapján…"
                    className="h-10 w-full rounded-xl border border-white/15 bg-[#293649] pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#8ce7e2]/55"
                  />
                </label>
                <div className="flex items-center justify-end gap-2 text-[10px] text-white/45">
                  <span>{historyPage} / {historyTotalPages}</span>
                  <button
                    type="button"
                    onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                    disabled={historyPage <= 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/14 bg-white/[0.05] text-white hover:bg-white/[0.09] disabled:opacity-35"
                    aria-label="Előző oldal"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryPage((page) => Math.min(historyTotalPages, page + 1))}
                    disabled={historyPage >= historyTotalPages}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/14 bg-white/[0.05] text-white hover:bg-white/[0.09] disabled:opacity-35"
                    aria-label="Következő oldal"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-2 p-3 lg:grid-cols-2 xl:grid-cols-3">
              {visibleHistory.map((item) => {
                const itemMode = inventoryModeOf(item);
                const lineCount = n((item as any).line_count);
                const countedLines = n((item as any).counted_lines);
                const countedQty = n((item as any).counted_qty);
                const selected = detail?.session.id === item.id;
                const itemBusy = archiveBusyId === item.id;
                return (
                  <article key={item.id} className={`rounded-[18px] border p-3 transition ${selected ? "border-[#8ce7e2]/45 bg-[#108D8B]/10 shadow-[0_8px_22px_rgba(16,141,139,0.12)]" : "border-white/12 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.055]"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-lg border border-white/12 bg-black/10 px-2 py-1 font-mono text-[9px] text-white/55">{item.code}</span>
                          <span className={`rounded-lg border px-2 py-1 text-[9px] ${item.status === "applied" ? "border-[#8ce7e2]/28 bg-[#108D8B]/14 text-[#d7fffd]" : item.status === "cancelled" ? "border-red-300/25 bg-red-500/10 text-red-50" : item.status === "review" ? "border-amber-200/26 bg-amber-500/10 text-amber-50" : "border-sky-200/22 bg-sky-500/8 text-sky-50"}`}>
                            {statusLabel(item.status)}
                          </span>
                          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] text-white/50">{itemMode === "recovery" ? "HELYREÁLLÍTÓ" : "RENDES"}</span>
                        </div>
                        <h4 className="mt-2 truncate text-sm text-white" title={item.title}>{item.title}</h4>
                        <p className="mt-1 text-[10px] text-white/40">{formatDateTime(item.started_at || item.created_at)}</p>
                        <p className="mt-2 text-[10px] text-white/48">
                          {lineCount > 0 ? `${qty(countedLines)} / ${qty(lineCount)} tétel számolva` : "Tételszám betöltése…"}
                          {countedQty > 0 ? ` • ${qty(countedQty)} db` : ""}
                        </p>
                        {item.note ? <p className="mt-1 truncate text-[10px] text-white/34" title={item.note}>{item.note}</p> : null}
                      </div>
                      {selected ? <span className="shrink-0 rounded-full border border-[#8ce7e2]/28 bg-[#108D8B]/18 px-2 py-1 text-[9px] text-[#d7fffd]">MEGNYITVA</span> : null}
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-white/9 pt-3">
                      <button
                        type="button"
                        onClick={() => openHistorySession(item)}
                        disabled={busy || itemBusy}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#8ce7e2]/30 bg-[#108D8B]/14 px-2 text-[10px] text-[#d7fffd] transition hover:bg-[#108D8B]/24 disabled:opacity-45"
                      >
                        {busy && selected ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Átnézés
                      </button>
                      <button
                        type="button"
                        onClick={() => void downloadHistorySession(item)}
                        disabled={Boolean(archiveBusyId)}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.05] px-2 text-[10px] text-white/72 transition hover:border-[#8ce7e2]/25 hover:bg-white/[0.09] disabled:opacity-45"
                      >
                        {itemBusy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => void printHistorySession(item)}
                        disabled={Boolean(archiveBusyId)}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.05] px-2 text-[10px] text-white/72 transition hover:border-[#8ce7e2]/25 hover:bg-white/[0.09] disabled:opacity-45"
                      >
                        <Printer size={13} /> PDF
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {!visibleHistory.length ? (
              <div className="border-t border-white/10 px-4 py-10 text-center text-sm text-white/40">Nincs találat az archívumban.</div>
            ) : null}
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
                  <p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Üzleti leltár</p>
                  <h2 className="mt-1 text-lg font-normal">{confirmAction === "close" ? "Beolvasás lezárása" : confirmAction === "reopen" ? "Leltár újranyitása" : confirmAction === "apply" ? "Készlet végleges alkalmazása" : "Leltár megszakítása"}</h2>
                </div>
              </div>
              <button type="button" onClick={() => setConfirmAction(null)} disabled={busy} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/14 bg-white/[0.05] hover:bg-white/[0.1]"><X size={16} /></button>
            </header>
            <div className="space-y-3 p-4 text-sm leading-relaxed text-white/70">
              {confirmAction === "close" ? <p>A bolti beolvasás leáll. Az addig nem beolvasott, de rendszerből ismert tételeket 0 talált darabbal vesszük figyelembe az ellenőrzéshez.</p> : null}
              {confirmAction === "reopen" ? <p>A lezáráskor automatikusan 0-ra tett, nem talált sorok újra „még nem számolt” állapotba kerülnek, és az üzletben folytatható a csippogtatás.</p> : null}
              {confirmAction === "apply" ? <p>A megszámolt mennyiségekre rávezetjük a közben történt eladásokat és készletmozgásokat, majd ezt alkalmazzuk az üzlet készletére. Minden korrekció naplózódik.</p> : null}
              {confirmAction === "cancel" ? <p>A leltár megszakad, a beolvasások megmaradnak auditként, de a készlethez nem nyúlunk.</p> : null}
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
