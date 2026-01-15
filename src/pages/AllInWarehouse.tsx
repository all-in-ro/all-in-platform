import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Package, Pencil, Trash2, Plus, Save, X } from "lucide-react";

/**
 * ALL IN – Raktár (API)
 *
 * - Szerver az igazság: termékek + lokációk + lokációs készlet mind backendből jön.
 * - Készletet beállítani (SET) lehet lokációnként.
 * - Incoming/Transfer commit később fogja automatán mozgatni a készletet.
 */

type Store = { id: string; name: string };

type WarehouseItem = {
  product_key: string;
  brand: string | null;
  code: string;
  name: string;
  size: string;
  color_name: string | null;
  color_code: string | null;
  category: string | null;
  image_url: string | null;
  byLocation: Record<string, number>;
};

const HEADER = "#354153";
const BORDER = "#d7dde6";

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function QtyPill({ qty, muted }: { qty: number; muted?: boolean }) {
  const q = Math.max(0, Math.floor(qty || 0));
  const base = muted ? "bg-slate-100 text-slate-600 border-slate-200" : "bg-white text-slate-800 border-slate-200";
  return (
    <span className={`inline-flex min-w-[44px] justify-center px-2 py-1 rounded-md text-sm border ${base}`}>
      {q}
    </span>
  );
}

function apiBase() {
  // same-origin API on Cloudflare Pages / Vercel, fallback to relative
  return "";
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiBase() + url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as T;
}

