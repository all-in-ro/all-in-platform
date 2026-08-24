import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Barcode,
  KeyRound,
  Loader2,
  LogIn,
  Shield,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";

type ShopId = string;
type ShopOption = {
  id: string;
  name: string;
  locationCode?: string | null;
  locationName?: string | null;
};

type Session =
  | { role: "admin"; actor: string }
  | {
      role: "shop";
      shopId: ShopId;
      shopName?: string;
      locationCode?: string;
      locationName?: string;
      actor: string;
    };

type Mode = "admin" | `shop:${string}` | null;
type LoginMode = Exclude<Mode, null>;

type ParsedAccessCard = {
  shopIdHint: string | null;
  code: string;
};

const LAST_LOGIN_MODE_KEY = "allin:last-login-mode";

function shopMode(shopId: string): LoginMode {
  return `shop:${shopId}`;
}

function modeShopId(mode: Mode) {
  if (!mode || mode === "admin" || !mode.startsWith("shop:")) return "";
  return mode.slice(5);
}

function rememberedLoginMode(): Mode {
  if (typeof window === "undefined") return null;
  try {
    const saved = String(window.localStorage.getItem(LAST_LOGIN_MODE_KEY) || "").trim();
    if (saved === "admin") return "admin";
    // Régi böngészőállapot kompatibilitás.
    if (saved === "csik") return shopMode("csikszereda");
    if (saved === "kezdi") return shopMode("kezdivasarhely");
    if (saved.startsWith("shop:") && saved.length > 5) return saved as LoginMode;
    return null;
  } catch {
    return null;
  }
}

function rememberLoginMode(session: Session) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LAST_LOGIN_MODE_KEY,
      session.role === "admin" ? "admin" : `shop:${session.shopId}`,
    );
  } catch {
    // A belépés ettől még működjön, ha a böngésző tiltja a localStorage-ot.
  }
}

class LoginRequestError extends Error {
  status: number;
  serverMessage: string;

