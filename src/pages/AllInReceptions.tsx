import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Download,
  Eye,
  FileText,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  AifMeta,
  AifReceptionDetail,
  AifReceptionSummary,
  apiAifDeleteReception,
  apiAifGetReception,
  apiAifListReceptions,
  apiAifMeta,
  apiAifReceptionExportCsvUrl,
} from "../lib/aif/api";

type Props = { onLogout?: () => void };

const page = "min-h-screen bg-[#4b5362] px-3 py-4 text-white font-normal sm:px-5 sm:py-6";
const wrap = "mx-auto max-w-7xl space-y-4";
const card = "rounded-2xl border border-white/18 bg-[#4d5869] p-3 shadow-lg shadow-slate-950/15 sm:p-4 font-normal";
const headerCard = "rounded-2xl border border-white/24 bg-[#465164] px-4 py-3 shadow-lg shadow-slate-950/10";
const sectionHeader = "flex w-full items-center justify-between gap-3 rounded-xl border border-white/22 border-l-4 border-l-emerald-300 bg-[#303b4e] px-3 py-2.5 text-left shadow-sm shadow-slate-950/20 font-normal";
const label = "grid gap-1.5 text-xs uppercase tracking-[0.05em] text-white/86 font-normal";
const input = "h-9 rounded-lg border border-white/24 bg-[#303b4e] px-3 text-sm text-white caret-white outline-none transition placeholder:text-white/50 selection:bg-emerald-300/35 focus:border-emerald-200/80 focus:ring-1 focus:ring-emerald-200/30 [color-scheme:dark] font-normal";
const select = `${input} pr-8`;
const btnBase = "inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = `${btnBase} border-emerald-300/24 bg-[#276454] hover:bg-[#2d735f]`;
const neutralBtn = `${btnBase} border-white/24 bg-[#354153] hover:bg-[#3e4d63]`;
const dangerBtn = `${btnBase} border-red-300/24 bg-[#c90d22] hover:bg-[#a90c1d]`;
const tinyBtn = "inline-flex h-7 items-center justify-center gap-1 rounded-md border border-white/20 bg-[#354153] px-2 text-[11px] text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const tinyDangerBtn = "inline-flex h-7 items-center justify-center gap-1 rounded-md border border-red-300/24 bg-[#c90d22] px-2 text-[11px] text-white transition hover:bg-[#a90c1d] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const statCard = "rounded-xl border border-white/18 bg-[#354153] px-3 py-2";

function n(v: unknown): number {
  const x = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

function money(v: unknown, currency?: string | null): string {
  const x = n(v);
  return `${x.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
}

function dateText(v?: string | null) {
  if (!v) return "-";
  return String(v).slice(0, 10);
}

function cell(v: unknown) {
  const s = String(v ?? "").trim();
  return s || "-";
}

function statusText(s?: string | null) {
  const v = String(s || "").toLowerCase();
  if (v === "draft") return "Vázlat";
  if (v === "parsed") return "Ellenőrizve";
  if (v === "needs_review") return "Ellenőrzés szükséges";
  if (v === "committed") return "Készletre véve";
  if (v === "cancelled") return "Törölve";
  return s || "-";
}

function SectionTitle(props: { title: string; icon?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className={sectionHeader}>
      <div className="flex items-center gap-2 text-sm uppercase tracking-[0.11em] text-white/94">
        {props.icon}
        <span>{props.title}</span>
      </div>
      {props.right}
    </div>
  );
}

function exportCsv(id: string) {
  window.open(apiAifReceptionExportCsvUrl(id), "_blank", "noopener,noreferrer");
}

export default function AllInReceptions(_props: Props) {
  const [meta, setMeta] = useState<AifMeta | null>(null);
  const [items, setItems] = useState<AifReceptionSummary[]>([]);
  const [detail, setDetail] = useState<AifReceptionDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AifReceptionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("");
  const [location, setLocation] = useState("");
  const [currency, setCurrency] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const [m, r] = await Promise.all([
        apiAifMeta(),
        apiAifListReceptions({ limit: 200, search, supplier, location, currency, status, from, to }),
      ]);
      setMeta(m);
      setItems(r.items || []);
    } catch (e: any) {
      setMessage(e?.message || "A receptiók betöltése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.qty += Number(r.total_qty || 0);
        acc.lines += Number(r.line_count || 0);
        acc.value += n(r.invoice_gross);
        acc.deletable += r.can_delete ? 1 : 0;
        return acc;
      },
      { count: 0, qty: 0, lines: 0, value: 0, deletable: 0 }
    );
  }, [items]);

  async function openDetail(id: string) {
    setBusy(true);
    setMessage("");
    try {
      setDetail(await apiAifGetReception(id));
    } catch (e: any) {
      setMessage(e?.message || "A receptió részletei nem tölthetők be.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteReception() {
    if (!deleteTarget) return;
    setBusy(true);
    setMessage("");
    try {
      await apiAifDeleteReception(deleteTarget.id);
      setDeleteTarget(null);
      if (detail?.item?.id === deleteTarget.id) setDetail(null);
      await load();
      setMessage("Receptió törölve.");
    } catch (e: any) {
      setMessage(e?.message || "A receptió törlése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setSupplier("");
    setLocation("");
    setCurrency("");
    setStatus("");
    setFrom("");
    setTo("");
    setTimeout(() => load(), 0);
  }

  return (
    <div className={page}>
      <div className={wrap}>
        <header className={headerCard}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.13em] text-white/70">AllInFashion</p>
              <h1 className="mt-1 text-2xl text-white">Receptiók</h1>
              <p className="mt-1 text-sm text-white/80">Számlás bevételezések, export, részletezés és tesztadatok törlése.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={neutralBtn} onClick={load} disabled={busy} type="button"><RefreshCw size={15} /> Frissítés</button>
              <button className={neutralBtn} onClick={() => (window.location.hash = "#allinincoming")} type="button"><FileText size={15} /> Új bevételezés</button>
              <button className={neutralBtn} onClick={() => (window.location.hash = "#allin")} type="button"><ArrowLeft size={15} /> Vissza</button>
            </div>
          </div>
        </header>

        {message && <div className="rounded-xl border border-white/18 bg-[#354153] px-3 py-2 text-sm text-white/86">{message}</div>}

        <section className={card}>
          <SectionTitle icon={<Search size={16} />} title="Szűrés és keresés" />
          <div className="mt-3 grid gap-3 lg:grid-cols-4">
            <label className={`${label} lg:col-span-2`}>
              Keresés
              <input className={input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="számlaszám, beszállító, cél hely" />
            </label>
            <label className={label}>
              Időszak kezdete
              <input className={input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className={label}>
              Időszak vége
              <input className={input} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className={label}>
              Beszállító
              <select className={select} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">Összes</option>
                {(meta?.suppliers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className={label}>
              Cél hely
              <select className={select} value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="">Összes</option>
                {(meta?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className={label}>
              Pénznem
              <select className={select} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="">Összes</option>
                {(meta?.currencies || []).map((c) => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
              </select>
            </label>
            <label className={label}>
              Állapot
              <select className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Összes</option>
                <option value="draft">Vázlat</option>
                <option value="parsed">Ellenőrizve</option>
                <option value="needs_review">Ellenőrzés szükséges</option>
                <option value="committed">Készletre véve</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={primaryBtn} onClick={load} disabled={busy} type="button"><Search size={15} /> Keresés</button>
            <button className={neutralBtn} onClick={resetFilters} type="button"><X size={15} /> Alaphelyzet</button>
          </div>
        </section>

        <section className={card}>
          <SectionTitle icon={<CalendarDays size={16} />} title="Áttekintés" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Receptiók</p><p className="mt-1 text-xl text-white">{totals.count}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Terméksor</p><p className="mt-1 text-xl text-white">{totals.lines}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Darab</p><p className="mt-1 text-xl text-white">{totals.qty}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Törölhető</p><p className="mt-1 text-xl text-white">{totals.deletable}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Összes érték</p><p className="mt-1 text-xl text-white">{money(totals.value)}</p></div>
          </div>
        </section>

        <section className={card}>
          <SectionTitle title="Receptió lista" right={<span className="text-xs text-white/70">{items.length} találat</span>} />
          <div className="mt-3 overflow-hidden rounded-xl border border-white/12">
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#303b4e] text-xs uppercase tracking-[0.06em] text-white/72">
                  <tr>
                    <th className="px-3 py-2">Számla</th>
                    <th className="px-3 py-2">Beszállító</th>
                    <th className="px-3 py-2">Cél hely</th>
                    <th className="px-3 py-2">Dátum</th>
                    <th className="px-3 py-2">Pénznem</th>
                    <th className="px-3 py-2 text-right">Végösszeg</th>
                    <th className="px-3 py-2 text-right">Sorszám</th>
                    <th className="px-3 py-2 text-right">Darab</th>
                    <th className="px-3 py-2">Állapot</th>
                    <th className="px-3 py-2 text-right">Művelet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 bg-[#4d5869]">
                  {items.map((r) => (
                    <tr key={r.id} className="hover:bg-white/5">
                      <td className="px-3 py-2 text-white">{cell(r.invoice_number)}</td>
                      <td className="px-3 py-2 text-white/82">{cell(r.supplier_name)}</td>
                      <td className="px-3 py-2 text-white/82">{cell(r.location_name)}</td>
                      <td className="px-3 py-2 text-white/82">{dateText(r.reception_date)}</td>
                      <td className="px-3 py-2 text-white/82">{cell(r.currency_code)}</td>
                      <td className="px-3 py-2 text-right text-white">{money(r.invoice_gross, r.currency_code)}</td>
                      <td className="px-3 py-2 text-right text-white/82">{r.line_count || 0}</td>
                      <td className="px-3 py-2 text-right text-white/82">{r.total_qty || 0}</td>
                      <td className="px-3 py-2 text-white/82">{statusText(r.status)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1.5">
                          <button className={tinyBtn} onClick={() => openDetail(r.id)} disabled={busy} type="button"><Eye size={13} /> Adatok</button>
                          <button className={tinyBtn} onClick={() => exportCsv(r.id)} type="button"><Download size={13} /> Export</button>
                          <button className={tinyDangerBtn} onClick={() => setDeleteTarget(r)} disabled={busy || !r.can_delete} type="button"><Trash2 size={13} /> Törlés</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!items.length && <tr><td className="px-3 py-8 text-center text-white/62" colSpan={10}>Nincs receptió a megadott szűrés szerint.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 bg-[#4d5869] p-2 lg:hidden">
              {items.map((r) => (
                <div key={r.id} className="rounded-xl border border-white/12 bg-[#354153] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-white">{cell(r.invoice_number)}</p>
                      <p className="mt-1 text-xs text-white/62">{cell(r.supplier_name)} • {cell(r.location_name)}</p>
                    </div>
                    <span className="rounded-full border border-emerald-200/30 bg-emerald-300/10 px-2 py-1 text-xs text-emerald-50">{statusText(r.status)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Dátum</p><p>{dateText(r.reception_date)}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Érték</p><p>{money(r.invoice_gross, r.currency_code)}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Sorszám</p><p>{r.line_count || 0}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Darab</p><p>{r.total_qty || 0}</p></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className={tinyBtn} onClick={() => openDetail(r.id)} disabled={busy} type="button"><Eye size={13} /> Adatok</button>
                    <button className={tinyBtn} onClick={() => exportCsv(r.id)} type="button"><Download size={13} /> Export</button>
                    <button className={tinyDangerBtn} onClick={() => setDeleteTarget(r)} disabled={busy || !r.can_delete} type="button"><Trash2 size={13} /> Törlés</button>
                  </div>
                </div>
              ))}
              {!items.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-5 text-center text-sm text-white/65">Nincs receptió a megadott szűrés szerint.</p>}
            </div>
          </div>
        </section>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/62 p-3 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-2xl border border-white/24 bg-[#4d5869] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/18 bg-[#303b4e] px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.1em] text-white/60">Receptió részletei</p>
                <h2 className="text-lg text-white">{cell(detail.item.invoice_number)}</h2>
              </div>
              <div className="flex gap-2">
                <button className={neutralBtn} onClick={() => exportCsv(detail.item.id)} type="button"><Download size={15} /> Export</button>
                <button className={neutralBtn} onClick={() => setDetail(null)} type="button"><X size={15} /> Bezárás</button>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div className={statCard}><p className="text-xs uppercase text-white/56">Beszállító</p><p className="mt-1 text-sm text-white">{cell(detail.item.supplier_name)}</p></div>
                <div className={statCard}><p className="text-xs uppercase text-white/56">Cél hely</p><p className="mt-1 text-sm text-white">{cell(detail.item.location_name)}</p></div>
                <div className={statCard}><p className="text-xs uppercase text-white/56">Pénznem</p><p className="mt-1 text-sm text-white">{cell(detail.item.currency_code)}</p></div>
                <div className={statCard}><p className="text-xs uppercase text-white/56">Árfolyam</p><p className="mt-1 text-sm text-white">{cell(detail.item.exchange_rate_to_ron)}</p></div>
                <div className={statCard}><p className="text-xs uppercase text-white/56">Végösszeg</p><p className="mt-1 text-sm text-white">{money(detail.item.invoice_gross, detail.item.currency_code)}</p></div>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/12">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#303b4e] text-xs uppercase tracking-[0.06em] text-white/72">
                    <tr>
                      <th className="px-3 py-2">Sorszám</th>
                      <th className="px-3 py-2">Állapot</th>
                      <th className="px-3 py-2">Termékkód</th>
                      <th className="px-3 py-2">Név</th>
                      <th className="px-3 py-2">Méret</th>
                      <th className="px-3 py-2 text-right">Darab</th>
                      <th className="px-3 py-2 text-right">Vételár</th>
                      <th className="px-3 py-2 text-right">Vételár RON</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 bg-[#4d5869]">
                    {detail.rows.map((r) => {
                      const norm: any = r.normalized || {};
                      return (
                        <tr key={r.id}>
                          <td className="px-3 py-2 text-white/82">{r.row_no}</td>
                          <td className="px-3 py-2 text-white/82">{statusText(r.status)}</td>
                          <td className="px-3 py-2 text-white/82">{cell(r.supplier_product_code || norm.supplierProductCode || norm.modelCode)}</td>
                          <td className="px-3 py-2 text-white">{cell(norm.titleRo)}</td>
                          <td className="px-3 py-2 text-white/82">{cell(r.supplier_size || norm.size)}</td>
                          <td className="px-3 py-2 text-right text-white/82">{r.qty || norm.qty || 0}</td>
                          <td className="px-3 py-2 text-right text-white/82">{money(r.buy_price, detail.item.currency_code)}</td>
                          <td className="px-3 py-2 text-right text-white/82">{money(r.buy_price_ron, "RON")}</td>
                        </tr>
                      );
                    })}
                    {!detail.rows.length && <tr><td className="px-3 py-8 text-center text-white/62" colSpan={8}>Ehhez a receptióhoz nincs mentett terméksor.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/62 p-3 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/24 bg-[#4d5869] p-4 shadow-2xl">
            <h2 className="text-lg text-white">Receptió törlése</h2>
            <p className="mt-2 text-sm text-white/76">A törlés a receptióhoz tartozó mentett import sorokat is eltávolítja, ha még nem történt készletre vétel.</p>
            <div className="mt-3 rounded-xl border border-white/12 bg-[#354153] p-3 text-sm text-white">
              {cell(deleteTarget.invoice_number)} • {cell(deleteTarget.supplier_name)} • {money(deleteTarget.invoice_gross, deleteTarget.currency_code)}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className={neutralBtn} onClick={() => setDeleteTarget(null)} disabled={busy} type="button"><X size={15} /> Mégse</button>
              <button className={dangerBtn} onClick={deleteReception} disabled={busy} type="button"><Trash2 size={15} /> Törlés</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
