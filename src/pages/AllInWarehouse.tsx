import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, ArrowLeft, Package } from "lucide-react";

/**
 * ALL IN – Raktár (mock UI)
 * - 1400px-re tervezve
 * - Kereső felül + bevételi ár mutat/elrejt
 * - Szűrők KÜLÖN panelben a kereső alatt (nem a táblázatban)
 * - Kompakt, finom betűméretek a terméksorban
 *
 * Később: MOCK → API/DB.
 */

type StoreKey = "Csíkszereda" | "Kézdivásárhely" | "Sepsiszentgyörgy" | "Raktár";

type SizeStock = {
  size: string;
  byStore: Partial<Record<StoreKey, number>>;
};

type AllInProductRow = {
  id: number;
  imageUrl?: string;
  brand: string;
  sku: string;
  name: string;
  colorName: string;
  colorHex?: string;
  sizes: SizeStock[];
  sellPrice: number; // RON
  buyPrice?: number; // RON (elrejthető)
  gender: string;
  category: string;
};

const BG = "#474c59";
const HEADER = "#354153";

const MOCK: AllInProductRow[] = [
  {
    id: 1,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "Malfini",
    sku: "MLF-TSH-001",
    name: "Póló basic (kereknyak)",
    colorName: "Fekete",
    colorHex: "#111827",
    sizes: [
      { size: "S", byStore: { "Csíkszereda": 5, "Kézdivásárhely": 2, "Raktár": 8 } },
      { size: "M", byStore: { "Csíkszereda": 3, "Raktár": 6 } },
      { size: "L", byStore: { "Kézdivásárhely": 1, "Raktár": 4, "Sepsiszentgyörgy": 2 } },
    ],
    sellPrice: 59.9,
    buyPrice: 29.5,
    gender: "Férfi",
    category: "Pólók",
  },
  {
    id: 2,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "Renbut",
    sku: "RNB-BOOT-0138",
    name: "Gyerek csizma téli – MORO",
    colorName: "Barna",
    colorHex: "#7c4a2d",
    sizes: [
      { size: "21/22", byStore: { "Csíkszereda": 0, "Raktár": 1 } },
      { size: "23/24", byStore: { "Kézdivásárhely": 2, "Raktár": 4 } },
      { size: "25/26", byStore: { "Csíkszereda": 1, "Sepsiszentgyörgy": 1, "Raktár": 3 } },
      { size: "27/28", byStore: { "Raktár": 2 } },
    ],
    sellPrice: 197.23,
    buyPrice: 102.0,
    gender: "Gyerek",
    category: "Lábbeli",
  },
  {
    id: 3,
    imageUrl: "https://via.placeholder.com/56x56.png?text=IMG",
    brand: "All In",
    sku: "AI-HOOD-2201",
    name: "Kapucnis pulóver (unisex)",
    colorName: "Kék",
    colorHex: "#2563eb",
    sizes: [
      { size: "S", byStore: { "Csíkszereda": 1, "Kézdivásárhely": 1, "Raktár": 7 } },
      { size: "M", byStore: { "Csíkszereda": 2, "Raktár": 4 } },
      { size: "L", byStore: { "Sepsiszentgyörgy": 2, "Raktár": 3 } },
      { size: "XL", byStore: { "Raktár": 2 } },
    ],
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

function StockCell({ sizes }: { sizes: SizeStock[] }) {
  if (!sizes?.length) return <span className="text-slate-500">—</span>;

  const stores: StoreKey[] = ["Csíkszereda", "Kézdivásárhely", "Sepsiszentgyörgy", "Raktár"];

  return (
    <div className="space-y-1 text-[11px] leading-[1.1]">
      {sizes.map((s) => {
        const entries = stores
          .map((store) => ({ store, qty: s.byStore?.[store] }))
          .filter((x) => x.qty !== undefined) as { store: StoreKey; qty: number }[];

        return (
          <div key={s.size} className="flex gap-[4px]">
            <div className="pt-[1px]">
              <span className="inline-flex min-w-[28px] justify-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200">
                {s.size}
              </span>
            </div>

            <div className="flex-1">
              <div className="grid gap-[1px]">
                {entries.map(({ store, qty }) => {
                  const isZero = qty === 0;
                  return (
                    <div key={store} className="grid grid-cols-[auto_44px] items-center gap-2">
                      <span className={(isZero ? "text-slate-400 text-[11px]" : "text-slate-700 text-[11px]")}>
                        {store}
                      </span>
                      <span
                        className={
                          "inline-flex w-[44px] justify-center self-start px-2 py-0.5 rounded-md text-[11px] border " +
                          (isZero
                            ? "bg-white text-slate-400 border-slate-200"
                            : "bg-[#354153] text-white border-white/25")
                        }
                        title={store}
                      >
                        {qty}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AllInWarehouse() {
  const [q, setQ] = useState("");
  const [showBuyPrice, setShowBuyPrice] = useState(false);

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
          r.gender.toLowerCase().includes(s);
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

  const th = "px-2 py-2 text-left font-medium text-[12px] whitespace-nowrap";
  const td = "px-2 py-2 align-top text-[12px] leading-[1.15]";

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
              placeholder="Keresés: márka, kód, név, kategória, nem…"
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

        {/* Filters (single row, category fits) */}
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
                  <th className={th + " w-[52px]"}>#</th>
                  <th className={th + " w-[70px]"}>Kép</th>
                  <th className={th + " w-[220px]"}>Márka</th>
                  <th className={th + " w-[260px]"}>Termékkód</th>
                  <th className={th + " min-w-[220px]"}>Terméknév</th>
                  <th className={th + " w-[140px]"}>Szín</th>
                  <th className={th + " min-w-[250px]"}>Méretek / üzletek</th>
                  <th className={th.replace("text-left", "text-right") + " w-[120px]"}>Eladási ár</th>
                  <th className={th.replace("text-left", "text-right") + " w-[120px]"}>Bevételi ár</th>
                  <th className={th + " w-[120px]"}>Nem</th>
                  <th className={th + " w-[150px]"}>Kategória</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r, idx) => (
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

                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <ColorDot hex={r.colorHex} />
                        <span className="text-slate-700">{r.colorName}</span>
                      </div>
                    </td>

                    <td className={td}>
                      <StockCell sizes={r.sizes} />
                    </td>

                    <td className={td + " text-right font-semibold text-slate-800"}>{money(r.sellPrice)}</td>

                    <td className={td + " text-right"}>
                      {showBuyPrice ? (
                        <span className="font-semibold text-slate-800">{money(r.buyPrice)}</span>
                      ) : (
                        <span className="text-slate-400 select-none">••••</span>
                      )}
                    </td>

                    <td className={td + " text-slate-700"}>{r.gender}</td>

                    <td className={td + " text-slate-700"}>{r.category}</td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-[12px] text-slate-500">
                      Nincs találat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 text-[11px] text-slate-500 border-t border-slate-200">
            Megjegyzés: a “Méretek / üzletek” cellában most mock adatok vannak. Később ugyanide jön a 3–4 üzlet készlete
            méretenként (S/M/L, 36/37 stb), API/DB-ből.
          </div>
        </div>
      </div>
    </div>
  );
}
