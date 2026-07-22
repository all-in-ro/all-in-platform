import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Barcode,
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Copy,
  CreditCard,
  Home,
  KeyRound,
  MapPin,
  Plus,
  Power,
  Printer,
  RefreshCw,
  ShieldCheck,
  Store,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";

type Shop = { id: string; name: string };

type CodeItem = {
  id: string;
  shopId: string;
  name: string | null;
  createdAt: string;
  codeHint: string | null;
  code: string | null;
  revokedAt: string | null;
};

type ConfirmAction = {
  kind: "delete" | "toggle" | "delete-shop";
  id: string;
  active?: boolean;
};

function normBase(s: string) {
  return s.replace(/\/+$/, "");
}

function fmt(ts: string | null) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function initials(name: string | null) {
  const parts = String(name || "Felhasználó")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "F").slice(0, 2);
}

function slugifyId(input: string) {
  const s = (input || "").trim().toLowerCase();
  const map: Record<string, string> = {
    á: "a",
    é: "e",
    í: "i",
    ó: "o",
    ö: "o",
    ő: "o",
    ú: "u",
    ü: "u",
    ű: "u",
    ă: "a",
    â: "a",
    î: "i",
    ș: "s",
    ş: "s",
    ț: "t",
    ţ: "t",
  };
  const replaced = s
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
  return replaced.replace(/[^a-z0-9]+/g, "").slice(0, 32) || "helyseg";
}


const CODE39_PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  "$": "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};

function accessCardPayload(item: CodeItem) {
  const rawCode = String(item.code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!rawCode) return "";
  const shopPrefix = item.shopId === "csikszereda"
    ? "C"
    : item.shopId === "kezdivasarhely"
      ? "K"
      : "";
  return shopPrefix ? `AIF-${shopPrefix}-${rawCode}` : "";
}

