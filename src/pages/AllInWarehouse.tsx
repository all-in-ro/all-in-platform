import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, ArrowLeft, Package, Pencil, Trash2 } from "lucide-react";

/**
 * ALL IN – Raktár (mock UI)
 *
 * Új logika (méret = külön termék):
 * - NINCS "S/M/L" összevonás egy terméken belül.
 * - Minden méret külön SKU (külön termék sor).
 * - Üzletenkénti készlet marad külön (nem piszkáljuk egymást).
 * - Van "Bejövő" (incoming) mennyiség, ami csak az ÖSSZESÍTETT db-hoz adódik hozzá,
 *   de nem módosítja az üzletekben meglévő készleteket.
 *
 * Később: MOCK → API/DB. (incoming majd az allinincoming CSV importból jön)
 */

type StoreKey = "Csíkszereda" | "Kézdivásárhely" | "Raktár";

type AllInProductRow = {
  id: string;
  imageUrl?: string;

  brand: string;
  sku: string; // egyedi, méret szerint is
  name: string;

  size: string; // S/M/L/XL vagy 21/22 stb. (külön termék)
  colorName: string;
  colorCode?: string; // pl. 001 / S10 (rendeléshez)
  colorHex?: string;

  // Készlet üzletenként (ez a "szentírás" az adott üzlethez)
  byStore: Partial<Record<StoreKey, number>>;

  // Bejövő készlet (CSV-ből) -> csak a totálhoz adódik, nem írja át az üzleteket
  incomingQty?: number;

  sellPrice: number; // RON
  buyPrice?: number; // RON (elrejthető)

  gender: string;
  category: string;
};

const BG = "#474c59";
const HEADER = "#354153";
// Public logo (Cloudflare R2) – works in all deployments
const ALLIN_LOGO_URL = "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/allin-logo-w.png";

const STORES: StoreKey[] = ["Csíkszereda", "Kézdivásárhely", "Raktár"];

type ApiStoreId = "csikszereda" | "kezdivasarhely" | "raktar";

type ApiWarehouseItem = {
  product_key: string;
  brand: string;
  code: string;
  name: string;
  size: string;
  color_name: string;
  color_code?: string | null;
  color_hex?: string | null;
  gender?: string | null;
  category?: string | null;
  image_url?: string | null;
  sell_price?: string | number | null;
  buy_price?: string | number | null;
  incoming_qty?: number | null;
  byLocation: Partial<Record<ApiStoreId, number>>;
};

type ApiWarehouseResponse = {
  stores: { id: string; name: string }[];
  items: ApiWarehouseItem[];
};

// Incoming (AllInIncoming) – best-effort overlay a "Bejövő" oszlophoz.
// Fontos: ez NEM hoz létre új terméket a raktárlistába, csak a meglévők bejövő értékét tölti.
type IncomingBatchSummary = { id: string; status?: string };

function pickIncomingSku(x: any): string {
  return String(x?.product_code ?? x?.sku ?? x?.code ?? "").trim();
}

