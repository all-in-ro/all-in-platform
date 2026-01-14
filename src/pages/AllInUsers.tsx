import { useState } from "react";
import { Button } from "@/components/ui/button";

type ShopId = "csikszereda" | "kezdivasarhely";

export default function AllInUsers({
  api,
  actor
}: {
  api: string;
  actor?: string;
}) {
  const [shopId, setShopId] = useState<ShopId>("csikszereda");
  const [name, setName] = useState("");
  const [outText, setOutText] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const createCode = async () => {
    setErr("");
    setOutText("");

    setBusy(true);
    try {
      const r = await fetch(`${api}/admin/codes`, {
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

  const select =
    "w-full h-11 rounded-xl px-4 border border-white/20 bg-white/5 text-white outline-none focus:ring-2 focus:ring-white/20";

  return (
    <div className="min-h-screen w-screen grid place-items-center" style={{ backgroundColor: "#474c59" }}>
      <div className="w-full max-w-3xl px-4">
        <div className="rounded-lg border border-white/20 bg-white/5 shadow-sm px-6 py-8">
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
            <div className="text-white/80 text-sm">
              Belépve mint: <span className="text-white font-semibold">{actor || "ADMIN"}</span>
            </div>

            <div className="grid gap-2">
              <div className="text-white/80 text-sm">Üzlet</div>
              <select value={shopId} onChange={(e) => setShopId(e.target.value as ShopId)} className={select}>
                <option value="csikszereda">Csíkszereda</option>
                <option value="kezdivasarhely">Kézdivásárhely</option>
              </select>
            </div>

            <div className="grid gap-2">
              <div className="text-white/80 text-sm">Dolgozó neve (opcionális)</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={input}
                placeholder="Pl. Pista"
              />
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

            {err && <div className="text-red-400 text-sm">{err}</div>}

            {outText && (
              <div>
                <div className="text-white/80 text-sm mb-2">Generált kód</div>
                <pre className="rounded-xl border border-white/15 bg-black/40 text-green-200 p-4">
                  {outText}
                </pre>
              </div>
            )}

            <div className="pt-4 border-t border-white/10 text-xs text-white/60">
              Tipp: a kódot add ki műszak / dolgozó szerint.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
