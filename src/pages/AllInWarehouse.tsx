import React, { useMemo, useState } from "react";
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
  id: number;
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

const STORES: StoreKey[] = ["Csíkszereda", "Kézdivásárhely", "Raktár"];

// MOCK: ugyanaz a termék több sorban, külön méret + külön SKU
const MOCK: AllInProductRow[] = [
  {
    id: 101,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "Malfini",
    sku: "MLF-TSH-001-S",
    name: "Póló basic (kereknyak)",
    size: "S",
    colorName: "Fekete",
    colorCode: "001",
    colorHex: "#111827",
    byStore: { "Csíkszereda": 5, "Kézdivásárhely": 2, Raktár: 8 },
    incomingQty: 6,
    sellPrice: 59.9,
    buyPrice: 29.5,
    gender: "Férfi",
    category: "Pólók",
  },
  {
    id: 102,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "Malfini",
    sku: "MLF-TSH-001-M",
    name: "Póló basic (kereknyak)",
    size: "M",
    colorName: "Fekete",
    colorCode: "001",
    colorHex: "#111827",
    byStore: { "Csíkszereda": 3, Raktár: 6 },
    incomingQty: 0,
    sellPrice: 59.9,
    buyPrice: 29.5,
    gender: "Férfi",
    category: "Pólók",
  },
  {
    id: 103,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "Malfini",
    sku: "MLF-TSH-001-L",
    name: "Póló basic (kereknyak)",
    size: "L",
    colorName: "Fekete",
    colorCode: "001",
    colorHex: "#111827",
    byStore: { "Kézdivásárhely": 1, Raktár: 4, "Sepsiszentgyörgy": 2 },
    incomingQty: 3,
    sellPrice: 59.9,
    buyPrice: 29.5,
    gender: "Férfi",
    category: "Pólók",
  },

  {
    id: 201,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "Renbut",
    sku: "RNB-BOOT-0138-21-22",
    name: "Gyerek csizma téli – MORO",
    size: "21/22",
    colorName: "Barna",
    colorCode: "S10",
    colorHex: "#7c4a2d",
    byStore: { "Csíkszereda": 0, Raktár: 1 },
    incomingQty: 8,
    sellPrice: 197.23,
    buyPrice: 102.0,
    gender: "Gyerek",
    category: "Lábbeli",
  },
  {
    id: 202,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "Renbut",
    sku: "RNB-BOOT-0138-23-24",
    name: "Gyerek csizma téli – MORO",
    size: "23/24",
    colorName: "Barna",
    colorCode: "S10",
    colorHex: "#7c4a2d",
    byStore: { "Kézdivásárhely": 2, Raktár: 4 },
    incomingQty: 0,
    sellPrice: 197.23,
    buyPrice: 102.0,
    gender: "Gyerek",
    category: "Lábbeli",
  },
  {
    id: 203,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "Renbut",
    sku: "RNB-BOOT-0138-25-26",
    name: "Gyerek csizma téli – MORO",
    size: "25/26",
    colorName: "Barna",
    colorCode: "S10",
    colorHex: "#7c4a2d",
    byStore: { "Csíkszereda": 1, "Sepsiszentgyörgy": 1, Raktár: 3 },
    incomingQty: 2,
    sellPrice: 197.23,
    buyPrice: 102.0,
    gender: "Gyerek",
    category: "Lábbeli",
  },
  {
    id: 204,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "Renbut",
    sku: "RNB-BOOT-0138-27-28",
    name: "Gyerek csizma téli – MORO",
    size: "27/28",
    colorName: "Barna",
    colorCode: "S10",
    colorHex: "#7c4a2d",
    byStore: { Raktár: 2 },
    incomingQty: 0,
    sellPrice: 197.23,
    buyPrice: 102.0,
    gender: "Gyerek",
    category: "Lábbeli",
  },

  {
    id: 301,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "All In",
    sku: "AI-HOOD-2201-S",
    name: "Kapucnis pulóver (unisex)",
    size: "S",
    colorName: "Kék",
    colorCode: "B07",
    colorHex: "#2563eb",
    byStore: { "Csíkszereda": 1, "Kézdivásárhely": 1, Raktár: 7 },
    incomingQty: 10,
    sellPrice: 149.0,
    buyPrice: 88.0,
    gender: "Unisex",
    category: "Pulóverek",
  },
  {
    id: 302,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "All In",
    sku: "AI-HOOD-2201-M",
    name: "Kapucnis pulóver (unisex)",
    size: "M",
    colorName: "Kék",
    colorCode: "B07",
    colorHex: "#2563eb",
    byStore: { "Csíkszereda": 2, Raktár: 4 },
    incomingQty: 0,
    sellPrice: 149.0,
    buyPrice: 88.0,
    gender: "Unisex",
    category: "Pulóverek",
  },
  {
    id: 303,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "All In",
    sku: "AI-HOOD-2201-L",
    name: "Kapucnis pulóver (unisex)",
    size: "L",
    colorName: "Kék",
    colorCode: "B07",
    colorHex: "#2563eb",
    byStore: { "Sepsiszentgyörgy": 2, Raktár: 3 },
    incomingQty: 1,
    sellPrice: 149.0,
    buyPrice: 88.0,
    gender: "Unisex",
    category: "Pulóverek",
  },
  {
    id: 304,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "All In",
    sku: "AI-HOOD-2201-XL",
    name: "Kapucnis pulóver (unisex)",
    size: "XL",
    colorName: "Kék",
    colorCode: "B07",
    colorHex: "#2563eb",
    byStore: { Raktár: 2 },
    incomingQty: 0,
    sellPrice: 149.0,
    buyPrice: 88.0,
    gender: "Unisex",
    category: "Pulóverek",
  },
];

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
          : "bg-[#354153] text-white border-white/25")
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

  const goView = (id: number) => {
    window.location.hash = `#allinproduct/${id}`;
  };

  const goEdit = (id: number) => {
    window.location.hash = `#allinproductedit/${id}`;
  };

  const doDelete = (id: number) => {
    // Mock: később API delete + refresh
    // Itt csak jelzünk, hogy van gomb.
    // eslint-disable-next-line no-alert
    alert(`Törlés (mock): ${id}`);
  };

  // Szűrők (árakra NINCS szűrés)
  const [fBrand, setFBrand] = useState("");
  const [fSku, setFSku] = useState("");
  const [fName, setFName] = useState("");
  const [fColor, setFColor] = useState("");
  const [fGender, setFGender] = useState("");
  const [fCategory, setFCategory] = useState("");

  const brandOptions = useMemo(() => Array.from(new Set(MOCK.map((x) => x.brand))).sort(), []);
  const colorOptions = useMemo(() => Array.from(new Set(MOCK.map((x) => x.colorName))).sort(), []);
  const genderOptions = useMemo(() => Array.from(new Set(MOCK.map((x) => x.gender))).sort(), []);
  const categoryOptions = useMemo(() => Array.from(new Set(MOCK.map((x) => x.category))).sort(), []);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sku = fSku.trim().toLowerCase();
    const name = fName.trim().toLowerCase();

    return MOCK.filter((r) => {
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
  }, [q, fBrand, fSku, fName, fColor, fGender, fCategory]);

  const th = "px-1.5 py-1.5 text-left font-normal text-[11px] whitespace-nowrap";
  const td = "px-1.5 py-1.5 align-top text-[11px] leading-[1.15]";

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG }}>
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-white/20" style={{ backgroundColor: HEADER }}>
        <div className="mx-auto w-full max-w-[1400px] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <div className="h-9 w-9 rounded-xl grid place-items-center border border-white/25 bg-white/5">
              <Package className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-semibold">ALL IN</div>
              <div className="text-xs text-white/70">Raktár</div>
            </div>
          </div>

          <Button
            variant="outline"
            className="rounded-xl px-4 text-white bg-[#354153] hover:bg-[#3c5069] border border-white/40 h-9"
            onClick={() => (window.location.hash = "#allin")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Vissza
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1400px] px-4 py-4 space-y-3">
        {/* Search + toggle */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[280px]">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Keresés: márka, kód, név, méret, szín, kategória, nem…"
              className="h-9 text-[12px]"
            />
          </div>

          <Button
            type="button"
            className="rounded-xl px-4 text-white bg-[#354153] hover:bg-[#3c5069] border border-white/40 h-9"
            onClick={() => setShowBuyPrice((v) => !v)}
            title="Bevételi ár mutatása/elrejtése"
          >
            {showBuyPrice ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {showBuyPrice ? "Bevételi ár elrejtése" : "Bevételi ár mutatása"}
          </Button>
        </div>

        {/* Filters */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-3">
          <div
            className="grid gap-2 items-end"
            style={{ gridTemplateColumns: "160px 160px 1fr 160px 160px 220px 160px" }}
          >
            <div>
              <div className="text-[11px] text-slate-500 mb-1">Márka</div>
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
              <div className="text-[11px] text-slate-500 mb-1">Szín</div>
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
              <div className="text-[11px] text-slate-500 mb-1">Terméknév</div>
              <Input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="szűrő…"
                className="h-9 text-[12px]"
              />
            </div>

            <div>
              <div className="text-[11px] text-slate-500 mb-1">Termékkód</div>
              <Input
                value={fSku}
                onChange={(e) => setFSku(e.target.value)}
                placeholder="szűrő…"
                className="h-9 text-[12px]"
              />
            </div>

            <div>
              <div className="text-[11px] text-slate-500 mb-1">Nem</div>
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
              <div className="text-[11px] text-slate-500 mb-1">Kategória</div>
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

            <div className="flex items-end justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setFBrand("");
                  setFSku("");
                  setFName("");
                  setFColor("");
                  setFGender("");
                  setFCategory("");
                }}
                title="Szűrők törlése"
              >
                Szűrők törlése
              </Button>
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

                  <th className={th + " w-[105px] border-l-2 border-white/20 text-center"}>Csíkszereda</th>
                  <th className={th + " w-[115px] text-center"}>Kézdivásárhely</th>
                                    <th className={th + " w-[82px] text-center"}>Raktár</th>

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
                        <span className="inline-flex min-w-[44px] justify-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                          {r.size}
                        </span>
                      </td>

                      <td className={td + " text-center border-l-2 border-slate-200"}>
                        <QtyPill qty={n(r.byStore?.["Csíkszereda"])} />
                      </td>
                      <td className={td + " text-center"}>
                        <QtyPill qty={n(r.byStore?.["Kézdivásárhely"])} />
                      </td>
                                            <td className={td + " text-center"}>
                        <QtyPill qty={n(r.byStore?.["Raktár"])} />
                      </td>

                      <td className={td + " text-center"}>
                        <QtyPill qty={incoming} muted />
                      </td>

                      <td className={td + " text-center"}>
                        <span
                          className={
                            "inline-flex w-[62px] justify-center px-2.5 py-1 rounded-md text-[12px] border " +
                            (total === 0 ? "bg-white text-slate-400 border-slate-200" : "bg-[#354153] text-white border-white/25")
                          }
                          title="Üzletek összege + bejövő"
                        >
                          {total}
                        </span>
                      </td>

                      <td className={td + " text-right font-semibold text-slate-800"}>{money(r.sellPrice)}</td>

                      <td className={td + " text-right"}>
                        {showBuyPrice ? (
                          <span className="font-semibold text-slate-800">{money(r.buyPrice)}</span>
                        ) : (
                          <span className="text-slate-400 select-none">••••</span>
                        )}
                      </td>

                      <td className={td + " text-center sticky right-0 bg-white z-10"}>
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => goView(r.id)}
                            className="h-8 w-8 rounded-lg grid place-items-center bg-teal-600 hover:bg-teal-700 text-white"
                            title="Megtekintés"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => goEdit(r.id)}
                            className="h-8 w-8 rounded-lg grid place-items-center bg-slate-700 hover:bg-slate-800 text-white"
                            title="Szerkesztés"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => doDelete(r.id)}
                            className="h-8 w-8 rounded-lg grid place-items-center bg-red-600 hover:bg-red-700 text-white"
                            title="Törlés"
                          >
                            <Trash2 className="h-4 w-4" />
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
