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

// Import/Batch források eltérő mezőnevekkel érkezhetnek (ForIT: pretachiz, HU: marka/nem, stb.)
function pickBrand(x: any) {
  const v = x?.brand ?? x?.marka ?? x?.marca ?? x?.márka ?? x?.Brand ?? "";
  return String(v ?? "").trim();
}

function pickGender(x: any) {
  const v = x?.gender ?? x?.nem ?? x?.gen ?? x?.sex ?? "";
  return String(v ?? "").trim();
}

function pickBuyPrice(x: any) {
  const v =
    x?.buyPrice ??
    x?.buy_price ??
    x?.beszerzesi_ar ??
    x?.beszerzési_ar ??
    x?.pretachiz ??
    x?.pretAchiz ??
    x?.pret_achiz ??
    null;
  return v === undefined ? null : v;
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
      brand: pickBrand(it),
      gender: pickGender(it),
      buyPrice: pickBuyPrice(it),
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

  // UI: a panelek egymás alatt vannak, nincs külön jobboldali tab.

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
        brand: pickBrand(x),
        gender: pickGender(x),
        buyPrice: pickBuyPrice(x),
      })) as any;

      setIncomingLocal(normalized.filter((r) => r.sku));
      setMsg("Bejövő batch betöltve.");
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
        brand: pickBrand(it),
        gender: pickGender(it),
        buyPrice: pickBuyPrice(it),
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
          brand: pickBrand(x),
          name: x.name ?? x.product_name ?? "",
          gender: pickGender(x),
          colorCode: x.colorCode ?? x.color_code ?? "",
          colorName: x.colorName ?? x.color_name ?? "",
          size: x.size ?? "",
          category: x.category ?? "",
          buyPrice: pickBuyPrice(x),
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
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
      {label}: <span className="ml-1 text-slate-900">{value}</span>
    </span>
  );

  return (
    <div className="w-full">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-slate-900">
            <List size={18} />
            <div className="text-sm">Bejövő tételek</div>
            <div className="ml-2 flex flex-wrap gap-2">
              {headerChip("Tételek", incomingRows.length)}
              {headerChip("Össz DB", incomingTotal)}
              {headerChip("Előzmények", history.length)}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="min-w-[280px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              value={incomingBatchId}
              onChange={(e) => setIncomingBatchId(e.target.value)}
              disabled={incomingBusy}
              title="Válassz bejövő batch-et"
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
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-50"
              onClick={() => refreshIncomingBatches(false)}
              disabled={incomingBusy}
              type="button"
            >
              <RefreshCcw size={16} />
              Frissítés
            </button>

            <button
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
              onClick={() => loadIncomingBatch()}
              disabled={!incomingBatchId || incomingBusy}
              type="button"
            >
              <List size={16} />
              Betöltés
            </button>
          </div>
        </div>

        <div className="mt-2 text-xs text-slate-600">
          Kattints sorra a listában, és hozzáadom a mozgatás draftjához.
          <span className="ml-2 text-slate-500">Forrás: {incoming.length ? "aktuális draft" : incomingLocal.length ? "batch (betöltve)" : "nincs"}</span>
        </div>

        {!incomingRows.length ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            Nincs bejövő tétel. Válassz batch-et fent és kattints a Betöltés gombra.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
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
                    className="border-t border-slate-200 text-slate-900 hover:bg-slate-50 cursor-pointer"
                    onClick={() => addFromIncoming(it)}
                    title="Hozzáadás a mozgatáshoz"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{it.sku}</td>
                    <td className="px-3 py-2 text-slate-700">{pickBrand(it) || <span className="text-slate-400">-</span>}</td>
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2 text-slate-700">{pickGender(it) || <span className="text-slate-400">-</span>}</td>
                    <td className="px-3 py-2">{it.colorCode || <span className="text-slate-400">-</span>}</td>
                    <td className="px-3 py-2 text-slate-700">{it.colorName || <span className="text-slate-400">-</span>}</td>
                    <td className="px-3 py-2">{it.size}</td>
                    <td className="px-3 py-2 text-slate-700">{it.category || <span className="text-slate-400">-</span>}</td>
                    <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{formatBuyPrice(pickBuyPrice(it)) || <span className="text-slate-400">-</span>}</td>
                    <td className="px-3 py-2 text-right">{it.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-slate-900">
            <ArrowRightLeft size={18} />
            <div className="text-sm">Mozgatás (draft)</div>
            <div className="ml-2 flex flex-wrap gap-2">
              {headerChip("Tételek", transfer.items.length)}
              {headerChip("Össz DB", draftTotal)}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-50"
              onClick={fillAllFromIncoming}
              type="button"
              title="Bejövő tételekből kitölti (összevonva)"
            >
              <RefreshCcw size={16} />
              Kitöltés bejövőből
            </button>

            <button
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
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
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            {msg ? <div className="text-emerald-700">{msg}</div> : null}
            {err ? <div className="text-rose-700">{err}</div> : null}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-600 mb-1">Forrás helyszín</div>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
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
            <div className="text-xs text-slate-600 mb-1">Cél helyszín</div>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
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

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
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
                <tr key={mergeKey(it) + i} className="border-t border-slate-200 text-slate-900">
                  <td className="px-3 py-2 whitespace-nowrap">{it.sku}</td>
                  <td className="px-3 py-2 text-slate-700">{pickBrand(it) || <span className="text-slate-400">-</span>}</td>
                  <td className="px-3 py-2">{it.name}</td>
                  <td className="px-3 py-2 text-slate-700">{pickGender(it) || <span className="text-slate-400">-</span>}</td>
                  <td className="px-3 py-2">{it.colorCode || <span className="text-slate-400">-</span>}</td>
                  <td className="px-3 py-2 text-slate-700">{it.colorName || <span className="text-slate-400">-</span>}</td>
                  <td className="px-3 py-2">{it.size}</td>
                  <td className="px-3 py-2 text-slate-700">{it.category || <span className="text-slate-400">-</span>}</td>
                  <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{formatBuyPrice(pickBuyPrice(it)) || <span className="text-slate-400">-</span>}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm text-slate-900"
                      type="number"
                      min={1}
                      value={it.qty}
                      onChange={(e) => updateItemQty(i, Math.max(1, Number(e.target.value || 1)))}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50"
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
                  <td className="px-3 py-6 text-center text-slate-600" colSpan={11}>
                    Üres. Válassz bejövő batch-et fent, töltsd be, majd kattints a sorokra.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer list-none">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-slate-900">
              <List size={18} />
              <div className="text-sm">Előzmények</div>
              <div className="ml-2">{headerChip("Mentett mozgatások", history.length)}</div>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-50"
              onClick={(e) => {
                e.preventDefault();
                refreshHistory();
              }}
              disabled={histBusy}
              type="button"
            >
              <RefreshCcw size={16} />
              Frissítés
            </button>
          </div>
        </summary>

        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left"> </th>
                <th className="px-3 py-2 text-left">Dátum</th>
                <th className="px-3 py-2 text-left">Honnan → Hová</th>
                <th className="px-3 py-2 text-left">Státusz</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-slate-200 text-slate-900">
                  <td className="px-3 py-2">
                    <input type="radio" name="transferSel" checked={selectedId === h.id} onChange={() => setSelectedId(h.id)} />
                  </td>
                  <td className="px-3 py-2 text-slate-700">{new Date(h.createdAtISO).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className="text-slate-900">{locationById.get(h.fromLocationId)?.name || h.fromLocationId}</span>
                    <span className="text-slate-500"> → </span>
                    <span className="text-slate-900">{locationById.get(h.toLocationId)?.name || h.toLocationId}</span>
                  </td>
                  <td className="px-3 py-2">
                    {h.status === "committed" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                        <CheckCircle2 size={14} />
                        committed
                      </span>
                    ) : h.status === "cancelled" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-700">
                        <XCircle size={14} />
                        cancelled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">draft</span>
                    )}
                  </td>
                </tr>
              ))}
              {!history.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-600" colSpan={4}>
                    Nincs még mentett mozgatás.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-50"
            onClick={loadSelected}
            disabled={!selectedId || busy}
            type="button"
          >
            <List size={16} />
            Betöltés draftba
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
            onClick={commitSelected}
            disabled={!selectedId || busy}
            type="button"
          >
            <CheckCircle2 size={16} />
            Commit
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-rose-600 bg-rose-600 px-3 py-2 text-sm text-white hover:bg-rose-700"
            onClick={cancelSelected}
            disabled={!selectedId || busy}
            type="button"
          >
            <XCircle size={16} />
            Törlés
          </button>
        </div>
      </details>
    </div>
  );
}
