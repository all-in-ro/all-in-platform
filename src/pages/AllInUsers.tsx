import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Clipboard, Trash2 } from "lucide-react";

type Shop = { id: string; name: string };

type CodeItem = {
  id: string;
  shopId: string;
  name: string | null;
  createdAt: string;
  codeHint: string | null;
  code: string | null; // admin only
  revokedAt: string | null;
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

function slugifyId(input: string) {
  const s = (input || "").trim().toLowerCase();
  const map: Record<string, string> = {
    "á": "a", "é": "e", "í": "i", "ó": "o", "ö": "o", "ő": "o", "ú": "u", "ü": "u", "ű": "u",
    "ă": "a", "â": "a", "î": "i", "ș": "s", "ş": "s", "ț": "t", "ţ": "t"
  };
  const replaced = s
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
  return replaced
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32) || "helyseg";
}

export default function AllInUsers({ api, actor }: { api?: string; actor?: string }) {
  const apiBase = useMemo(() => {
    const fromProp = typeof api === "string" && api.trim() ? api.trim() : "";
    const fromEnv = (import.meta as any)?.env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE) : "";
    const base = fromProp || fromEnv || "/api";
    return normBase(base);
  }, [api]);

  // Shops
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopsErr, setShopsErr] = useState("");
  const [shopId, setShopId] = useState<string>("csikszereda");

  const shopName = (id: string) => shops.find((s) => s.id === id)?.name || id;

  // Create code
  const [name, setName] = useState("");
  const [outText, setOutText] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // List
  const [items, setItems] = useState<CodeItem[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [listErr, setListErr] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");

  // Custom dropdowns
  const [openShop, setOpenShop] = useState(false);
  const [openStatus, setOpenStatus] = useState(false);
  const shopRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);

  const statusLabel = status === "active" ? "Aktív" : status === "inactive" ? "Inaktív" : "Összes";

  // Styled confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMsg, setConfirmMsg] = useState("");
  const [confirmAction, setConfirmAction] = useState<null | { kind: "delete" | "toggle" | "delete-shop"; id: string; active?: boolean }>(null);

  // Create place modal
  const [placeOpen, setPlaceOpen] = useState(false);
  useEffect(() => {
    if (!confirmOpen && !placeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmOpen) setConfirmOpen(false);
        if (placeOpen) setPlaceOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, placeOpen]);

  const [placeName, setPlaceName] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [placeErr, setPlaceErr] = useState("");
  const [placeBusy, setPlaceBusy] = useState(false);

  const btn = "h-9 sm:h-10 px-3 sm:px-4 rounded-xl text-white bg-[#354153] hover:bg-[#3c5069] border border-white/30 text-xs sm:text-sm whitespace-nowrap";
  const btnPrimary = btn + " font-semibold !bg-[#208d8b] hover:!bg-[#1b7a78] border-transparent";
  const input =
    "w-full h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white/20";
  const card = "rounded-lg border border-white/30 bg-white/5 shadow-sm px-4 sm:px-6 py-6 sm:py-8";
  const label = "text-white/80 text-sm";

  const closeDropdownsOnOutside = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as Node;
    if (openShop && shopRef.current && !shopRef.current.contains(t)) setOpenShop(false);
    if (openStatus && statusRef.current && !statusRef.current.contains(t)) setOpenStatus(false);
  };

  const fetchShops = async () => {
    setShopsErr("");
    try {
      const r = await fetch(`${apiBase}/admin/shops`, { credentials: "include" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
      const list: Shop[] = Array.isArray(j?.items) ? j.items : [];
      setShops(list);
      if (list.length && !list.some((s) => s.id === shopId)) setShopId(list[0].id);
    } catch (e: any) {
      setShopsErr(String(e?.message || e || "Hiba"));
    }
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
    fetchShops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  useEffect(() => {
    // only fetch list after shops loaded or if the current id is still valid
    if (!shopId) return;
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
      setName("");
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

  const setActive = async (id: string, active: boolean) => {
    setListErr("");
    try {
      const r = await fetch(`${apiBase}/admin/codes/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ active })
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
      await fetchList();
    } catch (e: any) {
      setListErr(String(e?.message || e || "Hiba"));
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const openConfirmDelete = (id: string) => {
    setConfirmTitle("Végleges törlés");
    setConfirmMsg("Biztos törlöd véglegesen? Ez nem visszavonható.");
    setConfirmAction({ kind: "delete", id });
    setConfirmOpen(true);
  };

  const openConfirmToggle = (id: string, currentlyInactive: boolean) => {
    setConfirmTitle(currentlyInactive ? "Aktiválás" : "Inaktiválás");
    setConfirmMsg(currentlyInactive ? "Aktiválod újra a felhasználót?" : "Inaktiválod a felhasználót? Belépni nem fog tudni.");
    setConfirmAction({ kind: "toggle", id, active: Boolean(currentlyInactive) });
    setConfirmOpen(true);
  };

  const runConfirm = async () => {
    const a = confirmAction;
    setConfirmOpen(false);
    setConfirmAction(null);
    if (!a) return;

    if (a.kind === "delete") return deleteCode(a.id);
    if (a.kind === "toggle") return setActive(a.id, Boolean(a.active));
    if (a.kind === "delete-shop") {
      try {
        await fetch(`${apiBase}/admin/shops/${encodeURIComponent(a.id)}`, { method: "DELETE", credentials: "include" });
        await fetchShops();
      } catch {}
      return;
    }
  };

  const openPlaceModal = () => {
    setPlaceErr("");
    setPlaceName("");
    setPlaceId("");
    setPlaceOpen(true);
  };

  const createPlace = async () => {
    setPlaceErr("");
    const n = placeName.trim();
    const id = (placeId.trim() || slugifyId(n)).trim();

    if (!n) {
      setPlaceErr("Adj meg egy helység nevet.");
      return;
    }
    if (!id) {
      setPlaceErr("Adj meg egy azonosítót.");
      return;
    }

    setPlaceBusy(true);
    try {
      const r = await fetch(`${apiBase}/admin/shops`, {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, name: n })
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));

      setPlaceOpen(false);
      await fetchShops();
      setShopId(id);
    } catch (e: any) {
      setPlaceErr(String(e?.message || e || "Hiba"));
    } finally {
      setPlaceBusy(false);
    }
  };

  const shopLabel = shopName(shopId);

  return (
    <div className="min-h-screen w-screen grid place-items-center" style={{ backgroundColor: "#474c59" }} onMouseDown={closeDropdownsOnOutside}>
      <div className="w-full max-w-5xl px-4">
        <div className={card}>
          <div className="flex items-center justify-between gap-3 sm:gap-4 flex-wrap">
            <div>
              <h1 className="text-white text-xl font-semibold">FELHASZNÁLÓK</h1>
              <div className="text-white/60 text-sm">Belépőkódok (ADMIN)</div>
            </div>

            <div className="flex items-center gap-2 flex-nowrap ml-auto">
              <Button type="button" className={btnPrimary} onClick={openPlaceModal}>
                Helység létrehozása / törlése...
              </Button>
              <Button className={btn} onClick={() => (window.location.hash = "#home")} type="button">
                Vissza
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-6">
            <div className={label}>
              Belépve mint: <span className="text-white font-semibold">{actor || "ADMIN"}</span>
            </div>

            {shopsErr ? <div className="text-red-400 text-sm whitespace-pre-wrap">{shopsErr}</div> : null}

            {/* Filters */}
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
              <div className="grid gap-2">
                <div className={label}>Üzlet</div>
                <div className="relative" ref={shopRef}>
                  <button
                    type="button"
                    className="w-full h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white text-left outline-none focus:ring-2 focus:ring-white/20 flex items-center justify-between"
                    onClick={() => setOpenShop((v) => !v)}
                  >
                    <span>{shopLabel}</span>
                    <span className="text-white/60">▾</span>
                  </button>

                  {openShop && (
                    <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/30 bg-[#354153] overflow-hidden shadow-lg max-h-72 overflow-y-auto">
                      {shops.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={"w-full px-4 py-3 text-left text-white hover:bg-white/10 " + (shopId === s.id ? "bg-white/10" : "")}
                          onClick={() => {
                            setShopId(s.id);
                            setOpenShop(false);
                          }}
                        >
                          {s.name}
                        </button>
                      ))}
                      {shops.length === 0 ? <div className="px-4 py-3 text-white/60 text-sm">Nincs helység.</div> : null}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <div className={label}>Lista</div>
                <div className="relative" ref={statusRef}>
                  <button
                    type="button"
                    className="w-full h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white text-left outline-none focus:ring-2 focus:ring-white/20 flex items-center justify-between"
                    onClick={() => setOpenStatus((v) => !v)}
                  >
                    <span>{statusLabel}</span>
                    <span className="text-white/60">▾</span>
                  </button>

                  {openStatus && (
                    <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/30 bg-[#354153] overflow-hidden shadow-lg">
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
                        className={"w-full px-4 py-3 text-left text-white hover:bg-white/10 " + (status === "inactive" ? "bg-white/10" : "")}
                        onClick={() => {
                          setStatus("inactive");
                          setOpenStatus(false);
                        }}
                      >
                        Inaktív
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
            <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
              <div className="md:col-span-2 grid gap-2">
                <div className={label}>Dolgozó neve (opcionális)</div>
                <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Pl. Elek" />
              </div>

              <div className="flex gap-3 md:items-end w-full">
                <Button type="button" className={btnPrimary + " w-full md:w-auto"} disabled={busy} onClick={createCode}>
                  {busy ? "Generálás…" : "Kód generálás"}
                </Button>
              </div>
            </div>

            {err && <div className="text-red-400 text-sm whitespace-pre-wrap">{err}</div>}

            {outText && (
              <div>
                <div className="text-white/80 text-sm mb-2">Generált kód</div>
                <pre className="rounded-xl border border-white/30 bg-black/40 text-green-200 p-4 overflow-auto">{outText}</pre>
              </div>
            )}

            {/* List */}
            <div className="grid gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-white/80 text-sm">Kód lista</div>
                <Button type="button" className={btn} disabled={listBusy} onClick={fetchList}>
                  {listBusy ? "Frissítés…" : "Frissítés"}
                </Button>
              </div>

              {listErr && <div className="text-red-400 text-sm whitespace-pre-wrap">{listErr}</div>}

              <div>
                {/* Mobile cards */}
                <div className="md:hidden grid gap-3">
                  {items.length === 0 && <div className="px-3 py-6 text-white/60 text-sm">Nincs találat.</div>}

                  {items.map((it) => (
                    <div key={it.id} className="rounded-xl border border-white/30 bg-white/5 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-white text-sm font-semibold">{shopName(it.shopId)}</div>
                          <div className="text-white/70 text-xs mt-1">Név: {it.name || "-"}</div>
                          <div className="text-white/70 text-xs mt-1">Létrehozva: {fmt(it.createdAt)}</div>
                        </div>

                        <div className="flex items-center gap-2 flex-nowrap ml-auto">
                          <button
                            type="button"
                            aria-label={it.revokedAt ? "Aktiválás" : "Inaktiválás"}
                            title={it.revokedAt ? "Aktiválás" : "Inaktiválás"}
                            className={
                              it.revokedAt
                                ? "inline-flex items-center justify-center rounded-md px-2 py-1 text-xs bg-[#208d8b] hover:bg-[#1b7a78] text-white"
                                : "inline-flex items-center justify-center rounded-md px-2 py-1 text-xs bg-white/10 hover:bg-white/15 text-white/90"
                            }
                            onClick={() => openConfirmToggle(it.id, Boolean(it.revokedAt))}
                          >
                            {it.revokedAt ? "Aktivál" : "Inaktivál"}
                          </button>

                          <button
                            type="button"
                            aria-label="Végleges törlés"
                            title="Törlés"
                            className="inline-flex items-center justify-center rounded-md p-1 bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => openConfirmDelete(it.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-white font-mono text-sm">{it.code ? it.code : it.codeHint ? `****${it.codeHint}` : "-"}</div>

                        {it.code ? (
                          <button
                            type="button"
                            aria-label="Kód másolása"
                            title="Másolás"
                            className="inline-flex items-center justify-center rounded-md p-1 text-white/70 hover:text-white hover:bg-white/10"
                            onClick={() => copy(it.code!)}
                          >
                            <Clipboard className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block rounded-xl border border-white/30 overflow-hidden">
                  <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
                    <div className="col-span-2">Üzlet</div>
                    <div className="col-span-2">Név</div>
                    <div className="col-span-3">Kód</div>
                    <div className="col-span-3">Létrehozva</div>
                    <div className="col-span-2 text-right">Művelet</div>
                  </div>

                  {items.length === 0 && <div className="px-3 py-6 text-white/60 text-sm">Nincs találat.</div>}

                  {items.map((it) => (
                    <div key={it.id} className="grid grid-cols-12 gap-0 px-3 py-3 border-t border-white/10 items-center">
                      <div className="col-span-2 text-white text-sm">
                        {shopName(it.shopId)}
                        {it.revokedAt ? <span className="ml-2 text-white/50">(inaktív)</span> : null}
                      </div>
                      <div className="col-span-2 text-white/80 text-sm">{it.name || "-"}</div>
                      <div className="col-span-3 text-white text-sm font-mono">
                        {it.code ? it.code : it.codeHint ? `****${it.codeHint}` : "-"}
                        {it.code ? (
                          <button
                            type="button"
                            aria-label="Kód másolása"
                            title="Másolás"
                            className="ml-2 inline-flex items-center justify-center rounded-md p-1 text-white/60 hover:text-white hover:bg-white/10"
                            onClick={() => copy(it.code!)}
                          >
                            <Clipboard className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                      <div className="col-span-3 text-white/70 text-xs">{fmt(it.createdAt)}</div>
                      <div className="col-span-2 text-right">
                        <button
                          type="button"
                          aria-label={it.revokedAt ? "Aktiválás" : "Inaktiválás"}
                          title={it.revokedAt ? "Aktiválás" : "Inaktiválás"}
                          className={
                            it.revokedAt
                              ? "mr-2 inline-flex items-center justify-center rounded-md px-2 py-1 text-xs bg-[#208d8b] hover:bg-[#1b7a78] text-white"
                              : "mr-2 inline-flex items-center justify-center rounded-md px-2 py-1 text-xs bg-white/10 hover:bg-white/15 text-white/90"
                          }
                          onClick={() => openConfirmToggle(it.id, Boolean(it.revokedAt))}
                        >
                          {it.revokedAt ? "Aktivál" : "Inaktivál"}
                        </button>

                        <button
                          type="button"
                          aria-label="Végleges törlés"
                          title="Törlés"
                          className="inline-flex items-center justify-center rounded-md p-1 bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => openConfirmDelete(it.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
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

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-xl border border-white/30 bg-[#354153] p-5 shadow-xl">
            <div className="text-white font-semibold">{confirmTitle}</div>
            <div className="text-white/70 text-sm mt-2 whitespace-pre-wrap">{confirmMsg}</div>
            <div className="mt-5 flex items-center justify-end gap-2">

              <button
                type="button"
                className="h-10 px-4 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10"
                onClick={() => setConfirmOpen(false)}
              >
                Mégse
              </button>
              <button
                type="button"
                className="h-10 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold"
                onClick={runConfirm}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create place modal */}
      {placeOpen && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-xl border border-white/30 bg-[#354153] p-5 shadow-xl">
            <div className="text-white font-semibold">Helység létrehozása</div>
            <div className="text-white/70 text-sm mt-2">Adj meg egy nevet és egy azonosítót (pl. csikszereda).</div>

            <div className="mt-4 grid gap-2">
              <div className="text-white/80 text-sm">Név</div>
              <input
                className="w-full h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white/20"
                value={placeName}
                onChange={(e) => {
                  const v = e.target.value;
                  setPlaceName(v);
                  if (!placeId) setPlaceId(slugifyId(v));
                }}
                placeholder="Pl. Marosvásárhely"
                autoFocus
              />
            </div>

            <div className="mt-3 grid gap-2">
              <div className="text-white/80 text-sm">Azonosító</div>
              <input
                className="w-full h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white/20"
                value={placeId}
                onChange={(e) => setPlaceId(e.target.value)}
                placeholder="pl. marosvasarhely"
              />
            </div>

            {placeErr ? <div className="text-red-300 text-sm mt-3 whitespace-pre-wrap">{placeErr}</div> : null}

            
            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="text-white/80 text-sm mb-2">Meglévő helységek</div>
              <div className="grid gap-2 max-h-48 overflow-y-auto">
                {shops.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-white/30 px-3 py-2">
                    <div className="text-white text-sm">{s.name}</div>
                    <button
                      type="button"
                      title="Helység törlése"
                      className="inline-flex items-center justify-center rounded-md p-1 bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => {
                        setConfirmTitle("Helység törlése");
                        setConfirmMsg(`Biztos törlöd a helységet: ${s.name}? Ez nem visszavonható.`);
                        setConfirmAction({ kind: "delete-shop", id: s.id });
                        setConfirmOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {shops.length === 0 && <div className="text-white/50 text-sm">Nincs helység.</div>}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">

              <button
                type="button"
                className="h-10 px-4 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10"
                onClick={() => setPlaceOpen(false)}
                disabled={placeBusy}
              >
                Mégse
              </button>
              <button
                type="button"
                className="h-10 px-4 rounded-xl bg-[#208d8b] hover:bg-[#1b7a78] text-white font-semibold disabled:opacity-60"
                onClick={createPlace}
                disabled={placeBusy}
              >
                {placeBusy ? "Mentés…" : "Létrehozás"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