function pickIncomingQty(x: any): number {
  const v = x?.qty ?? x?.db ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function fetchIncomingQtyBySku(): Promise<Record<string, number>> {
  const listRes = await fetch("/api/incoming/batches?limit=50&offset=0", { credentials: "include" });
  if (!listRes.ok) throw new Error(`Incoming list HTTP ${listRes.status}`);
  const listJson = await listRes.json();
  const batches: IncomingBatchSummary[] = (listJson?.items || listJson || []) as any;

  const committed = batches.filter((b) => (b.status || "").toLowerCase() === "committed");
  if (!committed.length) return {};

  const acc: Record<string, number> = {};
  for (const b of committed) {
    const res = await fetch(`/api/incoming/batches/${encodeURIComponent(b.id)}`, { credentials: "include" });
    if (!res.ok) continue;
    const d = await res.json();
    const rows = (d?.items || d?.incoming_items || []) as any[];
    for (const r of rows) {
      const sku = pickIncomingSku(r);
      if (!sku) continue;
      acc[sku] = (acc[sku] || 0) + pickIncomingQty(r);
    }
  }

  return acc;
}

const STORE_ID_TO_NAME: Record<ApiStoreId, StoreKey> = {
  csikszereda: "Csíkszereda",
  kezdivasarhely: "Kézdivásárhely",
  raktar: "Raktár",
};

function parsePrice(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function mapApiItemToRow(x: ApiWarehouseItem): AllInProductRow {
  const byStore: Record<StoreKey, number> = {
    "Csíkszereda": 0,
    "Kézdivásárhely": 0,
    "Raktár": 0,
  };

  (Object.entries(x.byLocation || {}) as Array<[ApiStoreId, number]>).forEach(([k, v]) => {
    if (k in STORE_ID_TO_NAME) byStore[STORE_ID_TO_NAME[k]] = Number(v) || 0;
  });

  return {
    id: x.product_key,
    imageUrl: x.image_url ?? undefined,
    brand: x.brand ?? "",
    sku: x.code ?? "",
    name: x.name ?? "",
    size: x.size ?? "",
    colorName: x.color_name ?? "",
    colorCode: (x.color_code ?? undefined) as string | undefined,
    colorHex: (x.color_hex ?? undefined) as string | undefined,
    byStore,
    incomingQty: x.incoming_qty ?? 0,
    sellPrice: parsePrice(x.sell_price) ?? 0,
    buyPrice: parsePrice(x.buy_price),
    gender: x.gender ?? "",
    category: x.category ?? "",
  };
}


// MOCK eltávolítva: a lista most az API/DB-ből jön.

function money(v?: number) {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return `${v.toFixed(2)} RON`;
}

function n(v?: number) {
  if (typeof v !== "number" || Number.isNaN(v)) return 0;
  return v;
}

function sumStore(byStore: Partial<Record<StoreKey, number>>) {
  return STORES.reduce((acc, k) => acc + n(byStore?.[k]), 0);
}

function ColorDot({ hex }: { hex?: string }) {
  return (
    <span
      className="inline-block h-3 w-3 rounded-full border border-white/40"
      style={{ backgroundColor: hex || "#cbd5e1" }}
      aria-label="Szín"
      title={hex || ""}
    />
  );
}

function QtyPill({ qty, muted }: { qty: number; muted?: boolean }) {
  const isZero = qty === 0;
  return (
    <span
      className={
        "inline-flex w-[56px] justify-center self-start px-3 py-1 rounded-lg text-[13px] border " +
        (muted || isZero
          ? "bg-white text-slate-400 border-slate-200"
          : "bg-[#dde4ef] text-slate-700 border-[#dde4ef]")
      }
      title={String(qty)}
    >
      {qty}
    </span>
  );
}

export default function AllInWarehouse() {
  const [q, setQ] = useState("");
  const [showBuyPrice, setShowBuyPrice] = useState(false);

  const [whErr, setWhErr] = useState<string>("");
  const [incomingNote, setIncomingNote] = useState<string>("");

  const goView = (id: string) => {
    window.location.hash = `#allinproduct/${id}`;
  };

  const goEdit = (id: string) => {
    window.location.hash = `#allinproductedit/${id}`;
  };

  const [items, setItems] = useState<AllInProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWarehouse = async () => {
    setLoading(true);
    setWhErr("");
    setIncomingNote("");
    try {
      const res = await fetch("/api/allin/warehouse", { credentials: "include" });
      if (!res.ok) throw new Error(`Warehouse HTTP ${res.status}`);
      const data = (await res.json()) as ApiWarehouseResponse;

      let mapped = (data.items || []).map(mapApiItemToRow);

      // Bejövő overlay: committed incoming batch-ekből számolunk (ha sikerül).
      // Ha nem sikerül, akkor a backend incoming_qty (ha van) marad.
      try {
        const incomingMap = await fetchIncomingQtyBySku();
        const keys = Object.keys(incomingMap);
        if (keys.length) {
          mapped = mapped.map((r) => ({ ...r, incomingQty: incomingMap[r.sku] ?? (r.incomingQty ?? 0) }));
          setIncomingNote("Bejövő betöltve committed batch-ekből.");
        }
      } catch (e: any) {
        setIncomingNote(`Bejövő overlay nem ment: ${e?.message || "hiba"}`);
      }

      setItems(mapped);
    } catch (e: any) {
      setItems([]);
      setWhErr(e?.message || "Nem sikerült betölteni a raktárlistát.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWarehouse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Incoming oldal mentés/commit után frissítjük a raktárt (kliens oldali összekötés)
  useEffect(() => {
    const onIncomingChanged = () => {
      void loadWarehouse();
    };
    window.addEventListener("allin:incoming-changed", onIncomingChanged);
    return () => window.removeEventListener("allin:incoming-changed", onIncomingChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doDelete = async (id: string) => {
    // Valós törlés (soft delete a backendben) + újratöltés
    // eslint-disable-next-line no-alert
    const ok = confirm("Biztosan törlöd ezt a terméket?");
    if (!ok) return;

    const res = await fetch(`/api/allin/products/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!res.ok) {
      // eslint-disable-next-line no-alert
      alert("Törlés sikertelen.");
      return;
    }

    await loadWarehouse();
  };

// Szűrők (árakra NINCS szűrés)
  const [fBrand, setFBrand] = useState("");
  const [fSku, setFSku] = useState("");
  const [fName, setFName] = useState("");
  const [fColor, setFColor] = useState("");
  const [fGender, setFGender] = useState("");
  const [fCategory, setFCategory] = useState("");

  const brandOptions = useMemo(() => Array.from(new Set(items.map((x) => x.brand))).sort(), [items]);
  const colorOptions = useMemo(() => Array.from(new Set(items.map((x) => x.colorName))).sort(), [items]);
  const genderOptions = useMemo(() => Array.from(new Set(items.map((x) => x.gender))).sort(), [items]);
  const categoryOptions = useMemo(() => Array.from(new Set(items.map((x) => x.category))).sort(), [items]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sku = fSku.trim().toLowerCase();
    const name = fName.trim().toLowerCase();

    return items.filter((r) => {
      // kereső
      if (s) {
        const ok =
          r.brand.toLowerCase().includes(s) ||
          r.sku.toLowerCase().includes(s) ||
          r.name.toLowerCase().includes(s) ||
          r.category.toLowerCase().includes(s) ||
          r.gender.toLowerCase().includes(s) ||
          r.size.toLowerCase().includes(s) ||
          r.colorName.toLowerCase().includes(s);
        if (!ok) return false;
      }

      // szűrők
      if (fBrand && r.brand !== fBrand) return false;
      if (sku && !r.sku.toLowerCase().includes(sku)) return false;
      if (name && !r.name.toLowerCase().includes(name)) return false;
      if (fColor && r.colorName !== fColor) return false;
      if (fGender && r.gender !== fGender) return false;
      if (fCategory && r.category !== fCategory) return false;

      return true;
    });
  }, [items, q, fBrand, fSku, fName, fColor, fGender, fCategory]);

  const th = "px-1.5 py-1.5 text-left font-normal text-[11px] whitespace-nowrap";
  const td = "px-1.5 py-1.5 align-top text-[11px] leading-[1.15]";

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
              <img
                src={ALLIN_LOGO_URL}
                alt="ALL IN"
                className="h-6 w-auto"
              />
              <div className="text-xs text-white/70">Raktár</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowBuyPrice((v) => !v)}
              title={showBuyPrice ? "Bevételi ár elrejtése" : "Bevételi ár mutatása"}
              className="h-7 w-7 rounded-md grid place-items-center bg-red-600 hover:bg-red-700 text-white"
            >
              {showBuyPrice ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>

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

        {whErr ? (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-[12px]">
            {whErr}
          </div>
        ) : null}

        {incomingNote ? (
          <div className="rounded-xl bg-slate-50 border border-slate-200 text-slate-700 px-4 py-3 text-[12px]">
            {incomingNote}
          </div>
        ) : null}

        {/* Gyorsszűrő */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Gyorsszűrő: bármi (márka, kód, név, szín, színkód, kategória, méret...)"
            className="h-9 text-[12px] bg-slate-100 border border-slate-300 text-slate-700 placeholder:text-slate-400"
          />
        </div>
        {/* Filters */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-3">
          <div
            className="grid gap-2 items-end"
            style={{ gridTemplateColumns: "160px 140px 180px 160px 180px 1fr 140px" }}
          >
            <div>
              <div className="text-[11px] text-slate-600 mb-1 font-medium">Márka</div>
              <select
                value={fBrand}
                onChange={(e) => setFBrand(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px]"
              >
                <option value="">Összes</option>
                {brandOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[11px] text-slate-600 mb-1 font-medium">Nem</div>
              <select
                value={fGender}
                onChange={(e) => setFGender(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px]"
              >
                <option value="">Összes</option>
                {genderOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[11px] text-slate-600 mb-1 font-medium">Kategória</div>
              <select
                value={fCategory}
                onChange={(e) => setFCategory(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px]"
              >
                <option value="">Összes</option>
                {categoryOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[11px] text-slate-600 mb-1 font-medium">Szín</div>
              <select
                value={fColor}
                onChange={(e) => setFColor(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px]"
              >
                <option value="">Összes</option>
                {colorOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[11px] text-slate-600 mb-1 font-medium">Termékkód</div>
              <Input
                value={fSku}
                onChange={(e) => setFSku(e.target.value)}
                placeholder="szűrő…"
                className="h-9 text-[12px] bg-slate-100 border border-slate-300 text-slate-700 placeholder:text-slate-400"
              />
            </div>

            <div>
              <div className="text-[11px] text-slate-600 mb-1 font-medium">Terméknév</div>
              <Input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="szűrő…"
                className="h-9 text-[12px] bg-slate-100 border border-slate-300 text-slate-700 placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-end justify-end">
              <button
                type="button"
                onClick={() => {
                  setFBrand("");
                  setFSku("");
                  setFName("");
                  setFColor("");
                  setFGender("");
                  setFCategory("");
                }}
                className="h-9 px-3 rounded-md border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 text-[12px]"
                title="Szűrők törlése"
              >
                Szűrők törlése
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              
<thead>
                <tr className="text-white" style={{ backgroundColor: HEADER }}>
                  <th className={th + " w-[44px]"}>#</th>
                  <th className={th + " w-[56px]"}>Kép</th>
                  <th className={th + " w-[140px]"}>Márka</th>
                  <th className={th + " w-[190px]"}>Termékkód</th>
                  <th className={th + " min-w-[220px]"}>Terméknév</th>

                  <th className={th + " w-[110px]"}>Nem</th>
                  <th className={th + " w-[140px]"}>Kategória</th>
                  <th className={th + " w-[140px]"}>Szín</th>
                  <th className={th + " w-[72px]"}>Méret</th>

                  <th className={th + " w-[105px] border-l border-white/10 text-center bg-white/5"}>Csíkszereda</th>
                  <th className={th + " w-[115px] text-center bg-white/5"}>Kézdivásárhely</th>
                                    <th className={th + " w-[82px] text-center bg-white/5"}>Raktár</th>

                  <th className={th + " w-[82px] text-center"}>Bejövő</th>
                  <th className={th + " w-[86px] text-center"}>Összesen</th>

                  <th className={th.replace("text-left", "text-right") + " w-[110px]"}>Eladási ár</th>
                  <th className={th.replace("text-left", "text-right") + " w-[110px]"}>Bevételi ár</th>

                  <th className={th + " w-[140px] text-center sticky right-0 z-30"} style={{ backgroundColor: HEADER }}>
                    Műveletek
                  </th>
                </tr>
              </thead>


              <tbody>
                {!loading && rows.length === 0 ? (
                  <tr className="border-t border-slate-200">
                    <td className={td + " text-slate-600"} colSpan={17}>
                      Nincs megjeleníthető termék. (Import/Mozgatás önmagában nem hoz létre új terméksort a raktárban, csak a meglévők "Bejövő" értékét tudja növelni.)
                    </td>
                  </tr>
                ) : null}

                {rows.map((r, idx) => {
                  const storeSum = sumStore(r.byStore || {});
                  const incoming = n(r.incomingQty);
                  const total = storeSum + incoming;

                  return (
                    <tr key={r.id} className="border-t border-slate-200 hover:bg-slate-50">
                      <td className={td + " text-slate-700"}>{idx + 1}</td>

                      <td className={td}>
                        <div className="h-11 w-11 rounded-lg border border-slate-200 overflow-hidden bg-white">
                          {r.imageUrl ? (
                            <img src={r.imageUrl} alt={r.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full grid place-items-center text-[11px] text-slate-400">—</div>
                          )}
                        </div>
                      </td>

                      <td className={td + " text-slate-800 font-medium"}>{r.brand}</td>

                      <td className={td + " text-slate-700"}>
                        <span className="inline-flex px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px]">
                          {r.sku}
                        </span>
                      </td>

                      <td className={td + " text-slate-800"}>{r.name}</td>

                      <td className={td + " text-slate-700"}>{r.gender}</td>

                      <td className={td + " text-slate-700"}>{r.category}</td>

                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <ColorDot hex={r.colorHex} />
                          <div className="leading-[1.1]">
                            <div className="text-slate-700">{r.colorName}</div>
                            <div className="text-[10px] text-slate-400">{r.colorCode || "—"}</div>
                          </div>
                        </div>
                      </td>

                      <td className={td}>
                        <span className="inline-flex min-w-[44px] justify-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-teal-600 text-white border border-teal-600">{r.size}</span>
                      </td>

                      <td className={td + " text-center border-l border-slate-200 bg-slate-50"}>
                        <QtyPill qty={n(r.byStore?.["Csíkszereda"])} />
                      </td>
                      <td className={td + " text-center bg-slate-50"}>
                        <QtyPill qty={n(r.byStore?.["Kézdivásárhely"])} />
                      </td>
                                            <td className={td + " text-center bg-slate-50"}>
                        <QtyPill qty={n(r.byStore?.["Raktár"])} />
                      </td>

                      <td className={td + " text-center"}>
                        <QtyPill qty={incoming} muted />
                      </td>

                      <td className={td + " text-center"}>
                        <span
                          className={
                            "inline-flex w-[62px] justify-center px-2.5 py-1 rounded-md text-[12px] border " +
                            (total === 0 ? "bg-white text-slate-400 border-slate-200" : "bg-teal-600 text-white border-teal-600")
                          }
                          title="Üzletek összege + bejövő"
                        >
                          {total}
                        </span>
                      </td>

                      <td className={td + " text-right font-semibold text-slate-800"}>{money(r.sellPrice)}</td>

                      <td className={td + " text-right"}>
                        {showBuyPrice ? (
                          <div className="flex flex-col items-end leading-[1.1]">
                            <span className="font-semibold text-slate-800">{money(r.buyPrice)}</span>
                            {typeof r.buyPrice === "number" && typeof r.sellPrice === "number" && r.sellPrice > 0 && (
                              <span className="text-[10px] text-slate-400">
                                {Math.round((r.buyPrice / r.sellPrice) * 100)}%
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 select-none">••••</span>
                        )}
                      </td>

                      <td className={td + " text-center sticky right-0 bg-white z-10"}>
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => goView(r.id)}
                            className="h-7 w-7 rounded-md grid place-items-center bg-teal-600 hover:bg-teal-700 text-white"
                            title="Megtekintés"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => goEdit(r.id)}
                            className="h-7 w-7 rounded-md grid place-items-center bg-slate-700 hover:bg-slate-800 text-white"
                            title="Szerkesztés"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => doDelete(r.id)}
                            className="h-7 w-7 rounded-md grid place-items-center bg-red-600 hover:bg-red-700 text-white"
                            title="Törlés"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })}

                {!rows.length && (
                  <tr>
                    <td colSpan={18} className="px-4 py-10 text-center text-[12px] text-slate-500">
                      Nincs találat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 text-[11px] text-slate-500 border-t border-slate-200">
            Megjegyzés: a “Bejövő” oszlop a CSV importból (allinincoming) fog jönni és csak az “Összesen” értéket növeli.
            Az üzletek készleteit nem módosítja.
          </div>
        </div>
      </div>
    </div>
  );
}
