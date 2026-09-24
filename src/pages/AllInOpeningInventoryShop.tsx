import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Barcode,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Minus,
  PackageSearch,
  Plus,
  RefreshCw,
  Store,
  XCircle,
} from "lucide-react";
import {
  apiAifOpeningInventoryActive,
  apiAifOpeningInventoryScan,
  apiAifOpeningInventorySetLine,
  type AifOpeningInventoryActiveResponse,
  type AifOpeningInventoryShopLine,
} from "../lib/aif/api";

type Props = {
  actor?: string;
  role?: "admin" | "shop";
  shopId?: string;
  locationCode?: string;
  locationName?: string;
};

type Notice = { tone: "success" | "error" | "info"; text: string };

const LOCATION_STORAGE_KEY = "allin:opening-inventory:location";

function cleanLocation(explicit?: string) {
  if (explicit) return explicit;
  try { return window.sessionStorage.getItem(LOCATION_STORAGE_KEY) || ""; } catch { return ""; }
}

function productMeta(line: AifOpeningInventoryShopLine) {
  return [line.product.brandName, line.product.colorName, line.product.size, line.product.productCode]
    .filter(Boolean)
    .join(" • ");
}

function backHash(role: Props["role"], shopId?: string) {
  if (role === "admin") return "openinginventoryadmin";
  if (shopId === "kezdivasarhely") return "magazintargusale";
  if (shopId === "csikszereda") return "magazinciucsale";
  return "shopsale";
}

