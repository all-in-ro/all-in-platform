import React, { useEffect, useMemo, useState } from "react";
import { Package, ArrowLeft, Upload, Plus, Truck, FileText, Layers } from "lucide-react";
import IncomingImport from "../components/incoming/IncomingImport";
import IncomingManualEntry from "../components/incoming/IncomingManualEntry";
import IncomingTransfer from "../components/incoming/IncomingTransfer";
import IncomingDocs from "../components/incoming/IncomingDocs";
import IncomingBOM from "../components/incoming/IncomingBOM";
import type { IncomingItemDraft, IncomingSourceMeta, Location, DocDraft, TransferDraft } from "../lib/incoming/types";

const BG = "#474c59";
const HEADER = "#354153";
const ALLIN_LOGO_URL = "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/allin-logo-w.png";

type TabKey = "import" | "manual" | "transfer" | "docs" | "bom";

export default function AllInIncoming({
  apiBase,
  actor,
  role,
  shopId,
  onLogout
}: {
  apiBase?: string;
  actor?: string;
  role?: string;
  shopId?: string;
  onLogout?: () => void;
}) {
  // NOTE: Backend nincs még (index.js-ben sincs endpoint), ezért ez az oldal most "draft" módban működik.
  // Amint lesz:
  // - GET /api/locations
  // - GET /api/products?search=
  // - GET /api/stock?...
  // - POST /api/incoming/import | /manual
  // - POST /api/transfers
  // - POST /api/docs/aviz | /receptie
  // akkor a draftokat serverre írjuk és újratöltjük.

  const [tab, setTab] = useState<TabKey>("import");

  // Locations: szerverről jön (shops). Fallback: hardcode, ha valamiért nem elérhető.
  const [locations, setLocations] = useState<Location[]>([
    { id: "csikszereda", name: "Csíkszereda", kind: "shop" },
    { id: "kezdivasarhely", name: "Kézdivásárhely", kind: "shop" },
    { id: "raktar", name: "Raktár", kind: "warehouse" }
  ]);
  const [locError, setLocError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/shops", { credentials: "include" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const items = Array.isArray(j?.items) ? j.items : [];
        const mapped: Location[] = items.map((x: any) => ({
          id: String(x.id),
          name: String(x.name),
          kind: String(x.id) === "raktar" ? "warehouse" : "shop"
        }));
        // biztosítsuk, hogy legyen raktar (vagy a backend már adja)
        if (!mapped.some((l) => l.id === "raktar")) {
          mapped.push({ id: "raktar", name: "Raktár", kind: "warehouse" });
        }
        if (!cancelled && mapped.length) setLocations(mapped);
        if (!cancelled) setLocError(null);
      } catch (e: any) {
        if (!cancelled) setLocError("Nem tudtam lekérni a helyszíneket a szerverről.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);


  // Incoming drafts (CSV + manual összevonva)
  const [incoming, setIncoming] = useState<IncomingItemDraft[]>([]);
  const [incomingMeta, setIncomingMeta] = useState<Record<string, IncomingSourceMeta>>({});

  const addIncomingBatch = (items: IncomingItemDraft[], meta: IncomingSourceMeta) => {
    if (!items.length) return;

    // Stamp metaId
    const metaId = meta.id;
    const stamped = items.map((x) => ({ ...x, sourceMetaId: metaId }));

    setIncoming((prev) => {
      // simple merge: same sku+size+colorCode -> qty összead
      const map = new Map<string, IncomingItemDraft>();
      const keyOf = (it: IncomingItemDraft) =>
        [it.sku || "", it.size || "", it.colorCode || "", it.brand || "", it.category || "", it.name || ""].join("|").toLowerCase();

      for (const p of prev) map.set(keyOf(p), p);
      for (const n of stamped) {
        const k = keyOf(n);
        const ex = map.get(k);
        if (!ex) map.set(k, n);
        else map.set(k, { ...ex, qty: ex.qty + n.qty });
      }
      return Array.from(map.values());
    });

    setIncomingMeta((prev) => ({ ...prev, [metaId]: meta }));
  };

  const removeIncomingRow = (idx: number) => {
    setIncoming((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearIncoming = () => {
    setIncoming([]);
    setIncomingMeta({});
  };

  // Transfer draft
  const [transfer, setTransfer] = useState<TransferDraft>(() => ({
    fromLocationId: "raktar",
    toLocationId: role === "shop" && shopId ? shopId : "csikszereda",
    items: []
  }));

  // Doc draft
  const [doc, setDoc] = useState<DocDraft>(() => ({
    docType: "aviz",
    number: "",
    dateISO: new Date().toISOString().slice(0, 10),
    fromLocationId: "raktar",
    toLocationId: role === "shop" && shopId ? shopId : "csikszereda",
    partnerName: "",
    notes: "",
    items: []
  }));

  const tabBtn = (active: boolean) =>
    "h-9 px-3 rounded-xl text-xs whitespace-nowrap border " +
    (active
      ? "bg-[#208d8b] text-white border-transparent"
      : "bg-white/5 text-white border-white/30 hover:bg-white/10");

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG }}>
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-white/20" style={{ backgroundColor: HEADER }}>
        <div className="mx-auto w-full max-w-[1440px] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <div className="h-9 w-9 rounded-xl grid place-items-center border border-white/25 bg-white/5">
              <Package className="h-5 w-5" />
            </div>
            <div className="leading-tight flex items-center gap-2">
              <img src={ALLIN_LOGO_URL} alt="ALL IN" className="h-6 w-auto" />
              <div className="text-xs text-white/70">Bejövő / Mozgatás / Dokumentumok</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => (window.location.hash = "#allin")}
              className="h-9 px-4 rounded-xl bg-[#354153] hover:bg-[#3c5069] text-white border border-white/40 inline-flex items-center"
              title="Vissza"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Vissza
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1440px] px-4 py-4 space-y-3">
        
{locError ? (
  <div
    style={{
      margin: "0 0 10px 0",
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(0,0,0,0.18)",
      color: "rgba(255,255,255,0.92)",
      fontSize: 13
    }}
  >
    {locError}
  </div>
) : null}

{/* Tabs */}
        <div className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 flex items-center gap-2 flex-wrap">
          <button className={tabBtn(tab === "import")} onClick={() => setTab("import")} type="button">
            <span className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" /> CSV import
            </span>
          </button>
          <button className={tabBtn(tab === "manual")} onClick={() => setTab("manual")} type="button">
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Kézi bevitel
            </span>
          </button>
          <button className={tabBtn(tab === "transfer")} onClick={() => setTab("transfer")} type="button">
            <span className="inline-flex items-center gap-2">
              <Truck className="h-4 w-4" /> Mozgatás
            </span>
          </button>
          <button className={tabBtn(tab === "docs")} onClick={() => setTab("docs")} type="button">
            <span className="inline-flex items-center gap-2">
              <FileText className="h-4 w-4" /> PDF (Aviz / Recepție)
            </span>
          </button>
          <button className={tabBtn(tab === "bom")} onClick={() => setTab("bom")} type="button">
            <span className="inline-flex items-center gap-2">
              <Layers className="h-4 w-4" /> Összetevők
            </span>
          </button>

          <div className="ml-auto text-white/80 text-xs flex items-center gap-3 flex-wrap">
            <div>
              Belépve mint: <span className="text-white font-semibold">{actor || "—"}</span>
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="text-white/60">Bejövő tételek:</span>
              <span className="inline-flex min-w-[34px] justify-center px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-white">
                {incoming.length}
              </span>
              <button
                type="button"
                onClick={clearIncoming}
                className="h-8 px-3 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10 text-xs"
                title="Bejövő tételek törlése"
              >
                Ürítés
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {tab === "import" && (
          <IncomingImport
            locations={locations}
            onAddBatch={addIncomingBatch}
            existingCount={incoming.length}
          />
        )}

        {tab === "manual" && (
          <IncomingManualEntry
            locations={locations}
            onAddBatch={addIncomingBatch}
          />
        )}

        {tab === "transfer" && (
          <IncomingTransfer
            locations={locations}
            incoming={incoming}
            incomingMeta={incomingMeta}
            value={transfer}
            onChange={setTransfer}
          />
        )}

        {tab === "docs" && (
          <IncomingDocs
            locations={locations}
            incoming={incoming}
            incomingMeta={incomingMeta}
            transfer={transfer}
            value={doc}
            onChange={setDoc}
          />
        )}

        {tab === "bom" && <IncomingBOM />}

        {/* Incoming table snapshot */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-[12px] font-semibold text-slate-800">Bejövő tételek (draft)</div>
            <div className="text-[11px] text-slate-500">
              Backend nélkül ez még csak „papíron” él. Igen, mint sok emberi ígéret.
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-white" style={{ backgroundColor: HEADER }}>
                  <th className="px-2 py-2 text-left font-normal text-[11px] w-[44px]">#</th>
                  <th className="px-2 py-2 text-left font-normal text-[11px] w-[140px]">Forrás</th>
                  <th className="px-2 py-2 text-left font-normal text-[11px] w-[140px]">Márka</th>
                  <th className="px-2 py-2 text-left font-normal text-[11px] w-[180px]">Termékkód</th>
                  <th className="px-2 py-2 text-left font-normal text-[11px] min-w-[220px]">Terméknév</th>
                  <th className="px-2 py-2 text-left font-normal text-[11px] w-[140px]">Kategória</th>
                  <th className="px-2 py-2 text-left font-normal text-[11px] w-[120px]">Szín</th>
                  <th className="px-2 py-2 text-left font-normal text-[11px] w-[80px]">Méret</th>
                  <th className="px-2 py-2 text-center font-normal text-[11px] w-[90px] bg-white/5">Darab</th>
                  <th className="px-2 py-2 text-center font-normal text-[11px] w-[110px] sticky right-0 z-20" style={{ backgroundColor: HEADER }}>
                    Művelet
                  </th>
                </tr>
              </thead>
              <tbody>
                {incoming.map((it, idx) => {
                  const meta = it.sourceMetaId ? incomingMeta[it.sourceMetaId] : null;
                  const sourceLabel = meta ? (meta.kind === "csv" ? `CSV: ${meta.label}` : `Kézi: ${meta.label}`) : "—";
                  return (
                    <tr key={idx} className="border-t border-slate-200 hover:bg-slate-50">
                      <td className="px-2 py-2 text-[11px] text-slate-700">{idx + 1}</td>
                      <td className="px-2 py-2 text-[11px] text-slate-700">{sourceLabel}</td>
                      <td className="px-2 py-2 text-[11px] text-slate-800 font-medium">{it.brand || "—"}</td>
                      <td className="px-2 py-2 text-[11px] text-slate-700">
                        <span className="inline-flex px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200">{it.sku || "—"}</span>
                      </td>
                      <td className="px-2 py-2 text-[11px] text-slate-800">{it.name || "—"}</td>
                      <td className="px-2 py-2 text-[11px] text-slate-700">{it.category || "—"}</td>
                      <td className="px-2 py-2 text-[11px] text-slate-700">
                        {it.colorName || "—"}
                        {it.colorCode ? <span className="ml-2 text-[10px] text-slate-400">{it.colorCode}</span> : null}
                      </td>
                      <td className="px-2 py-2 text-[11px] text-slate-700">
                        <span className="inline-flex min-w-[44px] justify-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-teal-600 text-white border border-teal-600">
                          {it.size || "—"}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[11px] text-center">
                        <span className="inline-flex w-[62px] justify-center px-2.5 py-1 rounded-md text-[12px] border bg-[#dde4ef] text-slate-700 border-[#dde4ef]">
                          {it.qty}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center sticky right-0 bg-white">
                        <button
                          type="button"
                          onClick={() => removeIncomingRow(idx)}
                          className="h-7 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-[12px]"
                          title="Tétel törlése"
                        >
                          Törlés
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!incoming.length && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-[12px] text-slate-500">
                      Nincs bejövő tétel. Importálj CSV-t vagy adj hozzá kézzel.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 text-[11px] text-slate-500 border-t border-slate-200">
            Megjegyzés: a Raktár oldalon a “Bejövő” oszlop innen fog táplálkozni, de csak akkor, ha backend is lesz mögötte.
          </div>
        </div>
      </div>
    </div>
  );
}
