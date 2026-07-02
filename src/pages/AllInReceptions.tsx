import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  Download,
  Eye,
  FileText,
  RefreshCw,
  Save,
  Search,
  MoveRight,
  Trash2,
  X,
} from "lucide-react";
import {
  AifMeta,
  AifReceptionDetail,
  AifReceptionSummary,
  apiAifCommitReceptionRows,
  apiAifDeleteReception,
  apiAifGetReception,
  apiAifIgnoreImportRow,
  apiAifListReceptions,
  apiAifMeta,
  apiAifMoveImportRow,
  apiAifUpdateReception,
  apiAifUpdateImportRow,
  apiAifReceptionExportCsvUrl,
} from "../lib/aif/api";

type Props = { onLogout?: () => void };

const page = "min-h-screen bg-[#4b5362] px-3 py-3 text-white font-normal sm:px-4 sm:py-4";
const wrap = "mx-auto max-w-7xl space-y-3";
const card = "rounded-2xl border border-white/18 bg-[#4d5869] p-2.5 shadow-lg shadow-slate-950/15 sm:p-3 font-normal";
const headerCard = "rounded-2xl border border-white/24 bg-[#465164] px-3 py-2.5 shadow-lg shadow-slate-950/10";
const sectionHeader = "flex w-full items-center justify-between gap-3 rounded-xl border border-white/22 border-l-4 border-l-emerald-300 bg-[#303b4e] px-3 py-2 text-left shadow-sm shadow-slate-950/20 font-normal";
const label = "grid gap-1 text-[11px] uppercase tracking-[0.05em] text-white/86 font-normal";
const input = "h-8 rounded-lg border border-white/24 bg-[#303b4e] px-2.5 text-xs text-white caret-white outline-none transition placeholder:text-white/50 selection:bg-emerald-300/35 focus:border-emerald-200/80 focus:ring-1 focus:ring-emerald-200/30 [color-scheme:dark] font-normal";
const select = `${input} pr-8`;
const btnBase = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = `${btnBase} border-emerald-300/24 bg-[#276454] hover:bg-[#2d735f]`;
const neutralBtn = `${btnBase} border-white/24 bg-[#354153] hover:bg-[#3e4d63]`;
const dangerBtn = `${btnBase} border-red-300/24 bg-[#c90d22] hover:bg-[#a90c1d]`;
const tinyBtn = "inline-flex h-6 items-center justify-center gap-1 rounded-md border border-white/20 bg-[#354153] px-2 text-[10.5px] text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const tinyDangerBtn = "inline-flex h-6 items-center justify-center gap-1 rounded-md border border-red-300/24 bg-[#c90d22] px-2 text-[10.5px] text-white transition hover:bg-[#a90c1d] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const statCard = "rounded-xl border border-white/18 bg-[#354153] px-2.5 py-1.5";

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
  if (v === "review") return "Folyamatban";
  if (v === "committed") return "Készletre véve";
  if (v === "ignored") return "Kihagyva";
  if (v === "cancelled") return "Törölve";
  return s || "-";
}

function rowDraftValue(row: any, drafts: Record<string, Record<string, unknown>>) {
  if (!row || row.status === "ignored") return 0;
  const draft = drafts[row.id] || row.normalized || {};
  const qty = n((draft as any).qty ?? row.qty ?? (row.normalized || {}).qty);
  const buyPrice = n((draft as any).buyPrice ?? row.buy_price ?? (row.normalized || {}).buyPrice);
  return qty * buyPrice;
}

function receptionBalance(item: any, rows: any[], drafts: Record<string, Record<string, unknown>>) {
  const invoiceGross = n(item?.invoice_gross);
  const shipping = n(item?.shipping_cost);
  const tvaRate = n(item?.tva_rate);
  const tvaMode = String(item?.tva_mode || "without_tva");
  const rowsValue = (rows || []).reduce((sum, row) => sum + rowDraftValue(row, drafts), 0);
  let tvaValue = 0;
  let calculatedTotal = rowsValue + shipping;

  if (tvaMode === "without_tva") {
    tvaValue = rowsValue * (tvaRate / 100);
    calculatedTotal = rowsValue + tvaValue + shipping;
  } else if (tvaMode === "with_tva" && tvaRate > 0) {
    tvaValue = rowsValue - rowsValue / (1 + tvaRate / 100);
    calculatedTotal = rowsValue + shipping;
  }

  const diff = invoiceGross - calculatedTotal;
  const absDiff = Math.abs(diff);
  const status = absDiff < 0.01 ? "Egyezik" : diff > 0 ? "Hiányzik a sorokból" : "Túllépés";
  const className = absDiff < 0.01
    ? "border-emerald-200/45 bg-emerald-300/10"
    : diff > 0
      ? "border-amber-200/50 bg-amber-300/12"
      : "border-red-200/50 bg-red-300/12";

  return { invoiceGross, rowsValue, shipping, tvaValue, calculatedTotal, diff, status, className };
}

