import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Banknote,
  Barcode,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  History,
  Landmark,
  Loader2,
  Minus,
  PackageSearch,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  X,
} from "lucide-react";
import {
  apiAifCompleteShopExchange,
  apiAifRequestShopReturnAuthorization,
  apiAifShopReturnAuthorizationStatus,
  apiAifShopReturnHistory,
  apiAifShopSaleCatalog,
  apiAifUnlockShopReturnAuthorization,
  type AifShopExchangeHistoryItem,
  type AifShopExchangeResult,
  type AifShopReturnAuthorizationRequest,
  type AifShopReturnSaleMatch,
  type AifShopSaleCatalogItem,
} from "../lib/aif/api";

type Props = {
  open: boolean;
  actor: string;
  locationCode: "main_warehouse" | "magazin_targu_secuiesc";
  locationName: string;
  onClose: () => void;
  onOpenShopify?: () => void;
};

type ReplacementLine = AifShopSaleCatalogItem & { quantity: number };

type AuthorizationState = {
  saleLineId: string;
  item: AifShopReturnAuthorizationRequest;
  code: string;
  status: string;
  unlockToken?: string | null;
  unlockExpiresAt?: string | null;
};

const SETTLEMENT_OPTIONS = [
  { value: "cash", label: "Készpénz", icon: Banknote },
  { value: "card", label: "Bankkártya", icon: CreditCard },
  { value: "bank_transfer", label: "Átutalás", icon: Landmark },
] as const;

type SettlementMethod = (typeof SETTLEMENT_OPTIONS)[number]["value"];

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

function productCode(item: AifShopSaleCatalogItem) {
  return item.productCode || item.modelCode || item.internalSku || item.barcode || "–";
}

function exactCatalogMatch(item: AifShopSaleCatalogItem, query: string) {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return false;
  return [item.barcode, item.internalSku, item.productCode]
    .filter(Boolean)
    .some((value) => String(value).trim().toLowerCase() === wanted);
}

function createRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `exchange-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// A bizonylat teljes visszaru-kezelesehez tartozo ket vegpont.
// A regota hasznalt, egy termeksoros API-t nem modositjuk a kliens-tipusokban.
async function receiptReturnRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok === false) {
    throw new Error(String(data?.error || `Bizonylat hiba: HTTP ${response.status}`));
  }
  return data as T;
}

type VoucherFundingPreview = {
  ok: true; hasVoucher: boolean; enabled: boolean; consistent?: boolean; sameStore?: boolean;
  restricted?: boolean; originalTotal?: number; voucherPaid?: number;
  previousReturned?: number; previousRestored?: number;
  externalMethod?: "cash" | "card" | "bank_transfer" | null;
};
type ReceiptSearchMatch = AifShopReturnSaleMatch & { saleTotal?: number | null };
type ReturnAuthorization = { authorizationId: string; unlockToken: string };
type ReceiptReturnResult = AifShopExchangeResult & {
  voucherRefund?: {code: string;voucherRestored: number;voucherBalanceAfter?: number;
    externalRefund: number; externalMethod?: string | null};
  exchangeIds?: string[];
  returnedLines?: Array<{ saleLineId: string; title: string; returnedQty: number; returnCredit: number }>;
};

function SaleProductImage({ item }: { item: AifShopReturnSaleMatch }) {
  return (
    <span className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/14 bg-white/95">
      {item.product.imageUrl ? (
        <img src={item.product.imageUrl} alt="" className="h-full w-full object-contain" />
      ) : (
        <PackageSearch size={28} className="text-[#526173]" />
      )}
    </span>
  );
}

export default function AllInShopReturns({ open, actor, locationCode, locationName, onClose, onOpenShopify }: Props) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchDate, setSearchDate] = useState("");
  const [dateWindowDays, setDateWindowDays] = useState<0 | 3 | 7 | 30>(0);
  const [matches, setMatches] = useState<ReceiptSearchMatch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchRan, setSearchRan] = useState(false);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchTimerRef = useRef<number | null>(null);
  const searchRequestRef = useRef(0);

  const [authorization, setAuthorization] = useState<AuthorizationState | null>(null);
  const [authorizationBusy, setAuthorizationBusy] = useState(false);

  const [selectedSource, setSelectedSource] = useState<AifShopReturnSaleMatch | null>(null);
  const [receiptLines, setReceiptLines] = useState<AifShopReturnSaleMatch[]>([]);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptReady, setReceiptReady] = useState(false);
  const [voucherFunding, setVoucherFunding] = useState<VoucherFundingPreview | null>(null);
  const [selectedReturns, setSelectedReturns] = useState<Record<string, number>>({});
  const [authorizedReturns, setAuthorizedReturns] = useState<Record<string, ReturnAuthorization>>({});
  const receiptRequestRef = useRef(0);

  const [replacementQuery, setReplacementQuery] = useState("");
  const [replacementResults, setReplacementResults] = useState<AifShopSaleCatalogItem[]>([]);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementCart, setReplacementCart] = useState<ReplacementLine[]>([]);
  const replacementInputRef = useRef<HTMLInputElement | null>(null);
  const replacementTimerRef = useRef<number | null>(null);

  const [settlementMethod, setSettlementMethod] = useState<SettlementMethod>("cash");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<AifShopExchangeResult | null>(null);
  const requestKeyRef = useRef("");

  const [history, setHistory] = useState<AifShopExchangeHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Egy kozos visszaruhoz tobb eredeti eladasi sor, de egy penzugyi
  // elszamolas tartozik. Az elozmenyben ez egyetlen csoportkent jelenjen meg.
  const historyGroups = useMemo(() => {
    type WithBatch = AifShopExchangeHistoryItem & { returnBatchId?: string | null; returnBatchPrimary?: boolean };
    const groups = new Map<string, WithBatch[]>();
    for (const entry of history as WithBatch[]) {
      const key = entry.returnBatchId || entry.id;
      const group = groups.get(key) || [];
      group.push(entry);
      groups.set(key, group);
    }
    return Array.from(groups.values());
  }, [history]);

  // A vonalkodbol tobb eladas is szarmazhat. Ugyanazt a nyugtat csak
  // egyszer mutatjuk, nem keverjuk a kulonbozo vasarlok azonos termekeit.
  const receiptMatches = useMemo(() => {
    const grouped = new Map<string, ReceiptSearchMatch[]>();
    for (const item of matches) {
      const list = grouped.get(item.saleId) || [];
      list.push(item);
      grouped.set(item.saleId, list);
    }
    return Array.from(grouped.values());
  }, [matches]);

  const returnCredit = useMemo(
    () => Math.round(receiptLines.reduce((sum, item) =>
      sum + numberValue(item.unitPrice) * numberValue(selectedReturns[item.saleLineId]), 0) * 100) / 100,
    [receiptLines, selectedReturns],
  );
  const selectedCount = receiptLines.filter((item) => numberValue(selectedReturns[item.saleLineId]) > 0).length;
  const selectedQty = receiptLines.reduce((sum, item) => sum + numberValue(selectedReturns[item.saleLineId]), 0);
  const replacementTotal = useMemo(
    () => replacementCart.reduce((sum, item) => sum + numberValue(item.sellPrice) * item.quantity, 0),
    [replacementCart],
  );
  const difference = Math.round((replacementTotal - returnCredit + Number.EPSILON) * 100) / 100;
  const settlementDirection = difference > 0.005 ? "in" : difference < -0.005 ? "out" : "none";
  const voucherRefundPreview = useMemo(() => {
    if(!voucherFunding?.hasVoucher)return null;
    const total=Math.round(numberValue(voucherFunding.originalTotal)*100);
    const voucher=Math.round(numberValue(voucherFunding.voucherPaid)*100);
    const prior=Math.round(numberValue(voucherFunding.previousReturned)*100);
    const restored=Math.round(numberValue(voucherFunding.previousRestored)*100);
    const current=Math.round(returnCredit*100);
    if(total<=0||voucher<=0||prior+current>total||restored<0)return null;
    const returnVoucher=Math.round((prior+current)*voucher/total)-restored;
    if(returnVoucher<0||returnVoucher>current)return null;
    return {voucher:returnVoucher/100,external:(current-returnVoucher)/100};
  },[voucherFunding,returnCredit]);

  function cancelSearchTimer() {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  }

  function cancelReplacementTimer() {
    if (replacementTimerRef.current !== null) {
      window.clearTimeout(replacementTimerRef.current);
      replacementTimerRef.current = null;
    }
  }

  function invalidateRequest() {
    requestKeyRef.current = "";
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const response = await apiAifShopReturnHistory({ location: locationCode, limit: 60 });
      setHistory(response.items || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function searchSales(value = searchQuery) {
    const query = value.trim();
    cancelSearchTimer();
    const request = ++searchRequestRef.current;
    if (!query) {
      setMatches([]);
      setSearchTruncated(false);
      setSearchLoading(false);
      setSearchRan(false);
      return;
    }
    setSearchLoading(true);
    setSearchRan(true);
    setError("");
    setNotice("");
    setAuthorization(null);
    try {
      const limit = searchDate ? 300 : 150;
      const params = new URLSearchParams({ location: locationCode, search: query, limit: String(limit) });
      if (searchDate) {
        params.set("saleDate", searchDate);
        params.set("windowDays", String(dateWindowDays));
      }
      const response = await receiptReturnRequest<{ ok: true; items: ReceiptSearchMatch[]; count: number }>(
        `/api/aif/shop-returns/sales?${params.toString()}`,
      );
      if (request !== searchRequestRef.current) return;
      setMatches(response.items || []);
      setSearchTruncated(Number(response.count || 0) >= limit);
    } catch (caught) {
      if (request !== searchRequestRef.current) return;
      setError(caught instanceof Error ? caught.message : "A korábbi eladások nem tölthetők be.");
      setMatches([]);
      setSearchTruncated(false);
    } finally {
      if (request === searchRequestRef.current) setSearchLoading(false);
    }
  }

  async function loadReceipt(item: AifShopReturnSaleMatch) {
    const request = ++receiptRequestRef.current;
    setReceiptReady(false);
    setReceiptLoading(true);
    try {
      const query = new URLSearchParams({ location: locationCode });
      const [result,funding] = await Promise.all([
        receiptReturnRequest<{ ok: true; items: AifShopReturnSaleMatch[]; count: number }>(
          `/api/aif/shop-returns/sales/${encodeURIComponent(item.saleId)}/lines?${query.toString()}`,
        ),
        receiptReturnRequest<VoucherFundingPreview>(
          `/api/aif/shop-returns/voucher-funding/${encodeURIComponent(item.saleId)}?${query.toString()}`,
        ),
      ]);
      if (request !== receiptRequestRef.current) return;
      if (!Array.isArray(result.items) || !result.items.some((row) => row.saleLineId === item.saleLineId)) {
        throw new Error("A bizonylaton nem talalhato a kivalasztott termek.");
      }
      // A friss szerverallapot az iranyado, nem a talalati lista korabbi
      // darabszama. Masik uzlet egyszer mar feloldott arat viszont megtartjuk.
      const merged = result.items.map((row) => {
        if (row.saleLineId !== item.saleLineId || row.priceVisible || !item.priceVisible) return row;
        return {
          ...row,
          priceVisible: true,
          listPrice: item.listPrice, unitPrice: item.unitPrice,
          discountPercent: item.discountPercent, discountAmount: item.discountAmount,
          lineTotal: item.lineTotal,
        };
      });
      setReceiptLines(merged);
      setVoucherFunding(funding);
      if(funding.hasVoucher && funding.externalMethod)setSettlementMethod(funding.externalMethod);
      const currentSource = merged.find((row) => row.saleLineId === item.saleLineId)!;
      setSelectedReturns(currentSource.priceVisible && currentSource.eligible !== false && currentSource.remainingQty > 0 && currentSource.product.variantId
        ? { [item.saleLineId]: 1 } : {});
      setReceiptReady(true);
    } catch (caught) {
      if (request !== receiptRequestRef.current) return;
      setError(caught instanceof Error ? caught.message : "A bizonylat termekei nem tolthetok be.");
      // Nem engedunk reszleges visszarut, ha a teljes bizonylat nem ellenorizheto.
      setReceiptLines([]);
      setVoucherFunding(null);
      setReceiptReady(false);
    } finally {
      if (request === receiptRequestRef.current) setReceiptLoading(false);
    }
  }

  function setReturnLineQty(item: AifShopReturnSaleMatch, quantity: number) {
    if (!item.priceVisible || item.eligible === false || !item.product.variantId) return;
    invalidateRequest();
    setSelectedReturns((current) => ({
      ...current,
      [item.saleLineId]: Math.min(Math.max(0, Math.trunc(quantity)), Math.max(0, item.remainingQty)),
    }));
  }

  async function requestAuthorization(item: AifShopReturnSaleMatch) {
    setAuthorizationBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiAifRequestShopReturnAuthorization({ location: locationCode, saleLineId: item.saleLineId });
      if (!response.required || !response.item) {
        if (selectedSource) {
          setReceiptLines((current) => current.map((row) => row.saleLineId === item.saleLineId ? item : row));
          setReturnLineQty(item, 1);
        } else {
          selectSource(item);
        }
        return;
      }
      setAuthorization({
        saleLineId: item.saleLineId,
        item: response.item,
        code: "",
        status: response.item.status || "pending",
      });
      setNotice(`${response.item.sourceLocation.name} üzletében megjelent az egyszer használható 4 számjegyű feloldókód.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az árlekérés nem indítható el.");
    } finally {
      setAuthorizationBusy(false);
    }
  }

  async function unlockAuthorization() {
    if (!authorization || !/^\d{4}$/.test(authorization.code)) {
      setError("Írd be a másik üzlettől kapott 4 számjegyű kódot.");
      return;
    }
    setAuthorizationBusy(true);
    setError("");
    try {
      const response = await apiAifUnlockShopReturnAuthorization(authorization.item.id, {
        location: locationCode,
        code: authorization.code,
      });
      setMatches((current) => current.map((item) => item.saleLineId === response.item.saleLineId ? response.item : item));
      if (selectedSource) {
        setReceiptLines((current) => current.map((row) => row.saleLineId === response.item.saleLineId ? response.item : row));
        setAuthorizedReturns((current) => ({ ...current, [response.item.saleLineId]: {
          authorizationId: authorization.item.id, unlockToken: response.unlockToken,
        }}));
        setReturnLineQty(response.item, 1);
        setAuthorization(null);
      } else {
        selectSource(response.item, authorization.item.id, response.unlockToken);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A feloldókód ellenőrzése nem sikerült.");
    } finally {
      setAuthorizationBusy(false);
    }
  }

  function selectSource(item: AifShopReturnSaleMatch, authorizationId: string | null = null, unlockToken: string | null = null) {
    if (item.eligible === false) {
      setError("Ehhez az eredeti eladáshoz még nyitott tartozás tartozik. A csere előtt előbb rendezd a tartozást.");
      return;
    }
    setSelectedSource(item);
    setVoucherFunding(null);
    setReceiptLines([item]);
    setReceiptReady(false);
    setSelectedReturns(item.priceVisible && item.eligible !== false && item.remainingQty > 0 && item.product.variantId
      ? { [item.saleLineId]: 1 } : {});
    setAuthorizedReturns(authorizationId && unlockToken ? {
      [item.saleLineId]: { authorizationId, unlockToken },
    } : {});
    setAuthorization(null);
    void loadReceipt(item);
    setReplacementQuery("");
    setReplacementResults([]);
    setReplacementCart([]);
    setSettlementMethod("cash");
    setNote("");
    setError("");
    setNotice("");
    invalidateRequest();
    window.setTimeout(() => replacementInputRef.current?.focus(), 100);
  }

  function resetWorkflow({ keepSearch = false } = {}) {
    receiptRequestRef.current += 1;
    setSelectedSource(null);
    setVoucherFunding(null);
    setReceiptLines([]);
    setReceiptLoading(false);
    setReceiptReady(false);
    setSelectedReturns({});
    setAuthorizedReturns({});
    setReplacementQuery("");
    setReplacementResults([]);
    setReplacementCart([]);
    setSettlementMethod("cash");
    setNote("");
    setAuthorization(null);
    setError("");
    setNotice("");
    invalidateRequest();
    if (!keepSearch) {
      setSearchQuery("");
      setSearchDate("");
      setDateWindowDays(0);
      setMatches([]);
      setSearchRan(false);
      setSearchTruncated(false);
      searchRequestRef.current += 1;
    }
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  async function searchReplacement(value = replacementQuery, autoAddExact = false) {
    if(voucherFunding?.hasVoucher){setError('Utalvannyal fizetett vasarlasnal a csere-termek egyelore nem engedelyezett.');return;}
    const query = value.trim();
    cancelReplacementTimer();
    if (!query) {
      setReplacementResults([]);
      return;
    }
    setReplacementLoading(true);
    setError("");
    try {
      const response = await apiAifShopSaleCatalog({ location: locationCode, search: query, limit: 80 });
      const items = response.items || [];
      setReplacementResults(items);
      if (autoAddExact) {
        const exact = items.filter((item) => exactCatalogMatch(item, query));
        if (exact.length === 1) {
          addReplacement(exact[0]);
          setReplacementQuery("");
          setReplacementResults([]);
          window.setTimeout(() => replacementInputRef.current?.focus(), 0);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A csere-termék keresése nem sikerült.");
    } finally {
      setReplacementLoading(false);
    }
  }

  function addReplacement(item: AifShopSaleCatalogItem) {
    if(voucherFunding?.hasVoucher){setError('Utalvanyos visszarunal csak az eredeti fizetesi modokra torteno visszaterites engedelyezett.');return;}
    const available = numberValue(item.availableQty);
    if (available <= 0) {
      setError("Ebből a termékből nincs elérhető készlet ebben az üzletben.");
      return;
    }
    invalidateRequest();
    setReplacementCart((current) => {
      const existing = current.find((line) => line.variantId === item.variantId);
      if (existing) {
        if (existing.quantity >= available) {
          setError(`Legfeljebb ${available} db adható ehhez a cseréhez.`);
          return current;
        }
        return current.map((line) => line.variantId === item.variantId ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, { ...item, quantity: 1 }];
    });
  }

  function setReplacementQty(variantId: string, next: number) {
    invalidateRequest();
    setReplacementCart((current) => current.flatMap((line) => {
      if (line.variantId !== variantId) return [line];
      if (next <= 0) return [];
      return [{ ...line, quantity: Math.min(numberValue(line.availableQty), next) }];
    }));
  }

  async function completeExchange() {
    if (!selectedSource || !receiptReady) return;
    const chosen = receiptLines.filter((item) => numberValue(selectedReturns[item.saleLineId]) > 0);
    if (!chosen.length) {
      setError("Jelolj ki legalabb egy visszahozott termeket.");
      return;
    }
    for (const line of chosen) {
      const qty = numberValue(selectedReturns[line.saleLineId]);
      if (!line.priceVisible || line.eligible === false || qty > line.remainingQty || !line.product.variantId) {
        setError(`${line.product.title}: nem veheto vissza a megadott mennyiseg.`);
        return;
      }
    }
    if(voucherFunding?.hasVoucher && (!voucherFunding.enabled || voucherFunding.consistent===false ||
       voucherFunding.sameStore===false || !voucherRefundPreview || replacementCart.length>0)) {
      setError('Az utalvanyos visszaru meg nem aktivalhato, vagy penzugyi ellenorzest igenyel.');
      return;
    }
    setSubmitting(true);
    setError("");
    if (!requestKeyRef.current) requestKeyRef.current = createRequestKey();
    const returns = chosen.map((item) => ({
      saleLineId: item.saleLineId,
      returnedQty: numberValue(selectedReturns[item.saleLineId]),
      authorizationId: authorizedReturns[item.saleLineId]?.authorizationId || null,
      unlockToken: authorizedReturns[item.saleLineId]?.unlockToken || null,
    }));
    try {
      const input = {
        location: locationCode,
        replacements: replacementCart.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
        settlementMethod: settlementDirection === "none" ? null : settlementMethod,
        note: note.trim() || null,
        idempotencyKey: requestKeyRef.current,
      };
      const result: ReceiptReturnResult = returns.length === 1
        ? await apiAifCompleteShopExchange({ ...input, ...returns[0] })
        : await receiptReturnRequest<ReceiptReturnResult>("/api/aif/shop-returns/exchanges", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": requestKeyRef.current },
            body: JSON.stringify({ ...input, returns }),
          });
      setSuccess(result);
      requestKeyRef.current = "";
      await loadHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A visszaru/csere lezarasa nem sikerult.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setError("");
    setNotice("");
    setSearchQuery("");
    setSearchDate("");
    setDateWindowDays(0);
    setMatches([]);
    setSearchTruncated(false);
    searchRequestRef.current += 1;
    setSearchRan(false);
    setAuthorization(null);
    setSuccess(null);
    resetWorkflow();
    void loadHistory();
  }, [locationCode, open]);

  useEffect(() => {
    if (!open || selectedSource) return;
    cancelSearchTimer();
    const value = searchQuery.trim();
    if (value.length < 8 || /\s/.test(value)) return;
    searchTimerRef.current = window.setTimeout(() => {
      searchTimerRef.current = null;
      void searchSales(value);
    }, 180);
    return cancelSearchTimer;
  }, [open, searchQuery, selectedSource]);

  useEffect(() => {
    if (!open || selectedSource || !searchRan || !searchQuery.trim()) return;
    cancelSearchTimer();
    // A regi datum-keresesi valasz nem villanhat fel az uj datum alatt.
    searchRequestRef.current += 1;
    setMatches([]);
    setSearchTruncated(false);
    setSearchLoading(true);
    searchTimerRef.current = window.setTimeout(() => {
      searchTimerRef.current = null;
      void searchSales(searchQuery);
    }, 260);
    return cancelSearchTimer;
    // Csak a datum es az idosav valtoztatasakor keressunk automatikusan ujra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDate, dateWindowDays]);

  useEffect(() => {
    if (!open || !selectedSource) return;
    cancelReplacementTimer();
    const value = replacementQuery.trim();
    if (value.length < 8 || /\s/.test(value)) return;
    replacementTimerRef.current = window.setTimeout(() => {
      replacementTimerRef.current = null;
      void searchReplacement(value, true);
    }, 180);
    return cancelReplacementTimer;
  }, [open, replacementQuery, selectedSource]);

  useEffect(() => {
    if (!authorization || authorization.status !== "pending") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await apiAifShopReturnAuthorizationStatus(authorization.item.id, { location: locationCode });
        if (response.status === "rejected" || response.status === "expired") {
          setAuthorization((current) => current ? { ...current, status: response.status } : current);
          setError(response.status === "rejected" ? "A másik üzlet elutasította az árlekérést." : "A feloldókód lejárt. Kérj új kódot.");
        }
      } catch {
        // A kézi kódbevitel ettől még működjön.
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [authorization?.item.id, authorization?.status, locationCode]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (success) {
        setSuccess(null);
        resetWorkflow();
        return;
      }
      if (selectedSource) {
        resetWorkflow({ keepSearch: true });
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      cancelSearchTimer();
      cancelReplacementTimer();
    };
  }, [onClose, open, selectedSource, success]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[270] flex items-center justify-center bg-[#111827]/84 p-3 backdrop-blur-sm sm:p-5">
      <section className="flex max-h-[96vh] w-full max-w-[1480px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/38 bg-[#303a4c] text-white shadow-[0_40px_120px_rgba(0,0,0,0.62)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] via-[#28565c] to-[#2a8d8b] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/12">
              <RotateCcw size={24} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.17em] text-white/58">Vevői visszáru és csere</p>
              <h2 className="mt-1 truncate text-xl">Visszáru központ</h2>
              <p className="mt-1 truncate text-xs text-white/62">{actor} • {locationName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenShopify ? <button type="button" onClick={onOpenShopify} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#96BF48]/55 bg-[#96BF48]/20 px-3 text-sm">
              <img src="https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/spfyicon.png" alt="" className="h-5 w-5 object-contain" /> Shopify visszáru</button> : null}
            <button
              type="button"
              onClick={() => setHistoryOpen((value) => !value)}
              className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm ${historyOpen ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/16 bg-black/10 hover:bg-white/10"}`}
            >
              <History size={17} /> Előzmények
            </button>
            <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-black/10 hover:bg-white/12"><X size={19} /></button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {error ? <div className="mb-4 rounded-2xl border border-rose-300/40 bg-rose-500/16 px-4 py-3 text-sm text-rose-50">{error}</div> : null}
          {notice ? <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/14 px-4 py-3 text-sm text-[#d7fffd]"><ShieldCheck size={18} className="mt-0.5 shrink-0" />{notice}</div> : null}

          {historyOpen ? (
            <section className="mb-4 rounded-[24px] border border-white/14 bg-[#374357] p-4">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-[10px] uppercase tracking-[0.13em] text-white/42">Visszanézhető napló</p><h3 className="mt-1 text-lg">Legutóbbi visszáruk és cserék</h3></div>
                <button type="button" onClick={() => void loadHistory()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/14 bg-[#293548] px-3 text-xs hover:bg-[#354153]"><RefreshCw className={historyLoading ? "animate-spin" : ""} size={15} /> Frissítés</button>
              </div>
              <div className="mt-3 max-h-[310px] space-y-2 overflow-y-auto pr-1">
                {historyGroups.map((group) => {
                  const item = group.find((row) => row.returnBatchPrimary) || group[0];
                  const totalCredit = group.reduce((sum, row) => sum + numberValue(row.returnCredit), 0);
                  const totalReplacement = group.reduce((sum, row) => sum + numberValue(row.replacementTotal), 0);
                  const totalDifference = group.reduce((sum, row) => sum + numberValue(row.difference), 0);
                  return (
                    <div key={item.returnBatchId || item.id} className="grid gap-2 rounded-2xl border border-white/10 bg-[#293548] p-3 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{item.exchangeNumber} {group.length > 1 ? `• ${group.length} visszavett termék` : `• ${item.sourceProduct.title}`}</p>
                        {group.length > 1 ? <p className="mt-1 break-words text-[11px] text-white/68">{group.map((row) => `${row.sourceProduct.title} (${row.returnedQty} db)`).join(" • ")}</p> : null}
                        <p className="mt-1 text-[11px] text-white/45">{formatDateTime(item.createdAt)} • {item.actor || "–"} • Eredet: {item.sourceLocation.name}</p>
                      </div>
                      <div><p className="text-[9px] uppercase text-white/38">Visszavett érték</p><p className="mt-1 text-sm text-[#d7fffd]">{formatMoney(totalCredit)}</p></div>
                      <div><p className="text-[9px] uppercase text-white/38">Új termékek</p><p className="mt-1 text-sm">{formatMoney(totalReplacement)}</p></div>
                      <div className={`rounded-xl border px-3 py-2 text-right ${totalDifference > 0 ? "border-amber-200/25 bg-amber-400/10 text-amber-50" : totalDifference < 0 ? "border-sky-200/25 bg-sky-400/10 text-sky-50" : "border-[#7bd7d4]/25 bg-[#2a8d8b]/12 text-[#d7fffd]"}`}>
                        <p className="text-[9px] uppercase opacity-60">Különbözet</p><p className="mt-1 text-sm">{formatMoney(totalDifference)}</p>
                      </div>
                    </div>
                  );
                })}
                {!historyLoading && !history.length ? <div className="rounded-2xl border border-dashed border-white/12 py-8 text-center text-sm text-white/42">Még nincs rögzített visszáru vagy csere ebben az üzletben.</div> : null}
              </div>
            </section>
          ) : null}

          {!selectedSource ? (
            <>
              <section className="rounded-[24px] border border-white/14 bg-[#374357] p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><p className="text-[10px] uppercase tracking-[0.13em] text-white/42">1. lépés</p><h3 className="mt-1 text-lg">Olvasd be a visszahozott terméket</h3><p className="mt-1 text-xs text-white/46">A talalat teljes bizonylata is megnyithato.</p></div>
                  <span className="rounded-full border border-white/12 bg-black/10 px-3 py-1 text-[10px] text-white/50">Árak üzletenként védve</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <label className="relative block">
                    <Barcode className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#91e5e1]" size={23} />
                    <input
                      ref={searchInputRef}
                      autoFocus
                      value={searchQuery}
                      onChange={(event) => {
                        searchRequestRef.current += 1;
                        setSearchQuery(event.target.value);
                        setMatches([]);
                        setSearchTruncated(false);
                        setSearchRan(false);
                        setSearchLoading(false);
                      }}
                      onKeyDown={(event) => { if (event.key === "Enter") void searchSales(event.currentTarget.value); }}
                      placeholder="Vonalkód, termékkód vagy bizonylatszám…"
                      className="h-16 w-full rounded-2xl border border-white/20 bg-[#273243] pl-14 pr-4 text-lg text-white outline-none placeholder:text-white/35 focus:border-[#72d8d4] focus:ring-4 focus:ring-[#2a8d8b]/18"
                    />
                  </label>
                  <button type="button" disabled={searchLoading} onClick={() => void searchSales()} className="inline-flex h-16 min-w-[150px] items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-base hover:bg-[#319c99] disabled:opacity-55">
                    {searchLoading ? <Loader2 className="animate-spin" size={21} /> : <Search size={21} />} Keresés
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2.5 rounded-2xl border border-white/10 bg-[#293548]/60 p-2.5 sm:px-3">
                  <label className="min-w-[176px] flex-1 sm:max-w-[245px]">
                    <span className="mb-1.5 flex items-center gap-1.5 text-[11px] text-white/62"><CalendarDays size={14} className="text-[#9be9e5]"/> Nyugta dátuma / kb. dátum</span>
                    <input type="date" value={searchDate} onChange={(event) => setSearchDate(event.target.value)}
                      className="h-11 w-full rounded-xl border border-white/18 bg-[#223044] px-3 text-[13px] text-white outline-none [color-scheme:dark] focus:border-[#92e8e4]"/>
                  </label>
                  <div className="min-w-0 flex-1">
                    <span className="mb-1.5 block text-[11px] text-white/55">Mennyire pontos?</span>
                    <div className="flex flex-wrap gap-1.5">
                      {([0, 3, 7, 30] as const).map((days) => (
                        <button key={days} type="button" disabled={!searchDate}
                          aria-pressed={dateWindowDays === days}
                          onClick={() => setDateWindowDays(days)}
                          className={`inline-flex h-11 min-w-[71px] items-center justify-center rounded-xl border px-3 text-[12px] transition disabled:cursor-not-allowed disabled:opacity-30 ${dateWindowDays === days && searchDate ? "border-[#a6f5ef]/60 bg-[#2a8d8b] text-white" : "border-white/14 bg-[#374357] text-white/68 hover:border-white/35 hover:text-white"}`}>
                          {days ? `±${days} nap` : "Pontos nap"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {searchDate ? <button type="button" onClick={() => { setSearchDate(""); setDateWindowDays(0); }}
                    className="inline-flex h-11 items-center gap-1 rounded-xl border border-white/14 bg-white/[0.04] px-3 text-xs text-white/65 hover:text-white"><X size={14}/> Dátum törlése</button> : null}
                </div>
              </section>

              {searchLoading ? <div className="flex min-h-[180px] items-center justify-center gap-3 text-sm text-white/55"><Loader2 className="animate-spin" size={18} /> Eladások keresése…</div> : receiptMatches.length ? (
                <div className="mt-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-white/58">
                    <span>{receiptMatches.length} korábbi vásárlás</span>
                    {searchTruncated ? <span className="text-amber-100">Sok találat. Szűkítsd a dátumot.</span> : null}
                  </div>
                  {receiptMatches.map((group) => {
                    const item = group[0];
                    const visibleTotal = (item as ReceiptSearchMatch).saleTotal;
                    return (
                      <article key={item.saleId} className={`rounded-[20px] border p-3 transition sm:p-3.5 ${item.sameStore ? "border-white/14 bg-[#374357]" : "border-amber-200/20 bg-[#3d414b]"}`}>
                        <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[13px] border border-white/12 bg-white/95">
                            {item.product.imageUrl ? <img src={item.product.imageUrl} alt="" className="h-full w-full object-contain"/> : <PackageSearch size={23} className="text-[#526173]"/>}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-[16px] tabular-nums text-white">
                              <CalendarDays size={16} className="text-[#9be9e5]"/> {formatDateTime(item.soldAt)}
                              <span className="rounded-lg border border-white/13 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/72">{item.saleLocation.name}</span>
                            </p>
                            <p className="mt-1.5 truncate text-[12px] text-white/88" title={group.map((row) => row.product.title).join(", ")}>{group.map((row) => row.product.title).join(" • ")}</p>
                            <p className="mt-1 text-[10px] text-white/50">{item.actor || "–"} • {group.length > 1 ? `${group.length} egyező terméksor` : `${item.remainingQty} db visszavehető`}</p>
                            <p className="mt-0.5 truncate text-[10px] text-white/36">Bizonylat: {item.saleNumber}</p>
                          </div>
                          <div className="flex w-full shrink-0 items-center justify-between gap-3 border-t border-white/10 pt-2.5 sm:w-[204px] sm:flex-col sm:items-stretch sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0 sm:text-right">
                            <div className="min-w-0">
                              <p className="text-[9px] uppercase tracking-[0.07em] text-white/42">Vásárlás összege</p>
                              <p className="mt-1 text-[17px] tabular-nums text-[#d7fffd]">{visibleTotal == null ? "Védett" : formatMoney(visibleTotal)}</p>
                            </div>
                            <button type="button" disabled={item.eligible === false} onClick={() => selectSource(item)}
                              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-3 text-[12px] text-white transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-40">
                              <Receipt size={16}/> {item.eligible === false ? "Tartozás" : "Bizonylat megnyitása"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : searchRan ? (
                <div className="mt-4 flex min-h-[320px] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/14 bg-[#273243]/40 text-center text-white/45"><PackageSearch size={40} /><p className="mt-3 text-base text-white/70">Ehhez a kódhoz nincs visszavehető korábbi eladás.</p></div>
              ) : (
                <div className="mt-4 flex min-h-[280px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#7bd7d4]/18 bg-[#273243]/40 text-center"><Barcode size={44} className="text-[#8ee6e2]/55" /><p className="mt-3 text-lg text-white/75">A terméket kell először beolvasni</p><p className="mt-1 text-sm text-white/42">Nem kell bizonylatot keresgélni. A rendszer kilistázza, mikor és hol adták el.</p></div>
              )}
            </>
          ) : (
            <>
              <button type="button" onClick={() => resetWorkflow({ keepSearch: true })} className="mb-3 inline-flex h-10 items-center gap-2 rounded-xl border border-white/14 bg-white/[0.05] px-3 text-xs hover:bg-white/[0.1]"><ArrowLeft size={15} /> Vissza az eladásokhoz</button>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
                <section className="min-w-0 rounded-[24px] border border-[#7bd7d4]/24 bg-[#374357] p-3.5 sm:p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-white/42">Eredeti bizonylat</p>
                      <h3 className="mt-1 text-base text-white">{selectedSource.saleNumber}</h3>
                      <p className="mt-1 text-[11px] text-white/48">{formatDateTime(selectedSource.soldAt)} • {selectedSource.saleLocation.name}</p>
                    </div>
                    <span className="shrink-0 rounded-xl border border-[#9be9e5]/30 bg-[#2a8d8b]/16 px-3 py-1.5 text-[11px] text-[#d7fffd]">{selectedCount} termék • {selectedQty} db</span>
                  </div>
                  {receiptLoading ? (
                    <div className="flex min-h-48 items-center justify-center gap-2 rounded-xl border border-white/12 bg-[#293548] text-xs text-white/65"><Loader2 size={16} className="animate-spin"/> Bizonylat ellenőrzése…</div>
                  ) : !receiptReady ? (
                    <div className="rounded-xl border border-rose-300/24 bg-rose-500/10 p-4 text-xs text-rose-50">A teljes bizonylat nem érhető el. A visszavétel addig nem indítható.</div>
                  ) : (
                    <div className="space-y-2">
                      {receiptLines.map((item, index) => {
                        const qty = numberValue(selectedReturns[item.saleLineId]);
                        const active = qty > 0;
                        const locked = !item.priceVisible;
                        const eligible = item.eligible !== false && item.remainingQty > 0 && Boolean(item.product.variantId);
                        const authHere = authorization?.saleLineId === item.saleLineId ? authorization : null;
                        return (
                          <div key={item.saleLineId} className={`rounded-[17px] border p-3 transition ${active ? "border-[#8ce7e2]/65 bg-[#24595b]/45" : "border-white/12 bg-[#293548]"}`}>
                            <div className="flex min-w-0 items-start gap-3">
                              <SaleProductImage item={item} />
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] text-white/40">{index + 1}. termék</p>
                                <p className="mt-0.5 text-sm leading-5 text-white">{item.product.title}</p>
                                <p className="mt-1 text-[11px] text-white/52">{[item.product.colorName, item.product.size].filter(Boolean).join(" • ")}</p>
                                <p className="mt-1 truncate font-mono text-[10px] text-white/40">{item.product.barcode || item.product.productCode || ""}</p>
                              </div>
                              {!locked && eligible ? (
                                <button type="button" disabled={submitting} onClick={() => setReturnLineQty(item, active ? 0 : 1)} aria-pressed={active}
                                  className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] transition disabled:opacity-40 ${active ? "border-[#b0fff9]/65 bg-[#108D8B] text-white" : "border-white/22 bg-white/5 text-white/75 hover:bg-white/10"}`}>
                                  {active ? <CheckCircle2 size={15}/> : <Plus size={14}/>} {active ? "Kijelölve" : "Visszaveszem"}
                                </button>
                              ) : null}
                            </div>
                            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                              <div className="min-w-0">
                                {locked ? (
                                  <p className="text-xs text-amber-100">Másik üzlet • ár feloldása szükséges</p>
                                ) : (
                                  <>
                                    <p className="text-[10px] text-white/45">Eredeti {formatMoney(item.listPrice)} • Kedv. {numberValue(item.discountPercent).toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%</p>
                                    <p className="mt-0.5 text-sm tabular-nums text-[#d7fffd]">{formatMoney(item.unitPrice)} / db</p>
                                  </>
                                )}
                              </div>
                              {eligible && !locked ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-white/45">{item.remainingQty} db visszavehető</span>
                                  <div className="inline-grid grid-cols-[33px_34px_33px] overflow-hidden rounded-lg border border-white/18 bg-[#202c3d]">
                                    <button type="button" disabled={submitting || qty <= 0} aria-label="Darabszám csökkentése" onClick={() => setReturnLineQty(item, qty - 1)} className="h-9 hover:bg-white/10 disabled:opacity-25"><Minus size={14} className="mx-auto"/></button>
                                    <span className="flex h-9 items-center justify-center border-x border-white/12 text-sm tabular-nums">{qty}</span>
                                    <button type="button" disabled={submitting || qty >= item.remainingQty} aria-label="Darabszám növelése" onClick={() => setReturnLineQty(item, qty + 1)} className="h-9 hover:bg-white/10 disabled:opacity-25"><Plus size={14} className="mx-auto"/></button>
                                  </div>
                                </div>
                              ) : !locked ? <span className="text-xs text-amber-100">{item.remainingQty <= 0 ? "Már visszavéve" : item.eligible === false ? "Nyitott tartozás" : "Nem azonosítható termék"}</span> : null}
                            </div>
                            {locked && eligible ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                {!authHere ? (
                                  <button type="button" disabled={authorizationBusy || Boolean(authorization?.status === "pending") || submitting} onClick={() => void requestAuthorization(item)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-200/28 bg-amber-400/12 px-3 text-xs text-amber-50 disabled:opacity-40"><ShieldCheck size={14}/> Ár lekérése</button>
                                ) : authHere.status === "pending" ? (
                                  <>
                                    <input value={authHere.code} maxLength={4} inputMode="numeric" placeholder="4 jegyű kód" onChange={(event) => setAuthorization((current) => current ? { ...current, code: event.target.value.replace(/\D/g, "").slice(0, 4) } : current)} className="h-9 w-32 rounded-lg border border-white/20 bg-[#202c3d] px-3 text-center text-sm outline-none"/>
                                    <button type="button" disabled={authorizationBusy || authHere.code.length !== 4} onClick={() => void unlockAuthorization()} className="h-9 rounded-lg bg-[#2a8d8b] px-3 text-xs disabled:opacity-40">Feloldás</button>
                                  </>
                                ) : (
                                  <button type="button" onClick={() => void requestAuthorization(item)} className="text-xs text-amber-100">Új kód kérése</button>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-[17px] border border-[#9be9e5]/44 bg-[#24595b] px-4 py-3">
                    <span className="text-[12px] text-[#d7fffd]">Visszáru összesen</span>
                    <span className="text-[clamp(1.25rem,2.2vw,1.7rem)] tabular-nums text-white">{formatMoney(returnCredit)}</span>
                  </div>
                </section>

                <section className="rounded-[24px] border border-white/14 bg-[#374357] p-4">
                  <div><p className="text-[10px] uppercase tracking-[0.12em] text-white/42">2. lépés</p><h3 className="mt-1 text-lg">Mire cseréli?</h3><p className="mt-1 text-xs text-white/46">{voucherFunding?.hasVoucher ? 'Utalvánnyal fizetett vásárlásnál most csak visszatérítés engedélyezett, új terméket külön vásárlásként rögzíts.' : 'Olvasd be az új terméket. Több terméket is hozzáadhatsz.'}</p></div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <label className="relative block"><Barcode className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#91e5e1]" size={21} /><input disabled={Boolean(voucherFunding?.hasVoucher)} ref={replacementInputRef} value={replacementQuery} onChange={(event) => setReplacementQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchReplacement(event.currentTarget.value, true); }} placeholder="Új termék vonalkódja…" className="h-14 w-full rounded-2xl border border-white/18 bg-[#273243] pl-12 pr-4 text-base outline-none placeholder:text-white/35 focus:border-[#72d8d4]" /></label>
                    <button type="button" disabled={replacementLoading || Boolean(voucherFunding?.hasVoucher)} onClick={() => void searchReplacement(replacementQuery, true)} className="inline-flex h-14 min-w-[130px] items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/40 bg-[#2a8d8b] px-4 text-sm disabled:opacity-50">{replacementLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />} Keresés</button>
                  </div>

                  {replacementResults.length ? <div className="mt-3 grid max-h-[220px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{replacementResults.map((item) => <button key={item.variantId} type="button" onClick={() => addReplacement(item)} className="grid grid-cols-[58px_1fr_auto] items-center gap-2 rounded-2xl border border-white/10 bg-[#293548] p-2 text-left hover:border-[#72d8d4]/40"><span className="flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-xl bg-white/95">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-contain" /> : <PackageSearch size={22} className="text-[#526173]" />}</span><span className="min-w-0"><span className="block truncate text-sm">{item.title}</span><span className="mt-1 block truncate text-[10px] text-white/45">{[item.colorName, item.size, productCode(item)].filter(Boolean).join(" • ")}</span></span><span className="text-right"><span className="block text-sm text-[#d7fffd]">{formatMoney(item.sellPrice)}</span><span className="mt-1 block text-[10px] text-white/40">{item.availableQty} db</span></span></button>)}</div> : null}

                  <div className="mt-4 space-y-2">
                    {replacementCart.map((line) => (
                      <div key={line.variantId} className="grid grid-cols-[58px_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-[#293548] p-3">
                        <span className="flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-xl bg-white/95">{line.imageUrl ? <img src={line.imageUrl} alt="" className="h-full w-full object-contain" /> : <PackageSearch size={22} className="text-[#526173]" />}</span>
                        <div className="min-w-0"><p className="truncate text-sm">{line.title}</p><p className="mt-1 truncate text-[10px] text-white/45">{[line.colorName, line.size, productCode(line)].filter(Boolean).join(" • ")}</p><p className="mt-1 text-sm text-[#d7fffd]">{formatMoney(numberValue(line.sellPrice) * line.quantity)}</p></div>
                        <div className="inline-grid grid-cols-[36px_42px_36px] overflow-hidden rounded-xl border border-white/12 bg-[#253144]"><button type="button" onClick={() => setReplacementQty(line.variantId, line.quantity - 1)} className="h-10 hover:bg-white/8"><Minus size={14} className="mx-auto" /></button><span className="inline-flex h-10 items-center justify-center border-x border-white/10">{line.quantity}</span><button type="button" onClick={() => setReplacementQty(line.variantId, line.quantity + 1)} className="h-10 hover:bg-white/8"><Plus size={14} className="mx-auto" /></button></div>
                      </div>
                    ))}
                    {!replacementCart.length ? <div className="flex min-h-[120px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-center text-white/40"><ShoppingBag size={28} /><p className="mt-2 text-xs">Ha nem adsz hozzá új terméket, a folyamat sima visszáruként zárható le.</p></div> : null}
                  </div>
                </section>
              </div>

              <section className="mt-4 rounded-[24px] border border-white/14 bg-[#374357] p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-[#d7fffd]/55">Visszavett érték</p><p className="mt-2 text-2xl text-[#d7fffd]">{formatMoney(returnCredit)}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-[#293548] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Új termékek értéke</p><p className="mt-2 text-2xl">{formatMoney(replacementTotal)}</p></div>
                  <div className={`rounded-2xl border p-3 ${difference > 0 ? "border-amber-200/25 bg-amber-400/10" : difference < 0 ? "border-sky-200/25 bg-sky-400/10" : "border-[#7bd7d4]/30 bg-[#2a8d8b]/16"}`}><p className="text-[9px] uppercase tracking-[0.1em] opacity-60">{difference > 0 ? "Még fizetendő" : difference < 0 ? "Visszajár" : "Különbözet"}</p><p className="mt-2 text-3xl">{formatMoney(Math.abs(difference))}</p></div>
                </div>

                {voucherFunding?.hasVoucher ? (
                  <div className="mt-4 rounded-[20px] border border-[#8ce7e2]/36 bg-[#234f58] p-4">
                    <p className="text-[10px] uppercase tracking-[0.13em] text-[#cffffd]/68">Ajándékutalványos visszáru • pénzügyi bontás</p>
                    <p className="mt-1 text-xs text-white/75">Az eredeti utalvány: {formatMoney(voucherFunding.voucherPaid)}. A visszajáró összegből a korábbi fizetési módokra arányosan írunk jóvá, kétszeres visszatérítés nélkül.</p>
                    {voucherRefundPreview ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-white/12 bg-[#2b3749] p-3"><p className="text-[10px] text-white/55">Vissza az utalványra · nem pénzkiadás</p><p className="mt-1 text-xl text-[#d7fffd]">{formatMoney(voucherRefundPreview.voucher)}</p></div>
                        <div className="rounded-xl border border-white/12 bg-[#2b3749] p-3"><p className="text-[10px] text-white/55">Külső fizetés visszaadása</p><p className="mt-1 text-xl text-white">{formatMoney(voucherRefundPreview.external)}</p><p className="text-[10px] text-white/48">{voucherFunding.externalMethod === 'card' ? 'Bankkártyára' : voucherFunding.externalMethod === 'bank_transfer' ? 'Átutalással' : voucherFunding.externalMethod === 'cash' ? 'Készpénzben' : 'Nincs külső kifizetés'}</p></div>
                      </div>
                    ) : <p className="mt-2 text-xs text-rose-100">A visszatérítés felosztása nem ellenőrizhető.</p>}
                    {!voucherFunding.enabled || voucherFunding.consistent===false || voucherFunding.sameStore===false ? (
                      <p className="mt-3 rounded-xl border border-amber-200/20 bg-amber-400/12 px-3 py-2 text-xs text-amber-50">A pénzügyi funkció jelenleg zárolva van vagy adminisztrátori ellenőrzést igényel. A visszáru nem zárható le.</p>
                    ) : null}
                  </div>
                ) : null}

                {settlementDirection !== "none" && (!voucherFunding?.hasVoucher || (voucherRefundPreview?.external||0)>0) ? (
                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-white/45">{settlementDirection === "in" ? "A különbözet fizetési módja" : "A visszajáró rendezése"}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {SETTLEMENT_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const active = settlementMethod === option.value;
                        return <button key={option.value} type="button" onClick={() => { invalidateRequest(); setSettlementMethod(option.value); }} className={`min-h-14 rounded-2xl border px-4 text-sm ${active ? "border-[#9be9e5]/50 bg-[#2a8d8b]" : "border-white/12 bg-[#293548] hover:bg-[#354153]"}`}><span className="inline-flex items-center gap-2"><Icon size={17} />{option.label}</span></button>;
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/10 px-4 py-3 text-sm text-[#d7fffd]"><CheckCircle2 size={19} /> {voucherFunding?.hasVoucher ? "Nincs külső pénzvisszatérítés. A jóváírás teljes egészében az utalványra történik." : "Az érték pontosan egyezik, nincs pénzügyi különbözet."}</div>
                )}

                <input value={note} onChange={(event) => { invalidateRequest(); setNote(event.target.value); }} placeholder="Megjegyzés a visszáruhoz / cseréhez (opcionális)" className="mt-4 h-11 w-full rounded-xl border border-white/14 bg-[#293548] px-3 text-sm outline-none placeholder:text-white/32 focus:border-[#72d8d4]" />

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <p className="max-w-3xl text-xs leading-relaxed text-white/45">A kijelölt tételek és a csere egy műveletként kerülnek mentésre.</p>
                  <button type="button" disabled={submitting || !receiptReady || selectedCount === 0 || Boolean(voucherFunding?.hasVoucher && (!voucherFunding.enabled || voucherFunding.consistent===false || voucherFunding.sameStore===false || !voucherRefundPreview || replacementCart.length>0))} onClick={() => void completeExchange()} className="inline-flex min-h-14 items-center gap-2 rounded-2xl border border-[#a4efeb]/50 bg-gradient-to-r from-[#2a8d8b] to-[#207572] px-6 text-base shadow-[0_12px_26px_rgba(42,141,139,0.22)] hover:brightness-110 disabled:opacity-55">
                    {submitting ? <Loader2 className="animate-spin" size={21} /> : <Receipt size={21} />} {replacementCart.length ? "Csere lezárása" : "Visszáru lezárása"}
                  </button>
                </div>
              </section>
            </>
          )}
        </div>

        <footer className="flex items-center justify-end border-t border-white/12 bg-[#293548] px-5 py-4">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm hover:bg-white/[0.09]"><X size={17} /> Bezárás</button>
        </footer>
      </section>

      {success ? (
        <div className="fixed inset-0 z-[390] flex items-center justify-center bg-[#111827]/82 p-4 backdrop-blur-sm">
          <section className="w-full max-w-[600px] overflow-hidden rounded-[30px] border border-[#9be9e5]/42 bg-[#303a4c] text-white shadow-[0_38px_120px_rgba(0,0,0,0.62)]">
            <div className="p-6 text-center">
              <span className="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full border border-[#9be9e5]/45 bg-[#2a8d8b]/24 text-[#d7fffd]"><CheckCircle2 size={42} /></span>
              <p className="mt-4 text-[10px] uppercase tracking-[0.16em] text-white/45">Sikeresen lezárva</p>
              <h3 className="mt-2 text-2xl">{success.exchangeNumber}</h3>
              {Array.isArray((success as ReceiptReturnResult).exchangeIds) && (success as ReceiptReturnResult).exchangeIds!.length > 1 ?
                <p className="mt-1 text-xs text-white/55">{(success as ReceiptReturnResult).exchangeIds!.length} visszavett terméksor egy műveletben</p> : null}
              <div className="mt-5 grid grid-cols-3 gap-2 text-left">
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3"><p className="text-[9px] uppercase text-white/38">Visszavett</p><p className="mt-1 text-lg text-[#d7fffd]">{formatMoney(success.returnCredit)}</p></div>
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3"><p className="text-[9px] uppercase text-white/38">Új termék</p><p className="mt-1 text-lg">{formatMoney(success.replacementTotal)}</p></div>
                <div className="rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 p-3"><p className="text-[9px] uppercase text-[#d7fffd]/55">Különbözet</p><p className="mt-1 text-lg text-[#d7fffd]">{formatMoney(success.difference)}</p></div>
              </div>
              {(success as ReceiptReturnResult).voucherRefund ? (
                <div className="mt-3 grid grid-cols-2 gap-2 text-left">
                  <div className="rounded-xl border border-[#8ce7e2]/25 bg-[#234f58] p-3"><p className="text-[10px] text-[#d7fffd]/70">Visszaírt utalványérték</p><p className="mt-1 text-lg text-white">{formatMoney((success as ReceiptReturnResult).voucherRefund!.voucherRestored)}</p></div>
                  <div className="rounded-xl border border-white/12 bg-[#293548] p-3"><p className="text-[10px] text-white/52">Külső visszafizetés</p><p className="mt-1 text-lg text-white">{formatMoney((success as ReceiptReturnResult).voucherRefund!.externalRefund)}</p></div>
                </div>
              ) : null}
              <button type="button" onClick={() => { setSuccess(null); resetWorkflow(); }} className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] text-base hover:bg-[#319c99]"><Plus size={20} /> Következő visszáru / csere</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
