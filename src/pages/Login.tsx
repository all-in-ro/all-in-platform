import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  KeyRound,
  LogIn,
  Shield,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";

type ShopId = "csikszereda" | "kezdivasarhely";
type Session =
  | { role: "admin"; actor: string }
  | { role: "shop"; shopId: ShopId; actor: string };

type Mode = "admin" | "csik" | "kezdi" | null;

function inferInitialModeFromHash(): Mode {
  const h = (typeof window !== "undefined" ? window.location.hash : "") || "";
  if (h === "#allinusers" || h === "#admin" || h === "#users") return "admin";
  return null;
}

const LOGO_URL =
  "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/allin-logo.png";

const modeMeta = {
  admin: {
    title: "ADMIN",
    subtitle: "Rendszerfelügyelet és teljes hozzáférés",
    inputLabel: "Admin jelszó",
    placeholder: "Admin jelszó…",
    icon: Shield,
  },
  csik: {
    title: "ÜZLET – Csíkszereda",
    subtitle: "Értékesítési munkamenet",
    inputLabel: "Belépőkód",
    placeholder: "Belépőkód…",
    icon: Store,
  },
  kezdi: {
    title: "ÜZLET – Kézdivásárhely",
    subtitle: "Értékesítési munkamenet",
    inputLabel: "Belépőkód",
    placeholder: "Belépőkód…",
    icon: Store,
  },
} as const;

export default function Login({
  api,
  onLoggedIn,
}: {
  api: string;
  onLoggedIn: (s: Session) => void;
}) {
  const [mode, setMode] = useState<Mode>(() => inferInitialModeFromHash());
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onHash = () => {
      const next = inferInitialModeFromHash();
      if (mode === null && next !== null) setMode(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [mode]);

  const cancelToChooser = () => {
    setMode(null);
    setSecret("");
    setErr("");
    setBusy(false);

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  };

  useEffect(() => {
    if (!mode) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelToChooser();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  const selectedMeta = useMemo(() => (mode ? modeMeta[mode] : null), [mode]);
  const SelectedIcon = selectedMeta?.icon || Store;

  const chooseMode = (nextMode: Exclude<Mode, null>) => {
    setMode(nextMode);
    setSecret("");
    setErr("");
  };

  const submit = async () => {
    if (!mode) return;

    setErr("");
    const value = secret.trim();

    if (!value) {
      setErr(mode === "admin" ? "Írd be az admin jelszót." : "Írd be a belépőkódot.");
      return;
    }

    setBusy(true);

    try {
      const body =
        mode === "admin"
          ? { kind: "admin", password: value }
          : {
              kind: "shop",
              shopId: mode === "csik" ? "csikszereda" : "kezdivasarhely",
              code: value,
            };

      const response = await fetch(`${api}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        credentials: "include",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(String(data?.error || data?.message || `HTTP ${response.status}`));
      }

      onLoggedIn(data.session);
    } catch (error: any) {
      setErr(String(error?.message || error || "A belépés nem sikerült."));
    } finally {
      setBusy(false);
    }
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
                {selectedMeta ? selectedMeta.subtitle : "Válaszd ki, hová szeretnél belépni."}
              </p>
              <h1 className="mt-1 text-[1.45rem] font-normal tracking-tight text-slate-800">
                {selectedMeta?.title || "Belépés"}
              </h1>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-7">
            {!mode ? (
              <div className="space-y-3">
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

                <button type="button" className={chooserButton} onClick={() => chooseMode("csik")}>
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#8de2de]">
                    <Store size={20} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-normal">ÜZLET – Csíkszereda</span>
                    <span className="mt-1 block text-xs text-white/50">Magazin - Miercurea Ciuc</span>
                  </span>
                  <LogIn size={18} className="text-white/45 transition group-hover:translate-x-0.5 group-hover:text-[#a8f0ec]" />
                </button>

                <button type="button" className={chooserButton} onClick={() => chooseMode("kezdi")}>
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#8de2de]">
                    <Store size={20} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-normal">ÜZLET – Kézdivásárhely</span>
                    <span className="mt-1 block text-xs text-white/50">Magazin - Târgu Secuiesc</span>
                  </span>
                  <LogIn size={18} className="text-white/45 transition group-hover:translate-x-0.5 group-hover:text-[#a8f0ec]" />
                </button>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 shrink-0 text-[#2a8d8b]" size={17} />
                    <p className="text-xs leading-relaxed text-slate-500">
                      Az üzleti belépőkódokat az admin adja ki műszak vagy felhasználó szerint.
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
                      className="h-13 w-full rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-base font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2a8d8b]/55 focus:ring-4 focus:ring-[#2a8d8b]/10"
                      type={mode === "admin" ? "password" : "text"}
                      placeholder={selectedMeta?.placeholder}
                      value={secret}
                      onChange={(event) => setSecret(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void submit();
                      }}
                      autoComplete={mode === "admin" ? "current-password" : "one-time-code"}
                      autoFocus
                    />
                  </div>
                </label>

                {err ? (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-normal text-rose-700">
                    {err}
                  </div>
                ) : null}

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-normal text-slate-700 hover:border-slate-400 hover:bg-slate-100"
                    onClick={cancelToChooser}
                    disabled={busy}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Mégse
                  </Button>

                  <Button
                    type="button"
                    disabled={busy}
                    className="h-12 rounded-2xl border border-[#2a8d8b] bg-[#2a8d8b] px-4 text-sm font-normal text-white shadow-[0_10px_24px_rgba(42,141,139,0.24)] hover:bg-[#319c99]"
                    onClick={() => void submit()}
                  >
                    <LogIn className="mr-2 h-4 w-4" />
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
