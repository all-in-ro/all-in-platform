import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Shield, Store } from "lucide-react";

type ShopId = "csikszereda" | "kezdivasarhely";
type Session =
  | { role: "admin"; actor: string }
  | { role: "shop"; shopId: ShopId; actor: string };

export default function Login({
  api,
  onLoggedIn
}: {
  api: string;
  onLoggedIn: (s: Session) => void;
}) {
  const [mode, setMode] = useState<"admin" | "csik" | "kezdi" | null>(null);
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mainBtn =
    "w-full h-12 rounded-xl px-4 bg-[#354153] text-white hover:bg-[#3c5069] flex items-center justify-between border border-white/40";

  const title = useMemo(() => {
    if (mode === "admin") return "ADMIN belépés";
    if (mode === "csik") return "ÜZLET – Csíkszereda";
    if (mode === "kezdi") return "ÜZLET – Kézdivásárhely";
    return "BELÉPÉS";
  }, [mode]);

  const submit = async () => {
    if (!mode) return;
    setErr(null);
    setBusy(true);

    const body =
      mode === "admin"
        ? { kind: "admin", password: secret }
        : { kind: "shop", shopId: mode === "csik" ? "csikszereda" : "kezdivasarhely", code: secret };

    try {
      const r = await fetch(`${api}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include"
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "Hiba");
        setErr(t || "Hiba");
        return;
      }

      const data = await r.json();
      onLoggedIn(data.session);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-screen grid place-items-center" style={{ backgroundColor: "#474c59" }}>
      <div className="w-full max-w-lg px-4">
        <div className="rounded-lg border border-white/20 bg-white/5 shadow-sm px-6 py-8">
          <h1 className="text-center text-2xl text-white mb-6">ALL IN</h1>

          <div className="text-center text-white/80 mb-5">{title}</div>

          {!mode && (
            <div className="space-y-3">
              <Button className={mainBtn} onClick={() => setMode("admin")}>
                <span>ADMIN</span>
                <Shield className="h-4 w-4" />
              </Button>

              <Button className={mainBtn} onClick={() => setMode("csik")}>
                <span>ÜZLET – Csíkszereda</span>
                <Store className="h-4 w-4" />
              </Button>

              <Button className={mainBtn} onClick={() => setMode("kezdi")}>
                <span>ÜZLET – Kézdivásárhely</span>
                <Store className="h-4 w-4" />
              </Button>
            </div>
          )}

          {mode && (
            <div className="space-y-3">
              <input
                className="w-full h-12 rounded-xl px-4 bg-white/10 text-white placeholder:text-white/50 border border-white/20 outline-none focus:border-white/40"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={mode === "admin" ? "Admin jelszó" : "Belépőkód"}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />

              <Button className={mainBtn} onClick={submit} disabled={busy}>
                <span>{busy ? "Beléptetés..." : "BELÉPÉS"}</span>
                <Shield className="h-4 w-4" />
              </Button>

              <Button
                className={mainBtn}
                onClick={() => {
                  setMode(null);
                  setSecret("");
                  setErr(null);
                }}
              >
                <span>VISSZA</span>
                <span className="text-white/70">↩</span>
              </Button>

              {err && (
                <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-red-100 text-sm whitespace-pre-wrap">
                  {err}
                </div>
              )}

              <div className="pt-4 mt-2 border-t border-white/15 text-white/60 text-xs">
                Üzlet belépőkódokat később az ADMIN fog kiadni (műszakok / felhasználók szerint).
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
