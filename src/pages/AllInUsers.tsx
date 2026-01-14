import { useState } from "react";
import { Button } from "@/components/ui/button";

type ShopId = "csikszereda" | "kezdivasarhely";

export default function AllInUsers({
  api,
  actor
}: {
  api?: string;
  actor?: string;
}) {
  const [shopId, setShopId] = useState<ShopId>("csikszereda");
  const [name, setName] = useState("");
  const [outText, setOutText] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const apiBase = api || "";

  const createCode = async () => {
    setErr("");
    setOutText("");

    if (!apiBase) {
      setErr("Hiányzik az API base (api prop).");
      return;
    }

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

  const mainBtn =
    "h-10 px-4 rounded-xl text-white bg-[#354153] hover:bg-[#3c5069] border border-white/40";

  const inputCls =
    "w-full h-11 rounded-xl px-4 border border-white/20 bg-white/10 text-white placeholder:text-white/50 outline-none focus:ring-2 focus:ring-white/20";

  const selectCls =
    "w-full h-11 rounded-xl px-4 border border-white/20 bg-white/10 text-white outline-none focus:ring-2 focus:ring-white/20";

  return (
    <div className="min-h-screen w-screen grid place-items-center" style={{ backgroundColor: "#474c59" }}>
      <div className="w-full max-w-3xl px-4">
        <div className="rounded-lg border border-white/20 bg-white/5 shadow-sm px-6 py-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-white text-xl font-semibold">FELHASZNÁLÓK</h1>
              <div className="text-white/60 text-sm mt-1">Belépőkód generálás (ADMIN)</div>
            </div>

            <Button className={mainBtn} onClick={() => (window.location.hash = "#allinadmin")} type="button">
              Vissza
            </Button>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="text-white/80 text-sm">
              {actor ? (
                <>
                  Belépve mint: <span className="text-white font-semibold">{actor}</span>
                </>
              ) : (
                <>Belépve mint: <span className="text-white/60">ismeretlen</span></>
              )}
            </div>

            <div className="grid gap-2">
              <div className="text-white/80 text-sm">Üzlet</div>
              <select value={shopId} onChange={(e) => setShopId(e.target.value as ShopId)} className={selectCls}>
                <option value="csikszereda">Csíkszereda</option>
                <option value="kezdivasarhely">Kézdivásárhely</option>
              </select>
            </div>

            <div className="grid gap-2">
              <div className="text-white/80 text-sm">Dolgozó neve (opcionális)</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="Pl. Pista"
              />
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className={mainBtn + " bg-transparent"}
                onClick={() => {
                  setName("");
                  setOutText("");
                  setErr("");
                }}
              >
                Törlés
              </Button>

              <Button type="button" className={mainBtn + " font-semibold"} disabled={busy} onClick={createCode}>
                {busy ? "Generálás…" : "Kód generálás"}
              </Button>
            </div>

            {err && <div className="text-red-300 text-sm">{err}</div>}

            {outText && (
              <div className="mt-2">
                <div className="text-white/80 text-sm mb-2">Generált kód</div>
                <pre className="rounded-xl border border-white/15 bg-black/40 text-green-200 p-4 overflow-auto">
                  {outText}
                </pre>
              </div>
            )}

            <div className="pt-4 mt-2 border-t border-white/10 text-xs text-white/60">
              Tipp: a kódot add ki műszak / dolgozó szerint, és ha kell, a név mező később loghoz is jó lesz.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
