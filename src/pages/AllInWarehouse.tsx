import React, { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, ArrowLeft, Package, Pencil, Trash2, RefreshCw } from "lucide-react";

/**
 * ALL IN – Raktár
 *
 * Logika (méret = külön termék):
 * - NINCS "S/M/L" összevonás egy terméken belül.
 * - Minden méret külön SKU (külön termék sor).
 * - Üzletenkénti készlet marad külön (lokációs készlet).
 * - Van "Bejövő" (incoming) mennyiség (Incoming modulból), ami csak az ÖSSZESÍTETT db-hoz adódik hozzá,
 *   de nem írja át a lokációs készleteket.
 *
 * Ez a fájl korábban mock adatokat használt. Most a szerverről tölt:
 * - GET /api/shops
 * - GET /api/allin/warehouse
 * - DELETE /api/allin/products/:product_key (ha elérhető)
 */

type Store = { id: string; name: string };

type AllInProductRow = {
  id: number; // UI/route kompatibilitás miatt (hash a productKey-ből)
  productKey: string;

  imageUrl?: string;

  brand: string;
  sku: string; // termékkód (code) + színkód + méret (UI)
  name: string;

  size: string;
  colorName: string;
  colorCode?: string;
  colorHex?: string;

  // Lokációs készlet: storeId -> qty
  byStore: Record<string, number>;

  // Bejövő készlet (Incoming batch-ekből, committed nélkül is lehet majd draft összeg)
  incomingQty?: number;

  sellPrice?: number;
  buyPrice?: number;

  gender?: string;
  category?: string;
};

const BG = "#474c59";
const HEADER = "#354153";
// Public logo (Cloudflare R2) – works in all deployments
const ALLIN_LOGO_URL =
  "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/allin-logo-w.png";

function money(v?: number) {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return `${v.toFixed(2)} RON`;
}

function n(v?: number) {
  if (typeof v !== "number" || Number.isNaN(v)) return 0;
  return v;
}