function SectionTitle(props: { title: string; icon?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className={sectionHeader}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.11em] text-white/94">
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
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [rowDrafts, setRowDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [receptionDraft, setReceptionDraft] = useState<Record<string, string>>({});
  const [rowStatusFilter, setRowStatusFilter] = useState("active");
  const [moveTarget, setMoveTarget] = useState<any | null>(null);
  const [moveToReceptionId, setMoveToReceptionId] = useState("");
  const [savingHeader, setSavingHeader] = useState(false);
  const [savingRows, setSavingRows] = useState(false);
  const [committingRows, setCommittingRows] = useState(false);
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
      const next = await apiAifGetReception(id);
      setDetail(next);
      setReceptionDraft(buildReceptionDraft(next.item));
      setRowDrafts(buildDrafts(next.rows || []));
      setSelectedRows(new Set((next.rows || []).filter(rowCanWork).map((row: any) => row.id)));
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

  function rowCanWork(row: any) {
    return row.status !== "committed" && row.status !== "ignored";
  }

  function buildDrafts(rows: any[]) {
    const next: Record<string, Record<string, unknown>> = {};
    for (const row of rows || []) {
      const n: any = row.normalized || {};
      next[row.id] = {
        ...n,
        supplierProductCode: row.supplier_product_code || n.supplierProductCode || n.modelCode || "",
        titleRo: n.titleRo || "",
        colorName: n.colorName || "",
        colorCode: row.supplier_color_code || n.colorCode || "",
        size: row.supplier_size || n.size || "",
        qty: row.qty ?? n.qty ?? "",
        buyPrice: row.buy_price ?? n.buyPrice ?? "",
      };
    }
    return next;
  }

  function buildReceptionDraft(item: AifReceptionSummary) {
    return {
      invoiceNumber: String(item.invoice_number || ""),
      invoiceDate: dateText(item.invoice_date) === "-" ? "" : dateText(item.invoice_date),
      receptionDate: dateText(item.reception_date) === "-" ? "" : dateText(item.reception_date),
      currencyCode: String(item.currency_code || ""),
      exchangeRateToRon: String(item.exchange_rate_to_ron || ""),
      tvaMode: String(item.tva_mode || "without_tva"),
      tvaRate: String(item.tva_rate ?? ""),
      shippingCost: String(item.shipping_cost ?? ""),
      invoiceGross: String(item.invoice_gross ?? ""),
      note: String((item as any).note || ""),
    };
  }

  function updateReceptionDraft(key: string, value: string) {
    setReceptionDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "tvaMode" && value === "no_tva") next.tvaRate = "0";
      return next;
    });
  }

  const visibleRows = useMemo(() => {
    const rows = detail?.rows || [];
    if (rowStatusFilter === "all") return rows;
    if (rowStatusFilter === "committed") return rows.filter((r) => r.status === "committed");
    if (rowStatusFilter === "ignored") return rows.filter((r) => r.status === "ignored");
    if (rowStatusFilter === "error") return rows.filter((r) => r.status === "error" || (r.error_messages || []).length);
    return rows.filter((r) => r.status !== "committed" && r.status !== "ignored");
  }, [detail, rowStatusFilter]);

  const detailBalance = useMemo(() => {
    if (!detail) return null;
    return receptionBalance(detail.item, detail.rows || [], rowDrafts);
  }, [detail, rowDrafts]);

  async function saveReceptionHeader() {
    if (!detail) return;
    setSavingHeader(true);
    setMessage("");
    try {
      const saved = await apiAifUpdateReception(detail.item.id, {
        invoiceNumber: receptionDraft.invoiceNumber,
        invoiceDate: receptionDraft.invoiceDate,
        receptionDate: receptionDraft.receptionDate,
        currencyCode: receptionDraft.currencyCode,
        exchangeRateToRon: receptionDraft.exchangeRateToRon,
        tvaMode: receptionDraft.tvaMode,
        tvaRate: receptionDraft.tvaMode === "no_tva" ? 0 : receptionDraft.tvaRate,
        shippingCost: receptionDraft.shippingCost,
        invoiceGross: receptionDraft.invoiceGross,
        note: receptionDraft.note,
      });
      if (saved?.item) {
        setDetail((prev) => prev ? { ...prev, item: { ...prev.item, ...saved.item } } : prev);
        setReceptionDraft((prev) => ({
          ...prev,
          invoiceNumber: String(saved.item?.invoice_number ?? prev.invoiceNumber ?? ""),
          invoiceDate: dateOnly(saved.item?.invoice_date) || prev.invoiceDate,
          receptionDate: dateOnly(saved.item?.reception_date) || prev.receptionDate,
          currencyCode: String(saved.item?.currency_code ?? prev.currencyCode ?? ""),
          exchangeRateToRon: String(saved.item?.exchange_rate_to_ron ?? prev.exchangeRateToRon ?? ""),
          tvaMode: String(saved.item?.tva_mode ?? prev.tvaMode ?? ""),
          tvaRate: String(saved.item?.tva_rate ?? prev.tvaRate ?? ""),
          shippingCost: String(saved.item?.shipping_cost ?? prev.shippingCost ?? ""),
          invoiceGross: String(saved.item?.invoice_gross ?? prev.invoiceGross ?? ""),
          note: String(saved.item?.note ?? prev.note ?? ""),
        }));
      }
      await reloadDetail(detail.item.id);
      await load();
      setMessage("Receptió fejadatai mentve.");
    } catch (e: any) {
      setMessage(e?.message || "A receptió fejadatai nem menthetők.");
    } finally {
      setSavingHeader(false);
    }
  }

  async function moveRowToReception() {
    if (!detail || !moveTarget || !moveToReceptionId) return;
    setBusy(true);
    setMessage("");
    try {
      await apiAifMoveImportRow(moveTarget.id, moveToReceptionId);
      setMoveTarget(null);
      setMoveToReceptionId("");
      await reloadDetail(detail.item.id);
      await load();
      setMessage("Terméksor áthelyezve.");
    } catch (e: any) {
      setMessage(e?.message || "A terméksor áthelyezése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  function updateRowDraft(rowId: string, key: string, value: unknown) {
    setRowDrafts((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || {}),
        [key]: value,
      },
    }));
  }

  function toggleRow(rowId: string) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function selectReadyRows() {
    if (!detail) return;
    const ids = detail.rows
      .filter((row) => row.status !== "committed" && row.status !== "ignored" && row.status !== "error")
      .map((row) => row.id);
    setSelectedRows(new Set(ids));
  }

  async function reloadDetail(id?: string) {
    const detailId = id || detail?.item?.id;
    if (!detailId) return;
    const next = await apiAifGetReception(detailId);
    setDetail(next);
    setReceptionDraft(buildReceptionDraft(next.item));
    setRowDrafts(buildDrafts(next.rows || []));
    setSelectedRows(new Set((next.rows || []).filter(rowCanWork).map((row: any) => row.id)));
  }

  async function saveRowEdits() {
    if (!detail) return;
    setSavingRows(true);
    setMessage("");
    try {
      const editable = detail.rows.filter((row) => rowCanWork(row));
      for (const row of editable) {
        await apiAifUpdateImportRow(row.id, rowDrafts[row.id] || row.normalized || {});
      }
      await reloadDetail(detail.item.id);
      await load();
      setMessage("Terméksorok mentve.");
    } catch (e: any) {
      setMessage(e?.message || "A terméksorok mentése nem sikerült.");
    } finally {
      setSavingRows(false);
    }
  }

  async function commitSelectedRows() {
    if (!detail) return;
    const ids = Array.from(selectedRows);
    if (!ids.length) {
      setMessage("Nincs kijelölt készletre vehető terméksor.");
      return;
    }
    setCommittingRows(true);
    setMessage("");
    try {
      await saveRowEdits();
      await apiAifCommitReceptionRows(detail.item.id, ids);
      await reloadDetail(detail.item.id);
      await load();
      setMessage("A kijelölt terméksorok készletre véve.");
    } catch (e: any) {
      setMessage(e?.message || "A kijelölt terméksorok készletre vétele nem sikerült.");
    } finally {
      setCommittingRows(false);
    }
  }

  async function ignoreRow(rowId: string) {
    if (!detail) return;
    setBusy(true);
    setMessage("");
    try {
      await apiAifIgnoreImportRow(rowId);
      await reloadDetail(detail.item.id);
      await load();
      setMessage("Terméksor kihagyva.");
    } catch (e: any) {
      setMessage(e?.message || "A terméksor kihagyása nem sikerült.");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className={page}>
      <div className={wrap}>
        <header className={headerCard}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.13em] text-white/70">AllInFashion</p>
              <h1 className="mt-1 text-xl text-white font-normal">Receptiók</h1>
              <p className="mt-1 text-xs text-white/80">Számlás bevételezések, export, részletezés és tesztadatok törlése.</p>
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
          <div className="mt-2 grid gap-2 lg:grid-cols-4">
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
                <option value="review">Folyamatban</option>
                <option value="committed">Készletre véve</option>
              </select>
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={primaryBtn} onClick={load} disabled={busy} type="button"><Search size={15} /> Keresés</button>
            <button className={neutralBtn} onClick={resetFilters} type="button"><X size={15} /> Alaphelyzet</button>
          </div>
        </section>

        <section className={card}>
          <SectionTitle icon={<CalendarDays size={16} />} title="Áttekintés" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Receptiók</p><p className="mt-0.5 text-lg text-white">{totals.count}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Terméksor</p><p className="mt-0.5 text-lg text-white">{totals.lines}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Darab</p><p className="mt-0.5 text-lg text-white">{totals.qty}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Törölhető</p><p className="mt-0.5 text-lg text-white">{totals.deletable}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Összes érték</p><p className="mt-0.5 text-lg text-white">{money(totals.value)}</p></div>
          </div>
        </section>

        <section className={card}>
          <SectionTitle title="Receptió lista" right={<span className="text-xs text-white/70">{items.length} találat</span>} />
          <div className="mt-3 overflow-hidden rounded-xl border border-white/12">
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-[#303b4e] text-xs uppercase tracking-[0.06em] text-white/72 [&_th]:font-normal">
                  <tr>
                    <th className="px-2 py-1.5">Számla</th>
                    <th className="px-2 py-1.5">Beszállító</th>
                    <th className="px-2 py-1.5">Cél hely</th>
                    <th className="px-2 py-1.5">Dátum</th>
                    <th className="px-2 py-1.5">Pénznem</th>
                    <th className="px-2 py-1.5 text-right">Végösszeg</th>
                    <th className="px-2 py-1.5 text-right">Sorszám</th>
                    <th className="px-2 py-1.5 text-right">Darab</th>
                    <th className="px-2 py-1.5">Állapot</th>
                    <th className="px-2 py-1.5 text-right">Művelet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 bg-[#4d5869]">
                  {items.map((r) => (
                    <tr key={r.id} className="hover:bg-white/5">
                      <td className="px-3 py-2 text-white">{cell(r.invoice_number)}</td>
                      <td className="px-2 py-1.5 text-white/82">{cell(r.supplier_name)}</td>
                      <td className="px-2 py-1.5 text-white/82">{cell(r.location_name)}</td>
                      <td className="px-2 py-1.5 text-white/82">{dateText(r.reception_date)}</td>
                      <td className="px-2 py-1.5 text-white/82">{cell(r.currency_code)}</td>
                      <td className="px-3 py-2 text-right text-white">{money(r.invoice_gross, r.currency_code)}</td>
                      <td className="px-3 py-2 text-right text-white/82">{r.line_count || 0}</td>
                      <td className="px-3 py-2 text-right text-white/82">{r.total_qty || 0}</td>
                      <td className="px-2 py-1.5 text-white/82">{statusText(r.status)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex justify-end gap-1.5">
                          <button className={tinyBtn} onClick={() => openDetail(r.id)} disabled={busy} type="button"><Eye size={13} /> {r.status === "committed" ? "Adatok" : "Folytatás"}</button>
                          <button className={tinyBtn} onClick={() => exportCsv(r.id)} type="button"><Download size={13} /> Export</button>
                          <button className={tinyDangerBtn} onClick={() => setDeleteTarget(r)} disabled={busy || !r.can_delete} type="button"><Trash2 size={13} /> Törlés</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!items.length && <tr><td className="px-2 py-6 text-center text-white/62" colSpan={10}>Nincs receptió a megadott szűrés szerint.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 bg-[#4d5869] p-2 lg:hidden">
              {items.map((r) => (
                <div key={r.id} className="rounded-xl border border-white/12 bg-[#354153] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-white">{cell(r.invoice_number)}</p>
                      <p className="mt-1 text-xs text-white/62">{cell(r.supplier_name)} • {cell(r.location_name)}</p>
                    </div>
                    <span className="rounded-full border border-emerald-200/30 bg-emerald-300/10 px-2 py-1 text-xs text-emerald-50">{statusText(r.status)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Dátum</p><p>{dateText(r.reception_date)}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Érték</p><p>{money(r.invoice_gross, r.currency_code)}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Sorszám</p><p>{r.line_count || 0}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Darab</p><p>{r.total_qty || 0}</p></div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className={tinyBtn} onClick={() => openDetail(r.id)} disabled={busy} type="button"><Eye size={13} /> {r.status === "committed" ? "Adatok" : "Folytatás"}</button>
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
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/18 bg-[#303b4e] px-3 py-2">
              <div>
                <p className="text-xs uppercase tracking-[0.1em] text-white/60">Receptió részletei</p>
                <h2 className="text-base text-white font-normal">{cell(detail.item.invoice_number)}</h2>
              </div>
              <div className="flex gap-2">
                <button className={neutralBtn} onClick={() => exportCsv(detail.item.id)} type="button"><Download size={15} /> Export</button>
                <button className={neutralBtn} onClick={() => setDetail(null)} type="button"><X size={15} /> Bezárás</button>
              </div>
            </div>
            <div className="space-y-3 p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Beszállító</p><p className="mt-0.5 text-xs text-white">{cell(detail.item.supplier_name)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Cél hely</p><p className="mt-0.5 text-xs text-white">{cell(detail.item.location_name)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Pénznem</p><p className="mt-0.5 text-xs text-white">{cell(detail.item.currency_code)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Árfolyam</p><p className="mt-0.5 text-xs text-white">{cell(detail.item.exchange_rate_to_ron)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Végösszeg</p><p className="mt-0.5 text-xs text-white">{money(detail.item.invoice_gross, detail.item.currency_code)}</p></div>
              </div>

              {detailBalance && (
                <div className={`rounded-xl border px-3 py-2 ${detailBalance.className}`}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.08em] text-white/72">Számla egyeztetés</p>
                      <p className="mt-0.5 text-sm text-white">Különbözet: {money(detailBalance.diff, detail.item.currency_code)}</p>
                    </div>
                    <span className="rounded-full border border-white/20 bg-slate-950/18 px-2 py-1 text-xs text-white/90">{detailBalance.status}</span>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-white/82 sm:grid-cols-4">
                    <div>Sorok értéke: {money(detailBalance.rowsValue, detail.item.currency_code)}</div>
                    <div>TVA: {money(detailBalance.tvaValue, detail.item.currency_code)}</div>
                    <div>Szállítás: {money(detailBalance.shipping, detail.item.currency_code)}</div>
                    <div>Számított: {money(detailBalance.calculatedTotal, detail.item.currency_code)}</div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-white/14 bg-[#354153] p-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs text-white">Receptió fejadatai</p>
                    <p className="mt-1 text-xs text-white/64">Számlaszám, árfolyam, TVA és végösszeg javítása. A még nem készletre vett sorok RON értékei újraszámolódnak.</p>
                  </div>
                  <button className={primaryBtn} onClick={saveReceptionHeader} disabled={busy || savingHeader} type="button"><Save size={15} /> Fejadatok mentése</button>
                </div>
                <div className="mt-2 grid gap-2 lg:grid-cols-4">
                  <label className={label}>Számlaszám<input className={input} value={receptionDraft.invoiceNumber || ""} onChange={(e) => updateReceptionDraft("invoiceNumber", e.target.value)} /></label>
                  <label className={label}>Számla dátuma<input className={input} type="date" value={receptionDraft.invoiceDate || ""} onChange={(e) => updateReceptionDraft("invoiceDate", e.target.value)} /></label>
                  <label className={label}>Receptió dátuma<input className={input} type="date" value={receptionDraft.receptionDate || ""} onChange={(e) => updateReceptionDraft("receptionDate", e.target.value)} /></label>
                  <label className={label}>Pénznem<select className={select} value={receptionDraft.currencyCode || ""} onChange={(e) => updateReceptionDraft("currencyCode", e.target.value)}>{(meta?.currencies || []).map((c) => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}</select></label>
                  <label className={label}>Árfolyam RON<input className={input} value={receptionDraft.exchangeRateToRon || ""} onChange={(e) => updateReceptionDraft("exchangeRateToRon", e.target.value)} /></label>
                  <label className={label}>TVA kezelés<select className={select} value={receptionDraft.tvaMode || "without_tva"} onChange={(e) => updateReceptionDraft("tvaMode", e.target.value)}><option value="without_tva">Árak nettóban</option><option value="with_tva">Árak bruttóban</option><option value="no_tva">TVA nélkül</option></select></label>
                  <label className={label}>TVA %<input className={input} disabled={receptionDraft.tvaMode === "no_tva"} value={receptionDraft.tvaMode === "no_tva" ? "0" : (receptionDraft.tvaRate || "")} onChange={(e) => updateReceptionDraft("tvaRate", e.target.value)} /></label>
                  <label className={label}>Szállítás<input className={input} value={receptionDraft.shippingCost || ""} onChange={(e) => updateReceptionDraft("shippingCost", e.target.value)} /></label>
                  <label className={label}>Számla végösszeg<input className={input} value={receptionDraft.invoiceGross || ""} onChange={(e) => updateReceptionDraft("invoiceGross", e.target.value)} /></label>
                  <label className={`${label} lg:col-span-3`}>Megjegyzés<input className={input} value={receptionDraft.note || ""} onChange={(e) => updateReceptionDraft("note", e.target.value)} /></label>
                </div>
              </div>

              <div className="rounded-xl border border-white/14 bg-[#354153] p-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs text-white">Terméksorok feldolgozása</p>
                    <p className="mt-1 text-xs text-white/64">
                      A hibátlan sorok külön is készletre vehetők. Ami még nincs kész, az marad javítható állapotban.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select className={select} value={rowStatusFilter} onChange={(e) => setRowStatusFilter(e.target.value)}>
                      <option value="active">Még dolgozandó sorok</option>
                      <option value="all">Minden sor</option>
                      <option value="committed">Készletre vett</option>
                      <option value="error">Hibás</option>
                      <option value="ignored">Kihagyott</option>
                    </select>
                    <button className={tinyBtn} onClick={selectReadyRows} disabled={busy || savingRows || committingRows} type="button">
                      Kész sorok kijelölése
                    </button>
                    <button className={tinyBtn} onClick={saveRowEdits} disabled={busy || savingRows || committingRows} type="button">
                      <Save size={13} /> Sorok mentése
                    </button>
                    <button className={primaryBtn} onClick={commitSelectedRows} disabled={busy || savingRows || committingRows || !selectedRows.size} type="button">
                      <CheckCircle size={15} /> Kijelölt sorok készletre
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/12">
                <div className="max-h-[40vh] overflow-auto">
                  <table className="min-w-[1080px] text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-[#303b4e] text-xs uppercase tracking-[0.06em] text-white/72 [&_th]:font-normal">
                      <tr>
                        <th className="px-2 py-1.5">Kijelölés</th>
                        <th className="px-2 py-1.5">Sorszám</th>
                        <th className="px-2 py-1.5">Állapot</th>
                        <th className="px-2 py-1.5">Termékkód</th>
                        <th className="px-2 py-1.5">Név</th>
                        <th className="px-2 py-1.5">Méret</th>
                        <th className="px-2 py-1.5">Szín</th>
                        <th className="px-2 py-1.5">Színkód</th>
                        <th className="px-2 py-1.5 text-right">Darab</th>
                        <th className="px-2 py-1.5 text-right">Vételár</th>
                        <th className="px-2 py-1.5 text-right">Vételár RON</th>
                        <th className="px-2 py-1.5 text-right">Művelet</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 bg-[#4d5869]">
                      {visibleRows.map((r) => {
                        const draft: any = rowDrafts[r.id] || r.normalized || {};
                        const editable = rowCanWork(r);
                        const checked = selectedRows.has(r.id);
                        return (
                          <tr key={r.id} className={r.status === "committed" ? "bg-emerald-300/8" : r.status === "ignored" ? "opacity-55" : ""}>
                            <td className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-emerald-300"
                                checked={checked}
                                disabled={!editable || r.status === "error"}
                                onChange={() => toggleRow(r.id)}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-white/82">{r.row_no}</td>
                            <td className="px-2 py-1.5 text-white/82">{statusText(r.status)}</td>
                            <td className="px-2 py-1.5">
                              <input className={input} value={String(draft.supplierProductCode ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "supplierProductCode", e.target.value)} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input className={input} value={String(draft.titleRo ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "titleRo", e.target.value)} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input className={input} value={String(draft.size ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "size", e.target.value)} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input className={input} value={String(draft.colorName ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "colorName", e.target.value)} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input className={input} value={String(draft.colorCode ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "colorCode", e.target.value)} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input className={`${input} text-right`} value={String(draft.qty ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "qty", e.target.value)} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input className={`${input} text-right`} value={String(draft.buyPrice ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "buyPrice", e.target.value)} />
                            </td>
                            <td className="px-3 py-2 text-right text-white/82">{money(r.buy_price_ron, "RON")}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex justify-end gap-1.5">
                                <button className={tinyBtn} onClick={() => { setMoveTarget(r); setMoveToReceptionId(""); }} disabled={!editable || busy} type="button">
                                  <MoveRight size={13} /> Áthelyezés
                                </button>
                                <button className={tinyDangerBtn} onClick={() => ignoreRow(r.id)} disabled={!editable || busy} type="button">
                                  Kihagy
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!visibleRows.length && <tr><td className="px-2 py-6 text-center text-white/62" colSpan={12}>Nincs sor ebben a nézetben.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {moveTarget && detail && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/62 p-3 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/24 bg-[#4d5869] p-4 shadow-2xl">
            <h2 className="text-base text-white font-normal">Terméksor áthelyezése</h2>
            <p className="mt-2 text-sm text-white/76">Csak még nem készletre vett sor helyezhető át másik nyitott receptióba.</p>
            <div className="mt-2 rounded-xl border border-white/12 bg-[#354153] p-2.5 text-xs text-white">
              {cell((moveTarget.normalized || {}).titleRo)} • {cell(moveTarget.supplier_product_code || (moveTarget.normalized || {}).supplierProductCode)}
            </div>
            <label className={`${label} mt-3`}>
              Cél receptió
              <select className={select} value={moveToReceptionId} onChange={(e) => setMoveToReceptionId(e.target.value)}>
                <option value="">Válassz receptiót</option>
                {items.filter((r) => r.id !== detail.item.id && r.status !== "committed" && r.status !== "cancelled").map((r) => (
                  <option key={r.id} value={r.id}>{cell(r.invoice_number)} • {cell(r.supplier_name)} • {dateText(r.reception_date)}</option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button className={neutralBtn} onClick={() => setMoveTarget(null)} disabled={busy} type="button"><X size={15} /> Mégse</button>
              <button className={primaryBtn} onClick={moveRowToReception} disabled={busy || !moveToReceptionId} type="button"><MoveRight size={15} /> Áthelyezés</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/62 p-3 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/24 bg-[#4d5869] p-4 shadow-2xl">
            <h2 className="text-base text-white font-normal">Receptió törlése</h2>
            <p className="mt-2 text-sm text-white/76">A törlés a receptióhoz tartozó mentett import sorokat is eltávolítja, ha még nem történt készletre vétel.</p>
            <div className="mt-2 rounded-xl border border-white/12 bg-[#354153] p-2.5 text-xs text-white">
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
