import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Save,
  Search,
  ShoppingBag,
  UserPlus,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  apiAifCreateShopCustomer,
  apiAifListShopCustomers,
  type AifShopCustomer,
} from "../lib/aif/api";

type ClientMode = "search" | "new" | "detail";

type Props = {
  open: boolean;
  initialMode?: "search" | "new";
  locationName: string;
  onClose: () => void;
};

type CustomerDraft = {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  note: string;
};

const EMPTY_DRAFT: CustomerDraft = {
  fullName: "",
  phone: "",
  email: "",
  address: "",
  note: "",
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: unknown) {
  return `${numberValue(value).toLocaleString("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} RON`;
}

export default function AllInMagazinClients({
  open,
  initialMode = "search",
  locationName,
  onClose,
}: Props) {
  const [mode, setMode] = useState<ClientMode>(initialMode);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AifShopCustomer[]>([]);
  const [selected, setSelected] = useState<AifShopCustomer | null>(null);
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setSelected(null);
    setError("");
    if (initialMode === "new") {
      setDraft(EMPTY_DRAFT);
    } else {
      setQuery("");
      void loadCustomers("");
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mode === "detail") {
          setMode("search");
          setSelected(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, mode, onClose]);

  async function loadCustomers(value = query) {
    setLoading(true);
    setError("");
    try {
      const response = await apiAifListShopCustomers({
        search: value.trim(),
        limit: 100,
      });
      setItems(response.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A klienslista nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }

  function openSearch() {
    setMode("search");
    setSelected(null);
    setError("");
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function openNew(prefillName = "") {
    setMode("new");
    setSelected(null);
    setDraft({ ...EMPTY_DRAFT, fullName: prefillName });
    setError("");
  }

  async function saveCustomer() {
    const fullName = draft.fullName.trim();
    const phone = draft.phone.trim();
    if (!fullName || !phone) {
      setError("A név és a telefonszám kötelező.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await apiAifCreateShopCustomer({
        fullName,
        phone,
        email: draft.email.trim() || null,
        address: draft.address.trim() || null,
        note: draft.note.trim() || null,
      });
      const saved = response.item;
      setItems((current) => {
        const exists = current.some((item) => item.id === saved.id);
        return exists
          ? current.map((item) => item.id === saved.id ? saved : item)
          : [saved, ...current];
      });
      setSelected(saved);
      setMode("detail");
      setDraft(EMPTY_DRAFT);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kliens mentése nem sikerült.");
    } finally {
      setSaving(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-[#111827]/82 p-3 backdrop-blur-sm sm:p-5">
      <div
        style={{ color: "#ffffff" }}
        className="flex max-h-[94vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/38 bg-[#303a4c] text-white shadow-[0_36px_110px_rgba(0,0,0,0.58)] [&_button]:font-normal [&_input]:font-normal [&_textarea]:font-normal"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] to-[#28565c] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#9be9e5]/35 bg-[#2a8d8b]/24 text-[#d7fffd]">
              <Users size={24} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Vevői nyilvántartás</p>
              <h2 className="mt-1 truncate text-xl text-white">Kliensek</h2>
              <p className="mt-1 truncate text-xs text-white/45">{locationName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openSearch}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs text-white transition ${
                mode === "search" || mode === "detail"
                  ? "border-[#9be9e5]/45 bg-[#2a8d8b]"
                  : "border-white/15 bg-white/[0.05] hover:bg-white/[0.09]"
              }`}
            >
              <Search size={15} /> Lista
            </button>
            <button
              type="button"
              onClick={() => openNew()}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs text-white transition ${
                mode === "new"
                  ? "border-[#9be9e5]/45 bg-[#2a8d8b]"
                  : "border-white/15 bg-white/[0.05] hover:bg-white/[0.09]"
              }`}
            >
              <UserPlus size={15} /> Új kliens
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Bezárás"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] text-white hover:bg-white/[0.1]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="mx-4 mt-4 rounded-2xl border border-rose-300/35 bg-rose-500/16 px-4 py-3 text-sm text-rose-50 sm:mx-5">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {mode === "search" ? (
            <>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8ee6e2]" size={20} />
                  <input
                    ref={searchInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void loadCustomers(query);
                    }}
                    placeholder="Név, telefonszám vagy e-mail…"
                    className="h-14 w-full rounded-2xl border border-white/18 bg-[#273243] pl-12 pr-4 text-base text-white outline-none placeholder:text-white/45 focus:border-[#72d8d4] focus:ring-4 focus:ring-[#2a8d8b]/16"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void loadCustomers(query)}
                  className="inline-flex h-14 min-w-[140px] items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99]"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                  Keresés
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs text-white/48">{items.length} kliens</span>
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      void loadCustomers("");
                    }}
                    className="h-9 rounded-xl border border-white/14 bg-white/[0.05] px-3 text-xs text-white/70 hover:bg-white/[0.09]"
                  >
                    Szűrés törlése
                  </button>
                ) : null}
              </div>

              {loading ? (
                <div className="flex min-h-[320px] items-center justify-center gap-3 text-white/55">
                  <Loader2 className="animate-spin" /> Kliensek betöltése…
                </div>
              ) : items.length ? (
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelected(item);
                        setMode("detail");
                      }}
                      className="group rounded-[20px] border border-white/13 bg-[#374357] p-4 text-left text-white transition hover:border-[#72d8d4]/50 hover:bg-[#3d4a5f] active:scale-[0.99]"
                    >
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/28 bg-[#2a8d8b]/16 text-[#d7fffd]">
                          <UserRound size={20} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="truncate text-base text-white">{item.fullName}</p>
                            <span className="rounded-full border border-white/12 bg-black/10 px-2 py-1 text-[10px] text-white/60">
                              {numberValue(item.saleCount)} vásárlás
                            </span>
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-white/55">
                            {item.phone ? <p className="flex items-center gap-2"><Phone size={13} className="text-[#8ee6e2]" />{item.phone}</p> : null}
                            {item.email ? <p className="flex items-center gap-2 truncate"><Mail size={13} className="text-[#8ee6e2]" />{item.email}</p> : null}
                            {item.address ? <p className="flex items-center gap-2 truncate"><MapPin size={13} className="text-[#8ee6e2]" />{item.address}</p> : null}
                          </div>
                          <div className="mt-3 flex justify-end">
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] ${
                              numberValue(item.openBalance) > 0
                                ? "border-rose-300/30 bg-rose-500/14 text-rose-50"
                                : "border-[#7bd7d4]/25 bg-[#2a8d8b]/14 text-[#d7fffd]"
                            }`}>
                              Hátralék: {formatMoney(item.openBalance)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex min-h-[320px] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/15 bg-black/5 px-5 text-center">
                  <Users size={38} className="text-white/30" />
                  <p className="mt-3 text-base text-white/70">Nincs találat</p>
                  <button
                    type="button"
                    onClick={() => openNew(query)}
                    className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl border border-[#9be9e5]/40 bg-[#2a8d8b] px-4 text-sm text-white"
                  >
                    <UserPlus size={17} /> Új kliens
                  </button>
                </div>
              )}
            </>
          ) : mode === "new" ? (
            <div className="mx-auto max-w-[780px] rounded-[22px] border border-white/13 bg-[#374357] p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#7bd7d4]/28 bg-[#2a8d8b]/16 text-[#d7fffd]">
                  <UserPlus size={20} />
                </span>
                <h3 className="text-lg text-white">Új kliens</h3>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  Név *
                  <input
                    autoFocus
                    value={draft.fullName}
                    onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))}
                    className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]"
                  />
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  Telefonszám *
                  <input
                    value={draft.phone}
                    onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
                    className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]"
                  />
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  E-mail
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                    className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]"
                  />
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  Cím
                  <input
                    value={draft.address}
                    onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))}
                    className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]"
                  />
                </label>
              </div>

              <label className="mt-3 grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                Megjegyzés
                <textarea
                  value={draft.note}
                  onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                  rows={3}
                  className="resize-none rounded-xl border border-white/16 bg-[#273243] px-3 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]"
                />
              </label>

              <div className="mt-4 flex justify-end gap-2 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={openSearch}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm text-white hover:bg-white/[0.09]"
                >
                  <X size={17} /> Mégse
                </button>
                <button
                  type="button"
                  onClick={() => void saveCustomer()}
                  disabled={saving}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
                  Mentés
                </button>
              </div>
            </div>
          ) : selected ? (
            <div className="mx-auto max-w-[820px]">
              <button
                type="button"
                onClick={openSearch}
                className="mb-3 inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-3 text-xs text-white hover:bg-white/[0.09]"
              >
                <ArrowLeft size={15} /> Vissza a listához
              </button>

              <div className="rounded-[24px] border border-white/14 bg-[#374357] p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/18 text-[#d7fffd]">
                    <UserRound size={25} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-2xl text-white">{selected.fullName}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-black/10 px-3 py-2 text-xs text-white/70">
                        <ShoppingBag size={14} className="text-[#8ee6e2]" /> {numberValue(selected.saleCount)} vásárlás
                      </span>
                      <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                        numberValue(selected.openBalance) > 0
                          ? "border-rose-300/30 bg-rose-500/14 text-rose-50"
                          : "border-[#7bd7d4]/25 bg-[#2a8d8b]/14 text-[#d7fffd]"
                      }`}>
                        <WalletCards size={14} /> Hátralék: {formatMoney(selected.openBalance)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                    <p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Telefonszám</p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-white"><Phone size={15} className="text-[#8ee6e2]" />{selected.phone || "-"}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                    <p className="text-[9px] uppercase tracking-[0.1em] text-white/42">E-mail</p>
                    <p className="mt-2 flex items-center gap-2 truncate text-sm text-white"><Mail size={15} className="text-[#8ee6e2]" />{selected.email || "-"}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#293548] p-3 sm:col-span-2">
                    <p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Cím</p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-white"><MapPin size={15} className="text-[#8ee6e2]" />{selected.address || "-"}</p>
                  </div>
                  {selected.notes ? (
                    <div className="rounded-2xl border border-white/10 bg-[#293548] p-3 sm:col-span-2">
                      <p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Megjegyzés</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/72">{selected.notes}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end border-t border-white/12 bg-[#293548] px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm text-white hover:bg-white/[0.09]"
          >
            <X size={17} /> Bezárás
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