  constructor(status: number, serverMessage: string) {
    super(serverMessage || `HTTP ${status}`);
    this.name = "LoginRequestError";
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

function friendlyLoginError(error: unknown, targetMode: LoginMode) {
  const status = error instanceof LoginRequestError ? error.status : 0;
  const raw = String(error instanceof Error ? error.message : error || "").trim();
  const normalized = raw.toLowerCase();

  if (targetMode === "admin") {
    if (status === 401 || status === 403 || normalized.includes("unauthor") || normalized.includes("invalid")) {
      return "Hibás admin jelszó. Ellenőrizd, és próbáld újra.";
    }
    if (status >= 500) return "A belépési szolgáltatás most nem elérhető. Próbáld újra néhány másodperc múlva.";
    return raw && !/^http\s+\d+$/i.test(raw) ? raw : "Az admin belépés nem sikerült.";
  }

  if (status === 401 || status === 403 || normalized.includes("unauthor") || normalized.includes("invalid")) {
    return "Hibás vagy inaktív belépőkód ehhez az üzlethez. Ellenőrizd a kódot, és próbáld újra.";
  }
  if (status >= 500) return "A belépési szolgáltatás most nem elérhető. Próbáld újra néhány másodperc múlva.";
  return raw && !/^http\s+\d+$/i.test(raw) ? raw : "A belépés nem sikerült. Ellenőrizd a kódot.";
}

function inferInitialModeFromHash(): Mode {
  const h = ((typeof window !== "undefined" ? window.location.hash : "") || "").toLowerCase();
  if (h === "#allinusers" || h === "#admin" || h === "#users") return "admin";
  if (h.includes("magazinciuc") || h.includes("shop-ciuc") || h === "#csikszereda") return shopMode("csikszereda");
  if (h.includes("magazintargu") || h.includes("shop-targu") || h === "#kezdivasarhely") return shopMode("kezdivasarhely");
  return rememberedLoginMode();
}

function parseAccessCard(value: string): ParsedAccessCard | null {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  // A régi C/K előtagos kártyákat továbbra is elfogadjuk.
  const match = normalized.match(/^AIF-(C|K)-([A-Z0-9]{4,64})$/);
  if (!match) return null;

  return {
    shopIdHint: match[1] === "C" ? "csikszereda" : "kezdivasarhely",
    code: match[2],
  };
}

function normalizeShopAccessCode(value: string) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const parsed = parseAccessCard(normalized);
  if (parsed) return parsed;

  const code = normalized.replace(/[^A-Z0-9]/g, "");
  return code ? { code, shopIdHint: null as string | null } : null;
}

const LOGO_URL =
  "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/allin-logo.png";

const adminModeMeta = {
  title: "ADMIN",
  subtitle: "Rendszerfelügyelet és teljes hozzáférés",
  inputLabel: "Admin jelszó",
  placeholder: "Admin jelszó…",
  icon: Shield,
} as const;

export default function Login({
  api,
  onLoggedIn,
}: {
  api: string;
  onLoggedIn: (session: Session) => void;
}) {
  const [mode, setMode] = useState<Mode>(() => inferInitialModeFromHash());
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [shopsBusy, setShopsBusy] = useState(true);
  const [shopsErr, setShopsErr] = useState("");
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const scanBufferRef = useRef("");
  const scanTimerRef = useRef<number | null>(null);
  const secretInputRef = useRef<HTMLInputElement | null>(null);
  const lastAutoSubmitRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    setShopsBusy(true);
    setShopsErr("");
    fetch(`${api}/auth/shops`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const raw = await response.text().catch(() => "");
        let body: any = null;
        try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
        if (!response.ok) throw new Error(String(body?.error || body?.message || raw || `HTTP ${response.status}`));
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        const items = Array.isArray(body?.items) ? body.items : [];
        const nextShops: ShopOption[] = items
          .map((item: any) => ({
            id: String(item?.id || "").trim(),
            name: String(item?.name || item?.id || "").trim(),
            locationCode: item?.locationCode ? String(item.locationCode) : null,
            locationName: item?.locationName ? String(item.locationName) : null,
          }))
          .filter((item: ShopOption) => Boolean(item.id && item.name));
        setShops(nextShops);
        const currentShopId = modeShopId(mode);
        if (currentShopId && !nextShops.some((shop) => shop.id === currentShopId)) {
          setMode(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setShops([]);
          setShopsErr(String(error?.message || error || "A belépési helységek nem tölthetők be."));
        }
      })
      .finally(() => {
        if (!cancelled) setShopsBusy(false);
      });
    return () => { cancelled = true; };
  }, [api]);

  const focusSecretForRetry = useCallback(() => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      secretInputRef.current?.focus();
      secretInputRef.current?.select();
    });
  }, []);

  useEffect(() => {
    const onHash = () => {
      const next = inferInitialModeFromHash();
      if (mode === null && next !== null) setMode(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [mode]);

  const cancelToChooser = useCallback(() => {
    setMode(null);
    setSecret("");
    setErr("");
    setBusy(false);
    scanBufferRef.current = "";
    lastAutoSubmitRef.current = "";

    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  useEffect(() => {
    if (!mode) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelToChooser();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelToChooser, mode]);

  const selectedShopId = modeShopId(mode);
  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === selectedShopId) || null,
    [selectedShopId, shops],
  );
  const selectedMeta = useMemo(() => {
    if (mode === "admin") return adminModeMeta;
    if (!selectedShop) return null;
    return {
      title: `ÜZLET – ${selectedShop.name}`,
      subtitle: selectedShop.locationName || "Értékesítési munkamenet",
      inputLabel: "Belépőkód vagy kártya",
      placeholder: "Belépőkód…",
      icon: Store,
    };
  }, [mode, selectedShop]);
  const SelectedIcon = selectedMeta?.icon || Store;

  const requestSession = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(`${api}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      credentials: "include",
      cache: "no-store",
    });

    const rawBody = await response.text().catch(() => "");
    let data: any = null;
    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const serverMessage = String(
        data?.error ||
        data?.message ||
        rawBody ||
        `HTTP ${response.status}`
      ).trim();
      throw new LoginRequestError(response.status, serverMessage);
    }

    if (!data?.session) {
      throw new LoginRequestError(response.status || 500, "A szerver nem adott vissza érvényes munkamenetet.");
    }

    return data.session as Session;
  }, [api]);

  const loginWithMode = useCallback(async (targetMode: LoginMode, rawValue: string) => {
    if (busy) return;
    setErr("");

    const targetShopId = modeShopId(targetMode);
    const normalized = targetMode === "admin" ? null : normalizeShopAccessCode(rawValue);
    const value = targetMode === "admin" ? rawValue.trim() : normalized?.code || "";

    if (!value) {
      setErr(targetMode === "admin" ? "Írd be az admin jelszót." : "Olvasd be a kártyát vagy írd be a belépőkódot.");
      focusSecretForRetry();
      return;
    }
    if (targetMode !== "admin" && !targetShopId) {
      setErr("A kiválasztott helység már nem érhető el. Térj vissza a belépési listához.");
      return;
    }

    if (
      targetMode !== "admin" &&
      normalized?.shopIdHint &&
      normalized.shopIdHint !== targetShopId
    ) {
      const selectedName = shops.find((shop) => shop.id === targetShopId)?.name || targetShopId;
      const cardName = shops.find((shop) => shop.id === normalized.shopIdHint)?.name || normalized.shopIdHint;
      setErr(`Ez a régi típusú kártya a(z) ${cardName} helységhez tartozik, nem a(z) ${selectedName} helységhez.`);
      setScannerActive(false);
      focusSecretForRetry();
      return;
    }

    setBusy(true);
    try {
      const session = await requestSession(
        targetMode === "admin"
          ? { kind: "admin", password: value }
          : { kind: "shop", shopId: targetShopId, code: value },
      );
      rememberLoginMode(session);
      onLoggedIn(session);
    } catch (error: unknown) {
      setErr(friendlyLoginError(error, targetMode));
      focusSecretForRetry();
    } finally {
      setBusy(false);
      setScannerActive(false);
      scanBufferRef.current = "";
    }
  }, [busy, focusSecretForRetry, onLoggedIn, requestSession, shops]);

  const loginScannedCard = useCallback(async (rawValue: string) => {
    if (busy) return;
    const normalized = normalizeShopAccessCode(rawValue);
    if (!normalized || normalized.code.length < 4) {
      setErr("A beolvasott kód nem felismerhető.");
      setScannerActive(false);
      return;
    }

    setBusy(true);
    setErr("");
    try {
      // A szerver a kód alapján megkeresi a helységet. Nincs több két üzletre hardkódolt próbálgatás.
      const session = await requestSession({ kind: "shop", code: normalized.code });
      rememberLoginMode(session);
      onLoggedIn(session);
    } catch (error: unknown) {
      const status = error instanceof LoginRequestError ? error.status : 0;
      const raw = String(error instanceof Error ? error.message : error || "").trim();
      setErr(
        status === 401 || status === 403
          ? "A beolvasott kód hibás, inaktív vagy már nem használható."
          : raw || "A beolvasott kódhoz nem található beléphető helység."
      );
    } finally {
      setBusy(false);
      setScannerActive(false);
      scanBufferRef.current = "";
    }
  }, [busy, onLoggedIn, requestSession]);

  useEffect(() => {
    if (mode !== null || busy) return;

    const finishScan = () => {
      const scanned = scanBufferRef.current;
      scanBufferRef.current = "";
      scanTimerRef.current = null;
      if (!scanned) {
        setScannerActive(false);
        return;
      }
      void loginScannedCard(scanned);
    };

    const scheduleAutomaticLogin = () => {
      if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = window.setTimeout(finishScan, 160);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      if (event.key === "Enter" || event.key === "Tab") {
        if (!scanBufferRef.current) return;
        event.preventDefault();
        if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
        finishScan();
        return;
      }

      if (event.key.length !== 1) return;
      scanBufferRef.current += event.key;
      setScannerActive(true);
      setErr("");
      scheduleAutomaticLogin();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (scanTimerRef.current !== null) {
        window.clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
    };
  }, [busy, loginScannedCard, mode]);

  useEffect(() => {
    if (!mode || mode === "admin" || busy) return;
    const normalized = normalizeShopAccessCode(secret);
    if (!normalized || normalized.code.length < 8) return;

    const submitKey = `${mode}:${normalized.shopIdHint || "raw"}:${normalized.code}`;
    // Ugyanazt a hibás kódot egyszer próbáljuk automatikusan. A busy állapot
    // visszaállása többé nem indít végtelen 401-es újrapróbálást.
    if (lastAutoSubmitRef.current === submitKey) return;

    const timer = window.setTimeout(() => {
      lastAutoSubmitRef.current = submitKey;
      void loginWithMode(mode, secret);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [busy, loginWithMode, mode, secret]);

  const chooseMode = (nextMode: LoginMode) => {
    setMode(nextMode);
    setSecret("");
    setErr("");
    scanBufferRef.current = "";
    lastAutoSubmitRef.current = "";
  };

  const submit = async () => {
    if (!mode) return;
    await loginWithMode(mode, secret);
  };

  const chooserButton =
    "group flex min-h-[66px] w-full items-center gap-3 rounded-2xl border border-white/14 bg-[#354153] px-4 text-left text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)] transition hover:border-[#7bd7d4]/40 hover:bg-[#3e4d61] active:scale-[0.99] font-normal";

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#667181] via-[#596474] to-[#485362] px-4 py-8 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[8%] top-[12%] h-56 w-56 rounded-full bg-[#2a8d8b]/16 blur-3xl" />
        <div className="absolute bottom-[8%] right-[10%] h-64 w-64 rounded-full bg-[#7bd7d4]/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:36px_36px]" />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-[1120px] place-items-center">
        <section className="w-full max-w-[460px] overflow-hidden rounded-[28px] border border-white/24 bg-[#f7fafb] text-slate-800 shadow-[0_30px_80px_rgba(15,23,42,0.32)]">
          <div className="border-b border-slate-200 bg-gradient-to-r from-[#ecf7f6] via-white to-[#eef4f7] px-6 py-6 sm:px-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <img
                  src={LOGO_URL}
                  alt="ALL IN"
                  className="h-11 w-auto object-contain sm:h-12"
                  loading="eager"
                />
                <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  Belső rendszer
                </p>
              </div>

              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#2a8d8b]/20 bg-[#2a8d8b]/10 text-[#267f7d]">
                {mode ? <SelectedIcon size={23} strokeWidth={1.8} /> : <Sparkles size={23} strokeWidth={1.8} />}
              </span>
            </div>

            <div className="mt-5">
              <p className="text-sm text-slate-500">
                {selectedMeta ? selectedMeta.subtitle : "Válassz belépést, vagy olvasd be közvetlenül a PVC-kártyát."}
              </p>
              <h1 className="mt-1 text-[1.45rem] font-normal tracking-tight text-slate-800">
                {selectedMeta?.title || "Belépés"}
              </h1>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-7">
            {!mode ? (
              <div className="space-y-3">
                <div className={`rounded-2xl border px-4 py-3 transition ${
                  scannerActive
                    ? "border-[#2a8d8b]/55 bg-[#dff4f2] shadow-[0_0_0_4px_rgba(42,141,139,0.09)]"
                    : "border-[#2a8d8b]/20 bg-[#edf8f7]"
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#2a8d8b]/22 bg-white text-[#2a8d8b]">
                      {busy ? <Loader2 size={20} className="animate-spin" /> : <Barcode size={22} strokeWidth={1.8} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-normal text-slate-800">
                        {busy ? "Kártya ellenőrzése…" : scannerActive ? "Kártya beolvasása…" : "PVC belépőkártya"}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Olvasd be a kártyát. A rendszer automatikusan a megfelelő üzletbe léptet.
                      </p>
                    </div>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      scannerActive ? "bg-[#2a8d8b] shadow-[0_0_12px_rgba(42,141,139,0.7)]" : "bg-slate-300"
                    }`} />
                  </div>
                </div>

                <button type="button" className={chooserButton} onClick={() => chooseMode("admin")}>
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#2a8d8b]">
                    <Shield size={20} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-normal">ADMIN</span>
                    <span className="mt-1 block text-xs text-white/50">Teljes rendszerfelügyelet</span>
                  </span>
                  <LogIn size={18} className="text-white/45 transition group-hover:translate-x-0.5 group-hover:text-[#a8f0ec]" />
                </button>

                {shops.map((shop) => (
                  <button
                    key={shop.id}
                    type="button"
                    className={chooserButton}
                    onClick={() => chooseMode(shopMode(shop.id))}
                  >
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#8de2de]">
                      <Store size={20} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-normal">ÜZLET – {shop.name}</span>
                      <span className="mt-1 block truncate text-xs text-white/50">
                        {shop.locationName || "Értékesítési munkamenet"}
                      </span>
                    </span>
                    <LogIn size={18} className="text-white/45 transition group-hover:translate-x-0.5 group-hover:text-[#a8f0ec]" />
                  </button>
                ))}

                {shopsBusy ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                    <Loader2 size={16} className="animate-spin" /> Helységek betöltése…
                  </div>
                ) : null}

                {shopsErr ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-normal text-rose-700">
                    {shopsErr}
                  </div>
                ) : null}

                {err ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-normal text-rose-700">
                    {err}
                  </div>
                ) : null}

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 shrink-0 text-[#2a8d8b]" size={17} />
                    <p className="text-xs leading-relaxed text-slate-500">
                      A kézi kódbevitel megmarad. A kártya beolvasásakor a rendszer automatikusan megkeresi a megfelelő üzletet és beléptet.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={cancelToChooser}
                  className="mb-5 inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-normal text-slate-600 transition hover:border-[#2a8d8b]/35 hover:bg-[#eef8f7] hover:text-[#267f7d]"
                >
                  <ArrowLeft size={15} />
                  Másik belépés választása
                </button>

                <label className="block">
                  <span className="mb-2 block text-[10px] uppercase tracking-[0.13em] text-slate-500">
                    {selectedMeta?.inputLabel}
                  </span>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      ref={secretInputRef}
                      className={`h-13 w-full rounded-2xl border bg-white py-3 pl-12 pr-4 text-base font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                        err
                          ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                          : "border-slate-300 focus:border-[#2a8d8b]/55 focus:ring-[#2a8d8b]/10"
                      }`}
                      type={mode === "admin" ? "password" : "text"}
                      placeholder={selectedMeta?.placeholder}
                      value={secret}
                      onChange={(event) => {
                        lastAutoSubmitRef.current = "";
                        setErr("");
                        setSecret(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void submit();
                      }}
                      autoComplete={mode === "admin" ? "current-password" : "off"}
                      autoCapitalize="characters"
                      spellCheck={false}
                      aria-invalid={Boolean(err)}
                      aria-describedby={err ? "allin-login-error" : undefined}
                      autoFocus
                    />
                  </div>
                </label>

                {mode !== "admin" ? (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#2a8d8b]/18 bg-[#edf8f7] px-3 py-2.5 text-xs text-slate-600">
                    <Barcode size={17} className="shrink-0 text-[#2a8d8b]" />
                    A mező aktív. A kártya beolvasása után a rendszer automatikusan beléptet.
                  </div>
                ) : null}

                <div className="mt-3 min-h-[58px]" aria-live="polite">
                  {err ? (
                    <div
                      id="allin-login-error"
                      className="flex min-h-[58px] items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-normal leading-5 text-rose-700 shadow-[0_8px_20px_rgba(190,24,93,0.06)]"
                    >
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                        <Shield size={14} />
                      </span>
                      <span>{err}</span>
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={cancelToChooser}
                    disabled={busy}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-400 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-[#2a8d8b]/55 hover:bg-[#eef8f7] hover:text-[#206f6d] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Mégse
                  </button>

                  <Button
                    type="button"
                    disabled={busy}
                    className="h-12 rounded-2xl border border-[#2a8d8b] bg-[#2a8d8b] px-4 text-sm font-normal text-white shadow-[0_10px_24px_rgba(42,141,139,0.24)] hover:bg-[#319c99]"
                    onClick={() => void submit()}
                  >
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                    {busy ? "Belépés…" : "Belépés"}
                  </Button>
                </div>

                <p className="mt-4 text-center text-[11px] text-slate-400">
                  ESC: vissza a belépési módokhoz
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
