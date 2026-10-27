import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Mail, Phone, RefreshCw, Search, ShoppingBag, UserRound, X } from "lucide-react";

const SHOPIFY_ICON = "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/spfyicon.png";
type Order = { orderNumber: string; total: number | string; shipping: number | string; financialStatus?: string; status?: string; createdAt: string };
type Customer = { customer_key: string; customer_name: string | null; customer_email: string | null; customer_phone: string | null; order_count: number; paid_total: number | string; last_order_at: string | null; orders: Order[] };
const formatMoney = (v: unknown) => `${Number(v || 0).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`;
const formatDate = (v: string | null) => v ? new Date(v).toLocaleDateString("hu-HU", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }) : "–";

export default function AllInShopifyCustomers({ open, apiBase = "/api", onClose }: { open: boolean; apiBase?: string; onClose: () => void }) {
  const [items, setItems] = useState<Customer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const base = apiBase.replace(/\/+$/, "");
  async function refresh() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${base}/aif/shopify/warehouse/shop/customers`, { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setItems(Array.isArray(body.items) ? body.items : []);
    } catch (e) { setError(e instanceof Error ? e.message : "A Shopify kliensek nem tölthetők be."); }
    finally { setBusy(false); }
  }
  useEffect(() => { if(open) { setQuery(""); setSelected(null); void refresh(); } }, [open]);
  const shown = useMemo(() => items.filter(item => [item.customer_name,item.customer_email,item.customer_phone,...(item.orders||[]).map(o=>o.orderNumber)].join(" ").toLocaleLowerCase("hu-HU").includes(query.trim().toLocaleLowerCase("hu-HU"))), [items,query]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[330] flex items-center justify-center bg-[#0f172a]/86 p-3 backdrop-blur-md sm:p-5" onMouseDown={e => { if (e.currentTarget === e.target) onClose(); }}>
    <section role="dialog" aria-modal="true" className="flex max-h-[94dvh] w-full max-w-[1250px] flex-col overflow-hidden rounded-[28px] border border-[#9be9e5]/35 bg-[#303a4c] text-white shadow-[0_35px_100px_rgba(0,0,0,.55)]">
      <header className="flex items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#1e4f54] via-[#247b79] to-[#2a8d8b] px-5 py-4"><div className="flex items-center gap-3"><img src={SHOPIFY_ICON} alt="Shopify" className="h-11 w-11 rounded-xl border border-white/20 bg-white/10 p-1.5 object-contain"/><div><p className="text-[10px] uppercase tracking-[.14em] text-white/60">Online vásárlók</p><h2 className="mt-1 text-xl">Shopify kliensek</h2></div></div><div className="flex gap-2"><button type="button" onClick={()=>void refresh()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-xs"><RefreshCw size={15} className={busy?"animate-spin":""}/>Frissítés</button><button type="button" onClick={onClose} className="h-10 w-10 rounded-xl border border-white/20 bg-white/10" aria-label="Bezárás"><X size={17} className="mx-auto"/></button></div></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"><p className="mb-3 text-xs text-white/55">A Shopify-rendelésekben szereplő vevők. Kizárólag megtekintés; külön a bolti kliensektől és a kasszától.</p><div className="relative mb-4"><Search size={17} className="absolute left-3 top-3.5 text-[#8ee6e2]"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Név, email, telefon vagy rendelés..." className="h-11 w-full rounded-xl border border-white/15 bg-[#253244] pl-10 pr-4 text-sm outline-none focus:border-[#9be9e5]/50" /></div>
      {error ? <p className="mb-4 rounded-xl border border-red-300/40 bg-red-600/15 p-3 text-sm text-red-100">{error}</p> : null}
      {busy && !items.length ? <div className="py-14 text-center text-white/55"><Loader2 size={19} className="mr-2 inline animate-spin"/>Betöltés...</div> : null}
      <div className="grid gap-3 lg:grid-cols-2">{shown.map(customer => <article key={customer.customer_key} className="rounded-[20px] border border-white/13 bg-[#354153] p-4"><button type="button" onClick={()=>setSelected(v=>v===customer.customer_key?null:customer.customer_key)} className="flex w-full items-start justify-between gap-3 text-left"><div className="flex min-w-0 items-start gap-3"><span className="rounded-xl border border-[#9be9e5]/25 bg-[#2a8d8b]/20 p-2.5 text-[#9be9e5]"><UserRound size={21}/></span><div className="min-w-0"><p className="truncate text-base">{customer.customer_name || customer.customer_email || "Névtelen vevő"}</p><p className="mt-1 text-xs text-white/52">{customer.order_count} rendelés • legutóbb {formatDate(customer.last_order_at)}</p><p className="mt-2 text-xs text-[#d7fffd]">Online fizetett összeg: {formatMoney(customer.paid_total)}</p></div></div><span className="shrink-0 rounded-lg border border-white/13 px-2 py-1 text-xs text-white/65">{selected===customer.customer_key?'−':'+'}</span></button>
        {selected===customer.customer_key ? <div className="mt-3 space-y-2 border-t border-white/12 pt-3">{customer.customer_email ? <p className="flex items-center gap-2 text-sm text-white/72"><Mail size={15}/><span className="break-all">{customer.customer_email}</span></p> : null}{customer.customer_phone ? <p className="flex items-center gap-2 text-sm text-white/72"><Phone size={15}/>{customer.customer_phone}</p> : null}<p className="pt-2 text-[10px] uppercase tracking-[.1em] text-white/43">Shopify rendelései</p>{(customer.orders||[]).map((order,i)=><div key={`${order.orderNumber}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#293548] px-3 py-2.5 text-sm"><span className="flex items-center gap-2"><ShoppingBag size={15} className="text-[#8ee6e2]"/>{order.orderNumber}<span className="text-xs text-white/40">{formatDate(order.createdAt)}</span></span><span className="text-[#d7fffd]">{formatMoney(order.total)} • {order.financialStatus==='paid'?'Fizetve':order.financialStatus || '–'}</span></div>)}</div> : null}
      </article>)}</div>
      {!busy && !shown.length ? <div className="py-14 text-center text-sm text-white/45">Nincs Shopify kliens a keresésben.</div> : null}
      </div>
    </section>
  </div>,document.body);
}
