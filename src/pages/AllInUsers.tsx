import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type ShopId = "csikszereda" | "kezdivasarhely";

type CodeItem = {
  id: string;
  shopId: ShopId;
  name: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  revokedAt: string | null;
  codeHint: string | null;
  code: string | null; // plaintext from server (admin only)
};

function normBase(s: string) {
  return s.replace(/\/+$/, "");
}

function fmt(ts: string | null) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

export default function AllInUsers({ api, actor }: { api?: string; actor?: string }) {
  const apiBase = useMemo(() => {
    const fromProp = typeof api === "string" && api.trim() ? api.trim() : "";
    const fromEnv = (import.meta as any)?.env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE) : "";
    const base = fromProp || fromEnv || "/api";
    return normBase(base);
  }, [api]);

  const [shopId, setShopId] = useState<ShopId>("csikszereda");
  const [name, setName] = useState("");
  const [outText, setOutText] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // list
  const [items, setItems] = useState<CodeItem[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [listErr, setListErr] = useState("");
  const [status, setStatus] = useState<"active" | "used" | "all">("active");

  // custom dropdown (no OS-blue select)
  const [openShop, setOpenShop] = useState(false);
  const [openStatus, setOpenStatus] = useState(false);
  const shopRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);

  const shopLabel = shopId === "csikszereda" ? "Csíkszereda" : "Kézdivásárhely";
  const statusLabel = status === "active" ? "Aktív" : status === "used" ? "Felhasznált" : "Összes";

  const btn = "h-10 px-4 rounded-xl text-white bg-[#354153] hover:bg-[#3c5069] border border-white/30";
  const input =
    "w-full h-11 rounded-xl px-4 border border-white/20 bg-white/5 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white/20";
  const card = "rounded-lg border border-white/20 bg-white/5 shadow-sm px-6 py-8";
  const label = "text-white/80 text-sm";

  const closeDropdownsOnOutside = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as Node;
    if (openShop && shopRef.current && !shopRef.current.contains(t)) setOpenShop(false);
    if (openStatus && statusRef.current && !statusRef.current.contains(t)) setOpenStatus(false);
  };

  const fetchList = async () => {
    setListErr("");
    setListBusy(true);
    try {
      const url = `${apiBase}/admin/codes?status=${encodeURIComponent(status)}&shopId=${encodeURIComponent(shopId)}`;
      const r = await fetch(url, { credentials: "include" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
      setItems(Array.isArray(j?.items) ? j.items : []);
    } catch (e: any) {
      setListErr(String(e?.message || e || "Hiba"));
      setItems([]);
    } finally {
      setListBusy(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, status, apiBase]);

  const createCode = async () => {
    setErr("");
    setOutText("");

    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/admin/codes`, {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ shopId, name: name.trim() })
      });

      const txt = await r.text().catch(() => "");
      if (!r.ok) throw new Error(txt || `HTTP ${r.status}`);

      setOutText(txt);
      await fetchList();
    } catch (e: any) {
      setErr(String(e?.message || e || "Hiba"));
    } finally {
      setBusy(false);
    }
  };

  const deleteCode = async (id: string) => {
    setListErr("");
    try {
      const r = await fetch(`${apiBase}/admin/codes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include"
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
      await fetchList();
    } catch (e: any) {
      setListErr(String(e?.message || e || "Hiba törlésnél"));
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback: nothing, at least the code is visible
    }
  };

  return (
    <div className="min-h-screen w-screen grid place-items-center" style={{ backgroundColor: "#474c59" }} onMouseDown={closeDropdownsOnOutside}>
      <div className="w-full max-w-5xl px-4">
        <div className={card}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-white text-xl font-semibold">FELHASZNÁLÓK</h1>
              <div className="text-white/60 text-sm">Belépőkódok (ADMIN)</div>
            </div>

            <Button className={btn} onClick={() => (window.location.hash = "#home")} type="button">
              Vissza
            </Button>
          </div>

          <div className="mt-6 grid gap-6">
            <div className={label}>
              Belépve mint: <span className="text-white font-semibold">{actor || "ADMIN"}</span>
            </div>

            {/* Filters */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <div className={label}>Üzlet</div>
                <div className="relative" ref={shopRef}>
                  <button
                    type="button"
                    className="w-full h-11 rounded-xl px-4 border border-white/20 bg-white/5 text-white text-left outline-none focus:ring-2 focus:ring-white/20 flex items-center justify-between"
                    onClick={() => setOpenShop((v) => !v)}
                  >
                    <span>{shopLabel}</span>
                    <span className="text-white/60">▾</span>
                  </button>

                  {openShop && (
                    <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/20 bg-[#354153] overflow-hidden shadow-lg">
                      <button
                        type="button"
                        className={"w-full px-4 py-3 text-left text-white hover:bg-white/10 " + (shopId === "csikszereda" ? "bg-white/10" : "")}
                        onClick={() => {
                          setShopId("csikszereda");
                          setOpenShop(false);
                        }}
                      >
                        Csíkszereda
                      </button>
                      <button
                        type="button"
                        className={"w-full px-4 py-3 text-left text-white hover:bg-white/10 " + (shopId === "kezdivasarhely" ? "bg-white/10" : "")}
                        onClick={() => {
                          setShopId("kezdivasarhely");
                          setOpenShop(false);
                        }}
                      >
                        Kézdivásárhely
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <div className={label}>Lista</div>
                <div className="relative" ref={statusRef}>
                  <button
                    type="button"
                    className="w-full h-11 rounded-xl px-4 border border-white/20 bg-white/5 text-white text-left outline-none focus:ring-2 focus:ring-white/20 flex items-center justify-between"
                    onClick={() => setOpenStatus((v) => !v)}
                  >
                    <span>{statusLabel}</span>
                    <span className="text-white/60">▾</span>
                  </button>

                  {openStatus && (
                    <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/20 bg-[#354153] overflow-hidden shadow-lg">
                      <button
                        type="button"
                        className={"w-full px-4 py-3 text-left text-white hover:bg-white/10 " + (status === "active" ? "bg-white/10" : "")}
                        onClick={() => {
                          setStatus("active");
                          setOpenStatus(false);
                        }}
                      >
                        Aktív
                      </button>
                      <button
                        type="button"
                        className={"w-full px-4 py-3 text-left text-white hover:bg-white/10 " + (status === "used" ? "bg-white/10" : "")}
                        onClick={() => {
                          setStatus("used");
                          setOpenStatus(false);
                        }}
                      >
                        Felhasznált
                      </button>
                      <button
                        type="button"
                        className={"w-full px-4 py-3 text-left text-white hover:bg-white/10 " + (status === "all" ? "bg-white/10" : "")}
                        onClick={() => {
                          setStatus("all");
                          setOpenStatus(false);
                        }}
                      >
                        Összes
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Create */}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2 grid gap-2">
                <div className={label}>Dolgozó neve (opcionális)</div>
                <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Pl. Elek" />
              </div>

              <div className="flex gap-3 md:items-end">
                <Button
                  type="button"
                  variant="outline"
                  className={btn + " bg-transparent"}
                  onClick={() => {
                    setName("");
                    setOutText("");
                    setErr("");
                  }}
                >
                  Törlés
                </Button>

                <Button type="button" className={btn + " font-semibold"} disabled={busy} onClick={createCode}>
                  {busy ? "Generálás…" : "Kód generálás"}
                </Button>
              </div>
            </div>

            {err && <div className="text-red-400 text-sm whitespace-pre-wrap">{err}</div>}

            {outText && (
              <div>
                <div className="text-white/80 text-sm mb-2">Generált kód</div>
                <pre className="rounded-xl border border-white/15 bg-black/40 text-green-200 p-4 overflow-auto">{outText}</pre>
              </div>
            )}

            {/* List */}
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <div className="text-white/80 text-sm">Kód lista</div>
                <Button type="button" className={btn} disabled={listBusy} onClick={fetchList}>
                  {listBusy ? "Frissítés…" : "Frissítés"}
                </Button>
              </div>

              {listErr && <div className="text-red-400 text-sm whitespace-pre-wrap">{listErr}</div>}

              <div className="rounded-xl border border-white/15 overflow-hidden">
                <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
                  <div className="col-span-2">Üzlet</div>
                  <div className="col-span-2">Név</div>
                  <div className="col-span-3">Kód</div>
                  <div className="col-span-3">Létrehozva</div>
                  <div className="col-span-2 text-right">Művelet</div>
                </div>

                {items.length === 0 && (
                  <div className="px-3 py-6 text-white/60 text-sm">Nincs találat.</div>
                )}

                {items.map((it) => (
                  <div key={it.id} className="grid grid-cols-12 gap-0 px-3 py-3 border-t border-white/10 items-center">
                    <div className="col-span-2 text-white text-sm">
                      {it.shopId === "csikszereda" ? "Csík" : "Kézdi"}
                      {it.usedAt ? <span className="ml-2 text-white/50">(használt)</span> : null}
                    </div>
                    <div className="col-span-2 text-white/80 text-sm">{it.name || "-"}</div>
                    <div className="col-span-3 text-white text-sm font-mono">
                      {it.code ? it.code : it.codeHint ? `****${it.codeHint}` : "-"}
                      {it.code ? (
                        <button className="ml-2 text-white/60 hover:text-white underline" onClick={() => copy(it.code!)}>
                          másol
                        </button>
                      ) : null}
                    </div>
                    <div className="col-span-3 text-white/70 text-xs">{fmt(it.createdAt)}</div>
                    <div className="col-span-2 text-right">
                      <button
                        className="text-red-300 hover:text-red-200 underline text-sm"
                        onClick={() => {
                          // eslint-disable-next-line no-alert
                          const ok = window.confirm("Biztos törlöd véglegesen?");
                          if (ok) deleteCode(it.id);
                        }}
                      >
                        törlés
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-white/50">
                Megjegyzés: a kódot a rendszer titkosítva tárolja, hogy az ADMIN vissza tudja küldeni. Törlés végleges.
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 text-xs text-white/60">
              API base: <span className="text-white/70">{apiBase}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
