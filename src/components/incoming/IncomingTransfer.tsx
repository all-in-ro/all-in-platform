import React, { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Trash2, Save, List, CheckCircle2, XCircle, RefreshCcw } from "lucide-react";
import type { Location, TransferDraft, TransferDraftItem, IncomingItemDraft, TransferSummary } from "../../lib/incoming/types";
import {
  apiCancelTransfer,
  apiCommitTransfer,
  apiCreateTransfer,
  apiGetIncomingBatch,
  apiGetTransfer,
  apiListIncomingBatches,
  apiListTransfers,
  apiSaveTransferItems,
} from "../../lib/incoming/api";

function formatBuyPrice(v: any) {
  if (v === null || v === undefined || String(v).trim() === "") return "";
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function mergeKey(it: { sku: string; size: string; colorCode: string; category: string; name: string }) {
  return [it.sku || "", it.size || "", it.colorCode || "", it.category || "", it.name || ""].join("|").toLowerCase();
}

function mapIncomingToTransferItems(incoming: IncomingItemDraft[]): TransferDraftItem[] {
  const map = new Map<string, TransferDraftItem>();
  for (const it of incoming) {
    const k = mergeKey(it);
    const existing = map.get(k);
    const next: TransferDraftItem = {
      sku: it.sku,
      // NOTE: TransferDraftItem típusban ezek lehetnek nem deklaráltak,
      // de UI-ban visszük tovább, hogy mindenhol ugyanazok az oszlopok látszódjanak.
      ...((it as any).brand ? { brand: (it as any).brand } : {}),
      ...((it as any).gender ? { gender: (it as any).gender } : {}),
      ...((it as any).buyPrice !== undefined && (it as any).buyPrice !== null ? { buyPrice: (it as any).buyPrice } : {}),
      name: it.name,
      colorCode: it.colorCode,
      colorName: it.colorName,
      size: it.size,
      category: it.category,
      qty: Number(it.qty || 0),
    };
    if (!existing) map.set(k, next);
    else map.set(k, { ...existing, qty: existing.qty + next.qty } as any);
  }
  return Array.from(map.values()).filter((x) => x.qty > 0);
}

function sumQty(arr: Array<{ qty?: any }>) {
  return arr.reduce((s, x) => s + Number(x.qty || 0), 0);
}

export default function IncomingTransfer(props: {
  locations: Location[];
  incoming: IncomingItemDraft[];
  transfer: TransferDraft;
  onChange: (next: TransferDraft) => void;
}) {
  const { locations, incoming, transfer, onChange } = props;

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const [history, setHistory] = useState<TransferSummary[]>([]);
  const [histBusy, setHistBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  // Bejövő (incoming) betöltés: ha az Incoming oldalon a draft üres újratöltés után,
  // innen is lehessen egy konkrét batch-et kiválasztani és betölteni.
  const [incomingBatches, setIncomingBatches] = useState<any[]>([]);
  const [incomingBatchId, setIncomingBatchId] = useState<string>("");
  const [incomingBusy, setIncomingBusy] = useState(false);
  const [incomingLocal, setIncomingLocal] = useState<IncomingItemDraft[]>([]);

  // Jobb oldali panel: ne legyen két táblázat egyszerre az arcodban.
  const [rightTab, setRightTab] = useState<"incoming" | "history">("incoming");

  const locationById = useMemo(() => {
    const m = new Map<string, Location>();
    for (const l of locations) m.set(l.id, l);
    return m;
  }, [locations]);

  async function refreshHistory() {
    setHistBusy(true);
    setErr("");
    try {
      const r = await apiListTransfers({ limit: 50, offset: 0 });
      setHistory(r.items || []);
    } catch (e: any) {
      setErr(e?.message || "Nem sikerült lekérni a mozgatás előzményeket.");
    } finally {
      setHistBusy(false);
    }
  }

  async function refreshIncomingBatches(autoLoadLatest = false) {
    setIncomingBusy(true);
    setErr("");
    try {
      const r = await apiListIncomingBatches({ limit: 50, offset: 0 });
      const items = (r as any).items || [];
      setIncomingBatches(items);

      if (autoLoadLatest && items.length) {
        const latestId = items[0]?.id;
        if (latestId) {
          setIncomingBatchId(latestId);
          await loadIncomingBatch(latestId);
        }
      }
    } catch (e: any) {
      setErr(e?.message || "Nem sikerült lekérni a bejövő batch-eket.");
    } finally {
      setIncomingBusy(false);
    }
  }

  async function loadIncomingBatch(id?: string) {
    const bid = id || incomingBatchId;
    if (!bid) return;
    setIncomingBusy(true);
    setErr("");
    try {
      const d = await apiGetIncomingBatch(bid);
      const rows = (d as any)?.items || (d as any)?.incoming_items || [];

      // Normalizálás: amit a backend ad, abból csinálunk IncomingItemDraft-ot.
      const normalized: IncomingItemDraft[] = rows.map((x: any) => ({
        sku: x.sku ?? x.product_code ?? x.code ?? "",
        name: x.name ?? x.product_name ?? x.termeknev ?? "",
        colorCode: x.colorCode ?? x.color_code ?? x.szinkod ?? "",
        colorName: x.colorName ?? x.color_name ?? x.szin ?? "",
        size: x.size ?? x.meret ?? "",
        category: x.category ?? x.kategoria ?? "",
        qty: Number(x.qty ?? x.db ?? 0),
        // plusz mezők, ha vannak
        ...(x.brand ?? x.marka ? { brand: x.brand ?? x.marka } : {}),
        ...(x.gender ?? x.nem ? { gender: x.gender ?? x.nem } : {}),
        ...(x.buyPrice ?? x.buy_price ?? x.beszerzesi_ar ? { buyPrice: x.buyPrice ?? x.buy_price ?? x.beszerzesi_ar } : {}),
      })) as any;

      setIncomingLocal(normalized.filter((r) => r.sku));
      setMsg("Bejövő batch betöltve.");
      setRightTab("incoming");
    } catch (e: any) {
      setErr(e?.message || "Nem sikerült betölteni a bejövő batch-et.");
    } finally {
      setIncomingBusy(false);
    }
  }

  // első betöltés: próbáljuk okosan, automatikusan behúzni a legfrissebbet.
  useEffect(() => {
    refreshHistory();
    // Ha a parent nem adott bejövő draftot (tipikusan újratöltés után),
    // akkor innen betöltjük a legfrissebb bejövő batch-et.
    refreshIncomingBatches(!incoming.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFromIncoming(it: IncomingItemDraft) {
    const k = mergeKey(it);
    const nextItems = [...transfer.items];
    const idx = nextItems.findIndex((x) => mergeKey(x) === k);
    if (idx >= 0) {
      nextItems[idx] = { ...nextItems[idx], qty: nextItems[idx].qty + Number(it.qty || 0) };
    } else {
      nextItems.push({
        sku: it.sku,
        ...((it as any).brand ? { brand: (it as any).brand } : {}),
        ...((it as any).gender ? { gender: (it as any).gender } : {}),
        ...((it as any).buyPrice !== undefined && (it as any).buyPrice !== null ? { buyPrice: (it as any).buyPrice } : {}),
        name: it.name,
        colorCode: it.colorCode,
        colorName: it.colorName,
        size: it.size,
        category: it.category,
        qty: Number(it.qty || 0),
      } as any);
    }
    onChange({ ...transfer, items: nextItems });
  }

  function updateItemQty(i: number, qty: number) {
    const next = [...transfer.items];
    next[i] = { ...next[i], qty };
    onChange({ ...transfer, items: next });
  }

  function removeItem(i: number) {
    const next = [...transfer.items];
    next.splice(i, 1);
    onChange({ ...transfer, items: next });
  }

  function setFrom(id: string) {
    onChange({ ...transfer, fromLocationId: id });
  }
  function setTo(id: string) {
    onChange({ ...transfer, toLocationId: id });
  }

  function fillAllFromIncoming() {
    const src = incoming.length ? incoming : incomingLocal;
    onChange({ ...transfer, items: mapIncomingToTransferItems(src) });
  }

  async function saveDraft() {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      if (!transfer.fromLocationId || !transfer.toLocationId) {
        throw new Error("Válassz forrás és cél helyszínt.");
      }
      if (transfer.fromLocationId === transfer.toLocationId) {
        throw new Error("A forrás és a cél helyszín nem lehet ugyanaz.");
      }
      if (!transfer.items.length) throw new Error("Nincs egyetlen tétel sem a mozgatásban.");
      const created = await apiCreateTransfer({
        fromLocationId: transfer.fromLocationId,
        toLocationId: transfer.toLocationId,
        note: "",
      });
      await apiSaveTransferItems(created.id, transfer.items);
      setMsg(`Mentve (Transfer ID: ${created.id}).`);
      setSelectedId(created.id);
      await refreshHistory();
      setRightTab("history");
    } catch (e: any) {
      setErr(e?.message || "Nem sikerült menteni a mozgatást.");
    } finally {
      setBusy(false);
    }
  }

  async function loadSelected() {
    if (!selectedId) return;
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const d = await apiGetTransfer(selectedId);
      onChange({
        fromLocationId: d.fromLocationId,
        toLocationId: d.toLocationId,
        items: (d.items || []).map((x: any) => ({
          sku: x.sku ?? x.product_code ?? "",
          ...(x.brand ?? x.marka ? { brand: x.brand ?? x.marka } : {}),
          name: x.name ?? x.product_name ?? "",
          ...(x.gender ?? x.nem ? { gender: x.gender ?? x.nem } : {}),
          colorCode: x.colorCode ?? x.color_code ?? "",
          colorName: x.colorName ?? x.color_name ?? "",
          size: x.size ?? "",
          category: x.category ?? "",
          ...(x.buyPrice ?? x.buy_price ?? x.beszerzesi_ar ? { buyPrice: x.buyPrice ?? x.buy_price ?? x.beszerzesi_ar } : {}),
          qty: Number(x.qty || 0),
        })),
      });
      setMsg("Betöltve a draftba.");
    } catch (e: any) {
      setErr(e?.message || "Nem sikerült betölteni a mozgatást.");
    } finally {
      setBusy(false);
    }
  }

  async function commitSelected() {
    if (!selectedId) return;
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await apiCommitTransfer(selectedId);
      setMsg("Könyvelve (commit).");
      await refreshHistory();
    } catch (e: any) {
      setErr(e?.message || "Nem sikerült commitolni.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSelected() {
    if (!selectedId) return;
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await apiCancelTransfer(selectedId);
      setMsg("Törölve (cancel).");
      await refreshHistory();
    } catch (e: any) {
      setErr(e?.message || "Nem sikerült törölni.");
    } finally {
      setBusy(false);
    }
  }

  const incomingRows = useMemo(() => {
    const src = incoming.length ? incoming : incomingLocal;
    return src.slice().sort((a, b) => (a.sku || "").localeCompare(b.sku || ""));
  }, [incoming, incomingLocal]);

  const incomingTotal = useMemo(() => sumQty(incomingRows), [incomingRows]);
  const draftTotal = useMemo(() => sumQty(transfer.items), [transfer.items]);

  const headerChip = (label: string, value: number) => (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">
      {label}: <span className="ml-1 text-white">{value}</span>
    </span>
  );

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: draft */}
        <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-white">
              <ArrowRightLeft size={18} />
              <div>
                <div className="font-semibold">Mozgatás (draft)</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {headerChip("Tételek", transfer.items.length)}
                  {headerChip("Össz DB", draftTotal)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
                onClick={fillAllFromIncoming}
                type="button"
                title="Bejövő tételekből kitölti (összevonva)"
              >
                <RefreshCcw size={16} />
                Kitöltés bejövőből
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-emerald-600/80 px-3 py-2 text-sm text-white hover:bg-emerald-600"
                onClick={saveDraft}
                disabled={busy}
                type="button"
              >
                <Save size={16} />
                Mentés
              </button>
            </div>
          </div>

          {(msg || err) && (
            <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
              {msg ? <div className="text-emerald-300">{msg}</div> : null}
              {err ? <div className="text-rose-300">{err}</div> : null}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-400 mb-1">Forrás helyszín</div>
              <select
                className="w-full rounded-lg border border-white/10 bg-[#0a1020] px-3 py-2 text-sm text-white"
                value={transfer.fromLocationId}
                onChange={(e) => setFrom(e.target.value)}
              >
                <option value="">Válassz...</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Cél helyszín</div>
              <select
                className="w-full rounded-lg border border-white/10 bg-[#0a1020] px-3 py-2 text-sm text-white"
                value={transfer.toLocationId}
                onChange={(e) => setTo(e.target.value)}
              >
                <option value="">Válassz...</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left">Kód</th>
                  <th className="px-3 py-2 text-left">Márka</th>
                  <th className="px-3 py-2 text-left">Terméknév</th>
                  <th className="px-3 py-2 text-left">Nem</th>
                  <th className="px-3 py-2 text-left">Színkód</th>
                  <th className="px-3 py-2 text-left">Szín</th>
                  <th className="px-3 py-2 text-left">Méret</th>
                  <th className="px-3 py-2 text-left">Kategória</th>
                  <th className="px-3 py-2 text-right">Beszerzési ár</th>
                  <th className="px-3 py-2 text-right">Db</th>
                  <th className="px-3 py-2 text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {transfer.items.map((it, i) => (
                  <tr key={mergeKey(it) + i} className="border-t border-white/10 text-slate-100">
                    <td className="px-3 py-2">{it.sku}</td>
                    <td className="px-3 py-2 text-slate-200">{(it as any).brand || <span className="text-slate-500">-</span>}</td>
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2 text-slate-200">{(it as any).gender || <span className="text-slate-500">-</span>}</td>
                    <td className="px-3 py-2">{it.colorCode || <span className="text-slate-500">-</span>}</td>
                    <td className="px-3 py-2 text-slate-200">{it.colorName || <span className="text-slate-500">-</span>}</td>
                    <td className="px-3 py-2">{it.size}</td>
                    <td className="px-3 py-2 text-slate-200">{it.category || <span className="text-slate-500">-</span>}</td>
                    <td className="px-3 py-2 text-right text-slate-200 whitespace-nowrap">{formatBuyPrice((it as any).buyPrice) || <span className="text-slate-500">-</span>}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        className="w-20 rounded-md border border-white/10 bg-[#0a1020] px-2 py-1 text-right text-sm text-white"
                        type="number"
                        min={1}
                        value={it.qty}
                        onChange={(e) => updateItemQty(i, Math.max(1, Number(e.target.value || 1)))}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 p-2 text-slate-200 hover:bg-white/10"
                        onClick={() => removeItem(i)}
                        type="button"
                        title="Törlés"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!transfer.items.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={11}>
                      Üres. Jobb oldalt válts „Bejövő lista” fülre, és kattints a sorokra.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: incoming OR history (tabbed) */}
        <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 text-white">
              <List size={18} />
              <div>
                <div className="font-semibold">Mozgatás</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {headerChip("Bejövő tételek", incomingRows.length)}
                  {headerChip("Bejövő DB", incomingTotal)}
                  {headerChip("Előzmények", history.length)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => setRightTab("incoming")}
                  className={`px-3 py-2 text-sm rounded-md ${rightTab === "incoming" ? "bg-white/10 text-white" : "text-slate-200 hover:bg-white/10"}`}
                >
                  Bejövő lista
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab("history")}
                  className={`px-3 py-2 text-sm rounded-md ${rightTab === "history" ? "bg-white/10 text-white" : "text-slate-200 hover:bg-white/10"}`}
                >
                  Előzmények
                </button>
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
                onClick={refreshHistory}
                disabled={histBusy}
                type="button"
              >
                <RefreshCcw size={16} />
                Frissítés
              </button>
            </div>
          </div>

          {rightTab === "history" ? (
            <>
              <div className="mt-3 rounded-xl border border-white/10 overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/5 text-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left"> </th>
                      <th className="px-3 py-2 text-left">Dátum</th>
                      <th className="px-3 py-2 text-left">Honnan → Hová</th>
                      <th className="px-3 py-2 text-left">Státusz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-t border-white/10 text-slate-100">
                        <td className="px-3 py-2">
                          <input type="radio" name="transferSel" checked={selectedId === h.id} onChange={() => setSelectedId(h.id)} />
                        </td>
                        <td className="px-3 py-2 text-slate-300">{new Date(h.createdAtISO).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <span className="text-slate-200">{locationById.get(h.fromLocationId)?.name || h.fromLocationId}</span>
                          <span className="text-slate-500"> → </span>
                          <span className="text-slate-200">{locationById.get(h.toLocationId)?.name || h.toLocationId}</span>
                        </td>
                        <td className="px-3 py-2">
                          {h.status === "committed" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/20 px-2 py-1 text-xs text-emerald-200">
                              <CheckCircle2 size={14} />
                              committed
                            </span>
                          ) : h.status === "cancelled" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-600/20 px-2 py-1 text-xs text-rose-200">
                              <XCircle size={14} />
                              cancelled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs text-slate-200">draft</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!history.length ? (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                          Nincs még mentett mozgatás.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
                  onClick={loadSelected}
                  disabled={!selectedId || busy}
                  type="button"
                >
                  <List size={16} />
                  Betöltés draftba
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-emerald-600/80 px-3 py-2 text-sm text-white hover:bg-emerald-600"
                  onClick={commitSelected}
                  disabled={!selectedId || busy}
                  type="button"
                >
                  <CheckCircle2 size={16} />
                  Commit
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-rose-600/70 px-3 py-2 text-sm text-white hover:bg-rose-600"
                  onClick={cancelSelected}
                  disabled={!selectedId || busy}
                  type="button"
                >
                  <XCircle size={16} />
                  Törlés
                </button>
              </div>

              {(msg || err) && (
                <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  {msg ? <div className="text-emerald-300">{msg}</div> : null}
                  {err ? <div className="text-rose-300">{err}</div> : null}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="text-sm text-slate-200">
                    <span className="text-white font-semibold">Bejövő forrás</span>
                    <span className="text-slate-400"> (batch)</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="min-w-[280px] rounded-lg border border-white/10 bg-[#0a1020] px-3 py-2 text-sm text-white"
                      value={incomingBatchId}
                      onChange={(e) => setIncomingBatchId(e.target.value)}
                      disabled={incomingBusy}
                      title="Válassz bejövő batch-et, amit mozgatni szeretnél"
                    >
                      <option value="">Válassz bejövő batch-et…</option>
                      {incomingBatches.map((b: any) => (
                        <option key={b.id} value={b.id}>
                          {(b.createdAtISO ? new Date(b.createdAtISO).toLocaleString() : "") +
                            (b.supplier ? ` • ${b.supplier}` : "") +
                            (b.sourceType || b.source_type ? ` • ${(b.sourceType || b.source_type)}` : "") +
                            (b.status ? ` • ${b.status}` : "")}
                        </option>
                      ))}
                    </select>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
                      onClick={() => refreshIncomingBatches(false)}
                      disabled={incomingBusy}
                      type="button"
                    >
                      <RefreshCcw size={16} />
                      Frissítés
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-emerald-600/80 px-3 py-2 text-sm text-white hover:bg-emerald-600"
                      onClick={() => loadIncomingBatch()}
                      disabled={!incomingBatchId || incomingBusy}
                      type="button"
                    >
                      <List size={16} />
                      Betöltés
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  Tipp: ha újratöltötted az oldalt, a bal oldali draft üres marad. Itt válaszd ki a batch-et és töltsd be, aztán kattints a sorokra.
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <div className="text-white font-semibold">Bejövő lista</div>
                  <div className="text-xs text-slate-400">Kattints sorra, hogy átkerüljön a draftba</div>
                </div>

                <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="text-xs text-slate-300 whitespace-nowrap">Bejövő batch</div>
                      <select
                        className="w-full sm:w-[420px] rounded-lg border border-white/10 bg-[#0a1020] px-3 py-2 text-sm text-white"
                        value={incomingBatchId}
                        onChange={(e) => setIncomingBatchId(e.target.value)}
                      >
                        <option value="">Válassz batch-et...</option>
                        {incomingBatches.map((b: any) => (
                          <option key={b.id} value={b.id}>
                            {b.id}  •  {b.supplier || "(nincs beszállító)"}  •  {b.status || ""}
                          </option>
                        ))}
                      </select>
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
                        onClick={() => loadIncomingBatch()}
                        disabled={!incomingBatchId || incomingBusy}
                        type="button"
                        title="A kiválasztott bejövő batch tételeit betölti ide"
                      >
                        <RefreshCcw size={16} />
                        Betöltés
                      </button>
                    </div>
                    <div className="text-xs text-slate-300">
                      Forrás: {incoming.length ? "aktuális draft" : incomingLocal.length ? "batch (betöltve)" : "nincs"}
                    </div>
                  </div>
                </div>

                {!incomingRows.length ? (
                  <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    <div className="text-white font-semibold">Nincs bejövő tétel.</div>
                    <div className="mt-2 text-slate-300">
                      Tipikus okok:
                      <ul className="list-disc pl-5 mt-1 text-slate-300">
                        <li>Az Incoming batch nincs betöltve ebbe a nézetbe.</li>
                        <li>Az Incoming oldalon a draft üres (újratöltés után).</li>
                      </ul>
                      <div className="mt-2 text-slate-300">
                        Teendő: menj az <span className="text-white">Előzmények</span> fülre az Incoming oldalon, <span className="text-white">Betöltés</span>, majd térj vissza ide.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 overflow-x-auto rounded-xl border border-white/10">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white/5 text-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left">Kód</th>
                          <th className="px-3 py-2 text-left">Márka</th>
                          <th className="px-3 py-2 text-left">Terméknév</th>
                          <th className="px-3 py-2 text-left">Nem</th>
                          <th className="px-3 py-2 text-left">Színkód</th>
                          <th className="px-3 py-2 text-left">Szín</th>
                          <th className="px-3 py-2 text-left">Méret</th>
                          <th className="px-3 py-2 text-left">Kategória</th>
                          <th className="px-3 py-2 text-right">Beszerzési ár</th>
                          <th className="px-3 py-2 text-right">Db</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incomingRows.map((it, i) => (
                          <tr
                            key={mergeKey(it) + i}
                            className="border-t border-white/10 text-slate-100 hover:bg-white/5 cursor-pointer"
                            onClick={() => addFromIncoming(it)}
                            title="Hozzáadás a mozgatáshoz"
                          >
                            <td className="px-3 py-2">{it.sku}</td>
                            <td className="px-3 py-2 text-slate-200">{(it as any).brand || <span className="text-slate-500">-</span>}</td>
                            <td className="px-3 py-2">{it.name}</td>
                            <td className="px-3 py-2 text-slate-200">{(it as any).gender || <span className="text-slate-500">-</span>}</td>
                            <td className="px-3 py-2">{it.colorCode || <span className="text-slate-500">-</span>}</td>
                            <td className="px-3 py-2 text-slate-200">{it.colorName || <span className="text-slate-500">-</span>}</td>
                            <td className="px-3 py-2">{it.size}</td>
                            <td className="px-3 py-2 text-slate-200">{it.category || <span className="text-slate-500">-</span>}</td>
                            <td className="px-3 py-2 text-right text-slate-200 whitespace-nowrap">{formatBuyPrice((it as any).buyPrice) || <span className="text-slate-500">-</span>}</td>
                            <td className="px-3 py-2 text-right">{it.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
