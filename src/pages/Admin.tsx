import { useState } from "react";

type ShopId = "csikszereda" | "kezdivasarhely";

export default function Admin({
  api,
  actor,
  onCancel
}: {
  api: string;
  actor: string;
  onCancel: () => void;
}) {
  const [shopId, setShopId] = useState<ShopId>("csikszereda");
  const [name, setName] = useState("");
  const [out, setOut] = useState<string>("");

  const createCode = async () => {
    setOut("");
    const r = await fetch(`${api}/admin/codes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ shopId, name })
    });
    const txt = await r.text();
    if (!r.ok) {
      setOut(txt || "Hiba");
      return;
    }
    setOut(txt);
  };

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 620 }}>
      <h3>Admin panel – belépőkód generálás</h3>
      <div>
        Belépve mint: <b>{actor}</b>
      </div>

      <label>
        Üzlet:
        <select
          value={shopId}
          onChange={(e) => setShopId(e.target.value as ShopId)}
          style={{ marginLeft: 8, padding: 8 }}
        >
          <option value="csikszereda">Csíkszereda</option>
          <option value="kezdivasarhely">Kézdivásárhely</option>
        </select>
      </label>

      <label>
        Dolgozó neve (opcionális, loghoz később hasznos):
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginLeft: 8, padding: 8 }}
        />
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} style={{ padding: 12 }}>
          Mégse
        </button>
        <button onClick={createCode} style={{ padding: 12, fontWeight: 700 }}>
          Kód generálás
        </button>
      </div>

      {out && (
        <pre style={{ background: "#111", color: "#0f0", padding: 12, borderRadius: 8 }}>
          {out}
        </pre>
      )}
    </div>
  );
}
