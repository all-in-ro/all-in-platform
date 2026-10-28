import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CheckCircle2, FileText, Loader2, PackageCheck, Printer, RefreshCw, Search, X } from "lucide-react";

const SHOPIFY_ICON = "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/spfyicon.png";

type ShopifyTransferLine = {
  id?: string; title?: string; product_title?: string; barcode?: string; size?: string;
  qty?: number | string; imageUrl?: string | null; image_url?: string | null;
  unitPrice?: number | string; total?: number | string; line_total?: number | string;
};
export type ShopifySourceDocument = {
  shopify_order_id: string; document_number: string; document_id: string;
  order_name: string; customer_name?: string | null; state: string;
  created_at: string; fulfilled_at?: string | null; total_qty: number | string;
  total_value: number | string; from_location_summary: string; to_location_summary: string;
  lines: ShopifyTransferLine[];
};
export type ShopifySourceSummary = { total: number; pending: number; fulfilled: number; cancelled: number };
type Props = {
  open: boolean; locationCode: string; locationName: string; onClose: () => void;
  onOpenRegularDocuments: () => void;
};
type Detail = { document: Record<string, any>; lines: Array<Record<string, any>> };
type Filter = "all" | "allocated" | "fulfilled" | "cancelled";

const fmt = (value: unknown) => {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "–" : date.toLocaleString("hu-HU", {
    timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
};
const money = (value: unknown) => `${Number(value || 0).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`;
const labelFor = (state: string) => state === "allocated" ? "Feladásra vár" : state === "fulfilled" ? "Elküldve" : state === "cancelled" ? "Visszavonva" : state;

/** Ugyanazokat a Shopify Avizokat mutatja, amelyek a főnöki készletbizonylati archívumban is szerepelnek. */
export default function AllInShopifySourceDocuments({ open, locationCode, locationName, onClose, onOpenRegularDocuments }: Props) {
  const [documents, setDocuments] = useState<ShopifySourceDocument[]>([]);
  const [summary, setSummary] = useState<ShopifySourceSummary>({ total: 0, pending: 0, fulfilled: 0, cancelled: 0 });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [printBusy, setPrintBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/aif/shopify/warehouse/shop/source/documents?location=${encodeURIComponent(locationCode)}`, {
        credentials: "include", cache: "no-store", headers: { Accept: "application/json" },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${response.status}`);
      if (!Array.isArray(data?.items) || !data?.summary) throw new Error("Hiányos Shopify Aviz-válasz érkezett a szervertől.");
      setDocuments(data.items);
      setSummary({
        total: Number(data.summary.total || 0),
        pending: Number(data.summary.pending || 0),
        fulfilled: Number(data.summary.fulfilled || 0),
        cancelled: Number(data.summary.cancelled || 0),
      });
    } catch (e) { setError(e instanceof Error ? e.message : "A Shopify átadások nem tölthetők be."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!open) return;
    setQuery(""); setFilter("all"); setDetail(null); setDetailError("");
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [open, locationCode]);

  useEffect(() => {
    if (!open) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") { if (detail) setDetail(null); else onClose(); } };
    window.addEventListener("keydown", onEsc);
    return () => { document.body.style.overflow = oldOverflow; window.removeEventListener("keydown", onEsc); };
  }, [open, detail, onClose]);

  const visible = useMemo(() => documents.filter(doc => {
    if (filter !== "all" && doc.state !== filter) return false;
    const haystack = [doc.document_number, doc.order_name, doc.customer_name,
      ...(doc.lines || []).flatMap(line => [line.title, line.barcode, line.size])]
      .join(" ").toLocaleLowerCase("hu-HU");
    return haystack.includes(query.trim().toLocaleLowerCase("hu-HU"));
  }), [documents, filter, query]);

  async function openDetail(item: ShopifySourceDocument) {
    setDetail(null); setDetailError(""); setDetailLoading(true);
    try {
      const response = await fetch(`/api/aif/shopify/warehouse/shop/source/documents/${encodeURIComponent(item.document_number)}?location=${encodeURIComponent(locationCode)}`, {
        credentials: "include", cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.document || !Array.isArray(data?.lines)) throw new Error(data?.error || "Hiányos Shopify Aviz-adatok.");
      setDetail({ document: data.document, lines: data.lines });
    } catch (e) { setDetailError(e instanceof Error ? e.message : "A bizonylat nem tölthető be."); }
    finally { setDetailLoading(false); }
  }

  async function print() {
    if (!detail || printBusy) return;
    setPrintBusy(true); setDetailError("");
    try {
      // Egyetlen közös AllInFashion proces-verbal formátum az Admin és az üzlet számára.
      const { printShopifyStockDocument } = await import("./AllInProductMoves");
      printShopifyStockDocument(detail);
    } catch (e) { setDetailError(e instanceof Error ? e.message : "A bizonylat nyomtatása nem sikerült."); }
    finally { setPrintBusy(false); }
  }

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[340] grid place-items-center bg-[#101827]/85 p-3 text-white backdrop-blur-sm sm:p-5" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Shopify készletátadási bizonylatok" className="flex max-h-[94dvh] w-full max-w-[1340px] flex-col overflow-hidden rounded-[26px] border border-[#96BF48]/40 bg-[#303a4c] shadow-[0_32px_100px_rgba(0,0,0,.58)]">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#365b35] via-[#59873d] to-[#96BF48] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <img src={SHOPIFY_ICON} alt="Shopify" className="h-11 w-11 shrink-0 rounded-xl border border-white/25 bg-white/15 p-1.5 object-contain" />
            <div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.13em] text-white/78">Készletfelelősség • {locationName}</p><h2 className="mt-1 truncate text-xl">Shopify kimenő Avizok</h2></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/25 bg-black/15 px-3 text-xs disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Frissítés</button>
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-white/25 bg-black/15" aria-label="Bezárás"><X size={18}/></button>
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3.5 sm:p-5">
          <nav aria-label="Bizonylatok típusai" className="flex flex-wrap items-center gap-2 rounded-[17px] border border-white/12 bg-[#283448] p-2">
            <button type="button" aria-current="page" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#96BF48]/65 bg-[#96BF48]/24 px-4 text-[12px] text-white">
              <img src={SHOPIFY_ICON} alt="" className="h-5 w-5 object-contain" /> Shopify bizonylatok
              <span className="ml-1 rounded-md bg-black/15 px-1.5 py-0.5 text-[10px]">{summary.total}</span>
            </button>
            <button type="button" onClick={onOpenRegularDocuments} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-[#354153] px-4 text-[12px] text-white/78 transition hover:border-white/40 hover:bg-[#405064]"><FileText size={16} /> Saját bizonylatok</button>
            {summary.pending > 0 && !error ? <span className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[#96BF48]/45 bg-[#96BF48]/12 px-3 py-2 text-[11px] text-[#e8ffce]"><CheckCircle2 size={14} /> {summary.pending} feladásra vár</span> : null}
          </nav>
          <p className="text-xs leading-relaxed text-white/65">Ezek a dokumentumok bizonyítják, hogy a megjelölt termékek kikerültek a <span className="text-white">{locationName}</span> készletfelelősségi köréből a Shopify Raktárba. Az Aviz nem helyi kasszabevétel és nem újabb készletlevonás.</p>
          <div className="grid gap-2 sm:grid-cols-4">
            {([{ key: "all", label: "Összes", value: summary.total }, { key: "allocated", label: "Feladásra vár", value: summary.pending }, { key: "fulfilled", label: "Elküldve", value: summary.fulfilled }, { key: "cancelled", label: "Visszavonva", value: summary.cancelled }] as const).map(f => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={`flex h-12 items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm transition ${filter === f.key ? "border-[#b3df77] bg-[#96BF48]/23 text-white" : "border-white/14 bg-[#354153] text-white/72 hover:bg-white/10"}`}><span>{f.label}</span><span className="tabular-nums">{f.value}</span></button>
            ))}
          </div>
          <label className="relative block"><Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#b3df77]" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Aviz, AIF-rendelés, vevő vagy vonalkód…" className="h-12 w-full rounded-xl border border-white/16 bg-[#253244] pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#96BF48]" /></label>
          {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/40 bg-amber-500/12 px-4 py-3 text-sm text-amber-50"><span>Shopify bizonylatok ellenőrzése sikertelen: {error}</span><button type="button" onClick={() => void load()} className="rounded-lg border border-amber-200/40 px-3 py-1.5 text-xs hover:bg-amber-500/20">Újrapróbálás</button></div> : null}
          <div className="grid gap-2 lg:grid-cols-2">
            {visible.map(item => {
              const pending = item.state === "allocated";
              return <button key={item.document_number} type="button" onClick={() => void openDetail(item)} className={`rounded-[19px] border p-3.5 text-left transition hover:border-[#96BF48]/70 ${pending ? "border-[#96BF48]/45 bg-[#96BF48]/[0.11]" : "border-white/12 bg-[#354153] hover:bg-[#405066]"}`}>
                <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2"><img src={SHOPIFY_ICON} alt="" className="h-7 w-7 object-contain"/><span className="text-base text-white">{item.document_number}</span></div><span className={`rounded-lg border px-2.5 py-1 text-[10px] ${pending ? "border-[#96BF48]/55 bg-[#96BF48]/23 text-[#eaffd5]" : "border-white/16 bg-black/10 text-white/70"}`}>{labelFor(item.state)}</span></div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-white/73"><span className="text-[#ddf9bc]">{item.order_name}</span><span>• {item.customer_name || "Vevő"}</span></div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-white/47"><span>{fmt(item.created_at)}</span><span>•</span><span>{item.total_qty} db</span><span>•</span><span>{money(item.total_value)}</span></div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-white/53"><span className="truncate">{item.from_location_summary}</span><ArrowRight size={13} /><span className="truncate">{item.to_location_summary}</span></div>
                {(item.lines || []).slice(0, 3).map((line,i) => <div key={line.id || i} className="mt-2 flex items-center gap-2 rounded-lg border border-white/9 bg-black/10 p-2 text-[11px] text-white/75">{line.imageUrl ? <img src={line.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain" /> : <PackageCheck size={18} className="shrink-0 text-[#b3df77]" />}<span className="min-w-0 flex-1 truncate">{line.title} • {line.size} • {line.barcode}</span><span className="shrink-0">{line.qty} db</span></div>)}
              </button>;
            })}
          </div>
          {loading && !documents.length ? <p className="py-14 text-center text-white/50"><Loader2 size={18} className="mr-2 inline animate-spin" />Adatok betöltése…</p> : null}
          {!loading && !error && !visible.length ? <p className="rounded-xl border border-dashed border-white/15 px-4 py-12 text-center text-sm text-white/48">Nincs a szűrésnek megfelelő Shopify Aviz ennél az üzletnél.</p> : null}
          {detailLoading ? <p className="flex items-center gap-2 rounded-xl border border-white/12 p-4 text-xs text-white/60"><Loader2 size={16} className="animate-spin"/>Bizonylat betöltése…</p> : null}
          {detailError ? <p className="rounded-xl border border-rose-300/35 bg-rose-500/10 p-3 text-xs text-rose-100">{detailError}</p> : null}
          {detail ? <section className="rounded-[19px] border border-[#96BF48]/42 bg-[#283c41] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[9px] uppercase tracking-[0.12em] text-white/47">Aviz részletei</p><h3 className="mt-1 text-lg text-white">{String(detail.document.document_number || "")}</h3><p className="mt-1 text-xs text-white/60">{String(detail.document.order_name || detail.document.external_reference || "")} • {String(detail.document.customer_name || detail.document.raw?.customerName || "")}</p></div>
            <div className="flex items-center gap-2"><button type="button" onClick={() => void print()} disabled={printBusy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#96BF48]/50 bg-[#96BF48]/25 px-4 text-sm text-white hover:bg-[#96BF48]/35 disabled:opacity-50"><Printer size={16} /> {printBusy ? "Nyomtatás…" : "Hivatalos formátum / PDF"}</button><button type="button" onClick={() => setDetail(null)} className="h-10 rounded-xl border border-white/18 px-3 text-sm">Bezárás</button></div></div>
            <div className="mt-3 space-y-2">{detail.lines.map((line,i) => <div key={String(line.id || i)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#354153] px-3 py-2.5 text-xs"><span>{String(line.product_title || "")} • {String(line.size || "")} • {String(line.barcode || "")}</span><span>{Number(line.qty)} db • {money(line.line_total)}</span></div>)}</div>
            <p className="mt-3 text-[11px] text-white/45">Belső készletátadási dokumentum, nem számla és nem bolti pénztári nyugta. Nem indít készletmozgást.</p>
          </section> : null}
        </div>
      </section>
    </div>, document.body,
  );
}
