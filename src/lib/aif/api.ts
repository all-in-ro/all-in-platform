export type AifSupplier = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type AifBrand = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type AifCategory = {
  id: string;
  code: string;
  name_ro: string;
  name_hu?: string | null;
  sort_order?: number;
  is_active: boolean;
};

export type AifLocation = {
  id: string;
  code: string;
  name: string;
  location_type: string;
  is_active: boolean;
};

export type AifLocationType = {
  id: string;
  code: string;
  name: string;
  sort_order?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AifCurrency = {
  code: string;
  name: string;
  symbol?: string | null;
  sort_order?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AifReceptionInput = {
  invoiceNumber?: string;
  invoiceDate?: string;
  receptionDate?: string;
  currencyCode?: string;
  exchangeRateToRon?: number | string;
  tvaMode?: "without_tva" | "with_tva" | "no_tva" | string;
  tvaRate?: number | string;
  shippingCost?: number | string;
  goodsValue?: number | string;
  invoiceNet?: number | string;
  invoiceVat?: number | string;
  invoiceGross?: number | string;
  lineCount?: number;
  totalQty?: number;
  note?: string;
};

export type AifReceptionSummary = {
  id: string;
  created_at: string;
  updated_at?: string;
  status: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  target_location_id?: string | null;
  location_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  reception_date?: string | null;
  currency_code: string;
  exchange_rate_to_ron: string | number;
  tva_mode: string;
  tva_rate?: string | number | null;
  goods_value?: string | number | null;
  invoice_net?: string | number | null;
  invoice_vat?: string | number | null;
  invoice_gross?: string | number | null;
  shipping_cost?: string | number | null;
  total_qty?: number | null;
  line_count?: number | null;
};

export type AifImportProfile = {
  id: string;
  supplier_id: string;
  supplier_code: string;
  name: string;
  source_format: string;
  version: number;
  is_active: boolean;
};

export type AifMeta = {
  suppliers: AifSupplier[];
  brands: AifBrand[];
  categories: AifCategory[];
  locations: AifLocation[];
  locationTypes?: AifLocationType[];
  currencies?: AifCurrency[];
  profiles: AifImportProfile[];
};

export type AifImportBatchSummary = {
  id: string;
  created_at: string;
  updated_at?: string;
  status: string;
  row_count: number;
  error_count: number;
  source_file_name?: string | null;
  note?: string | null;
  committed_at?: string | null;
  supplier_code: string;
  supplier_name: string;
  location_code?: string | null;
  location_name?: string | null;
  profile_name?: string | null;
  profile_version?: number | null;
  reception_id?: string | null;
  invoice_number?: string | null;
  currency_code?: string | null;
  exchange_rate_to_ron?: string | number | null;
  invoice_gross?: string | number | null;
};

export type AifParsedRow = {
  rowNo?: number;
  raw?: Record<string, unknown>;
  normalized: Record<string, unknown>;
};

export type AifInventoryItem = {
  variant_id: string;
  internal_sku: string;
  barcode?: string | null;
  brand_name?: string | null;
  model_id: string;
  model_code?: string | null;
  title_ro: string;
  gender?: string | null;
  category_code?: string | null;
  category_name_ro?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  size: string;
  buy_price?: string | number | null;
  sell_price?: string | number | null;
  variant_status: string;
  total_qty: number;
  total_reserved_qty: number;
  available_qty: number;
};

export type AifStockItem = {
  location_code: string;
  location_name: string;
  variant_id: string;
  internal_sku: string;
  barcode?: string | null;
  size: string;
  color_code?: string | null;
  color_name?: string | null;
  title_ro: string;
  qty: number;
  reserved_qty: number;
  available_qty: number;
  updated_at?: string;
};

const AIF_BASE = "/api/aif";

async function fetchAifJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${AIF_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `${res.status} ${res.statusText}`;
    throw new Error(String(msg));
  }

  return data as T;
}

export function apiAifHealth() {
  return fetchAifJSON<{ ok: boolean; suppliers: number }>("/health");
}

export function apiAifMeta() {
  return fetchAifJSON<AifMeta>("/meta");
}

export function apiAifListImportBatches(limit = 50) {
  return fetchAifJSON<{ items: AifImportBatchSummary[] }>(`/import-batches?limit=${encodeURIComponent(String(limit))}`);
}

export function apiAifCreateImportBatch(input: {
  supplierId?: string;
  supplierCode?: string;
  targetLocationId?: string;
  locationCode?: string;
  sourceFileName?: string;
  sourceFormat?: string;
  note?: string;
  reception?: AifReceptionInput;
}) {
  return fetchAifJSON<{ id: string }>("/import-batches", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifReplaceImportRows(batchId: string, rows: AifParsedRow[]) {
  return fetchAifJSON<{ ok: true; rowCount: number; errorCount: number }>(
    `/import-batches/${encodeURIComponent(batchId)}/rows`,
    {
      method: "POST",
      body: JSON.stringify({ rows }),
    }
  );
}

export function apiAifGetImportBatch(batchId: string) {
  return fetchAifJSON<{ batch: AifImportBatchSummary; rows: any[] }>(`/import-batches/${encodeURIComponent(batchId)}`);
}

export function apiAifCommitImportBatch(batchId: string) {
  return fetchAifJSON<{ ok: true; committed: number; already?: boolean }>(
    `/import-batches/${encodeURIComponent(batchId)}/commit`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function apiAifInventory(search = "", limit = 300) {
  const q = new URLSearchParams();
  if (search.trim()) q.set("search", search.trim());
  q.set("limit", String(limit));
  return fetchAifJSON<{ items: AifInventoryItem[] }>(`/inventory?${q.toString()}`);
}

export function apiAifStock(locationCodeOrId?: string) {
  const q = new URLSearchParams();
  if (locationCodeOrId) q.set("location", locationCodeOrId);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifStockItem[] }>(`/stock${suffix}`);
}

export type AifSupplierDetail = AifSupplier & {
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  import_batches?: number;
  imported_rows?: number;
  purchased_qty?: number;
  purchased_value?: string | number;
  last_purchase_at?: string | null;
};

export type AifSupplierReportItem = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  purchase_batches: number;
  purchase_rows: number;
  purchase_qty: number;
  purchase_value: string | number;
  rows_without_buy_price: number;
  last_purchase_at?: string | null;
};

export type AifSupplierReportTotals = {
  purchase_batches: number;
  purchase_rows: number;
  purchase_qty: number;
  purchase_value: number;
  rows_without_buy_price: number;
};

export function apiAifListSuppliers(options?: { includeInactive?: boolean; withStats?: boolean }) {
  const q = new URLSearchParams();
  if (options?.includeInactive) q.set("includeInactive", "1");
  if (options?.withStats) q.set("withStats", "1");
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifSupplierDetail[] }>(`/suppliers${suffix}`);
}

export function apiAifCreateSupplier(input: { name: string; code?: string; notes?: string }) {
  return fetchAifJSON<{ item: AifSupplierDetail }>("/suppliers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifUpdateSupplier(id: string, input: { name?: string; code?: string; notes?: string | null; is_active?: boolean }) {
  return fetchAifJSON<{ item: AifSupplierDetail }>(`/suppliers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function apiAifDeleteSupplier(id: string) {
  return fetchAifJSON<{ ok: true; mode: "deleted" | "deactivated"; usage?: Record<string, number> }>(`/suppliers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function apiAifSupplierReport(options?: { from?: string; to?: string; includeInactive?: boolean }) {
  const q = new URLSearchParams();
  if (options?.from) q.set("from", options.from);
  if (options?.to) q.set("to", options.to);
  if (options?.includeInactive) q.set("includeInactive", "1");
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifSupplierReportItem[]; totals: AifSupplierReportTotals }>(`/suppliers/report${suffix}`);
}


export function apiAifListLocationTypes(options?: { includeInactive?: boolean }) {
  const q = new URLSearchParams();
  if (options?.includeInactive) q.set("includeInactive", "1");
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifLocationType[] }>(`/location-types${suffix}`);
}

export function apiAifCreateLocationType(input: { name: string; code?: string; sortOrder?: number }) {
  return fetchAifJSON<{ item: AifLocationType }>("/location-types", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifUpdateLocationType(id: string, input: { name?: string; code?: string; sortOrder?: number; is_active?: boolean }) {
  return fetchAifJSON<{ item: AifLocationType }>(`/location-types/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function apiAifDeleteLocationType(id: string) {
  return fetchAifJSON<{ ok: true; mode: "deleted" | "deactivated"; usage?: Record<string, number> }>(`/location-types/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}


export type AifLocationDetail = AifLocation & {
  created_at?: string;
  updated_at?: string;
};

export function apiAifListLocations(options?: { includeInactive?: boolean }) {
  const q = new URLSearchParams();
  if (options?.includeInactive) q.set("includeInactive", "1");
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifLocationDetail[] }>(`/locations${suffix}`);
}

export function apiAifCreateLocation(input: { name: string; code?: string; locationType?: string }) {
  return fetchAifJSON<{ item: AifLocationDetail }>("/locations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifUpdateLocation(id: string, input: { name?: string; code?: string; locationType?: string; is_active?: boolean }) {
  return fetchAifJSON<{ item: AifLocationDetail }>(`/locations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function apiAifDeleteLocation(id: string) {
  return fetchAifJSON<{ ok: true; mode: "deleted" | "deactivated"; usage?: Record<string, number> }>(`/locations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}


export function apiAifListCurrencies(options?: { includeInactive?: boolean }) {
  const q = new URLSearchParams();
  if (options?.includeInactive) q.set("includeInactive", "1");
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifCurrency[] }>(`/currencies${suffix}`);
}

export function apiAifCreateCurrency(input: { code: string; name: string; symbol?: string; sortOrder?: number }) {
  return fetchAifJSON<{ item: AifCurrency }>("/currencies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifUpdateCurrency(code: string, input: { name?: string; symbol?: string | null; sortOrder?: number; is_active?: boolean }) {
  return fetchAifJSON<{ item: AifCurrency }>(`/currencies/${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function apiAifDeleteCurrency(code: string) {
  return fetchAifJSON<{ ok: true; mode: "deleted" | "deactivated"; usage?: Record<string, number> }>(`/currencies/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
}

export function apiAifListReceptions(options?: { limit?: number }) {
  const q = new URLSearchParams();
  q.set("limit", String(options?.limit || 50));
  return fetchAifJSON<{ items: AifReceptionSummary[] }>(`/receptions?${q.toString()}`);
}
