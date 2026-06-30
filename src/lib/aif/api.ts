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
