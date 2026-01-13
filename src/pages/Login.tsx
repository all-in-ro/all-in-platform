import { useMemo, useState } from "react";

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

  const title = useMemo(() => {
    if (mode === "admin") return "ADMIN belépés";
    if (mode === "csik") return "ÜZLET – Csíkszereda belépés";
    if (mode === "kezdi") return "ÜZLET – Kézdivásárhely belépés";
    return "Válassz belépést";
  }, [mode]);

  const submit = async () => {
    setErr(null);
    const body =
      mode === "admin"
        ? { kind: "admin", password: secret }
        : { kind: "shop", shopId: mode === "csik" ? "csikszereda" : "kezdivasarhely", code: secret };

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
  };

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h2>{title}</h2>

      {!mode && (
        <div style={{ display: "grid", gap: 10 }}>
          <button onClick={() => setMode("admin")} style={{ padding: 12, fontWeight: 700 }}>
            ADMIN
          </button>
          <button onClick={() => setMode("csik")} style={{ padding: 12, fontWeight: 700 }}>
            ÜZLET – Csíkszereda
          </button>
          <button onClick={() => setMode("kezdi")} style={{ padding: 12, fontWeight: 700 }}>
            ÜZLET – Kézdivásárhely
          </button>
        </div>
      )}

      {mode && (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={mode === "admin" ? "Admin jelszó" : "Belépőkód"}
            style={{ padding: 10 }}
          />
          <button onClick={submit} style={{ padding: 12, fontWeight: 700 }}>
            Belépés
          </button>
          <button onClick={() => (setMode(null), setSecret(""), setErr(null))} style={{ padding: 10 }}>
            Vissza
          </button>
          {err && <div style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{err}</div>}
        </div>
      )}
    </div>
  );
}