export default function AllInOpeningInventoryShop({
  actor = "Üzleti felhasználó",
  role = "shop",
  shopId,
  locationCode,
  locationName,
}: Props) {
  const location = useMemo(() => cleanLocation(locationCode), [locationCode]);
  const [data, setData] = useState<AifOpeningInventoryActiveResponse | null>(null);
  const [scanValue, setScanValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [editingLineId, setEditingLineId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lastLine, setLastLine] = useState<AifOpeningInventoryShopLine | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const scanInFlightRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiAifOpeningInventoryActive(location || undefined);
      setData(response);
      if (!silent) setNotice(null);
    } catch (error) {
      if (!silent) setNotice({ tone: "error", text: error instanceof Error ? error.message : "A nyitó leltár nem tölthető be." });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [location]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!data?.active || !data.session?.editable || scanning) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [data?.active, data?.session?.editable, scanning]);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
    };
  }, []);

  const recent = data?.recent || [];
  const session = data?.session || null;
  const editable = Boolean(session?.editable);

  function updateRecent(line: AifOpeningInventoryShopLine) {
    setLastLine(line);
    setData((current) => current ? {
      ...current,
      active: true,
      progress: {
        countedLines: Math.max(current.progress?.countedLines || 0, (current.recent || []).some((item) => item.id === line.id) ? current.progress?.countedLines || 0 : (current.progress?.countedLines || 0) + 1),
        countedQty: (current.progress?.countedQty || 0) + 1,
      },
      recent: [line, ...(current.recent || []).filter((item) => item.id !== line.id)].slice(0, 60),
    } : current);
  }

  async function scan(raw = scanValue) {
    const code = String(raw || "").replace(/[\r\n\t]+/g, "").trim();
    if (!code || scanInFlightRef.current || !editable) return;
    scanInFlightRef.current = true;
    setScanning(true);
    setNotice(null);
    try {
      const response = await apiAifOpeningInventoryScan({ location: location || undefined, code, qty: 1 });
      setScanValue("");
      updateRecent(response.line);
      setNotice({ tone: "success", text: `${response.line.product.title}: ${response.line.countedQty} db talált.` });
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } catch (caught) {
      const error = caught as Error & { payload?: any };
      const payload = error?.payload;
      setScanValue("");
      setNotice({
        tone: payload?.unknownRecorded ? "info" : "error",
        text: error instanceof Error ? error.message : "A beolvasás nem sikerült.",
      });
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } finally {
      scanInFlightRef.current = false;
      setScanning(false);
    }
  }

  function changeScanValue(value: string) {
    setScanValue(value);
    if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
    const code = value.trim();
    if (!editable || code.length < 8 || /\s/.test(code)) return;
    scanTimerRef.current = window.setTimeout(() => {
      scanTimerRef.current = null;
      void scan(code);
    }, 180);
  }

  async function setLineQty(line: AifOpeningInventoryShopLine, nextQty: number) {
    if (!editable || editingLineId) return;
    const safe = Math.max(0, Math.trunc(nextQty));
    setEditingLineId(line.id);
    try {
      const response = await apiAifOpeningInventorySetLine(line.id, { location: location || undefined, countedQty: safe });
      setData((current) => current ? {
        ...current,
        recent: [response.line, ...(current.recent || []).filter((item) => item.id !== response.line.id)].slice(0, 60),
      } : current);
      setLastLine(response.line);
      setNotice({ tone: "success", text: `${response.line.product.title}: ${response.line.countedQty} db.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "A mennyiség módosítása nem sikerült." });
    } finally {
      setEditingLineId("");
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#4b5362] px-4 text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-white/14 bg-[#303a4c] px-5 py-4 text-sm text-white/72">
          <Loader2 className="animate-spin" size={18} /> Nyitó leltár betöltése…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#4b5362] px-3 py-3 text-white sm:px-4 sm:py-4">
      <div className="mx-auto max-w-[1180px] space-y-3">
        <header className="rounded-[22px] border border-white/16 bg-[#303a4c] px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.24)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#8ce7e2]/38 bg-[#108D8B]/20 text-[#d7fffd]">
              <ClipboardCheck size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/45">ALL IN • nyitó leltár</p>
              <h1 className="mt-1 text-xl font-normal sm:text-2xl">{session?.title || "Leltározás"}</h1>
              <p className="mt-1 text-xs text-white/55">{session?.location?.name || locationName || location || "Üzlet"} • {actor}</p>
            </div>
            <button
              type="button"
              onClick={() => { window.location.hash = backHash(role, shopId); }}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/18 bg-[#354153] px-4 text-sm text-white hover:bg-[#405066]"
            >
              <ArrowLeft size={17} /> Vissza
            </button>
          </div>
        </header>

        {!data?.active || !session ? (
          <section className="rounded-[22px] border border-white/16 bg-[#354153] p-6 text-center shadow-lg">
            <XCircle className="mx-auto text-white/36" size={44} />
            <h2 className="mt-3 text-xl font-normal">Nincs aktív nyitó leltár</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/55">
              A főnök még nem indított leltárt ehhez az üzlethez. Amikor elindítja, ezen az oldalon azonnal lehet csippogtatni a termékeket.
            </p>
            <button type="button" onClick={() => void load()} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl border border-[#8ce7e2]/42 bg-[#108D8B] px-4 text-sm text-white hover:bg-[#149b98]">
              <RefreshCw size={16} /> Frissítés
            </button>
          </section>
        ) : (
          <>
            <section className={`rounded-[22px] border p-4 shadow-lg ${editable ? "border-[#8ce7e2]/36 bg-[#354153]" : "border-amber-200/30 bg-[#4a4450]"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.13em] text-white/45">Állapot</p>
                  <p className="mt-1 text-base text-white">{editable ? "Beolvasás folyamatban • eladás mehet" : "Beolvasás lezárva • eladás mehet tovább"}</p>
                </div>
                <div className="flex gap-2 text-center">
                  <div className="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.1em] text-white/40">Talált tétel</div>
                    <div className="mt-1 text-xl">{data.progress?.countedLines || 0}</div>
                  </div>
                  <div className="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.1em] text-white/40">Talált db</div>
                    <div className="mt-1 text-xl">{data.progress?.countedQty || 0}</div>
                  </div>
                </div>
              </div>

              {editable ? (
                <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void scan(); }}>
                  <label className="relative block">
                    <Barcode className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8ee6e2]" size={25} />
                    <input
                      ref={inputRef}
                      autoFocus
                      value={scanValue}
                      onChange={(event) => changeScanValue(event.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Csippantsd be a termék vonalkódját…"
                      className="h-20 w-full rounded-2xl border-2 border-[#8ce7e2]/35 bg-[#263244] pl-14 pr-4 text-xl text-white outline-none placeholder:text-white/32 focus:border-[#8ce7e2] focus:ring-4 focus:ring-[#108D8B]/18"
                    />
                    {scanning ? <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-[#8ee6e2]" size={22} /> : null}
                  </label>
                </form>
              ) : null}

              {notice ? (
                <div className={`mt-3 rounded-xl border px-3 py-2.5 text-sm ${notice.tone === "success" ? "border-[#8ce7e2]/36 bg-[#108D8B]/18 text-[#d7fffd]" : notice.tone === "info" ? "border-amber-200/30 bg-amber-500/10 text-amber-50" : "border-red-300/35 bg-red-600/20 text-red-50"}`}>
                  {notice.text}
                </div>
              ) : null}
            </section>

            {lastLine ? (
              <section className="rounded-[22px] border border-[#8ce7e2]/38 bg-[#2f5056] p-4 shadow-lg">
                <div className="grid gap-3 sm:grid-cols-[88px_1fr_auto] sm:items-center">
                  <div className="grid h-[88px] w-[88px] place-items-center overflow-hidden rounded-2xl border border-white/16 bg-white">
                    {lastLine.product.imageUrl ? <img src={lastLine.product.imageUrl} alt="" className="h-full w-full object-contain p-1" /> : <PackageSearch className="text-slate-500" size={30} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.13em] text-[#cffffd]/65">Utolsó találat</p>
                    <h2 className="mt-1 truncate text-lg font-normal">{lastLine.product.title}</h2>
                    <p className="mt-1 truncate text-xs text-white/58">{productMeta(lastLine) || "–"}</p>
                  </div>
                  <div className="rounded-2xl border border-white/18 bg-white/[0.08] px-5 py-3 text-center">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Talált</div>
                    <div className="mt-1 text-3xl">{lastLine.countedQty} <span className="text-sm text-white/55">db</span></div>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="overflow-hidden rounded-[22px] border border-white/16 bg-[#354153] shadow-lg">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Ezen a leltáron</p>
                  <h2 className="mt-1 text-lg font-normal">Legutóbb beolvasott termékek</h2>
                </div>
                <button type="button" onClick={() => void load()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] text-white hover:bg-white/[0.1]" aria-label="Frissítés">
                  <RefreshCw size={16} />
                </button>
              </div>
              <div className="divide-y divide-white/8">
                {recent.length ? recent.map((line) => (
                  <div key={line.id} className="grid gap-3 px-3 py-3 sm:grid-cols-[56px_1fr_auto] sm:items-center">
                    <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl border border-white/14 bg-white">
                      {line.product.imageUrl ? <img src={line.product.imageUrl} alt="" className="h-full w-full object-contain p-1" /> : <PackageSearch className="text-slate-500" size={20} />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm">{line.product.title}</p>
                      <p className="mt-1 truncate text-[11px] text-white/48">{productMeta(line) || "–"}</p>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {editable ? (
                        <button type="button" disabled={editingLineId === line.id || line.countedQty <= 0} onClick={() => void setLineQty(line, line.countedQty - 1)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-[#283446] text-white hover:bg-white/[0.08] disabled:opacity-40"><Minus size={16} /></button>
                      ) : null}
                      <div className="min-w-[82px] rounded-xl border border-[#8ce7e2]/28 bg-[#108D8B]/16 px-3 py-2 text-center text-lg text-[#d7fffd]">{line.countedQty} db</div>
                      {editable ? (
                        <button type="button" disabled={editingLineId === line.id} onClick={() => void setLineQty(line, line.countedQty + 1)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-[#283446] text-white hover:bg-white/[0.08] disabled:opacity-40"><Plus size={16} /></button>
                      ) : null}
                    </div>
                  </div>
                )) : (
                  <div className="px-4 py-10 text-center text-sm text-white/42">
                    <Store className="mx-auto mb-2 text-white/25" size={32} /> Még nincs beolvasott termék.
                  </div>
                )}
              </div>
            </section>

            {!editable ? (
              <div className="rounded-[20px] border border-[#8ce7e2]/30 bg-[#108D8B]/14 px-4 py-3 text-sm text-[#d7fffd]">
                <CheckCircle2 className="mr-2 inline" size={17} /> A bolti számolás lezárva. Az eladási oldal továbbra is használható.
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
