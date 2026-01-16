import React, { useEffect, useMemo, useState } from "react";
import { Package, ArrowLeft, Upload, Plus, Truck, FileText, Layers, Save, List, CheckCircle2 } from "lucide-react";
import { Trash2 } from "lucide-react";
import IncomingImport from "../components/incoming/IncomingImport";
import IncomingManualEntry from "../components/incoming/IncomingManualEntry";
import IncomingTransfer from "../components/incoming/IncomingTransfer";
import IncomingDocs from "../components/incoming/IncomingDocs";
import IncomingBOM from "../components/incoming/IncomingBOM";
import type { IncomingItemDraft, IncomingSourceMeta, Location, TransferDraft, IncomingBatchSummary } from "../lib/incoming/types";
import { apiGetLocations, apiCreateIncomingBatch, apiReplaceIncomingItems, apiListIncomingBatches, apiGetIncomingBatch, apiCommitIncomingBatch } from "../lib/incoming/api";

const BG = "#474c59";
const HEADER = "#354153";
const ALLIN_LOGO_URL = "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/allin-logo-w.png";

type TabKey = "import" | "manual" | "transfer" | "docs" | "bom" | "history";

async function tryDeleteIncomingBatch(batchId: string) {
  // We don't have the backend file here, so we try a couple of likely routes.
  // Backend should implement one of these (preferred: the same base route used by apiListIncomingBatches).
  const candidates = [
    `/api/incoming/batches/${encodeURIComponent(batchId)}`,
    `/api/incoming/batch/${encodeURIComponent(batchId)}`,
    `/api/allin/incoming/batches/${encodeURIComponent(batchId)}`,
    `/api/allin/incoming/batch/${encodeURIComponent(batchId)}`,
  ];

  let lastErr = "";
  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: "DELETE", headers: { "content-type": "application/json" } });
      if (res.ok) return;
      const txt = await res.text().catch(() => "");
      lastErr = txt || `${res.status} ${res.statusText}`;
      // if it's a hard auth/permission error, stop early
      if (res.status === 401 || res.status === 403) break;
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
  }

  throw new Error(lastErr || "Törlés sikertelen (nincs DELETE endpoint vagy hibás útvonal).");
}

function mergeKey(it: { sku: string; size: string; colorCode: string; category: string; name: string }) {
  return [it.sku || "", it.size || "", it.colorCode || "", it.category || "", it.name || ""].join("|").toLowerCase();
}