function code39Svg(value: string, height = 64) {
  const safe = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z. $/+%-]/g, "");
  const encoded = `*${safe}*`;
  const narrow = 2;
  const wide = 5;
  const characterGap = 2;
  const quiet = 12;
  let x = quiet;
  const rects: string[] = [];

  for (const character of encoded) {
    const pattern = CODE39_PATTERNS[character];
    if (!pattern) continue;

    pattern.split("").forEach((widthCode, index) => {
      const width = widthCode === "w" ? wide : narrow;
      if (index % 2 === 0) {
        rects.push(`<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000"/>`);
      }
      x += width;
    });
    x += characterGap;
  }

  const totalWidth = x + quiet;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" role="img" aria-label="${safe}" preserveAspectRatio="none">${rects.join("")}</svg>`;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function AllInUsers({ api, actor }: { api?: string; actor?: string }) {
  const apiBase = useMemo(() => {
    const fromProp = typeof api === "string" && api.trim() ? api.trim() : "";
    const fromEnv = (import.meta as any)?.env?.VITE_API_BASE
      ? String((import.meta as any).env.VITE_API_BASE)
      : "";
    return normBase(fromProp || fromEnv || "/api");
  }, [api]);

  const panel = "rounded-2xl border border-white/14 bg-white/[0.06] shadow-sm";
  const panelHead =
    "flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b border-white/12 bg-[#404a5b] px-4 py-3";
  const label = "text-xs text-white/62";
  const input =
    "h-10 w-full rounded-xl border border-white/18 bg-[#3f4959] px-3 text-white placeholder:text-white/34 outline-none transition focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18";
  const btn =
    "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/18 bg-[#354153] px-3 text-xs font-normal text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-45";
  const btnPrimary =
    "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#7bd7d4]/40 bg-[#2a8d8b] px-3 text-xs font-normal text-white transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-45";
  const btnSoft =
    "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/14 bg-white/[0.07] px-3 text-xs font-normal text-white transition hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-45";
  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/18 bg-[#354153] text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-45";

  const [shops, setShops] = useState<Shop[]>([]);
  const [shopsErr, setShopsErr] = useState("");
  const [shopId, setShopId] = useState("csikszereda");

  const [name, setName] = useState("");
  const [outText, setOutText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [items, setItems] = useState<CodeItem[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [listErr, setListErr] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");

  const [openShop, setOpenShop] = useState(false);
  const [openStatus, setOpenStatus] = useState(false);
  const shopRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMsg, setConfirmMsg] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeName, setPlaceName] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [placeErr, setPlaceErr] = useState("");
  const [placeBusy, setPlaceBusy] = useState(false);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState("");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [cardItem, setCardItem] = useState<CodeItem | null>(null);

  const shopName = (id: string) => shops.find((shop) => shop.id === id)?.name || id;
  const shopLabel = shopName(shopId);
  const statusLabel = status === "active" ? "Aktív" : status === "inactive" ? "Inaktív" : "Összes";

  const activeCount = useMemo(() => items.filter((item) => !item.revokedAt).length, [items]);
  const inactiveCount = useMemo(() => items.filter((item) => Boolean(item.revokedAt)).length, [items]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (openShop && shopRef.current && !shopRef.current.contains(target)) setOpenShop(false);
      if (openStatus && statusRef.current && !statusRef.current.contains(target)) setOpenStatus(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenShop(false);
      setOpenStatus(false);
      setConfirmOpen(false);
      setPlaceOpen(false);
      setCardItem(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openShop, openStatus]);

  useEffect(() => {
    if (!pageNotice) return;
    const timer = window.setTimeout(() => setPageNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [pageNotice]);

  const fetchShops = async () => {
    setShopsErr("");
    try {
      const response = await fetch(`${apiBase}/admin/shops`, { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
      const list: Shop[] = Array.isArray(body?.items) ? body.items : [];
      setShops(list);
      if (list.length && !list.some((shop) => shop.id === shopId)) setShopId(list[0].id);
    } catch (error: any) {
      setShopsErr(String(error?.message || error || "A helységek nem tölthetők be."));
    }
  };

  const fetchList = async () => {
    if (!shopId) return;
    setListErr("");
    setListBusy(true);
    try {
      const url = `${apiBase}/admin/codes?status=${encodeURIComponent(status)}&shopId=${encodeURIComponent(shopId)}`;
      const response = await fetch(url, { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
      setItems(Array.isArray(body?.items) ? body.items : []);
    } catch (error: any) {
      setListErr(String(error?.message || error || "A felhasználói kódok nem tölthetők be."));
      setItems([]);
    } finally {
      setListBusy(false);
    }
  };

  useEffect(() => {
    void fetchShops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  useEffect(() => {
    if (!shopId) return;
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, status, apiBase]);

  const createCode = async () => {
    setErr("");
    setOutText("");
    if (!shopId) {
      setErr("Válassz helységet a kód generálásához.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/admin/codes`, {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ shopId, name: name.trim() }),
      });
      const text = await response.text().catch(() => "");
      if (!response.ok) throw new Error(text || `HTTP ${response.status}`);

      setOutText(text);
      setName("");
      setPageNotice("Az új belépési kód elkészült.");
      await fetchList();
    } catch (error: any) {
      setErr(String(error?.message || error || "A kód generálása nem sikerült."));
    } finally {
      setBusy(false);
    }
  };

  const deleteCode = async (id: string) => {
    setListErr("");
    setRowBusyId(id);
    try {
      const response = await fetch(`${apiBase}/admin/codes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
      setPageNotice("A felhasználói kód véglegesen törölve.");
      await fetchList();
    } catch (error: any) {
      setListErr(String(error?.message || error || "A törlés nem sikerült."));
    } finally {
      setRowBusyId(null);
    }
  };

  const setActive = async (id: string, active: boolean) => {
    setListErr("");
    setRowBusyId(id);
    try {
      const response = await fetch(`${apiBase}/admin/codes/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ active }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
      setPageNotice(active ? "A felhasználó aktiválva." : "A felhasználó inaktiválva.");
      await fetchList();
    } catch (error: any) {
      setListErr(String(error?.message || error || "Az állapot módosítása nem sikerült."));
    } finally {
      setRowBusyId(null);
    }
  };

  const copyText = async (text: string, key: string) => {
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        copied = document.execCommand("copy");
        textarea.remove();
      } catch {
        copied = false;
      }
    }

    if (!copied) {
      setListErr("A másolás nem sikerült. A böngésző nem engedélyezte a vágólap használatát.");
      return;
    }

    setCopiedKey(key);
    setPageNotice("A belépési kód a vágólapra másolva.");
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1800);
  };

  const openConfirmDelete = (id: string) => {
    setConfirmTitle("Végleges törlés");
    setConfirmMsg("Biztosan véglegesen törlöd ezt a felhasználói kódot? A művelet nem vonható vissza.");
    setConfirmAction({ kind: "delete", id });
    setConfirmOpen(true);
  };

  const openConfirmToggle = (id: string, currentlyInactive: boolean) => {
    setConfirmTitle(currentlyInactive ? "Felhasználó aktiválása" : "Felhasználó inaktiválása");
    setConfirmMsg(
      currentlyInactive
        ? "A felhasználó újra be tud majd lépni ezzel a kóddal. Aktiválod?"
        : "A felhasználó nem tud majd belépni, amíg újra nem aktiválod. Inaktiválod?"
    );
    setConfirmAction({ kind: "toggle", id, active: currentlyInactive });
    setConfirmOpen(true);
  };

  const runConfirm = async () => {
    const action = confirmAction;
    setConfirmOpen(false);
    setConfirmAction(null);
    if (!action) return;

    if (action.kind === "delete") {
      await deleteCode(action.id);
      return;
    }
    if (action.kind === "toggle") {
      await setActive(action.id, Boolean(action.active));
      return;
    }
    if (action.kind === "delete-shop") {
      setPlaceBusy(true);
      try {
        const response = await fetch(`${apiBase}/admin/shops/${encodeURIComponent(action.id)}`, {
          method: "DELETE",
          credentials: "include",
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
        setPageNotice("A helység törölve.");
        await fetchShops();
      } catch (error: any) {
        setPlaceErr(String(error?.message || error || "A helység törlése nem sikerült."));
      } finally {
        setPlaceBusy(false);
      }
    }
  };

  const openPlaceModal = () => {
    setPlaceErr("");
    setPlaceName("");
    setPlaceId("");
    setPlaceOpen(true);
  };

  const createPlace = async () => {
    setPlaceErr("");
    const normalizedName = placeName.trim();
    const normalizedId = (placeId.trim() || slugifyId(normalizedName)).trim();

    if (!normalizedName) {
      setPlaceErr("Adj meg egy helységnevet.");
      return;
    }
    if (!normalizedId) {
      setPlaceErr("Adj meg egy azonosítót.");
      return;
    }

    setPlaceBusy(true);
    try {
      const response = await fetch(`${apiBase}/admin/shops`, {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: normalizedId, name: normalizedName }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));

      setPlaceOpen(false);
      setPageNotice("Az új helység létrehozva.");
      await fetchShops();
      setShopId(normalizedId);
    } catch (error: any) {
      setPlaceErr(String(error?.message || error || "A helység létrehozása nem sikerült."));
    } finally {
      setPlaceBusy(false);
    }
  };

  const printAccessCard = (item: CodeItem) => {
    const payload = accessCardPayload(item);
    if (!payload || !item.code) {
      setListErr("Ehhez a felhasználóhoz nem készíthető kártya, mert a teljes belépési kód nem érhető el.");
      return;
    }

    const popup = window.open("", "_blank", "width=900,height=650");
    if (!popup) {
      setListErr("A böngésző letiltotta a nyomtatási ablakot.");
      return;
    }

    const nameText = escapeHtml(item.name || "Név nélküli felhasználó");
    const shopText = escapeHtml(shopName(item.shopId));
    const codeText = escapeHtml(item.code);
    const barcode = code39Svg(payload, 64);

    popup.document.open();
    popup.document.write(`<!doctype html>
<html lang="hu">
<head>
  <meta charset="utf-8" />
  <title>AllIn belépőkártya</title>
  <style>
    @page { size: 85.6mm 54mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      width: 85.6mm;
      height: 54mm;
      margin: 0;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      color: #182233;
    }
    body { display: grid; place-items: center; }
    .card {
      position: relative;
      width: 85.6mm;
      height: 54mm;
      overflow: hidden;
      padding: 5mm 5.5mm 4.5mm;
      border: .35mm solid #2a8d8b;
      border-radius: 4mm;
      background:
        radial-gradient(circle at 92% 10%, rgba(42,141,139,.18), transparent 28%),
        linear-gradient(145deg, #f7fbfb, #ffffff);
    }
    .stripe {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 2.2mm;
      background: #2a8d8b;
    }
    .top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 3mm;
    }
    .brand {
      font-size: 4.1mm;
      letter-spacing: .7mm;
      font-weight: 400;
    }
    .tag {
      border: .25mm solid rgba(42,141,139,.45);
      border-radius: 3mm;
      padding: 1.1mm 2.4mm;
      font-size: 2.4mm;
      color: #206f6d;
      white-space: nowrap;
    }
    .name {
      margin-top: 2.5mm;
      font-size: 4mm;
      font-weight: 400;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .shop {
      margin-top: 1mm;
      font-size: 2.6mm;
      color: #607083;
    }
    .barcode {
      margin-top: 3.1mm;
      width: 74mm;
      height: 14mm;
      background: #fff;
    }
    .barcode svg { width: 100%; height: 100%; display: block; }
    .code {
      margin-top: 1.2mm;
      text-align: center;
      font-family: "Courier New", monospace;
      font-size: 2.9mm;
      letter-spacing: .45mm;
      color: #223044;
    }
    .note {
      position: absolute;
      right: 5.5mm;
      bottom: 2.6mm;
      font-size: 2mm;
      color: #8a96a5;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="stripe"></div>
    <div class="top">
      <div class="brand">ALL IN</div>
      <div class="tag">BELÉPŐKÁRTYA</div>
    </div>
    <div class="name">${nameText}</div>
    <div class="shop">${shopText}</div>
    <div class="barcode">${barcode}</div>
    <div class="code">${codeText}</div>
    <div class="note">PVC 85,6 × 54 mm</div>
  </div>
  <script>
    window.addEventListener("load", function () {
      window.setTimeout(function () {
        window.focus();
        window.print();
      }, 120);
    });
  </script>
</body>
</html>`);
    popup.document.close();
  };

  const CopyButton = ({ value, copyKey, compact = false }: { value: string; copyKey: string; compact?: boolean }) => {
    const copied = copiedKey === copyKey;
    return (
      <button
        type="button"
        className={
          copied
            ? `inline-flex ${compact ? "h-8 px-2.5" : "h-9 px-3"} items-center justify-center gap-1.5 rounded-xl border border-emerald-200/35 bg-emerald-500/18 text-xs text-emerald-50 transition`
            : `inline-flex ${compact ? "h-8 px-2.5" : "h-9 px-3"} items-center justify-center gap-1.5 rounded-xl border border-white/16 bg-white/[0.07] text-xs text-white transition hover:bg-white/[0.12]`
        }
        onClick={() => void copyText(value, copyKey)}
        title={copied ? "A kód másolva" : "Kód másolása"}
        aria-label={copied ? "A kód másolva" : "Kód másolása"}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        <span>{copied ? "Másolva" : "Másolás"}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#4b5362] px-3 py-4 text-white sm:px-4 sm:py-5">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header className="sticky top-2 z-40 rounded-2xl border border-white/20 bg-[#303a4c]/96 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28)] backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-[250px] items-center gap-3 border-l-4 border-[#7bd7d4]/70 pl-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/18 text-[#d7fffd]">
                <UsersRound className="h-5 w-5" />
              </span>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">AllInFashion</div>
                <h1 className="mt-0.5 text-xl leading-tight">Felhasználók</h1>
                <div className="mt-0.5 text-[11px] text-white/48">Belépési kódok, hozzáférések és helységek kezelése</div>
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
              <Button className={btnSoft} type="button" onClick={openPlaceModal}>
                <MapPin className="h-4 w-4" />
                <span className="hidden sm:inline">Helységek kezelése</span>
                <span className="sm:hidden">Helységek</span>
              </Button>
              <Button
                className={btnSoft}
                type="button"
                disabled={listBusy}
                onClick={() => {
                  void fetchShops();
                  void fetchList();
                }}
              >
                <RefreshCw className={`h-4 w-4 ${listBusy ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Frissítés</span>
              </Button>
              <Button className={btn} type="button" onClick={() => (window.location.hash = "#allin")}>
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">Kezdőlap</span>
              </Button>
            </div>
          </div>
        </header>

        {pageNotice ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#7bd7d4]/28 bg-[#174c55]/72 px-4 py-3 text-sm text-[#e5fffd]">
            <span>
              <CheckCircle2 className="mr-2 inline h-4 w-4" />
              {pageNotice}
            </span>
            <button type="button" className="text-white/55 hover:text-white" onClick={() => setPageNotice("")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/13 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.11em] text-[#d7fffd]/62">
              <Store className="h-4 w-4" /> Kiválasztott helység
            </div>
            <div className="mt-2 truncate text-lg text-white">{shopLabel || "-"}</div>
          </div>
          <div className="rounded-2xl border border-emerald-200/20 bg-emerald-500/9 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.11em] text-emerald-100/62">
              <ShieldCheck className="h-4 w-4" /> Aktív a listában
            </div>
            <div className="mt-2 text-lg text-white">{activeCount}</div>
          </div>
          <div className="rounded-2xl border border-amber-200/20 bg-amber-500/9 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.11em] text-amber-100/62">
              <Power className="h-4 w-4" /> Inaktív a listában
            </div>
            <div className="mt-2 text-lg text-white">{inactiveCount}</div>
          </div>
          <div className="rounded-2xl border border-white/12 bg-white/[0.055] p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.11em] text-white/44">
              <UsersRound className="h-4 w-4" /> Belépve
            </div>
            <div className="mt-2 truncate text-lg text-white">{actor || "ADMIN"}</div>
          </div>
        </section>

        {(shopsErr || listErr) && (
          <div className="rounded-2xl border border-rose-200/25 bg-rose-500/12 px-4 py-3 text-sm text-rose-50 whitespace-pre-wrap">
            {[shopsErr, listErr].filter(Boolean).join("\n")}
          </div>
        )}

        <section className={`${panel} relative z-20 overflow-visible`}>
          <div className={panelHead}>
            <div>
              <div className="text-[10px] uppercase tracking-[0.17em] text-white/40">Munkaterület</div>
              <div className="mt-1 flex items-center gap-2 text-base">
                <UserPlus className="h-4 w-4" /> Új belépési kód létrehozása
              </div>
            </div>
            <span className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/55">
              {shopLabel}
            </span>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.9fr)_minmax(180px,0.65fr)_minmax(240px,1fr)_auto] lg:items-end">
              <div ref={shopRef} className="relative grid gap-1.5">
                <div className={label}>Helység</div>
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-left text-sm text-white transition hover:bg-[#465264] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                  onClick={() => {
                    setOpenShop((current) => !current);
                    setOpenStatus(false);
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={openShop}
                >
                  <span className="truncate">{shopLabel}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-white/55 transition ${openShop ? "rotate-180" : ""}`} />
                </button>
                {openShop ? (
                  <div className="absolute left-0 top-full z-[220] mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-white/18 bg-[#354153] shadow-2xl" role="listbox">
                    {shops.map((shop) => (
                      <button
                        key={shop.id}
                        type="button"
                        className={`block w-full px-4 py-2.5 text-left text-sm transition ${shopId === shop.id ? "bg-[#2a8d8b] text-white" : "text-white/82 hover:bg-[#415064]"}`}
                        onClick={() => {
                          setShopId(shop.id);
                          setOpenShop(false);
                        }}
                      >
                        {shop.name}
                      </button>
                    ))}
                    {!shops.length ? <div className="px-4 py-3 text-sm text-white/48">Nincs helység.</div> : null}
                  </div>
                ) : null}
              </div>

              <div ref={statusRef} className="relative grid gap-1.5">
                <div className={label}>Lista állapota</div>
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-left text-sm text-white transition hover:bg-[#465264] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                  onClick={() => {
                    setOpenStatus((current) => !current);
                    setOpenShop(false);
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={openStatus}
                >
                  <span>{statusLabel}</span>
                  <ChevronDown className={`h-4 w-4 text-white/55 transition ${openStatus ? "rotate-180" : ""}`} />
                </button>
                {openStatus ? (
                  <div className="absolute left-0 top-full z-[220] mt-2 w-full overflow-hidden rounded-xl border border-white/18 bg-[#354153] shadow-2xl" role="listbox">
                    {([
                      ["active", "Aktív"],
                      ["inactive", "Inaktív"],
                      ["all", "Összes"],
                    ] as const).map(([value, text]) => (
                      <button
                        key={value}
                        type="button"
                        className={`block w-full px-4 py-2.5 text-left text-sm transition ${status === value ? "bg-[#2a8d8b] text-white" : "text-white/82 hover:bg-[#415064]"}`}
                        onClick={() => {
                          setStatus(value);
                          setOpenStatus(false);
                        }}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <div className={label}>Dolgozó neve</div>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={input}
                  placeholder="Pl. Kovács Anna"
                />
              </div>

              <Button type="button" className={`${btnPrimary} w-full lg:w-auto`} disabled={busy || !shopId} onClick={createCode}>
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {busy ? "Generálás…" : "Kód generálása"}
              </Button>
            </div>

            <div className="rounded-xl border border-[#7bd7d4]/20 bg-[#174c55]/42 px-3 py-2 text-xs leading-5 text-[#e5fffd]/76">
              A kód a kiválasztott helységhez tartozik. Az inaktivált kód nem használható belépésre, de később újra aktiválható.
            </div>

            {err ? (
              <div className="rounded-xl border border-rose-200/25 bg-rose-500/12 px-3 py-2 text-sm text-rose-50 whitespace-pre-wrap">
                {err}
              </div>
            ) : null}

            {outText ? (
              <div className="overflow-hidden rounded-2xl border border-[#7bd7d4]/26 bg-[#173f46]/72">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#7bd7d4]/18 px-4 py-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#d7fffd]/54">Elkészült</div>
                    <div className="mt-1 text-sm text-white">Új belépési kód</div>
                  </div>
                  <CopyButton value={outText} copyKey="generated-code" />
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all px-4 py-4 font-mono text-base text-[#d7fffd]">{outText}</pre>
              </div>
            ) : null}
          </div>
        </section>

        <section className={panel}>
          <div className={panelHead}>
            <div>
              <div className="text-[10px] uppercase tracking-[0.17em] text-white/40">Hozzáférések</div>
              <div className="mt-1 flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" /> Felhasználói kódok
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/55">
                {items.length} találat
              </span>
              <Button type="button" className={btnSoft} disabled={listBusy} onClick={() => void fetchList()}>
                <RefreshCw className={`h-4 w-4 ${listBusy ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Frissítés</span>
              </Button>
            </div>
          </div>

          <div className="p-3 sm:p-4">
            {listBusy && !items.length ? (
              <div className="flex min-h-48 items-center justify-center text-sm text-white/48">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Kódok betöltése…
              </div>
            ) : !items.length ? (
              <div className="flex min-h-48 flex-col items-center justify-center text-center">
                <KeyRound className="h-8 w-8 text-white/22" />
                <div className="mt-3 text-sm text-white/58">A kiválasztott szűréssel nincs felhasználói kód.</div>
              </div>
            ) : (
              <>
                <div className="grid gap-2 md:hidden">
                  {items.map((item) => {
                    const inactive = Boolean(item.revokedAt);
                    const codeValue = item.code || (item.codeHint ? `****${item.codeHint}` : "-");
                    return (
                      <article key={item.id} className="rounded-2xl border border-white/12 bg-white/[0.055] p-3">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-sm text-[#d7fffd]">
                            {initials(item.name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-sm text-white">{item.name || "Név nélküli kód"}</div>
                              <span className={`rounded-full border px-2 py-0.5 text-[9px] ${inactive ? "border-amber-200/25 bg-amber-500/12 text-amber-50" : "border-emerald-200/25 bg-emerald-500/12 text-emerald-50"}`}>
                                {inactive ? "Inaktív" : "Aktív"}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-white/48">{shopName(item.shopId)} · {fmt(item.createdAt)}</div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#303a4c]/72 px-3 py-2">
                          <code className="min-w-0 truncate font-mono text-sm text-white">{codeValue}</code>
                          {item.code ? <CopyButton value={item.code} copyKey={item.id} compact /> : null}
                        </div>

                        <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
                          <button
                            type="button"
                            className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3 text-xs transition disabled:opacity-45 ${inactive ? "border-[#7bd7d4]/35 bg-[#2a8d8b] text-white hover:bg-[#319c99]" : "border-white/16 bg-[#354153] text-white hover:bg-[#3e4d63]"}`}
                            disabled={rowBusyId === item.id}
                            onClick={() => openConfirmToggle(item.id, inactive)}
                          >
                            <Power className="h-4 w-4" />
                            {inactive ? "Aktiválás" : "Inaktiválás"}
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#7bd7d4]/35 bg-[#2a8d8b] px-3 text-xs text-white transition hover:bg-[#319c99] disabled:opacity-45"
                            disabled={!item.code || rowBusyId === item.id}
                            onClick={() => setCardItem(item)}
                            title="PVC belépőkártya"
                          >
                            <CreditCard className="h-4 w-4" />
                            Kártya
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-300/30 bg-rose-600 text-white transition hover:bg-rose-500 disabled:opacity-45"
                            disabled={rowBusyId === item.id}
                            onClick={() => openConfirmDelete(item.id)}
                            title="Végleges törlés"
                            aria-label="Végleges törlés"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="hidden overflow-hidden rounded-2xl border border-white/12 md:block">
                  <div className="grid grid-cols-[minmax(160px,1.1fr)_minmax(150px,0.9fr)_minmax(230px,1.25fr)_150px_330px] items-center bg-[#303a4c] px-3 py-2.5 text-[10px] uppercase tracking-[0.08em] text-white/48">
                    <div>Felhasználó</div>
                    <div>Helység</div>
                    <div>Belépési kód</div>
                    <div>Létrehozva</div>
                    <div className="text-right">Művelet</div>
                  </div>

                  {items.map((item) => {
                    const inactive = Boolean(item.revokedAt);
                    const codeValue = item.code || (item.codeHint ? `****${item.codeHint}` : "-");
                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-[minmax(160px,1.1fr)_minmax(150px,0.9fr)_minmax(230px,1.25fr)_150px_330px] items-center border-t border-white/10 px-3 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#7bd7d4]/22 bg-[#2a8d8b]/13 text-[11px] text-[#d7fffd]">
                            {initials(item.name)}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm text-white">{item.name || "Név nélküli kód"}</div>
                            <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] ${inactive ? "border-amber-200/25 bg-amber-500/12 text-amber-50" : "border-emerald-200/25 bg-emerald-500/12 text-emerald-50"}`}>
                              {inactive ? "Inaktív" : "Aktív"}
                            </span>
                          </div>
                        </div>
                        <div className="truncate text-sm text-white/72">{shopName(item.shopId)}</div>
                        <div className="flex min-w-0 items-center gap-2">
                          <code className="min-w-0 truncate font-mono text-sm text-white">{codeValue}</code>
                          {item.code ? <CopyButton value={item.code} copyKey={item.id} compact /> : null}
                        </div>
                        <div className="text-xs text-white/52">{fmt(item.createdAt)}</div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-[#7bd7d4]/35 bg-[#2a8d8b] px-2.5 text-xs text-white transition hover:bg-[#319c99] disabled:opacity-45"
                            disabled={!item.code || rowBusyId === item.id}
                            onClick={() => setCardItem(item)}
                            title="PVC belépőkártya nyomtatása"
                          >
                            <Printer className="h-4 w-4" />
                            Kártya
                          </button>
                          <button
                            type="button"
                            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs transition disabled:opacity-45 ${inactive ? "border-[#7bd7d4]/35 bg-[#2a8d8b] text-white hover:bg-[#319c99]" : "border-white/16 bg-[#354153] text-white hover:bg-[#3e4d63]"}`}
                            disabled={rowBusyId === item.id}
                            onClick={() => openConfirmToggle(item.id, inactive)}
                          >
                            <Power className="h-4 w-4" />
                            {inactive ? "Aktiválás" : "Inaktiválás"}
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/30 bg-rose-600 text-white transition hover:bg-rose-500 disabled:opacity-45"
                            disabled={rowBusyId === item.id}
                            onClick={() => openConfirmDelete(item.id)}
                            title="Végleges törlés"
                            aria-label="Végleges törlés"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {cardItem ? (
        <div
          className="fixed inset-0 z-[170] grid place-items-center bg-slate-950/80 px-3 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setCardItem(null);
          }}
        >
          <section className="w-full max-w-[720px] overflow-hidden rounded-[26px] border border-[#9be9e5]/34 bg-[#4b5362] text-white shadow-[0_34px_110px_rgba(0,0,0,0.55)]">
            <header className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] to-[#28565c] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#9be9e5]/34 bg-[#2a8d8b]/22 text-[#d7fffd]">
                  <CreditCard className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">PVC belépőkártya</div>
                  <div className="mt-1 text-lg font-normal text-white">{cardItem.name || "Név nélküli felhasználó"}</div>
                </div>
              </div>
              <button type="button" className={iconBtn} onClick={() => setCardItem(null)} aria-label="Bezárás">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="grid place-items-center p-5 sm:p-7">
              <div className="relative aspect-[85.6/54] w-full max-w-[560px] overflow-hidden rounded-[22px] border-2 border-[#2a8d8b] bg-gradient-to-br from-[#f7fbfb] to-white p-6 text-[#182233] shadow-[0_24px_60px_rgba(15,23,42,0.3)]">
                <span className="absolute inset-y-0 left-0 w-3 bg-[#2a8d8b]" />
                <div className="flex items-start justify-between gap-3">
                  <div className="text-2xl font-normal tracking-[0.14em]">ALL IN</div>
                  <span className="rounded-full border border-[#2a8d8b]/35 bg-[#2a8d8b]/8 px-3 py-1 text-[10px] tracking-[0.12em] text-[#206f6d]">
                    BELÉPŐKÁRTYA
                  </span>
                </div>
                <div className="mt-4 truncate text-xl font-normal">{cardItem.name || "Név nélküli felhasználó"}</div>
                <div className="mt-1 text-sm text-slate-500">{shopName(cardItem.shopId)}</div>
                <div
                  className="mt-4 h-[92px] w-full bg-white"
                  dangerouslySetInnerHTML={{ __html: code39Svg(accessCardPayload(cardItem), 64) }}
                />
                <div className="mt-2 text-center font-mono text-sm tracking-[0.16em] text-slate-700">
                  {cardItem.code}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className={btnSoft}
                  onClick={() => setCardItem(null)}
                >
                  Mégse
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => printAccessCard(cardItem)}
                >
                  <Printer className="h-4 w-4" />
                  PVC-kártya nyomtatása
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/78 px-3 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !rowBusyId) setConfirmOpen(false);
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-[24px] border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/12 bg-[#303a4c] px-4 py-3.5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-white/42">Megerősítés</div>
                <div className="mt-1 text-lg text-white">{confirmTitle}</div>
              </div>
              <button type="button" className={iconBtn} onClick={() => setConfirmOpen(false)} aria-label="Bezárás">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 text-sm leading-6 text-white/68">{confirmMsg}</div>
            <div className="flex justify-end gap-2 border-t border-white/12 bg-[#303a4c] px-4 py-3">
              <button type="button" className={btnSoft} onClick={() => setConfirmOpen(false)}>
                Mégse
              </button>
              <button
                type="button"
                className={
                  confirmAction?.kind === "delete" || confirmAction?.kind === "delete-shop"
                    ? "inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-xs text-white transition hover:bg-rose-500"
                    : btnPrimary
                }
                onClick={() => void runConfirm()}
              >
                {confirmAction?.kind === "toggle" ? <Power className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                {confirmAction?.kind === "toggle"
                  ? confirmAction.active
                    ? "Aktiválás"
                    : "Inaktiválás"
                  : "Végleges törlés"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {placeOpen ? (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/76 px-3 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !placeBusy) setPlaceOpen(false);
          }}
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#236d6b] via-[#2a8d8b] to-[#426775] px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/30 bg-white/[0.14] text-white">
                  <MapPin className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/65">Admin settings</div>
                  <div className="mt-0.5 text-xl text-white">Helységek kezelése</div>
                  <div className="mt-1 text-xs text-white/62">Új helység létrehozása vagy meglévő helység törlése.</div>
                </div>
              </div>
              <button type="button" className={iconBtn} disabled={placeBusy} onClick={() => setPlaceOpen(false)} aria-label="Bezárás">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <div className={label}>Helység neve</div>
                  <input
                    className={input}
                    value={placeName}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPlaceName(value);
                      if (!placeId) setPlaceId(slugifyId(value));
                    }}
                    placeholder="Pl. Marosvásárhely"
                    autoFocus
                  />
                </div>
                <div className="grid gap-1.5">
                  <div className={label}>Technikai azonosító</div>
                  <input
                    className={input}
                    value={placeId}
                    onChange={(event) => setPlaceId(event.target.value)}
                    placeholder="pl. marosvasarhely"
                  />
                </div>
              </div>

              {placeErr ? (
                <div className="rounded-xl border border-rose-200/25 bg-rose-500/12 px-3 py-2 text-sm text-rose-50 whitespace-pre-wrap">
                  {placeErr}
                </div>
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-white/12 bg-white/[0.04]">
                <div className="flex items-center justify-between border-b border-white/10 bg-[#303a4c] px-3 py-2.5">
                  <div className="text-sm text-white">Meglévő helységek</div>
                  <span className="rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/52">{shops.length}</span>
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                  {shops.map((shop) => (
                    <div key={shop.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.05]">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-white">{shop.name}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-white/42">{shop.id}</div>
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/30 bg-rose-600 text-white transition hover:bg-rose-500"
                        onClick={() => {
                          setConfirmTitle("Helység végleges törlése");
                          setConfirmMsg(`Biztosan véglegesen törlöd ezt a helységet: ${shop.name}?`);
                          setConfirmAction({ kind: "delete-shop", id: shop.id });
                          setConfirmOpen(true);
                        }}
                        title="Helység törlése"
                        aria-label="Helység törlése"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {!shops.length ? <div className="px-3 py-6 text-center text-sm text-white/48">Nincs létrehozott helység.</div> : null}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/12 bg-[#303a4c] px-4 py-3">
              <button type="button" className={btnSoft} disabled={placeBusy} onClick={() => setPlaceOpen(false)}>
                Mégse
              </button>
              <button type="button" className={btnPrimary} disabled={placeBusy} onClick={() => void createPlace()}>
                {placeBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {placeBusy ? "Mentés…" : "Helység létrehozása"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
