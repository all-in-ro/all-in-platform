type ShopId = "csikszereda" | "kezdivasarhely";

export default function Shop({ api, shopId, actor }: { api: string; shopId: ShopId; actor: string }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <h3>ÜZLET – {shopId === "csikszereda" ? "Csíkszereda" : "Kézdivásárhely"}</h3>
      <div>Belépve mint: <b>{actor}</b></div>
      <div style={{ opacity: 0.8 }}>
        Itt jön majd a raktár/üzlet kezelő UI. Most csak a belépés és role-logika az alap.
      </div>
      <div style={{ opacity: 0.7 }}>API base: {api}</div>
    </div>
  );
}
