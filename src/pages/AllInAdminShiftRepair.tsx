import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Store,
  UserCheck,
  Wrench,
  X,
} from "lucide-react";
import {
  apiAifAdminRepairShopDayClosure,
  apiAifAdminShopShiftRepairPreview,
  type AifAdminShopShiftRepairPreview,
  type AifShopShiftHandover,
} from "../lib/aif/api";

export type AllInAdminShiftRepairLocation = {
  code: string;
  name: string;
  cityName?: string;
};

type Props = {
  open: boolean;
  actor: string;
  locations: AllInAdminShiftRepairLocation[];
  initialLocationCode?: string;
  initialWorkDate?: string;
  onClose: () => void;
  onRepaired?: () => void | Promise<void>;
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return `${numberValue(value).toLocaleString("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} RON`;
}

function dateTime(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString("hu-HU", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AllInAdminShiftRepair({
  open,
  actor,
  locations,
  initialLocationCode = "",
  initialWorkDate = "",
  onClose,
  onRepaired,
}: Props) {
  const availableLocations = useMemo(
    () => locations.filter((item) => String(item.code || "").trim()),
    [locations],
  );
  const [locationCode, setLocationCode] = useState("");
  const [preview, setPreview] = useState<AifAdminShopShiftRepairPreview | null>(null);
  const [targetActor, setTargetActor] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<AifShopShiftHandover | null>(null);

  const selectedLocation = availableLocations.find((item) => item.code === locationCode) || null;

  async function loadPreview(code = locationCode) {
    if (!code) return;
    setLoading(true);
    setError("");
    setCreated(null);
    try {
      const response = await apiAifAdminShopShiftRepairPreview(code, initialWorkDate || undefined);
      setPreview(response);
      setTargetActor((current) => {
        if (response.employees.some((item) => item.name === current)) return current;
        return "";
      });
    } catch (caught) {
      setPreview(null);
      setTargetActor("");
      setError(caught instanceof Error ? caught.message : "A műszakjavítás állapota nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }

  async function repair() {
    if (!locationCode || !targetActor || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiAifAdminRepairShopDayClosure({
        location: locationCode,
        toActor: targetActor,
        workDate: preview?.workDate || initialWorkDate || undefined,
      });
      setCreated(response.item);
      setPreview((current) => current ? { ...current, closure: null, pending: response.item, canRepair: false, reason: null } : current);
      window.dispatchEvent(new CustomEvent("allin:shift-handover-changed", { detail: { locationCode } }));
      await onRepaired?.();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "A hibás napzárás javítása nem sikerült.";
      await loadPreview(locationCode);
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setTargetActor("");
    setError("");
    setCreated(null);
    const requested = availableLocations.find((item) => item.code === initialLocationCode)?.code || "";
    const nextCode = requested || (availableLocations.length === 1 ? availableLocations[0].code : "");
    setLocationCode(nextCode);
    if (nextCode) void loadPreview(nextCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialLocationCode, initialWorkDate]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose, open, saving]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[540] flex items-center justify-center bg-[#0b1220]/90 p-3 backdrop-blur-md sm:p-5"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !saving) onClose();
      }}
    >
      <section className="flex max-h-[94vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[28px] border border-[#9be9e5]/38 bg-[#303a4c] text-white shadow-[0_40px_120px_rgba(0,0,0,0.66)]">
        <header className="flex items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] via-[#285057] to-[#287d79] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#9be9e5]/34 bg-[#2a8d8b]/22 text-[#d7fffd]">
              <Wrench size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.15em] text-white/48">Admin</p>
              <h2 className="mt-1 truncate text-xl text-white">Műszak javítás</h2>
              <p className="mt-1 truncate text-[11px] text-white/48">{actor}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] text-white transition hover:bg-white/[0.1] disabled:opacity-45"
            aria-label="Bezárás"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {!locationCode ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {availableLocations.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    setLocationCode(item.code);
                    void loadPreview(item.code);
                  }}
                  className="flex min-h-[88px] items-center gap-3 rounded-2xl border border-white/14 bg-[#344154] p-4 text-left transition hover:border-[#8ce7e2]/42 hover:bg-[#394a5f] active:scale-[0.99]"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/25 bg-[#2a8d8b]/14 text-[#d7fffd]">
                    <Store size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white">{item.cityName || item.name}</span>
                    <span className="mt-1 block truncate text-[10px] text-white/45">{item.name}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#293548] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Üzlet</p>
                  <p className="mt-1 truncate text-sm text-white">{selectedLocation?.cityName || selectedLocation?.name || locationCode}</p>
                  {(preview?.workDate || initialWorkDate) ? <p className="mt-0.5 text-[10px] text-[#bff8f5]/62">Nap: {preview?.workDate || initialWorkDate}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {availableLocations.length > 1 ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setLocationCode("");
                        setPreview(null);
                        setCreated(null);
                        setError("");
                      }}
                      className="h-9 rounded-xl border border-white/14 bg-white/[0.04] px-3 text-[11px] text-white/70 disabled:opacity-45"
                    >
                      Másik üzlet
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={loading || saving}
                    onClick={() => void loadPreview()}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/14 bg-white/[0.04] text-white/70 disabled:opacity-45"
                    aria-label="Frissítés"
                  >
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {error ? (
                <div className="mb-3 flex items-start gap-2.5 rounded-2xl border border-rose-200/30 bg-rose-500/14 px-3.5 py-3 text-sm text-rose-50">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              {loading ? (
                <div className="flex min-h-[260px] items-center justify-center gap-3 text-sm text-white/55">
                  <Loader2 size={20} className="animate-spin text-[#8ee6e2]" /> Betöltés...
                </div>
              ) : created ? (
                <div className="rounded-[24px] border border-[#9be9e5]/40 bg-[#24585d] p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-[#bff8f5]" />
                    <div className="min-w-0">
                      <p className="text-base text-white">{created.fromActor} <ArrowRight className="mx-1 inline" size={15} /> {created.toActor}</p>
                      <p className="mt-2 text-2xl text-[#d7fffd]">{money(created.expectedCash)}</p>
                      <p className="mt-2 text-xs text-white/58">Átvételre vár.</p>
                    </div>
                  </div>
                </div>
              ) : preview ? (
                <>
                  {preview.closure ? (
                    <section className="rounded-[24px] border border-amber-200/24 bg-[#3a414f] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Hibás napzárás</p>
                          <p className="mt-1 text-lg text-white">{preview.closure.actor}</p>
                          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-white/48"><Clock3 size={13} /> {dateTime(preview.closure.closedAt)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Kassza</p>
                          <p className="mt-1 text-xl text-[#d7fffd]">{money(preview.closure.countedCash)}</p>
                        </div>
                      </div>
                      {preview.closure.note ? (
                        <p className="mt-3 rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-[11px] text-white/58">{preview.closure.note}</p>
                      ) : null}
                    </section>
                  ) : null}

                  {preview.canRepair ? (
                    <section className="mt-3 rounded-[24px] border border-[#9be9e5]/28 bg-[#293548] p-4">
                      <div className="flex items-center gap-2.5">
                        <UserCheck size={18} className="text-[#8ee6e2]" />
                        <p className="text-sm text-white">Ki veszi át?</p>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {preview.employees.map((employee) => {
                          const active = targetActor === employee.name;
                          return (
                            <button
                              key={employee.name}
                              type="button"
                              onClick={() => setTargetActor(employee.name)}
                              className={`min-h-11 rounded-xl border px-3 text-left text-sm transition ${
                                active
                                  ? "border-[#9be9e5]/55 bg-[#2a8d8b] text-white"
                                  : "border-white/12 bg-[#344154] text-white/72 hover:border-[#7bd7d4]/32"
                              }`}
                            >
                              {employee.name}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ) : preview.reason ? (
                    <div className="mt-3 rounded-2xl border border-white/12 bg-[#293548] px-4 py-3 text-sm text-white/65">{preview.reason}</div>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/12 bg-[#293548] px-4 py-3.5 sm:px-5">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/14 bg-white/[0.05] px-4 text-sm text-white disabled:opacity-45"
          >
            <X size={15} /> Bezárás
          </button>
          {preview?.canRepair && !created ? (
            <button
              type="button"
              disabled={!targetActor || saving}
              onClick={() => void repair()}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#9be9e5]/48 bg-[#2a8d8b] px-4 text-sm text-white shadow-[0_8px_20px_rgba(42,141,139,0.20)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
              {saving ? "Javítás..." : targetActor ? `Átadás → ${targetActor}` : "Válassz átvevőt"}
            </button>
          ) : null}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