export default function AllInIncoming() {
  const [tab, setTab] = useState<TabKey>("import");

  const [locations, setLocations] = useState<Location[]>([
    { id: "raktar", name: "Raktár", kind: "warehouse" },
    { id: "csikszereda", name: "Csíkszereda", kind: "shop" },
    { id: "kezdivasarhely", name: "Kézdivásárhely", kind: "shop" },
  ]);
  const [locErr, setLocErr] = useState<string>("");

  const [incoming, setIncoming] = useState<IncomingItemDraft[]>([]);
  const [incomingMeta, setIncomingMeta] = useState<Record<string, IncomingSourceMeta>>({});

  const [transfer, setTransfer] = useState<TransferDraft>({
    fromLocationId: "raktar",
    toLocationId: "csikszereda",
    items: [],
  });

  // saving state
  const [saveErr, setSaveErr] = useState<string>("");
  const [saveOk, setSaveOk] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  // history state
  const [history, setHistory] = useState<IncomingBatchSummary[]>([]);
  const [historyErr, setHistoryErr] = useState<string>("");
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLocErr("");
        const shops = await apiGetLocations();
        if (!alive) return;
        // map shops -> Location
        const locs: Location[] = shops.map((s: any) => ({
          id: s.id,
          name: s.name || s.label || s.id,
          kind: s.kind || (s.id === "raktar" ? "warehouse" : "shop"),
        }));
        if (locs.length) setLocations(locs);
      } catch (e: any) {
        if (!alive) return;
        setLocErr(e?.message || "Nem sikerült beolvasni a helyszíneket.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const addBatch = (items: IncomingItemDraft[], meta: IncomingSourceMeta) => {
    if (!items.length) return;
    const metaId = meta.id;

    // merge by key
    setIncoming((prev) => {
      const map = new Map<string, IncomingItemDraft>();
      for (const p of prev) map.set(mergeKey(p), p);
      for (const n of items) {
        const k = mergeKey(n);
        const ex = map.get(k);
        if (!ex) map.set(k, n);
        else map.set(k, { ...ex, qty: ex.qty + n.qty });
      }
      return Array.from(map.values());
    });

    setIncomingMeta((prev) => ({ ...prev, [metaId]: meta }));
  };

  const clearIncoming = () => {
    setIncoming([]);
    setIncomingMeta({});
    setSaveErr("");
    setSaveOk("");
  };

  const removeIncomingRow = (idx: number) => {
    setIncoming((prev) => prev.filter((_, i) => i !== idx));
  };

  const setIncomingQty = (idx: number, qty: number) => {
    setIncoming((prev) => prev.map((it, i) => (i === idx ? { ...it, qty } : it)).filter((x) => x.qty > 0));
  };

  const groupedByMeta = useMemo(() => {
    const ids = Array.from(new Set(incoming.map((x) => x.sourceMetaId)));
    return ids.map((id) => incomingMeta[id]).filter(Boolean);
  }, [incoming, incomingMeta]);

  const canSave = incoming.length > 0 && Object.keys(incomingMeta).length > 0;

  const saveToServer = async () => {
    setSaveErr("");
    setSaveOk("");
    if (!canSave) {
      setSaveErr("Nincs mit menteni.");
      return;
    }

    // v1: meta-bontás batch-enként (minden import/hand meta külön batch)
    setSaving(true);
    try {
      const metaList = groupedByMeta;
      for (const meta of metaList) {
        const itemsForMeta = incoming.filter((x) => x.sourceMetaId === meta.id);
        if (!itemsForMeta.length) continue;

        const created = await apiCreateIncomingBatch({
          supplier: meta.supplier,
          sourceType: meta.kind,
          locationId: meta.locationId,
          note: meta.label,
        });

        await apiReplaceIncomingItems(
          created.id,
          itemsForMeta.map((x) => ({
            product_code: x.sku,
            product_name: x.name,
            color_code: x.colorCode,
            color_name: x.colorName,
            size: x.size,
            category: x.category,
            qty: x.qty,
            raw: { sourceMetaId: x.sourceMetaId },
          }))
        );
      }

      setSaveOk("Mentve a szerverre (batch-ek létrehozva).");
      // refresh history silently
      void loadHistory();
    } catch (e: any) {
      setSaveErr(e?.message || "Mentés sikertelen.");
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async () => {
    setHistoryErr("");
    setHistoryLoading(true);
    try {
      const res = await apiListIncomingBatches({ limit: 50, offset: 0 });
      setHistory(res.items || []);
    } catch (e: any) {
      setHistoryErr(e?.message || "Nem sikerült beolvasni a batch listát.");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "history") void loadHistory();
  }, [tab]);

  const loadBatchIntoDraft = async (batchId: string) => {
    setHistoryErr("");
    try {
      const d = await apiGetIncomingBatch(batchId);
      const metaId = `batch_${d.id}`;
      const meta: IncomingSourceMeta = {
        id: metaId,
        kind: d.source_type,
        label: `Batch ${d.id}`,
        supplier: d.supplier,
        createdAtISO: d.created_at,
        locationId: d.location_id,
      };
      const items: IncomingItemDraft[] = d.items.map((it) => ({
        brand: (it.brand || "").toString(),
        gender: (it.gender || "").toString(),
        buyPrice: (it.buy_price ?? it.buyPrice ?? null) as any,
        sku: (it.product_code || "").toString(),
        name: (it.product_name || "").toString(),
        colorCode: (it.color_code || "").toString(),
        colorName: (it.color_name || "").toString(),
        size: (it.size || "").toString(),
        category: (it.category || "").toString(),
        qty: it.qty,
        sourceMetaId: metaId,
      }));
      setIncoming(items);
      setIncomingMeta({ [metaId]: meta });
      setSaveOk(`Betöltve: ${d.id}`);
      setSaveErr("");
      setTab("import");
    } catch (e: any) {
      setHistoryErr(e?.message || "Nem sikerült betölteni a batch-et.");
    }
  };

  const commitSelectedBatch = async () => {
    if (!selectedBatchId) return;
    setHistoryErr("");
    try {
      await apiCommitIncomingBatch(selectedBatchId);
      setSaveOk(`Commit: ${selectedBatchId}`);
      void loadHistory();
    } catch (e: any) {
      setHistoryErr(e?.message || "Commit sikertelen.");
    }
  };

  const deleteBatchPermanently = async (batchId: string) => {
    // blunt but effective. humans love clicking without reading.
    const ok = window.confirm(`Biztosan végleg törlöd ezt az előzményt?\n\nBatch ID: ${batchId}\n\nEz nem visszavonható.`);
    if (!ok) return;

    setHistoryErr("");
    setSaveOk("");
    try {
      await tryDeleteIncomingBatch(batchId);
      if (selectedBatchId === batchId) setSelectedBatchId("");
      setSaveOk(`Törölve: ${batchId}`);
      void loadHistory();
    } catch (e: any) {
      setHistoryErr(e?.message || "Törlés sikertelen.");
    }
  };

  const tabs: Array<{ key: TabKey; label: string; icon: any }> = [
    { key: "import", label: "CSV import", icon: Upload },
    { key: "manual", label: "Kézi bevitel", icon: Plus },
    { key: "transfer", label: "Mozgatás", icon: Truck },
    { key: "docs", label: "PDF (Aviz/Recepție)", icon: FileText },
    { key: "bom", label: "Összetevők", icon: Layers },
    { key: "history", label: "Előzmények", icon: List },
  ];

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <div className="sticky top-0 z-30 border-b border-white/10" style={{ background: HEADER }}>
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => (window.location.hash = "#home")}
              className="h-9 px-3 rounded-xl border border-white/25 bg-white/5 text-white hover:bg-white/10 text-[12px] font-semibold inline-flex items-center gap-2"
              title="Vissza"
            >
              <ArrowLeft className="w-4 h-4" /> Vissza
            </button>

            <div className="flex items-center gap-2">
              <img src={ALLIN_LOGO_URL} alt="ALL IN" className="h-7 w-auto opacity-90" />
              <div className="text-white font-semibold text-[14px] inline-flex items-center gap-2">
                <Package className="w-4 h-4" /> Incoming
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveToServer}
              disabled={!canSave || saving}
              className="h-9 px-3 rounded-xl bg-white text-slate-900 text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              title={canSave ? "Mentés a szerverre" : "Előbb importálj vagy vigyél be tételeket"}
            >
              <Save className="w-4 h-4" /> {saving ? "Mentés..." : "Mentés"}
            </button>

            <div className="inline-flex items-center gap-2 text-white/80 text-[12px]">
              <span className="text-white/60">Tételek:</span>
              <span className="inline-flex min-w-[34px] justify-center px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-white">
                {incoming.length}
              </span>
              <button
                type="button"
                onClick={clearIncoming}
                className="h-8 px-3 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10 text-[12px]"
                title="Bejövő tételek törlése"
              >
                Ürítés
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-4 grid gap-4">
        {locErr ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            Helyszínek betöltése nem sikerült: <b>{locErr}</b> (fallback lista aktív)
          </div>
        ) : null}

        {saveErr ? <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-900">{saveErr}</div> : null}
        {saveOk ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900 inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> {saveOk}
          </div>
        ) : null}

        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-2 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={
                    "h-9 px-3 rounded-xl text-[12px] font-semibold inline-flex items-center gap-2 border " +
                    (active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50")
                  }
                >
                  <Icon className="w-4 h-4" /> {t.label}
                </button>
              );
            })}
          </div>

          <div className="p-4">
            {tab === "import" ? <IncomingImport locations={locations} existingCount={incoming.length} onAddBatch={addBatch} /> : null}
            {tab === "manual" ? <IncomingManualEntry locations={locations} existingCount={incoming.length} onAddBatch={addBatch} /> : null}
            {tab === "transfer" ? (
              <IncomingTransfer locations={locations} incoming={incoming} incomingMeta={incomingMeta} transfer={transfer} onChange={setTransfer} />
            ) : null}
            {tab === "docs" ? <IncomingDocs locations={locations} transfer={transfer} incomingCount={incoming.length} /> : null}
            {tab === "bom" ? <IncomingBOM /> : null}

            {tab === "history" ? (
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12px] font-semibold text-slate-800">Incoming előzmények (utolsó 50)</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadHistory}
                      className="h-9 px-3 rounded-xl border border-slate-300 bg-white text-[12px] font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      Frissítés
                    </button>
                    <button
                      type="button"
                      disabled={!selectedBatchId}
                      onClick={commitSelectedBatch}
                      className="h-9 px-3 rounded-xl bg-slate-900 text-white text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Batch commit (draft -> committed)"
                    >
                      Commit
                    </button>
                  </div>
                </div>

                {historyErr ? <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-900">{historyErr}</div> : null}

                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="max-h-[520px] overflow-auto">
                    <table className="w-full text-[12px]">
                      <thead className="bg-slate-50 text-slate-600 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold">Dátum</th>
                          <th className="text-left px-3 py-2 font-semibold">ID</th>
                          <th className="text-left px-3 py-2 font-semibold">Beszállító</th>
                          <th className="text-left px-3 py-2 font-semibold">Típus</th>
                          <th className="text-left px-3 py-2 font-semibold">Helyszín</th>
                          <th className="text-left px-3 py-2 font-semibold">Státusz</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((b) => (
                          <tr key={b.id} className="border-t border-slate-200 hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{new Date(b.created_at).toLocaleString()}</td>
                            <td className="px-3 py-2 font-semibold text-slate-900">{b.id}</td>
                            <td className="px-3 py-2 text-slate-800">{b.supplier}</td>
                            <td className="px-3 py-2 text-slate-700">{b.source_type}</td>
                            <td className="px-3 py-2 text-slate-700">{b.location_id}</td>
                            <td className="px-3 py-2">
                              <span
                                className={
                                  "inline-flex px-2 py-0.5 rounded-md text-[11px] border " +
                                  (b.status === "committed"
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                    : b.status === "cancelled"
                                    ? "bg-red-50 text-red-800 border-red-200"
                                    : "bg-slate-50 text-slate-800 border-slate-200")
                                }
                              >
                                {b.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <input
                                  type="radio"
                                  name="selectedBatch"
                                  checked={selectedBatchId === b.id}
                                  onChange={() => setSelectedBatchId(b.id)}
                                  title="Kijelölés commit-hoz"
                                />
                                <button
                                  type="button"
                                  onClick={() => deleteBatchPermanently(b.id)}
                                  className="h-8 px-3 rounded-xl border border-red-300 bg-white text-[12px] font-semibold text-red-700 hover:bg-red-50"
                                  title="Előzmény végleges törlése"
                                >
                                  Törlés
                                </button>
                                <button
                                  type="button"
                                  onClick={() => loadBatchIntoDraft(b.id)}
                                  className="h-8 px-3 rounded-xl border border-slate-300 bg-white text-[12px] font-semibold text-slate-800 hover:bg-slate-50"
                                >
                                  Betöltés
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!history.length && !historyLoading ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                              Nincs adat.
                            </td>
                          </tr>
                        ) : null}
                        {historyLoading ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                              Betöltés...
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Incoming items table always visible */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-[12px] font-semibold text-slate-800">Bejövő tételek (draft)</div>
            <div className="text-[11px] text-slate-500">Itt látszik, amit importáltál / beírtál.</div>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Kód</th>
                  <th className="text-left px-3 py-2 font-semibold">Termék</th>
                  <th className="text-left px-3 py-2 font-semibold">Szín</th>
                  <th className="text-left px-3 py-2 font-semibold">Méret</th>
                  <th className="text-left px-3 py-2 font-semibold">Kategória</th>
                  <th className="text-right px-3 py-2 font-semibold">Db</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {incoming.map((it, idx) => (
                  <tr key={idx} className="border-t border-slate-200">
                    <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">{it.sku}</td>
                    <td className="px-3 py-2 text-slate-800">{it.name}</td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {it.colorCode ? <span className="font-semibold">{it.colorCode}</span> : <span className="text-slate-400">-</span>}
                      {it.colorName ? <span className="text-slate-500"> · {it.colorName}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{it.size || <span className="text-slate-400">-</span>}</td>
                    <td className="px-3 py-2 text-slate-700">{it.category || <span className="text-slate-400">-</span>}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        value={String(it.qty)}
                        onChange={(e) => {
                          const q = Math.round(Number((e.target.value || "").replace(",", ".")));
                          setIncomingQty(idx, Number.isFinite(q) ? q : 0);
                        }}
                        className="w-[90px] h-9 rounded-lg border border-slate-300 px-2 text-[12px] text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeIncomingRow(idx)}
                        className="h-9 w-9 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 inline-flex items-center justify-center"
                        title="Sor törlése"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                {!incoming.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                      Még nincs tétel.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