function sumStore(byStore: Record<string, number>, stores: Store[]) {
  return stores.reduce((acc, s) => acc + n(byStore?.[s.id]), 0);
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

function hashToInt(input: string) {
  // Stabil, gyors UI id (nem kriptó, nem kell annak lennie)
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

type WarehouseResponseAny = any;

function adaptWarehousePayload(payload: WarehouseResponseAny, stores: Store[]): AllInProductRow[] {
  // Tűrjük a backend shape változását:
  // - products/items/list: tömb
  // - stock: { [productKey]: { [storeId]: qty } } vagy rows[].
  // - incoming: { [productKey]: qty }
  const products: any[] =
    payload?.products ||
    payload?.items ||
    payload?.list ||
    payload?.rows ||
    payload?.data ||
    [];

  const incomingMap: Record<string, number> = payload?.incoming || payload?.incomingByProductKey || {};
  const stockMap: Record<string, Record<string, number>> = payload?.stock || payload?.stockByLocation || {};

  const rows: AllInProductRow[] = products.map((p) => {
    const productKey: string =
      p.productKey || p.product_key || p.key || p.pk || p.id || `${p.code || p.sku || "UNK"}|${p.color_code || p.colorCode || ""}|${p.size || ""}`;

    const code = p.code || p.product_code || p.sku || "";
    const colorCode = p.color_code || p.colorCode || p.color_code2 || "";
    const size = p.size || "";
    const sku = p.sku || (code ? `${code}${colorCode ? "-" + colorCode : ""}${size ? "-" + size : ""}` : productKey);

    const byStore: Record<string, number> = {};
    // 1) ha van stockMap[productKey][storeId]
    if (stockMap?.[productKey] && typeof stockMap[productKey] === "object") {
      for (const s of stores) byStore[s.id] = n(stockMap[productKey][s.id]);
    }
    // 2) ha a product tartalmaz készletet storeId szerint
    if (p.byStore && typeof p.byStore === "object") {
      for (const s of stores) byStore[s.id] = n(p.byStore[s.id]);
    }
    if (p.stock && typeof p.stock === "object") {
      for (const s of stores) byStore[s.id] = n(p.stock[s.id]);
    }

    return {
      id: typeof p.uiId === "number" ? p.uiId : hashToInt(String(productKey)),
      productKey,
      imageUrl: p.imageUrl || p.image_url || p.image || p.image_url1 || undefined,
      brand: p.brand || p.vendor || "—",
      sku,
      name: p.name || p.product_name || "—",
      size,
      colorName: p.color_name || p.colorName || "—",
      colorCode: colorCode || undefined,
      colorHex: p.color_hex || p.colorHex || undefined,
      byStore,
      incomingQty: n(incomingMap?.[productKey] ?? p.incomingQty ?? p.incoming_qty),
      sellPrice: typeof p.sellPrice === "number" ? p.sellPrice : (typeof p.sell_price === "number" ? p.sell_price : undefined),
      buyPrice: typeof p.buyPrice === "number" ? p.buyPrice : (typeof p.buy_price === "number" ? p.buy_price : undefined),
      gender: p.gender || p.sex || undefined,
      category: p.category || undefined,
    };
  });

  return rows;
}

export default function AllInWarehouse() {
  const [q, setQ] = useState("");
  const [showBuyPrice, setShowBuyPrice] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [stores, setStores] = useState<Store[]>([]);
  const [data, setData] = useState<AllInProductRow[]>([]);

  const goView = (id: number) => {
    window.location.hash = `#allinproduct/${id}`;
  };

  const goEdit = (id: number) => {
    window.location.hash = `#allinproductedit/${id}`;
  };

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      // shops: [{id,name}] (auth után)
      const shopsRaw = await apiFetch<any[]>("/api/shops");
      const s: Store[] = (shopsRaw || [])
        .map((x) => ({
          id: String(x?.id ?? x?.key ?? x?.shop_id ?? x?.name ?? ""),
          name: String(x?.name ?? x?.title ?? x?.label ?? x?.id ?? ""),
        }))
        .filter((x) => x.id && x.name);

      // fallback, ha valamiért üres
      const storesFinal: Store[] =
        s.length > 0
          ? s
          : [
              { id: "Csíkszereda", name: "Csíkszereda" },
              { id: "Kézdivásárhely", name: "Kézdivásárhely" },
              { id: "Raktár", name: "Raktár" },
            ];

      setStores(storesFinal);

      // warehouse payload (termék + lokációs készlet + incoming, ha van)
      const payload = await apiFetch<WarehouseResponseAny>("/api/allin/warehouse");
      const rows = adaptWarehousePayload(payload, storesFinal);
      setData(rows);
    } catch (e: any) {
      setErr(e?.message || "Ismeretlen hiba");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doDelete = async (row: AllInProductRow) => {
    // Backend delete + refresh
    if (!row?.productKey) return;
    // eslint-disable-next-line no-alert
    const ok = confirm(`Törlöd? (${row.sku})`);
    if (!ok) return;

    try {
      setErr(null);
      await apiFetch(`/api/allin/products/${encodeURIComponent(row.productKey)}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Nem sikerült törölni.");
    }
  };

  // Szűrők (árakra NINCS szűrés)
  const [fBrand, setFBrand] = useState("");
  const [fSku, setFSku] = useState("");
  const [fName, setFName] = useState("");
  const [fColor, setFColor] = useState("");
  const [fGender, setFGender] = useState("");
  const [fCategory, setFCategory] = useState("");

  const brandOptions = useMemo(() => Array.from(new Set(data.map((x) => x.brand).filter(Boolean))).sort(), [data]);
  const colorOptions = useMemo(() => Array.from(new Set(data.map((x) => x.colorName).filter(Boolean))).sort(), [data]);
  const genderOptions = useMemo(() => Array.from(new Set(data.map((x) => x.gender || "").filter(Boolean))).sort(), [data]);
  const categoryOptions = useMemo(() => Array.from(new Set(data.map((x) => x.category || "").filter(Boolean))).sort(), [data]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sku = fSku.trim().toLowerCase();
    const name = fName.trim().toLowerCase();

    return data.filter((r) => {
      // kereső
      if (s) {
        const ok =
          (r.brand || "").toLowerCase().includes(s) ||
          (r.sku || "").toLowerCase().includes(s) ||
          (r.name || "").toLowerCase().includes(s) ||
          (r.category || "").toLowerCase().includes(s) ||
          (r.gender || "").toLowerCase().includes(s) ||
          (r.size || "").toLowerCase().includes(s) ||
          (r.colorName || "").toLowerCase().includes(s) ||
          (r.colorCode || "").toLowerCase().includes(s);
        if (!ok) return false;
      }

      // szűrők
      if (fBrand && r.brand !== fBrand) return false;
      if (sku && !(r.sku || "").toLowerCase().includes(sku)) return false;
      if (name && !(r.name || "").toLowerCase().includes(name)) return false;
      if (fColor && r.colorName !== fColor) return false;
      if (fGender && (r.gender || "") !== fGender) return false;
      if (fCategory && (r.category || "") !== fCategory) return false;

      return true;
    });
  }, [data, q, fBrand, fSku, fName, fColor, fGender, fCategory]);

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
              <img src={ALLIN_LOGO_URL} alt="ALL IN" className="h-6 w-auto" />
              <div className="text-xs text-white/70">Raktár</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void load()}
              className="h-9 px-3 rounded-xl bg-[#354153] hover:bg-[#3c5069] text-white border border-white/40 inline-flex items-center"
              title="Frissítés"
            >
              <RefreshCw className={"h-4 w-4 mr-2 " + (loading ? "animate-spin" : "")} />
              Frissít
            </button>

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
        {!!err && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {err}
          </div>
        )}

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
          <div className="grid gap-2 items-end" style={{ gridTemplateColumns: "160px 140px 180px 160px 180px 1fr 140px" }}>
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

                  {stores.map((s, i) => (
                    <th
                      key={s.id}
                      className={
                        th +
                        ` w-[115px] text-center bg-white/5` +
                        (i === 0 ? " border-l border-white/10" : "")
                      }
                    >
                      {s.name}
                    </th>
                  ))}

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
                {rows.map((r, idx) => {
                  const storeSum = sumStore(r.byStore || {}, stores);
                  const incoming = n(r.incomingQty);
                  const total = storeSum + incoming;

                  return (
                    <tr key={r.productKey} className="border-t border-slate-200 hover:bg-slate-50">
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

                      <td className={td + " text-slate-700"}>{r.gender || "—"}</td>

                      <td className={td + " text-slate-700"}>{r.category || "—"}</td>

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
                        <span className="inline-flex min-w-[44px] justify-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-teal-600 text-white border border-teal-600">
                          {r.size}
                        </span>
                      </td>

                      {stores.map((s, i) => (
                        <td
                          key={s.id}
                          className={
                            td +
                            " text-center bg-slate-50" +
                            (i === 0 ? " border-l border-slate-200" : "")
                          }
                        >
                          <QtyPill qty={n(r.byStore?.[s.id])} />
                        </td>
                      ))}

                      <td className={td + " text-center"}>
                        <QtyPill qty={incoming} muted />
                      </td>

                      <td className={td + " text-center"}>
                        <span
                          className={
                            "inline-flex w-[62px] justify-center px-2.5 py-1 rounded-md text-[12px] border " +
                            (total === 0
                              ? "bg-white text-slate-400 border-slate-200"
                              : "bg-teal-600 text-white border-teal-600")
                          }
                          title="Lokációk összege + bejövő"
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
                            onClick={() => void doDelete(r)}
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

                {!loading && !rows.length && (
                  <tr>
                    <td colSpan={13 + stores.length} className="px-4 py-10 text-center text-[12px] text-slate-500">
                      Nincs találat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 text-[11px] text-slate-500 border-t border-slate-200">
            Megjegyzés: a “Bejövő” oszlop az Incoming modulból fog jönni és csak az “Összesen” értéket növeli.
            A lokációk készleteit nem módosítja.
          </div>
        </div>
      </div>
    </div>
  );
}