export default function AllInWarehouse() {
  const [q, setQ] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  // product modal
  const [productOpen, setProductOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const [pBrand, setPBrand] = useState("");
  const [pCode, setPCode] = useState("");
  const [pName, setPName] = useState("");
  const [pSize, setPSize] = useState("");
  const [pColorName, setPColorName] = useState("");
  const [pColorCode, setPColorCode] = useState("");
  const [pCategory, setPCategory] = useState("");
  const [pImageUrl, setPImageUrl] = useState("");

  // stock modal
  const [stockOpen, setStockOpen] = useState(false);
  const [stockKey, setStockKey] = useState<string | null>(null);
  const [stockDraft, setStockDraft] = useState<Record<string, string>>({});
  const [stockSaving, setStockSaving] = useState(false);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((it) => {
      const hay = [
        it.brand || "",
        it.code || "",
        it.name || "",
        it.size || "",
        it.color_name || "",
        it.color_code || "",
        it.category || "",
        it.product_key || ""
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(qq);
    });
  }, [items, q]);

  async function reload() {
    setLoading(true);
    setErr("");
    try {
      const data = await apiJson<{ stores: Store[]; items: WarehouseItem[] }>("/api/allin/warehouse");
      setStores(data.stores || []);
      setItems(data.items || []);
    } catch (e: any) {
      setErr(e?.message || "Hiba");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNewProduct() {
    setEditingKey(null);
    setPBrand("");
    setPCode("");
    setPName("");
    setPSize("");
    setPColorName("");
    setPColorCode("");
    setPCategory("");
    setPImageUrl("");
    setProductOpen(true);
  }

  function openEditProduct(it: WarehouseItem) {
    setEditingKey(it.product_key);
    setPBrand(it.brand || "");
    setPCode(it.code || "");
    setPName(it.name || "");
    setPSize(it.size || "");
    setPColorName(it.color_name || "");
    setPColorCode(it.color_code || "");
    setPCategory(it.category || "");
    setPImageUrl(it.image_url || "");
    setProductOpen(true);
  }

  async function saveProduct() {
    setErr("");
    const payload: any = {
      brand: pBrand.trim(),
      code: pCode.trim(),
      name: pName.trim(),
      size: pSize.trim(),
      color_name: pColorName.trim(),
      color_code: pColorCode.trim(),
      category: pCategory.trim(),
      image_url: pImageUrl.trim()
    };

    try {
      if (!payload.code || !payload.name || !payload.size) {
        setErr("Hiányzik: Kód, Terméknév, Méret");
        return;
      }

      if (editingKey) {
        // product_key from code|color_code|size is immutable in v1 (különben stock kulcs is változna).
        // ezért csak a nem-kulcs mezőket engedjük frissíteni.
        await apiJson("/api/allin/products/" + encodeURIComponent(editingKey), {
          method: "PATCH",
          body: JSON.stringify({
            brand: payload.brand,
            name: payload.name,
            category: payload.category,
            image_url: payload.image_url,
            color_name: payload.color_name
          })
        });
      } else {
        await apiJson("/api/allin/products", { method: "POST", body: JSON.stringify(payload) });
      }

      setProductOpen(false);
      await reload();
    } catch (e: any) {
      setErr(e?.message || "Mentési hiba");
    }
  }

  async function deleteProduct(product_key: string) {
    // eslint-disable-next-line no-alert
    if (!confirm("Biztos törlöd? (A készlet sorok is törlődnek)")) return;
    setErr("");
    try {
      await apiJson("/api/allin/products/" + encodeURIComponent(product_key), { method: "DELETE" });
      await reload();
    } catch (e: any) {
      setErr(e?.message || "Törlési hiba");
    }
  }

  function openStock(it: WarehouseItem) {
    setStockKey(it.product_key);
    const next: Record<string, string> = {};
    for (const s of stores) next[s.id] = String(n(it.byLocation?.[s.id]));
    setStockDraft(next);
    setStockOpen(true);
  }

  async function saveStock() {
    if (!stockKey) return;
    setStockSaving(true);
    setErr("");
    try {
      for (const s of stores) {
        const raw = stockDraft[s.id];
        const qty = Math.max(0, Math.floor(Number(raw)));
        if (!Number.isFinite(qty)) continue;

        await apiJson("/api/allin/stock/set", {
          method: "POST",
          body: JSON.stringify({
            location_id: s.id,
            product_key: stockKey,
            qty,
            reason: "warehouse_set"
          })
        });
      }
      setStockOpen(false);
      await reload();
    } catch (e: any) {
      setErr(e?.message || "Készlet mentési hiba");
    } finally {
      setStockSaving(false);
    }
  }

  const th = "text-left text-[12px] font-semibold tracking-wide px-3 py-2 border-b border-slate-200 bg-slate-50";
  const td = "px-3 py-2 border-b border-slate-100 text-[13px] text-slate-700";

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-0 z-40" style={{ backgroundColor: HEADER }}>
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => (window.location.hash = "#home")}
            className="h-9 w-9 rounded-md grid place-items-center bg-white/10 hover:bg-white/15 text-white"
            title="Vissza"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 text-white">
            <Package className="h-5 w-5" />
            <div className="text-[14px] tracking-wide">RAKTÁR</div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Keresés: kód, név, szín, méret, kategória…"
              className="h-9 w-[320px] bg-white"
            />
            <Button onClick={openNewProduct} className="h-9 px-3 bg-teal-600 hover:bg-teal-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Új termék
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-4">
        {err ? (
          <div className="mb-3 px-3 py-2 rounded-md border text-sm bg-rose-50 border-rose-200 text-rose-700">{err}</div>
        ) : null}

        <div className="rounded-lg border" style={{ borderColor: BORDER }}>
          <div className="overflow-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={th + " w-[120px]"}>Márka</th>
                  <th className={th + " w-[120px]"}>Kód</th>
                  <th className={th}>Termék</th>
                  <th className={th + " w-[84px] text-center"}>Méret</th>
                  <th className={th + " w-[160px]"}>Szín</th>
                  <th className={th + " w-[140px]"}>Kategória</th>

                  {stores.map((s) => (
                    <th key={s.id} className={th + " w-[120px] text-center"}>
                      {s.name}
                    </th>
                  ))}

                  <th className={th + " w-[96px] text-center"}>Összesen</th>

                  <th className={th + " w-[150px] text-center sticky right-0 z-30"} style={{ backgroundColor: "#f8fafc" }}>
                    Műveletek
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className={td} colSpan={7 + stores.length}>
                      Betöltés…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className={td} colSpan={7 + stores.length}>
                      Nincs találat.
                    </td>
                  </tr>
                ) : (
                  filtered.map((it) => {
                    const total = stores.reduce((sum, s) => sum + n(it.byLocation?.[s.id]), 0);
                    return (
                      <tr key={it.product_key} className="hover:bg-slate-50">
                        <td className={td}>{it.brand || "—"}</td>
                        <td className={td}>
                          <div className="leading-[1.1]">
                            <div className="text-slate-800">{it.code}</div>
                            <div className="text-[10px] text-slate-400">{it.product_key}</div>
                          </div>
                        </td>
                        <td className={td}>{it.name}</td>
                        <td className={td + " text-center"}>
                          <span className="inline-flex min-w-[44px] justify-center px-2 py-1 rounded-md text-sm border bg-teal-600 text-white border-teal-600">
                            {it.size}
                          </span>
                        </td>
                        <td className={td}>
                          <div className="leading-[1.1]">
                            <div className="text-slate-700">{it.color_name || "—"}</div>
                            <div className="text-[10px] text-slate-400">{it.color_code || "—"}</div>
                          </div>
                        </td>
                        <td className={td}>{it.category || "—"}</td>

                        {stores.map((s) => (
                          <td key={s.id} className={td + " text-center bg-slate-50"}>
                            <QtyPill qty={n(it.byLocation?.[s.id])} />
                          </td>
                        ))}

                        <td className={td + " text-center"}>
                          <QtyPill qty={total} />
                        </td>

                        <td className={td + " text-center sticky right-0 z-30 bg-white"}>
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => openStock(it)}
                              className="h-7 px-2 rounded-md inline-flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white"
                              title="Készlet beállítás"
                            >
                              <Save className="h-3.5 w-3.5" />
                              Készlet
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditProduct(it)}
                              className="h-7 w-7 rounded-md grid place-items-center bg-slate-700 hover:bg-slate-800 text-white"
                              title="Szerkesztés"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteProduct(it.product_key)}
                              className="h-7 w-7 rounded-md grid place-items-center bg-rose-600 hover:bg-rose-700 text-white"
                              title="Törlés"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Product modal */}
      {productOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-[720px] rounded-lg bg-white border" style={{ borderColor: BORDER }}>
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: BORDER }}>
              <div className="font-semibold text-slate-800">{editingKey ? "Termék szerkesztése" : "Új termék"}</div>
              <button type="button" onClick={() => setProductOpen(false)} className="ml-auto h-8 w-8 rounded-md grid place-items-center hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500 mb-1">Márka</div>
                <Input value={pBrand} onChange={(e) => setPBrand(e.target.value)} className="h-9" />
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-1">Kategória</div>
                <Input value={pCategory} onChange={(e) => setPCategory(e.target.value)} className="h-9" />
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-1">Kód *</div>
                <Input value={pCode} onChange={(e) => setPCode(e.target.value)} className="h-9" disabled={!!editingKey} />
                {editingKey ? <div className="text-[11px] text-slate-400 mt-1">A kód + színkód + méret a kulcs része (v1-ben nem módosítható).</div> : null}
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-1">Méret *</div>
                <Input value={pSize} onChange={(e) => setPSize(e.target.value)} className="h-9" disabled={!!editingKey} />
              </div>

              <div className="col-span-2">
                <div className="text-xs text-slate-500 mb-1">Terméknév *</div>
                <Input value={pName} onChange={(e) => setPName(e.target.value)} className="h-9" />
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-1">Szín megnevezés</div>
                <Input value={pColorName} onChange={(e) => setPColorName(e.target.value)} className="h-9" />
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-1">Színkód</div>
                <Input value={pColorCode} onChange={(e) => setPColorCode(e.target.value)} className="h-9" disabled={!!editingKey} />
              </div>

              <div className="col-span-2">
                <div className="text-xs text-slate-500 mb-1">Kép URL</div>
                <Input value={pImageUrl} onChange={(e) => setPImageUrl(e.target.value)} className="h-9" />
              </div>
            </div>

            <div className="px-4 py-3 border-t flex items-center gap-2 justify-end" style={{ borderColor: BORDER }}>
              <Button variant="outline" onClick={() => setProductOpen(false)} className="h-9">
                Mégse
              </Button>
              <Button onClick={saveProduct} className="h-9 bg-teal-600 hover:bg-teal-700 text-white">
                Mentés
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Stock modal */}
      {stockOpen && stockKey ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-[640px] rounded-lg bg-white border" style={{ borderColor: BORDER }}>
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: BORDER }}>
              <div className="font-semibold text-slate-800">Készlet beállítás</div>
              <div className="text-xs text-slate-400">{stockKey}</div>
              <button type="button" onClick={() => setStockOpen(false)} className="ml-auto h-8 w-8 rounded-md grid place-items-center hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {stores.map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="w-[160px] text-sm text-slate-700">{s.name}</div>
                  <Input
                    value={stockDraft[s.id] ?? "0"}
                    onChange={(e) => setStockDraft((prev) => ({ ...prev, [s.id]: e.target.value }))}
                    className="h-9 w-[160px] text-right"
                    inputMode="numeric"
                  />
                </div>
              ))}
              <div className="text-[11px] text-slate-400">Mentéskor lokációnként beállítjuk a készletet (SET). Negatív érték nem engedett.</div>
            </div>

            <div className="px-4 py-3 border-t flex items-center gap-2 justify-end" style={{ borderColor: BORDER }}>
              <Button variant="outline" onClick={() => setStockOpen(false)} className="h-9">
                Mégse
              </Button>
              <Button disabled={stockSaving} onClick={saveStock} className="h-9 bg-teal-600 hover:bg-teal-700 text-white">
                Mentés
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
