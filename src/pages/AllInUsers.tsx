import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type ShopId = "csikszereda" | "kezdivasarhely";

function normBase(s: string) {
  return s.replace(/\/+$/, "");
}

export default function AllInUsers({
  api,
  actor
}: {
  api?: string;
  actor?: string;
}) {
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

  // Custom dropdown (no OS-blue select highlight, no shadcn dependency)
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const shopLabel = shopId === "csikszereda" ? "Csíkszereda" : "Kézdivásárhely";

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
    } catch (e: any) {
      setErr(String(e?.message || e || "Hiba"));
    } finally {
      setBusy(false);
    }
  };

  const btn =
    "h-10 px-4 rounded-xl text-white bg-[#354153] hover:bg-[#3c5069] border border-white/30";

  const input =
    "w-full h-11 rounded-xl px-4 border border-white/20 bg-white/5 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white/20";

  const card = "rounded-lg border border-white/20 bg-white/5 shadow-sm px-6 py-8";
  const label = "text-white/80 text-sm";

  // Close dropdown on outside click
  const onWrapMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!open) return;
    const el = dropdownRef.current;
    if (el && !el.contains(e.target as Node)) setOpen(false);
  };

  return (
    <div
      className="min-h-screen w-screen grid place-items-center"
      style={{ backgroundColor: "#474c59" }}
      onMouseDown={onWrapMouseDown}
    >
      <div className="w-full max-w-3xl px-4">
        <div className={card}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-white text-xl font-semibold">FELHASZNÁLÓK</h1>
              <div className="text-white/60 text-sm">Belépőkód generálás (ADMIN)</div>
            </div>

            <Button className={btn} onClick={() => (window.location.hash = "#home")} type="button">
              Vissza
            </Button>
          </div>

          <div className="mt-6 grid gap-4">
            <div className={label}>
              Belépve mint: <span className="text-white font-semibold">{actor || "ADMIN"}</span>
            </div>

            <div className="grid gap-2">
              <div className={label}>Üzlet</div>

              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  className="w-full h-11 rounded-xl px-4 border border-white/20 bg-white/5 text-white text-left outline-none focus:ring-2 focus:ring-white/20 flex items-center justify-between"
                  onClick={() => setOpen((v) => !v)}
                >
                  <span>{shopLabel}</span>
                  <span className="text-white/60">▾</span>
                </button>

                {open && (
                  <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/20 bg-[#354153] overflow-hidden shadow-lg">
                    <button
                      type="button"
                      className={
                        "w-full px-4 py-3 text-left text-white hover:bg-white/10 " +
                        (shopId === "csikszereda" ? "bg-white/10" : "")
                      }
                      onClick={() => {
                        setShopId("csikszereda");
                        setOpen(false);
                      }}
                    >
                      Csíkszereda
                    </button>
                    <button
                      type="button"
                      className={
                        "w-full px-4 py-3 text-left text-white hover:bg-white/10 " +
                        (shopId === "kezdivasarhely" ? "bg-white/10" : "")
                      }
                      onClick={() => {
                        setShopId("kezdivasarhely");
                        setOpen(false);
                      }}
                    >
                      Kézdivásárhely
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <div className={label}>Dolgozó neve (opcionális)</div>
              <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Pl. Pista" />
            </div>

            <div className="flex gap-3">
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

            {err && <div className="text-red-400 text-sm whitespace-pre-wrap">{err}</div>}

            {outText && (
              <div>
                <div className="text-white/80 text-sm mb-2">Generált kód</div>
                <pre className="rounded-xl border border-white/15 bg-black/40 text-green-200 p-4 overflow-auto">
                  {outText}
                </pre>
              </div>
            )}

            <div className="pt-4 border-t border-white/10 text-xs text-white/60">
              Tipp: a kódot add ki műszak / dolgozó szerint.
              <span className="block mt-1">
                API base: <span className="text-white/70">{apiBase}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
