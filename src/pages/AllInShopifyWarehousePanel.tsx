import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Loader2, PackageCheck, PackageSearch, Printer, RefreshCw, Search, UserRound, X } from "lucide-react";

const SHOPIFY_ICON = "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/spfyicon.png";
const clean = (value: unknown) => String(value ?? "");
const money = (value: unknown) => `${Number(value || 0).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`;
const date = (value: unknown) => {
  const d = new Date(clean(value));
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString("hu-HU", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

type DocumentLine = { title?: string; qty?: number; size?: string | null; barcode?: string | null; imageUrl?: string | null; shipped?: number; released?: number };
type ShopifyDocument = {
  shopify_order_id: string;
  document_number: string;
  order_name: string;
  customer_name?: string | null;
  state: string;
  created_at: string;
  total_qty: number | string;
  total_value?: number | string;
  total_price?: number | string;
  total_shipping?: number | string;
  financial_status?: string;
  lines?: DocumentLine[];
};
type AvizLine = { id?: string; line_no?: number; product_title?: string; brand_name?: string; barcode?: string; size?: string; qty?: number; unit_price?: number; line_total?: number; image_url?: string };
type AvizDetail = { document: Record<string, unknown>; lines: AvizLine[] };

type Props = { open: boolean; mode: "reserved" | "documents"; apiBase?: string; onClose: () => void };

export default function AllInShopifyWarehousePanel({ open, mode, apiBase = "/api", onClose }: Props) {
  const base = apiBase.replace(/\/+$/, "");
  const [items, setItems] = useState<ShopifyDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<AvizDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [openedId, setOpenedId] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${base}/aif/shopify/warehouse/shop/documents`, { credentials: "include", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setItems(Array.isArray(result.items) ? result.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Az Aviz-lista nem tölthető be.");
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDetail(null);
    setOpenedId("");
    void load();
  }, [open]);

  const shown = useMemo(() => items.filter(item => {
    if (mode === "reserved" && item.state !== "allocated") return false;
    const match = [item.document_number, item.order_name, item.customer_name, ...(item.lines || []).map(line => [line.title, line.barcode].join(" "))].join(" ").toLocaleLowerCase("hu-HU");
    return match.includes(query.trim().toLocaleLowerCase("hu-HU"));
  }), [items, mode, query]);

  async function openDetail(item: ShopifyDocument) {
    setOpenedId(item.document_number);
    setDetail(null);
    setDetailBusy(true);
    setDetailError("");
    try {
      const response = await fetch(`${base}/aif/shopify/warehouse/shop/documents/${encodeURIComponent(item.document_number)}`, { credentials: "include", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      if (!result.document || !Array.isArray(result.lines)) throw new Error("Hiányos Aviz-adatok.");
      setDetail({ document: result.document, lines: result.lines });
    } catch (e) { setDetailError(e instanceof Error ? e.message : "A bizonylat nem tölthető be."); }
    finally { setDetailBusy(false); }
  }

  async function print() {
    if (!detail) return;
    setDetailError("");
    try {
      // Pontosan ugyanaz a román, A4-es proces-verbal sablon mint az Admin bizonylatainál.
      // A függvény kizárólag nyomtat, sem készletet, sem rendelést nem módosít.
      const { printShopifyStockDocument } = await import("./AllInProductMoves");
      printShopifyStockDocument(detail);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "A PDF / nyomtatás nem indítható.");
    }
  }

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-[#0f172a]/85 p-3 backdrop-blur-md sm:p-5" onMouseDown={e => { if (e.currentTarget === e.target) onClose(); }}>
      <section role="dialog" aria-modal="true" className="flex max-h-[94dvh] w-full max-w-[1340px] flex-col overflow-hidden rounded-[28px] border border-[#9be9e5]/35 bg-[#303a4c] text-white shadow-[0_35px_100px_rgba(0,0,0,.55)]">
        <header className="flex items-center justify-between gap-3 border-b border-white/14 bg-gradient-to-r from-[#1e4f54] via-[#247b79] to-[#2a8d8b] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3"><img src={SHOPIFY_ICON} alt="Shopify" className="h-11 w-11 rounded-xl border border-white/25 bg-white/10 p-1.5 object-contain" /><div><p className="text-[10px] uppercase tracking-[.14em] text-white/60">Shopify Raktár • belső nyilvántartás</p><h2 className="mt-1 text-xl">{mode === "reserved" ? "Rendeléshez félretett termékek" : "Shopify Avizok"}</h2></div></div>
          <div className="flex gap-2"><button type="button" onClick={() => void load()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/22 bg-white/10 px-3 text-xs disabled:opacity-50"><RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Frissítés</button><button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/22 bg-white/10" aria-label="Bezárás"><X size={18}/></button></div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <p className="mb-3 text-xs text-white/55">Az automatikusan létrehozott bizonylatok. A foglalás nem számít bolti eladásnak, és nem módosítja a kasszát.</p>
          <div className="relative mb-4"><Search size={17} className="absolute left-3 top-3.5 text-[#8ee6e2]"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Aviz, rendelés, vevő, termék vagy vonalkód..." className="h-11 w-full rounded-xl border border-white/16 bg-[#253244] pl-10 pr-4 text-sm outline-none focus:border-[#9be9e5]/50"/></div>
          {error ? <p className="mb-3 rounded-xl border border-red-300/40 bg-red-600/15 p-3 text-sm text-red-100">{error}</p> : null}
          {busy && !items.length ? <p className="py-12 text-center text-white/55"><Loader2 size={19} className="mr-2 inline animate-spin"/>Betöltés...</p> : null}
          <div className="grid gap-2 lg:grid-cols-2">
            {shown.map(item => <button key={item.document_number} type="button" onClick={()=>void openDetail(item)} className={`rounded-2xl border p-4 text-left transition hover:border-[#9be9e5]/50 hover:bg-[#405066] ${openedId===item.document_number ? "border-[#9be9e5]/55 bg-[#245a60]" : "border-white/12 bg-[#354153]"}`}>
              <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><FileText size={19} className="text-[#8ee6e2]" /><span className="truncate text-base text-white">{item.document_number}</span></div><span className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] ${item.state==='allocated'?'border-[#9be9e5]/35 bg-[#2a8d8b]/25 text-[#d7fffd]':'border-white/15 bg-black/10 text-white/65'}`}>{item.state==='allocated'?'Csomagolásra vár':item.state==='fulfilled'?'Teljesítve':'Visszavonva'}</span></div>
              <div className="mt-2 text-sm text-white/76"><span className="text-[#d7fffd]">{item.order_name}</span> <span className="text-white/35">•</span> <UserRound size={13} className="mb-0.5 inline text-white/50"/> {item.customer_name || "Ismeretlen vevő"}</div>
              <div className="mt-2 text-xs text-white/47">{date(item.created_at)} • {Number(item.total_qty)} db</div>
              {(item.lines || []).map((line, index)=><div key={index} className="mt-2 flex items-center gap-2 rounded-lg border border-white/8 bg-black/10 px-3 py-2 text-xs text-white/75">{line.imageUrl ? <img src={line.imageUrl} alt="" className="h-9 w-9 rounded-md bg-white object-contain"/> : <PackageSearch size={16}/>}<span className="min-w-0 flex-1 truncate">{line.title} • {line.size}</span><span className="shrink-0 text-[#d7fffd]">{line.qty} db</span></div>)}
            </button>)}
          </div>
          {!busy && !shown.length ? <div className="rounded-2xl border border-dashed border-white/15 py-16 text-center text-sm text-white/43">{query?'Nincs a keresésnek megfelelő Aviz.':mode==='reserved'?'Nincs függőben lévő, félretett Shopify-rendelés.':'Még nincs Shopify Aviz.'}</div> : null}
          {openedId ? <section className="mt-4 rounded-[22px] border border-[#9be9e5]/30 bg-[#253b4b] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><PackageCheck size={18} className="text-[#9be9e5]"/><h3 className="text-lg">{openedId}</h3></div><div className="flex gap-2"><button type="button" onClick={print} disabled={!detail} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#9be9e5]/40 bg-[#2a8d8b] px-4 text-sm disabled:opacity-40"><Printer size={16}/> Nyomtatás / PDF</button><button type="button" onClick={()=>{setOpenedId("");setDetail(null);}} className="h-10 rounded-xl border border-white/20 px-3 text-xs">Bezárás</button></div></div>
            {detailBusy ? <p className="mt-3 text-sm text-white/55"><Loader2 size={15} className="mr-2 inline animate-spin"/>Bizonylat betöltése...</p> : null}{detailError ? <p className="mt-3 text-sm text-red-100">{detailError}</p> : null}
            {detail ? <><p className="mt-3 text-sm text-white/72">{clean(detail.document.order_name)} • {clean(detail.document.customer_name)} • {clean(detail.document.from_location_summary)} → {clean(detail.document.to_location_summary)}</p><div className="mt-3 space-y-2">{detail.lines.map((line,i)=><div key={line.id || i} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#354153] p-3 text-sm"><span>{line.product_title} • {line.size} • {line.barcode}</span><span>{line.qty} db · {money(line.line_total)}</span></div>)}</div><p className="mt-3 text-xs text-white/46">Belső Aviz, nem számla. Az online fizetés nem a Shopify Raktár pénztárába kerül.</p></> : null}
          </section> : null}
        </div>
      </section>
    </div>, document.body
  );
}
