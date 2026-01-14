import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Shield, Store } from "lucide-react";

type ShopId = "csikszereda" | "kezdivasarhely";
type Session =
  | { role: "admin"; actor: string }
  | { role: "shop"; shopId: ShopId; actor: string };

type Mode = "admin" | "csik" | "kezdi" | null;

function inferInitialModeFromHash(): Mode {
  // If the app routes directly to an admin-only hash (like #allinusers),
  // we still want a "Mégse" escape hatch that can take the user back to #home.
  const h = (typeof window !== "undefined" ? window.location.hash : "") || "";
  if (h === "#allinusers" || h === "#admin" || h === "#users") return "admin";
  return null;
}

export default function Login({
  api,
  onLoggedIn
}: {
  api: string;
  onLoggedIn: (s: Session) => void;
}) {
  const [mode, setMode] = useState<Mode>(() => inferInitialModeFromHash());
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // If someone navigates between hashes without remounting, keep it consistent.
  useEffect(() => {
    const onHash = () => {
      const next = inferInitialModeFromHash();
      // Only auto-set when we're currently at the chooser screen.
      if (mode === null && next !== null) setMode(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [mode]);

  const mainBtn =
    "w-full h-12 rounded-xl px-4 text-white bg-[#354153] hover:bg-[#3c5069] border border-white/40 flex items-center justify-between";

  const title = useMemo(() => {
    if (mode === "admin") return "ADMIN belépés";
    if (mode === "csik") return "ÜZLET – Csíkszereda";
    if (mode === "kezdi") return "ÜZLET – Kézdivásárhely";
    return "BELÉPÉS";
  }, [mode]);

  const cancelToChooser = () => {
    setMode(null);
    setSecret("");
    setErr("");
    // Make sure the URL also reflects the chooser state.
    if (typeof window !== "undefined") {
      if (window.location.hash !== "#home") window.location.hash = "#home";
    }
  };

  const submit = async () => {
    if (!mode) return;
    setErr("");
    const s = secret.trim();
    if (!s) {
      setErr(mode === "admin" ? "Írd be az admin jelszót." : "Írd be a belépőkódot.");
      return;
    }

    setBusy(true);
    try {
      const body =
        mode === "admin"
          ? { kind: "admin", password: s }
          : {
              kind: "shop",
              shopId: mode === "csik" ? "csikszereda" : "kezdivasarhely",
              code: s
            };

      const r = await fetch(`${api}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        credentials: "include"
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));

      onLoggedIn(j.session);
    } catch (e: any) {
      setErr(String(e?.message || e || "Hibás adat!"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-screen grid place-items-center" style={{ backgroundColor: "#474c59" }}>
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-slate-300 bg-white shadow-sm px-6 py-8">
          <h1 className="text-center text-2xl font-extrabold tracking-wide">ALL IN</h1>

          <div className="mt-6 text-center text-sm text-slate-600">{title}</div>

          {!mode && (
            <div className="mt-6 space-y-3">
              <Button onClick={() => setMode("admin")} className={mainBtn} type="button">
                <span>ADMIN</span>
                <Shield className="h-4 w-4" />
              </Button>

              <Button onClick={() => setMode("csik")} className={mainBtn} type="button">
                <span>ÜZLET – Csíkszereda</span>
                <Store className="h-4 w-4" />
              </Button>

              <Button onClick={() => setMode("kezdi")} className={mainBtn} type="button">
                <span>ÜZLET – Kézdivásárhely</span>
                <Store className="h-4 w-4" />
              </Button>
            </div>
          )}

          {mode && (
            <div className="mt-6 space-y-3">
              <input
                className="w-full h-12 rounded-xl px-4 border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-300"
                type={mode === "admin" ? "password" : "text"}
                placeholder={mode === "admin" ? "Admin jelszó…" : "Belépőkód…"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                autoFocus
              />

              {err && <div className="text-red-700 text-sm">{err}</div>}

              <div className="flex justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-xl px-4 text-white bg-[#354153] hover:bg-[#3c5069] border border-white/40"
                  onClick={cancelToChooser}
                >
                  Mégse
                </Button>

                <Button
                  type="button"
                  disabled={busy}
                  className="flex-1 rounded-xl px-4 text-white bg-[#354153] hover:bg-[#3c5069] border border-white/40"
                  onClick={submit}
                >
                  {busy ? "Belépés…" : "Belépés"}
                </Button>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-200 text-xs text-slate-500">
                Üzlet belépőkódokat az ADMIN fog kiadni (műszakok / felhasználók szerint).
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
