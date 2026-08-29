import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  History,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import {
  apiAifReceiveAllShopIncoming,
  apiAifReceiveShopIncomingLine,
  apiAifShopIncoming,
  apiAifShopIncomingHistory,
  type AifShopIncomingDocument,
  type AifShopIncomingHistoryItem,
} from "../lib/aif/api";

type Props = {
  open: boolean;
  actor: string;
  locationCode: "main_warehouse" | "magazin_targu_secuiesc";
  locationName: string;
  onClose: () => void;
};

type Mode = "waiting" | "history";

function currentMonth() {
  try {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 7);
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function localDateKey(value?: string | null) {
  if (!value) return "ismeretlen";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ismeretlen";
  try {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function prettyDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

export default function AllInShopIncoming({ open, actor, locationCode, locationName, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("waiting");
  const [items, setItems] = useState<AifShopIncomingDocument[]>([]);
  const [history, setHistory] = useState<AifShopIncomingHistoryItem[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [expandedHistoryDate, setExpandedHistoryDate] = useState<string | null>(null);
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("waiting");
    setError("");
    setSuccess("");
    setExpandedHistoryDate(null);
    setExpandedDocumentId(null);
    void loadWaiting();
  }, [open, locationCode]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busyKey) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [busyKey, onClose, open]);

  async function loadWaiting() {
    setLoading(true);
    setError("");
    try {
      const response = await apiAifShopIncoming({ location: locationCode });
      const nextItems = response.items || [];
      setItems(nextItems);
      setExpandedDocumentId((current) =>
        current && nextItems.some((item) => item.id === current) ? current : null,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A beérkező áru nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(value = month) {
    setLoading(true);
    setError("");
    try {
      const response = await apiAifShopIncomingHistory({ location: locationCode, month: value });
      setHistory(response.items || []);
      setExpandedHistoryDate(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A beérkezési előzmény nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }

  async function receiveLine(lineId: string) {
    setBusyKey(lineId);
    setError("");
    try {
      const result = await apiAifReceiveShopIncomingLine(lineId, { location: locationCode });
      setSuccess(result.stockApplied ? "A termék megérkezett és bekerült az üzlet készletébe." : "A termék átvétele rögzítve. Ennél a korábbi Aviznál a készlet már előzőleg könyvelve volt.");
      await loadWaiting();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A termék átvétele nem sikerült.");
    } finally {
      setBusyKey("");
    }
  }

  async function receiveAll(document: AifShopIncomingDocument) {
    setBusyKey(`doc:${document.id}`);
    setError("");
    try {
      const result = await apiAifReceiveAllShopIncoming(document.id, { location: locationCode });
      setSuccess(`${result.received} tétel átvéve${result.duplicates ? ` • ${result.duplicates} már korábban átvéve` : ""}.`);
      await loadWaiting();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az Aviz átvétele nem sikerült.");
    } finally {
      setBusyKey("");
    }
  }

  const groupedHistory = useMemo(() => {
    const groups = new Map<string, AifShopIncomingHistoryItem[]>();
    for (const item of history) {
      const key = localDateKey(item.receivedAt);
      const rows = groups.get(key) || [];
      rows.push(item);
      groups.set(key, rows);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [history]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[245] flex items-center justify-center bg-[#111827]/82 p-3 backdrop-blur-sm sm:p-5">
      <section className="flex max-h-[95vh] w-full max-w-[1380px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/36 bg-[#303a4c] text-white shadow-[0_36px_110px_rgba(0,0,0,0.6)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] to-[#28565c] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#9be9e5]/35 bg-[#2a8d8b]/24 text-[#d7fffd]"><Truck size={24} /></span>
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Üzletközi átvétel</p>
              <h2 className="mt-1 text-xl">Beérkező áru</h2>
              <p className="mt-1 text-xs text-white/45">{locationName} • {actor}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { setMode("waiting"); setExpandedDocumentId(null); void loadWaiting(); }} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs ${mode === "waiting" ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/14 bg-white/[0.05]"}`}><Truck size={15} /> Érkezésre vár</button>
            <button type="button" onClick={() => { setMode("history"); setExpandedDocumentId(null); void loadHistory(); }} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs ${mode === "history" ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/14 bg-white/[0.05]"}`}><History size={15} /> Beérkezési előzmény</button>
            <button type="button" onClick={() => mode === "waiting" ? void loadWaiting() : void loadHistory()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/14 bg-white/[0.05]"><RefreshCw size={16} /></button>
            <button type="button" onClick={onClose} disabled={Boolean(busyKey)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] disabled:opacity-50"><X size={18} /></button>
          </div>
        </header>

        {error ? <div className="mx-5 mt-4 rounded-2xl border border-rose-300/35 bg-rose-500/16 px-4 py-3 text-sm text-rose-50">{error}</div> : null}
        {success ? <div className="mx-5 mt-4 flex items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/14 px-4 py-3 text-sm text-emerald-50"><CheckCircle2 size={18} />{success}</div> : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {mode === "history" ? (
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Havi visszanézés</p><h3 className="mt-1 text-lg">Mikor milyen áru érkezett?</h3></div>
                <div className="flex gap-2"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-11 rounded-xl border border-white/16 bg-[#293548] px-3" /><button onClick={() => void loadHistory(month)} className="h-11 rounded-xl border border-[#9be9e5]/40 bg-[#2a8d8b] px-4 text-sm">Betöltés</button></div>
              </div>
              {loading ? <Loading /> : groupedHistory.length ? (
                <div className="space-y-3">
                  {groupedHistory.map(([date, rows]) => {
                    const expanded = expandedHistoryDate === date;
                    const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
                    return (
                      <section key={date} className="overflow-hidden rounded-[24px] border border-white/14 bg-[#374357]">
                        <button
                          type="button"
                          onClick={() => setExpandedHistoryDate((current) => current === date ? null : date)}
                          className={`flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition ${expanded ? "border-b border-white/10 bg-[#303b4e]" : "bg-[#303b4e] hover:bg-[#37465c]"}`}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#8ee6e2]"><CalendarDays size={18} /></span>
                            <span className="min-w-0">
                              <span className="block text-base text-white">{prettyDate(date)}</span>
                              <span className="mt-1 block text-[11px] text-white/45">Kattints a napi átvétel részleteihez</span>
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="rounded-full border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 px-2.5 py-1 text-[10px] text-[#d7fffd]">{totalQty} db • {rows.length} tétel</span>
                            <ChevronDown size={18} className={`text-white/55 transition-transform ${expanded ? "rotate-180" : ""}`} />
                          </span>
                        </button>
                        {expanded ? <div className="space-y-2 p-3">{rows.map((row) => <HistoryRow key={row.id} item={row} />)}</div> : null}
                      </section>
                    );
                  })}
                </div>
              ) : <Empty text="Ebben a hónapban még nincs rögzített átvétel." />}
            </div>
          ) : loading ? <Loading /> : items.length ? (
            <div className="space-y-3">
              {items.map((document) => (
                <IncomingDocument
                  key={document.id}
                  document={document}
                  expanded={expandedDocumentId === document.id}
                  busyKey={busyKey}
                  onToggle={() => setExpandedDocumentId((current) => current === document.id ? null : document.id)}
                  onReceiveLine={receiveLine}
                  onReceiveAll={receiveAll}
                />
              ))}
            </div>
          ) : <Empty text="Nincs átvételre váró Aviz ennél az üzletnél." />}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function IncomingDocument({
  document,
  expanded,
  busyKey,
  onToggle,
  onReceiveLine,
  onReceiveAll,
}: {
  document: AifShopIncomingDocument;
  expanded: boolean;
  busyKey: string;
  onToggle: () => void;
  onReceiveLine: (id: string) => void;
  onReceiveAll: (doc: AifShopIncomingDocument) => void;
}) {
  const issued = document.status === "issued";
  const pendingLines = document.lines.filter((line) => !line.received);
  const legacy = document.inventoryMode !== "in_transit_until_received";

  return (
    <article className={`overflow-hidden rounded-[24px] border transition ${expanded ? "border-[#7bd7d4]/42 shadow-[0_16px_34px_rgba(15,23,42,0.20)]" : "border-white/14"} ${issued ? "bg-[#374357]" : "bg-[#414454]"}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left transition ${
          expanded
            ? issued ? "border-b border-white/10 bg-[#303b4e]" : "border-b border-amber-100/12 bg-amber-400/8"
            : issued ? "bg-[#303b4e] hover:bg-[#364459]" : "bg-amber-400/8 hover:bg-amber-400/12"
        }`}
        aria-expanded={expanded}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${issued ? "border-[#7bd7d4]/28 bg-[#2a8d8b]/14 text-[#a9f3ef]" : "border-amber-200/25 bg-amber-400/10 text-amber-100"}`}>
            <Truck size={18} />
          </span>

          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[17px] text-white">{document.documentNumber}</span>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] ${issued ? "border-emerald-300/30 bg-emerald-500/12 text-emerald-50" : "border-amber-200/35 bg-amber-400/10 text-amber-50"}`}>
                {issued ? "LEZÁRT AVIZ • átvehető" : "ELŐKÉSZÍTÉS • még nem vehető át"}
              </span>
              {legacy ? (
                <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/50">
                  Korábbi készletlogika
                </span>
              ) : null}
            </span>

            <span className="mt-1.5 block truncate text-xs text-white/50">
              {document.sourceLocation.name} → {document.targetLocation.name} • {formatDateTime(document.createdAt)}
            </span>
            {document.note ? <span className="mt-1 block truncate text-xs text-white/55">{document.note}</span> : null}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-3">
          <span className="hidden text-right sm:block">
            <span className="block text-[9px] uppercase tracking-[0.1em] text-white/38">Állapot</span>
            <span className="mt-1 block text-base text-[#d7fffd]">
              {document.receivedCount}/{document.lineCount} tétel átvéve
            </span>
            <span className="block text-[11px] text-white/42">{document.totalQty} db az Avizon</span>
          </span>

          <span className="rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 px-2.5 py-1.5 text-[11px] text-[#d7fffd] sm:hidden">
            {document.receivedCount}/{document.lineCount} • {document.totalQty} db
          </span>

          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${expanded ? "border-[#9be9e5]/42 bg-[#2a8d8b] text-white" : "border-white/14 bg-black/10 text-white/62"}`}>
            <ChevronDown size={19} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </span>
        </span>
      </button>

      {expanded ? (
        <>
          {!issued ? (
            <div className="flex items-start gap-3 border-b border-amber-200/15 bg-amber-400/8 px-4 py-3 text-sm text-amber-50">
              <Clock3 className="mt-0.5 shrink-0" size={18} />
              <div>
                <p>Az áru látszik, de még nem pipálható ki.</p>
                <p className="mt-1 text-xs text-amber-100/65">A „Megjött” csak akkor aktiválódik, amikor a főnök lezárta az Avizt.</p>
              </div>
            </div>
          ) : null}

          <div className="space-y-2 p-3">
            {document.lines.map((line) => (
              <div
                key={line.id}
                className={`grid grid-cols-[64px_1fr_auto] items-center gap-3 rounded-2xl border p-3 ${
                  line.received ? "border-emerald-300/18 bg-emerald-500/8" : "border-white/10 bg-[#293548]"
                }`}
              >
                <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-white/95">
                  {line.imageUrl ? (
                    <img src={line.imageUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <ShoppingBag className="text-slate-500" />
                  )}
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm">{line.title}</p>
                  <p className="mt-1 text-[11px] text-white/48">
                    {[line.brandName, line.colorName, line.size, line.productCode].filter(Boolean).join(" • ")}
                  </p>
                  {line.received ? (
                    <p className="mt-2 text-xs text-emerald-100">
                      Átvette: {line.receivedBy || "–"} • {formatDateTime(line.receivedAt)}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-white/42">{line.qty} db érkezik</p>
                  )}
                </div>

                {line.received ? (
                  <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-500/12 px-3 text-xs text-emerald-50">
                    <CheckCircle2 size={15} /> Megérkezett
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!issued || Boolean(busyKey)}
                    onClick={() => onReceiveLine(line.id)}
                    className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                      issued ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/14 bg-white/[0.05]"
                    }`}
                  >
                    {busyKey === line.id ? <Loader2 className="animate-spin" size={16} /> : <PackageCheck size={16} />}
                    Megjött
                  </button>
                )}
              </div>
            ))}
          </div>

          {issued && pendingLines.length > 1 ? (
            <footer className="flex justify-end border-t border-white/10 bg-black/5 px-4 py-3">
              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() => onReceiveAll(document)}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-4 text-sm disabled:opacity-45"
              >
                {busyKey === `doc:${document.id}` ? <Loader2 className="animate-spin" size={16} /> : <PackageCheck size={16} />}
                Minden tétel megjött
              </button>
            </footer>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

function HistoryRow({ item }: { item: AifShopIncomingHistoryItem }) {
  return <div className="grid grid-cols-[58px_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-[#293548] p-3"><span className="flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-xl bg-white/95">{item.product.imageUrl ? <img src={item.product.imageUrl} alt="" className="h-full w-full object-contain" /> : <ShoppingBag className="text-slate-500" />}</span><div className="min-w-0"><p className="truncate text-sm">{item.product.title}</p><p className="mt-1 text-[11px] text-white/48">{[item.product.brandName,item.product.colorName,item.product.size,item.product.productCode].filter(Boolean).join(" • ")}</p><p className="mt-1 text-[11px] text-[#d7fffd]">{item.document.documentNumber} • {item.document.sourceName} → {item.document.targetName}</p></div><div className="text-right"><p className="text-lg text-[#d7fffd]">{item.qty} db</p><p className="text-[11px] text-white/45">{formatDateTime(item.receivedAt)}</p><p className="mt-1 text-[10px] text-white/42">{item.receivedBy || "–"}</p></div></div>;
}

function Loading() {
  return <div className="flex min-h-[360px] items-center justify-center gap-3 text-white/50"><Loader2 className="animate-spin" /> Betöltés…</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/14 bg-black/5 text-center text-white/42"><Truck size={40} /><p className="mt-3 text-base">{text}</p></div>;
}
