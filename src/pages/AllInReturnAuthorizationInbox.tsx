import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  Clipboard,
  Clock3,
  KeyRound,
  Loader2,
  LockKeyhole,
  MapPin,
  PackageSearch,
  ShieldCheck,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import {
  apiAifRejectShopReturnAuthorization,
  apiAifShopReturnAuthorizationInbox,
  type AifShopReturnAuthorizationInboxItem,
} from "../lib/aif/api";

type Props = {
  locationCode: "main_warehouse" | "magazin_targu_secuiesc";
  locationName: string;
};

function formatDateTime(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function secondsRemaining(value?: string | null) {
  if (!value) return 0;
  const ms = new Date(value).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

function countdownLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function AllInReturnAuthorizationInbox({ locationCode, locationName }: Props) {
  const [items, setItems] = useState<AifShopReturnAuthorizationInboxItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>({});

  async function refresh() {
    try {
      const response = await apiAifShopReturnAuthorizationInbox({ location: locationCode });
      setItems(response.items || []);
    } catch {
      // A háttér-poll ne takarja tele hibával az admin oldalt. A következő kör újrapróbálja.
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [locationCode]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const current = useMemo(() => {
    void tick;
    const now = Date.now();
    return items.find((item) => (snoozedUntil[item.id] || 0) <= now) || null;
  }, [items, snoozedUntil, tick]);

  const remaining = secondsRemaining(current?.expiresAt);

  async function rejectCurrent() {
    if (!current || busy) return;
    setBusy(true);
    try {
      await apiAifRejectShopReturnAuthorization(current.id, { location: locationCode });
      setItems((list) => list.filter((item) => item.id !== current.id));
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!current?.code) return;
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  if (!current || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[360] flex items-center justify-center bg-[#111827]/84 p-4 backdrop-blur-sm">
      <section className="w-full max-w-[720px] overflow-hidden rounded-[30px] border border-[#9be9e5]/42 bg-[#303a4c] text-white shadow-[0_38px_120px_rgba(0,0,0,0.62)]">
        <header className="flex items-start justify-between gap-4 border-b border-white/12 bg-gradient-to-r from-[#1d4d52] via-[#247b79] to-[#2a8d8b] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/26 bg-white/12">
              <ShieldCheck size={24} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.17em] text-white/62">Másik üzlet árlekérése</p>
              <h2 className="mt-1 truncate text-xl">Egyszer használható feloldókód</h2>
              <p className="mt-1 text-xs text-white/66">{locationName}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSnoozedUntil((currentSnooze) => ({ ...currentSnooze, [current.id]: Date.now() + 30000 }))}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-black/10 text-white hover:bg-white/12 disabled:opacity-50"
            title="Elrejtés 30 másodpercre"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-5">
          <div className="grid gap-3 md:grid-cols-[112px_minmax(0,1fr)]">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[22px] border border-white/14 bg-white/95">
              {current.product.imageUrl ? (
                <img src={current.product.imageUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <PackageSearch size={38} className="text-[#536173]" />
              )}
            </div>
            <div className="min-w-0 rounded-[22px] border border-white/12 bg-[#374357] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg">{current.product.title}</h3>
                  <p className="mt-1 text-xs text-white/55">
                    {[current.product.brandName, current.product.colorName, current.product.size].filter(Boolean).join(" • ") || "–"}
                  </p>
                </div>
                <span className="rounded-full border border-[#9be9e5]/32 bg-[#2a8d8b]/18 px-3 py-1 text-[10px] text-[#d7fffd]">
                  {current.product.productCode || current.product.barcode || "kód nélkül"}
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-[#293548] px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Lekérő üzlet</p>
                  <p className="mt-1 flex items-center gap-2 text-sm"><MapPin size={14} className="text-[#8ee6e2]" />{current.requestingLocation.name}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#293548] px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Eredeti eladás</p>
                  <p className="mt-1 text-sm">{current.saleNumber}</p>
                  <p className="mt-1 text-[10px] text-white/45">{formatDateTime(current.soldAt)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#293548] px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Kliens</p>
                  <p className="mt-1 flex items-center gap-2 text-sm"><UserRound size={14} className="text-[#8ee6e2]" />{current.customerName || "Nem volt hozzárendelve"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#293548] px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Kérés indítója</p>
                  <p className="mt-1 text-sm">{current.requestedBy || "Üzleti felhasználó"}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-[#9be9e5]/38 bg-[#243c45] p-4 text-center shadow-[0_16px_38px_rgba(42,141,139,0.16)]">
            <div className="flex items-center justify-center gap-2 text-xs text-[#d7fffd]/72">
              <KeyRound size={16} /> A másik üzlet csak ezzel az egyszer használható kóddal láthatja az eredeti árat és kedvezményt.
            </div>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="mx-auto mt-3 flex min-h-[92px] w-full max-w-[410px] items-center justify-center gap-5 rounded-[22px] border border-white/25 bg-white/[0.08] px-6 transition hover:bg-white/[0.12] active:scale-[0.99]"
            >
              <span className="font-mono text-6xl tracking-[0.22em] text-white">{current.code}</span>
              {copied ? <CheckCircle2 size={24} className="shrink-0 text-[#9ff3ef]" /> : <Clipboard size={22} className="shrink-0 text-white/58" />}
            </button>
            <div className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${remaining <= 60 ? "border-amber-200/35 bg-amber-400/10 text-amber-50" : "border-white/14 bg-black/10 text-white/60"}`}>
              <Clock3 size={14} /> Lejár: {countdownLabel(remaining)}
            </div>
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-[#293548] px-4 py-3 text-xs leading-relaxed text-white/55">
            <LockKeyhole size={18} className="mt-0.5 shrink-0 text-[#8ee6e2]" />
            <p>A kód nem az eredeti eladóhoz kötött. Ebből az üzletből bármelyik éppen dolgozó kolléga megadhatja a másik üzletnek. Sikeres feloldás után a kód azonnal érvényét veszti.</p>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/12 bg-[#293548] px-5 py-4">
          <p className="text-xs text-white/42">Függő árlekérések: {items.length}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void rejectCurrent()}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-rose-300/50 bg-rose-600 px-4 text-sm text-white hover:bg-rose-500 disabled:opacity-55"
          >
            {busy ? <Loader2 className="animate-spin" size={17} /> : <XCircle size={17} />} Elutasítás
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
