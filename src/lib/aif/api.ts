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
  parent_id?: string | null;
  parentId?: string | null;
  name_ro: string;
  name_hu?: string | null;
  aliases?: string[] | null;
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

export type AifColorType = {
  id: string;
  code: string;
  name_ro: string;
  name_hu?: string | null;
  name_en?: string | null;
  name_de?: string | null;
  aliases?: string[] | null;
  hex?: string | null;
  sort_order?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AifBrandColorCode = {
  id: string;
  brand_id: string;
  brand_code?: string | null;
  brand_name?: string | null;
  color_code: string;
  color_type_id: string;
  color_type_code?: string | null;
  color_name_ro?: string | null;
  color_name_hu?: string | null;
  color_name_en?: string | null;
  color_name_de?: string | null;
  color_hex?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AifGenderType = {
  code: string;
  name: string;
  aliases?: string[] | null;
  sort_order?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AifMaterialType = {
  id: string;
  code: string;
  name_ro: string;
  name_hu?: string | null;
  name_en?: string | null;
  name_de?: string | null;
  aliases?: string[] | null;
  sort_order?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AifSizeType = {
  id: string;
  code: string;
  name: string;
  name_hu?: string | null;
  aliases?: string[] | null;
  sort_order?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AifBrandSizeCode = {
  id: string;
  brand_id: string;
  brand_code?: string | null;
  brand_name?: string | null;
  size_code: string;
  size_type_id: string;
  size_type_code?: string | null;
  size_name?: string | null;
  notes?: string | null;
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
  salesTvaRate?: number | string;
  saleTvaRate?: number | string;
  salesPriceIncludesTva?: boolean;
  sellPriceIncludesTva?: boolean;
  sellPriceCurrencyMode?: "invoice" | "ron" | string;
  sellPriceCurrency?: string;
  sellPriceIsRon?: boolean;
  shippingCost?: number | string;
  goodsValue?: number | string;
  invoiceNet?: number | string;
  invoiceVat?: number | string;
  invoiceGross?: number | string;
  lineCount?: number;
  totalQty?: number;
  note?: string;
  purchaseOrderId?: string | null;
  purchase_order_id?: string | null;
};

export type AifSalesTvaSettings = {
  key?: string;
  salesTvaRate: number | string;
  salesPriceIncludesTva: boolean;
  sellPriceIncludesTva?: boolean;
  sellPriceCurrency?: string;
  sellPriceIsRon?: boolean;
  updatedAt?: string | null;
  updated_at?: string | null;
  updatedBy?: string | null;
  updated_by?: string | null;
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
  purchase_order_id?: string | null;
  purchase_order_number?: string | null;
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
  raw_meta?: Record<string, unknown> | null;
  total_qty?: number | null;
  line_count?: number | null;
  import_batches?: number | null;
  import_rows?: number | null;
  committed_rows?: number | null;
  remaining_rows?: number | null;
  error_rows?: number | null;
  ignored_rows?: number | null;
  committed_batches?: number | null;
  pending_rows?: number | null;
  has_stock_movements?: boolean | null;
  can_delete?: boolean | null;
};


export type AifReceptionDetailRow = {
  id: string;
  batch_id?: string;
  row_no: number;
  status: string;
  error_messages?: string[] | null;
  qty?: number | null;
  buy_price?: string | number | null;
  buy_price_ron?: string | number | null;
  sell_price?: string | number | null;
  sell_price_ron?: string | number | null;
  sn_cod?: string | null;
  snCod?: string | null;
  purchase_order_id?: string | null;
  purchase_order_line_id?: string | null;
  supplier_product_code?: string | null;
  supplier_variant_code?: string | null;
  supplier_color_code?: string | null;
  supplier_size?: string | null;
  normalized?: Record<string, unknown> | null;
  raw?: Record<string, unknown> | null;
};

export type AifReceptionDetailBatch = AifImportBatchSummary & {
  rows?: AifReceptionDetailRow[];
};

export type AifReceptionDetail = {
  item: AifReceptionSummary;
  batches: AifReceptionDetailBatch[];
  rows: AifReceptionDetailRow[];
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
  genderTypes?: AifGenderType[];
  locations: AifLocation[];
  locationTypes?: AifLocationType[];
  currencies?: AifCurrency[];
  colorTypes?: AifColorType[];
  brandColorCodes?: AifBrandColorCode[];
  sizeTypes?: AifSizeType[];
  brandSizeCodes?: AifBrandSizeCode[];
  materialTypes?: AifMaterialType[];
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
  sn_cod?: string | null;
  snCod?: string | null;
  brand_name?: string | null;
  supplier_names?: string | null;
  supplier_codes?: string | null;
  supplier_source_codes?: string | null;
  supplier_ids?: string | null;
  model_id: string;
  model_code?: string | null;
  title_ro: string;
  gender?: string | null;
  category_code?: string | null;
  category_name_ro?: string | null;
  subcategory_code?: string | null;
  subcategory_name_ro?: string | null;
  subcategory_name_hu?: string | null;
  product_type?: string | null;
  material?: string | null;
  image_url?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  size: string;
  buy_price?: string | number | null;
  sell_price?: string | number | null;
  variant_status: string;
  model_status?: string | null;
  total_qty: number;
  total_reserved_qty: number;
  available_qty: number;
  first_incoming_at?: string | null;
  last_incoming_at?: string | null;
  last_stock_movement_at?: string | null;
  last_import_batch_id?: string | null;
  last_reception_id?: string | null;
  last_invoice_number?: string | null;
  last_invoice_date?: string | null;
  last_reception_date?: string | null;
  last_source_file_name?: string | null;
  invoice_numbers?: string[] | string | null;
  invoice_history?: Array<{
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    receptionDate?: string | null;
    importedAt?: string | null;
    batchId?: string | null;
    receptionId?: string | null;
    sourceFileName?: string | null;
    supplierId?: string | null;
    supplierCode?: string | null;
    supplierName?: string | null;
    locationId?: string | null;
    locationName?: string | null;
    currencyCode?: string | null;
    invoiceGross?: string | number | null;
    receptionStatus?: string | null;
  }> | string | null;
  shopify_mapped?: boolean | null;
  shopify_sync_status?: string | null;
  shopify_outbox_status?: string | null;
  shopify_product_id?: string | null;
  shopify_variant_id?: string | null;
  shopify_inventory_item_id?: string | null;
  shopify_product_title?: string | null;
  shopify_variant_title?: string | null;
  shopify_product_status?: string | null;
  shopify_mapped_at?: string | null;
  shopify_mapping_updated_at?: string | null;
  shopify_connected_at?: string | null;
  shopify_last_synced_at?: string | null;
  shopify_last_error?: string | null;
  shopify_outbox_error?: string | null;
  shopify_export_id?: string | null;
  shopify_export_item_status?: string | null;
  shopify_export_status?: string | null;
  shopify_exported_at?: string | null;
  shopify_export_reconciled_at?: string | null;
  shopify_export_errors?: string[] | null;
  shopify_export_warnings?: string[] | null;
  shopify_export_pending?: boolean | null;
};

export type AifSelectedWorkAction = "label" | "order" | "move" | "shopify";

export type AifSelectedWorkItem = AifInventoryItem & {
  selected_variant_id?: string | null;
  action?: AifSelectedWorkAction | null;
  selected_action?: AifSelectedWorkAction | null;
  sort_order?: number | string | null;
  selected_at?: string | null;
  selected_updated_at?: string | null;
};

export type AifSelectedWorkPayloadItem = {
  variantId: string;
  action?: AifSelectedWorkAction | null;
};

export type AifSelectedWorklistResponse = {
  ok?: true;
  count?: number;
  owner?: string;
  items?: AifSelectedWorkItem[];
  variantIds?: string[];
  selectedVariantIds?: string[];
  actions?: Record<string, AifSelectedWorkAction>;
  updatedAt?: string | null;
  added?: number;
  updated?: number;
  removed?: number;
  saved?: number;
};

export type AifStockItem = {
  location_id?: string;
  location_code: string;
  location_name: string;
  variant_id: string;
  internal_sku?: string | null;
  barcode?: string | null;
  sn_cod?: string | null;
  snCod?: string | null;
  variant_status?: string | null;
  status?: string | null;
  model_status?: string | null;
  display_barcode?: string | null;
  size: string;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  images?: unknown;
  buy_price?: string | number | null;
  sell_price?: string | number | null;
  model_id?: string | null;
  model_code?: string | null;
  title_ro: string;
  shopify_title?: string | null;
  brand_name?: string | null;
  brand_code?: string | null;
  category_name_ro?: string | null;
  category_code?: string | null;
  subcategory_code?: string | null;
  subcategory_name_ro?: string | null;
  subcategory_name_hu?: string | null;
  product_type?: string | null;
  material?: string | null;
  qty: number;
  reserved_qty: number;
  available_qty: number;
  updated_at?: string;
};

export type AifInventoryCountStatus = "draft" | "counting" | "review" | "committed" | "cancelled";

export type AifInventoryCountSummary = {
  id: string;
  code: string;
  title: string;
  location_id: string;
  location_code?: string | null;
  location_name?: string | null;
  location_type?: string | null;
  status: AifInventoryCountStatus;
  started_at?: string | null;
  counted_at?: string | null;
  committed_at?: string | null;
  actor?: string | null;
  note?: string | null;
  raw?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
  line_count?: number | string | null;
  counted_lines?: number | string | null;
  expected_qty?: number | string | null;
  counted_qty?: number | string | null;
  diff_qty?: number | string | null;
  missing_qty?: number | string | null;
  extra_qty?: number | string | null;
  missing_sell_value?: number | string | null;
  extra_sell_value?: number | string | null;
  diff_sell_value?: number | string | null;
  missing_buy_value?: number | string | null;
  extra_buy_value?: number | string | null;
  diff_buy_value?: number | string | null;
};

export type AifInventoryCountLine = {
  id: string;
  count_id: string;
  variant_id: string;
  expected_qty: number | string;
  expected_reserved_qty?: number | string | null;
  counted_qty?: number | string | null;
  diff_qty?: number | string | null;
  missing_qty?: number | string | null;
  extra_qty?: number | string | null;
  buy_price?: number | string | null;
  sell_price?: number | string | null;
  diff_buy_value?: number | string | null;
  diff_sell_value?: number | string | null;
  note?: string | null;
  raw?: unknown;
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  internal_sku?: string | null;
  barcode?: string | null;
  sn_cod?: string | null;
  snCod?: string | null;
  display_barcode?: string | null;
  size?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  images?: unknown;
  model_id?: string | null;
  model_code?: string | null;
  title_ro: string;
  shopify_title?: string | null;
  brand_name?: string | null;
  brand_code?: string | null;
  category_name_ro?: string | null;
  category_code?: string | null;
  current_qty?: number | string | null;
  current_reserved_qty?: number | string | null;
  current_available_qty?: number | string | null;
};

export type AifInventoryCountDetail = {
  item: AifInventoryCountSummary;
  lines: AifInventoryCountLine[];
  totals?: AifInventoryCountSummary;
};

export type AifStockMovementDirection = "all" | "in" | "out" | "adjust";

export type AifStockMovementItem = {
  id: string;
  created_at: string;
  movement_type?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  qty_delta: number | string;
  qty_before?: number | string | null;
  qty_after?: number | string | null;
  actor?: string | null;
  raw?: unknown;
  direction: "in" | "out" | "adjust";
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  variant_id: string;
  internal_sku?: string | null;
  barcode?: string | null;
  sn_cod?: string | null;
  snCod?: string | null;
  display_barcode?: string | null;
  size?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  images?: unknown;
  model_id?: string | null;
  model_code?: string | null;
  title_ro: string;
  shopify_title?: string | null;
  brand_name?: string | null;
  brand_code?: string | null;
  category_name_ro?: string | null;
  category_code?: string | null;
  subcategory_code?: string | null;
  subcategory_name_ro?: string | null;
  subcategory_name_hu?: string | null;
};

export type AifStockMovementTotals = {
  movement_count: number;
  distinct_variants: number;
  incoming_qty: number | string;
  outgoing_qty: number | string;
  net_qty: number | string;
};


export type AifBarcodeConflict = {
  variantId?: string | null;
  barcode?: string | null;
  internalSku?: string | null;
  title?: string | null;
  modelCode?: string | null;
  brand?: string | null;
  color?: string | null;
  size?: string | null;
};

export type AifVariantBarcodeAssignmentResponse = {
  ok: true;
  unchanged?: boolean;
  variantId: string;
  barcode: string;
  previousBarcode?: string | null;
  updatedAt?: string | null;
  item?: {
    id?: string | null;
    title?: string | null;
    brand?: string | null;
    color?: string | null;
    size?: string | null;
  } | null;
};

export type AifVariantHistoryEventType = "incoming" | "outgoing" | "transfer" | "inventory" | "adjustment" | "price" | "price_change" | string;

export type AifVariantHistoryEvent = {
  id: string;
  created_at: string;
  event_type: AifVariantHistoryEventType;
  direction: "in" | "out" | "adjust";
  movement_type?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  qty_delta: number | string;
  qty_before?: number | string | null;
  qty_after?: number | string | null;
  actor?: string | null;
  raw?: Record<string, unknown> | null;
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  from_location_id?: string | null;
  from_location_code?: string | null;
  from_location_name?: string | null;
  to_location_id?: string | null;
  to_location_code?: string | null;
  to_location_name?: string | null;
  import_row_id?: string | null;
  import_row_no?: number | string | null;
  import_qty?: number | string | null;
  buy_price?: number | string | null;
  buy_price_ron?: number | string | null;
  sell_price?: number | string | null;
  sell_price_ron?: number | string | null;
  effective_buy_price?: number | string | null;
  effective_sell_price?: number | string | null;
  import_batch_id?: string | null;
  source_file_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  reception_date?: string | null;
  currency_code?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  reception_id?: string | null;
  sales_tva_rate?: number | string | null;
  sell_price_includes_tva?: boolean | null;
  old_buy_price?: number | string | null;
  new_buy_price?: number | string | null;
  old_sell_price?: number | string | null;
  new_sell_price?: number | string | null;
  old_compare_at_price?: number | string | null;
  new_compare_at_price?: number | string | null;
  price_change_fields?: string[] | null;
  local_only?: boolean | null;
};

export type AifVariantHistorySummary = {
  currentQty: number;
  reservedQty: number;
  availableQty: number;
  stockLocationCount: number;
  totalIncomingQty: number;
  totalOutgoingQty: number;
  totalTransferredQty: number;
  netMovementQty: number;
  movementCount: number;
  totalPurchasedQty: number;
  avgBuyPrice?: number | string | null;
  lastBuyPrice?: number | string | null;
  lastSellPrice?: number | string | null;
  lastIncomingAt?: string | null;
  marginWithoutTva?: number | string | null;
};

export type AifVariantHistoryResponse = {
  item: AifInventoryItem & Record<string, unknown>;
  stock: AifStockItem[];
  summary: AifVariantHistorySummary;
  events: AifVariantHistoryEvent[];
};

const AIF_BASE = "/api/aif";

async function fetchAifJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const requestHeaders = new Headers(init?.headers || {});
  if (!requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const res = await fetch(`${AIF_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: requestHeaders,
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
    const error = new Error(String(msg));
    (error as Error & { status?: number; statusCode?: number; code?: string }).status = res.status;
    (error as Error & { status?: number; statusCode?: number; code?: string }).statusCode = res.status;
    if (data && typeof data === "object" && data.code) {
      (error as Error & { status?: number; statusCode?: number; code?: string }).code = String(data.code);
    }
    if (data && typeof data === "object") {
      (error as Error & { conflict?: AifBarcodeConflict | null; payload?: unknown }).conflict =
        (data.conflict && typeof data.conflict === "object" ? data.conflict : null) as AifBarcodeConflict | null;
      (error as Error & { conflict?: AifBarcodeConflict | null; payload?: unknown }).payload = data;
    }
    throw error;
  }

  return data as T;
}

export function apiAifHealth() {
  return fetchAifJSON<{ ok: boolean; suppliers: number }>("/health");
}

export function apiAifGetSalesTvaSettings() {
  return fetchAifJSON<{ ok: true; item: AifSalesTvaSettings; settings?: AifSalesTvaSettings }>("/settings/sales-tva");
}

export function apiAifSaveSalesTvaSettings(settings: Partial<AifSalesTvaSettings>) {
  return fetchAifJSON<{ ok: true; item: AifSalesTvaSettings; settings?: AifSalesTvaSettings }>("/settings/sales-tva", {
    method: "PATCH",
    body: JSON.stringify({ settings }),
  });
}

export function apiAifGetIncomingSalesTvaSettings() {
  return fetchAifJSON<{ ok: true; item: AifSalesTvaSettings; settings?: AifSalesTvaSettings }>("/settings/incoming-sales-tva");
}

export function apiAifSaveIncomingSalesTvaSettings(settings: Partial<AifSalesTvaSettings>) {
  return fetchAifJSON<{ ok: true; item: AifSalesTvaSettings; settings?: AifSalesTvaSettings }>("/settings/incoming-sales-tva", {
    method: "PUT",
    body: JSON.stringify({ settings }),
  });
}

export function apiAifGetIncomingSalesSettings() {
  return apiAifGetIncomingSalesTvaSettings();
}

export function apiAifSaveIncomingSalesSettings(settings: Partial<AifSalesTvaSettings>) {
  return apiAifSaveIncomingSalesTvaSettings(settings);
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


export function apiAifCreateFullImportBatch(input: {
  supplierId?: string;
  supplierCode?: string;
  targetLocationId?: string;
  locationCode?: string;
  sourceFileName?: string;
  sourceFormat?: string;
  note?: string;
  purchaseOrderId?: string | null;
  purchase_order_id?: string | null;
  reception?: AifReceptionInput;
  rows: AifParsedRow[];
}) {
  return fetchAifJSON<{ ok: true; id: string; receptionId: string; rowCount: number; errorCount: number }>(
    "/import-batches/full",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

export function apiAifReplaceImportRows(batchId: string, rows: AifParsedRow[]) {
  return fetchAifJSON<{ ok: true; rowCount: number; errorCount: number; addedRows?: number }>(
    `/import-batches/${encodeURIComponent(batchId)}/rows`,
    {
      method: "POST",
      body: JSON.stringify({ rows }),
    }
  );
}

export function apiAifAppendImportRows(batchId: string, rows: AifParsedRow[]) {
  return fetchAifJSON<{ ok: true; rowCount: number; errorCount: number; addedRows?: number }>(
    `/import-batches/${encodeURIComponent(batchId)}/rows`,
    {
      method: "POST",
      body: JSON.stringify({ rows, append: true }),
    }
  );
}

export function apiAifGetImportBatch(batchId: string) {
  return fetchAifJSON<{ batch: AifImportBatchSummary; rows: any[] }>(`/import-batches/${encodeURIComponent(batchId)}`);
}

export type AifCommitImportBatchResult = {
  ok: boolean;
  committed: number;
  already?: boolean;
  totalRows?: number;
  committedRows?: number;
  remainingRows?: number;
  errorRows?: number;
  failedCount?: number;
  warning?: string | null;
  failedRows?: Array<{ id?: string; rowNo?: number | string | null; error?: string; code?: string | null; detail?: string | null; constraint?: string | null }>;
};

export function apiAifCommitImportBatch(batchId: string) {
  return fetchAifJSON<AifCommitImportBatchResult>(
    `/import-batches/${encodeURIComponent(batchId)}/commit`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}


export function apiAifDeleteImportBatchHistory(batchId: string) {
  return fetchAifJSON<{
    ok: true;
    mode: "history_deleted";
    deletedRows: number;
    committedRows: number;
    receptionId?: string | null;
  }>(
    `/import-batches/${encodeURIComponent(batchId)}/history`,
    {
      method: "DELETE",
    }
  );
}

export function apiAifInventory(search = "", limit = 5000, options?: { snCod?: string }) {
  const q = new URLSearchParams();
  if (search.trim()) q.set("search", search.trim());
  if (options?.snCod?.trim()) q.set("snCod", options.snCod.trim());
  q.set("limit", String(limit));
  return fetchAifJSON<{ items: AifInventoryItem[] }>(`/inventory?${q.toString()}`);
}

export function apiAifSelectedWorklist() {
  return fetchAifJSON<AifSelectedWorklistResponse>("/selection");
}

export function apiAifSaveSelectedWorklist(items: AifSelectedWorkPayloadItem[]) {
  return fetchAifJSON<AifSelectedWorklistResponse>("/selection", {
    method: "PUT",
    body: JSON.stringify({ items, replace: true }),
  });
}

// Többgépes munkához atomikus műveletek. Ezek nem írják felül a teljes közös
// kijelölési listát, csak a megadott variánsokat módosítják.
export function apiAifAddSelectedWorklistItems(items: AifSelectedWorkPayloadItem[]) {
  return fetchAifJSON<AifSelectedWorklistResponse>("/selection/items", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export function apiAifUpdateSelectedWorklistActions(items: AifSelectedWorkPayloadItem[]) {
  return fetchAifJSON<AifSelectedWorklistResponse>("/selection/items", {
    method: "PATCH",
    body: JSON.stringify({ items }),
  });
}

export function apiAifRemoveSelectedWorklistItems(variantIds: string[]) {
  return fetchAifJSON<AifSelectedWorklistResponse>("/selection/items", {
    method: "DELETE",
    body: JSON.stringify({ variantIds }),
  });
}

export function apiAifClearSelectedWorklist() {
  return fetchAifJSON<AifSelectedWorklistResponse>("/selection", {
    method: "DELETE",
  });
}

export function apiAifStock(locationCodeOrId?: string, options?: { search?: string; snCod?: string }) {
  const q = new URLSearchParams();
  if (locationCodeOrId) q.set("location", locationCodeOrId);
  if (options?.search?.trim()) q.set("search", options.search.trim());
  if (options?.snCod?.trim()) q.set("snCod", options.snCod.trim());
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifStockItem[] }>(`/stock${suffix}`);
}

export function apiAifListInventoryCounts(options?: {
  location?: string;
  status?: AifInventoryCountStatus;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (options?.location) q.set("location", options.location);
  if (options?.status) q.set("status", options.status);
  if (options?.limit) q.set("limit", String(options.limit));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifInventoryCountSummary[] }>(`/inventory-counts${suffix}`);
}

export function apiAifCreateInventoryCount(input: {
  location: string;
  title?: string;
  note?: string;
  search?: string;
  includeZero?: boolean;
}) {
  return fetchAifJSON<AifInventoryCountDetail>("/inventory-counts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifGetInventoryCount(id: string) {
  return fetchAifJSON<AifInventoryCountDetail>(`/inventory-counts/${encodeURIComponent(id)}`);
}

export function apiAifSaveInventoryCountLines(
  id: string,
  lines: { lineId?: string; variantId?: string; countedQty?: number | string | null; note?: string | null }[]
) {
  return fetchAifJSON<AifInventoryCountDetail & { ok: true; saved: number }>(
    `/inventory-counts/${encodeURIComponent(id)}/lines`,
    {
      method: "PATCH",
      body: JSON.stringify({ lines }),
    }
  );
}

export function apiAifCommitInventoryCount(id: string) {
  return fetchAifJSON<AifInventoryCountDetail & { ok: true; changed: number; netDiff: number }>(
    `/inventory-counts/${encodeURIComponent(id)}/commit`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function apiAifDeleteInventoryCount(id: string) {
  return fetchAifJSON<{ ok: true; mode: "deleted" }>(`/inventory-counts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function apiAifStockMovements(options?: {
  location?: string;
  variant?: string;
  search?: string;
  direction?: AifStockMovementDirection;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (options?.location) q.set("location", options.location);
  if (options?.variant) q.set("variant", options.variant);
  if (options?.search?.trim()) q.set("search", options.search.trim());
  if (options?.direction && options.direction !== "all") q.set("direction", options.direction);
  if (options?.from) q.set("from", options.from);
  if (options?.to) q.set("to", options.to);
  if (options?.limit) q.set("limit", String(options.limit));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifStockMovementItem[]; totals: AifStockMovementTotals }>(`/stock-movements${suffix}`);
}


export function apiAifGetVariant(variantId: string) {
  return fetchAifJSON<{
    item: AifInventoryItem & Record<string, unknown>;
    stock?: AifStockItem[];
    supplierCodes?: Array<Record<string, unknown>>;
    movements?: Array<Record<string, unknown>>;
  }>(`/variants/${encodeURIComponent(variantId)}`);
}

export function apiAifAssignVariantBarcode(
  variantId: string,
  barcode: string,
  options?: { source?: string }
) {
  return fetchAifJSON<AifVariantBarcodeAssignmentResponse>(
    `/variants/${encodeURIComponent(variantId)}/barcode`,
    {
      method: "PUT",
      body: JSON.stringify({
        barcode,
        source: options?.source || "barcode_center",
      }),
    }
  );
}

export function apiAifVariantHistory(variantId: string, limit = 500) {
  const q = new URLSearchParams();
  if (limit) q.set("limit", String(limit));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<AifVariantHistoryResponse>(`/variants/${encodeURIComponent(variantId)}/history${suffix}`);
}

export function apiAifDeleteStockMovement(id: string) {
  return fetchAifJSON<{
    ok: true;
    mode: "permanently_deleted";
    item?: AifStockMovementItem;
    note?: string;
  }>(`/stock-movements/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}


export function apiAifUpdateVariantStock(
  variantId: string,
  rows: { locationId?: string; locationCode?: string; qty: number | string; reservedQty?: number | string }[],
  options?: { mode?: "redistribute" | "correction"; allowTotalChange?: boolean }
) {
  return fetchAifJSON<{ ok: true; changed?: number; mode?: string; beforeTotal?: number; afterTotal?: number; stock: AifStockItem[] }>(
    `/variants/${encodeURIComponent(variantId)}/stock`,
    {
      method: "PATCH",
      body: JSON.stringify({ rows, mode: options?.mode || "redistribute", allowTotalChange: Boolean(options?.allowTotalChange) }),
    }
  );
}


export type AifManualProductInput = {
  titleRo: string;
  titleHu?: string | null;
  descriptionRo?: string | null;
  brandId?: string | null;
  brandCode?: string | null;
  brandName?: string | null;
  categoryId?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  parentCategoryCode?: string | null;
  subCategoryId?: string | null;
  subCategoryCode?: string | null;
  subCategoryName?: string | null;
  subcategoryId?: string | null;
  subcategoryCode?: string | null;
  subcategoryName?: string | null;
  gender?: string | null;
  productType?: string | null;
  season?: string | null;
  material?: string | null;
  composition?: string | null;
  longDescription?: string | null;
  shopifyTitle?: string | null;
  modelCode?: string | null;
  barcode?: string | null;
  photoUrl?: string | null;
  image_url?: string | null;
  snCod?: string | null;
  colorCode?: string | null;
  colorName?: string | null;
  colorHex?: string | null;
  size: string;
  standardSize?: string | null;
  buyPrice?: string | number | null;
  sellPrice?: string | number | null;
  compareAtPrice?: string | number | null;
  imageUrl?: string | null;
  supplierId?: string | null;
  supplierCode?: string | null;
  supplierProductCode?: string | null;
  supplierVariantCode?: string | null;
  supplierColorCode?: string | null;
  supplierSize?: string | null;
  modelStatus?: string | null;
  status?: string | null;
  qty?: number | string;
  stockRows?: Array<{ locationId?: string; locationCode?: string; location?: string; qty: number | string }>;
};

export function apiAifCreateManualProduct(input: AifManualProductInput) {
  return fetchAifJSON<{ ok: true; variantId: string; modelId?: string; qty?: number; stockRows?: Array<Record<string, unknown>> }>("/manual-products", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifCreateManualVariant(input: AifManualProductInput) {
  return apiAifCreateManualProduct(input);
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

export function apiAifListColorTypes(options?: { includeInactive?: boolean }) {
  const q = new URLSearchParams();
  if (options?.includeInactive) q.set("includeInactive", "1");
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifColorType[] }>(`/color-types${suffix}`);
}

export function apiAifCreateColorType(input: {
  nameRo: string;
  code?: string;
  nameHu?: string;
  nameEn?: string;
  nameDe?: string;
  aliases?: string[] | string;
  hex?: string;
  sortOrder?: number | string;
}) {
  return fetchAifJSON<{ item: AifColorType }>("/color-types", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifUpdateColorType(id: string, input: {
  nameRo?: string;
  code?: string;
  nameHu?: string | null;
  nameEn?: string | null;
  nameDe?: string | null;
  aliases?: string[] | string;
  hex?: string | null;
  sortOrder?: number | string;
  is_active?: boolean;
}) {
  return fetchAifJSON<{ item: AifColorType }>(`/color-types/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function apiAifDeleteColorType(id: string) {
  return fetchAifJSON<{ ok: true; mode: "deleted" | "deactivated"; usage?: Record<string, number> }>(`/color-types/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function apiAifListBrandColorCodes(options?: { includeInactive?: boolean; brand?: string }) {
  const q = new URLSearchParams();
  if (options?.includeInactive) q.set("includeInactive", "1");
  if (options?.brand) q.set("brand", options.brand);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifBrandColorCode[] }>(`/brand-color-codes${suffix}`);
}

export function apiAifSaveBrandColorCode(id: string, input: {
  brandId?: string;
  brandCode?: string;
  brand?: string;
  colorCode?: string;
  colorTypeId?: string;
  colorTypeCode?: string;
  color?: string;
  notes?: string | null;
  is_active?: boolean;
}) {
  const url = id ? `/brand-color-codes/${encodeURIComponent(id)}` : "/brand-color-codes";
  return fetchAifJSON<{ item: AifBrandColorCode }>(url, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifDeleteBrandColorCode(id: string) {
  return fetchAifJSON<{ ok: true; mode: "deactivated" }>(`/brand-color-codes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function apiAifNormalizeColor(color: string) {
  return fetchAifJSON<{ input: string; color: string; item?: AifColorType | null }>("/color-types/normalize", {
    method: "POST",
    body: JSON.stringify({ color }),
  });
}


export function apiAifListSizeTypes(options?: { includeInactive?: boolean }) {
  const q = new URLSearchParams();
  if (options?.includeInactive) q.set("includeInactive", "1");
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifSizeType[] }>(`/size-types${suffix}`);
}

export function apiAifSaveSizeType(id: string, input: {
  name?: string;
  code?: string;
  nameHu?: string | null;
  name_hu?: string | null;
  aliases?: string[] | string;
  sortOrder?: number | string;
  is_active?: boolean;
}) {
  const url = id ? `/size-types/${encodeURIComponent(id)}` : "/size-types";
  return fetchAifJSON<{ item: AifSizeType }>(url, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifDeleteSizeType(id: string) {
  return fetchAifJSON<{ ok: true; mode: "deleted" | "deactivated"; usage?: Record<string, number> }>(`/size-types/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function apiAifNormalizeSize(size: string) {
  return fetchAifJSON<{ input: string; size: string; item?: AifSizeType | null }>("/size-types/normalize", {
    method: "POST",
    body: JSON.stringify({ size }),
  });
}

export function apiAifListBrandSizeCodes(options?: { includeInactive?: boolean; brand?: string }) {
  const q = new URLSearchParams();
  if (options?.includeInactive) q.set("includeInactive", "1");
  if (options?.brand) q.set("brand", options.brand);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifBrandSizeCode[] }>(`/brand-size-codes${suffix}`);
}

export function apiAifSaveBrandSizeCode(id: string, input: {
  brandId?: string;
  brandCode?: string;
  brand?: string;
  sizeCode?: string;
  sizeTypeId?: string;
  sizeTypeCode?: string;
  size?: string;
  notes?: string | null;
  is_active?: boolean;
}) {
  const url = id ? `/brand-size-codes/${encodeURIComponent(id)}` : "/brand-size-codes";
  return fetchAifJSON<{ item: AifBrandSizeCode }>(url, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifDeleteBrandSizeCode(id: string) {
  return fetchAifJSON<{ ok: true; mode: "deactivated"; usage?: Record<string, number> }>(`/brand-size-codes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function apiAifListGenderTypes(options?: { includeInactive?: boolean }) {
  const q = new URLSearchParams();
  if (options?.includeInactive) q.set("includeInactive", "1");
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifGenderType[] }>(`/gender-types${suffix}`);
}

export function apiAifCreateGenderType(input: {
  name: string;
  code?: string;
  aliases?: string[] | string;
  sortOrder?: number | string;
}) {
  return fetchAifJSON<{ item: AifGenderType }>("/gender-types", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifUpdateGenderType(code: string, input: {
  name?: string;
  aliases?: string[] | string;
  sortOrder?: number | string;
  is_active?: boolean;
}) {
  return fetchAifJSON<{ item: AifGenderType }>(`/gender-types/${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function apiAifDeleteGenderType(code: string) {
  return fetchAifJSON<{ ok: true; mode: "deleted" | "deactivated"; usage?: Record<string, number> }>(`/gender-types/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
}

export function apiAifListMaterialTypes(options?: { includeInactive?: boolean }) {
  const q = new URLSearchParams();
  if (options?.includeInactive) q.set("includeInactive", "1");
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchAifJSON<{ items: AifMaterialType[] }>(`/material-types${suffix}`);
}

export function apiAifCreateMaterialType(input: {
  nameRo: string;
  code?: string;
  nameHu?: string;
  nameEn?: string;
  nameDe?: string;
  aliases?: string[] | string;
  sortOrder?: number | string;
}) {
  return fetchAifJSON<{ item: AifMaterialType }>("/material-types", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifUpdateMaterialType(id: string, input: {
  nameRo?: string;
  code?: string;
  nameHu?: string | null;
  nameEn?: string | null;
  nameDe?: string | null;
  aliases?: string[] | string;
  sortOrder?: number | string;
  is_active?: boolean;
}) {
  return fetchAifJSON<{ item: AifMaterialType }>(`/material-types/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function apiAifDeleteMaterialType(id: string) {
  return fetchAifJSON<{ ok: true; mode: "deleted" | "deactivated"; usage?: Record<string, number> }>(`/material-types/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function apiAifNormalizeMaterial(material: string) {
  return fetchAifJSON<{ input: string; material: string }>("/material-types/normalize", {
    method: "POST",
    body: JSON.stringify({ material }),
  });
}

export function apiAifListReceptions(options?: {
  limit?: number;
  search?: string;
  supplier?: string;
  location?: string;
  currency?: string;
  status?: string;
  from?: string;
  to?: string;
}) {
  const q = new URLSearchParams();
  q.set("limit", String(options?.limit || 50));
  if (options?.search?.trim()) q.set("q", options.search.trim());
  if (options?.supplier) q.set("supplier", options.supplier);
  if (options?.location) q.set("location", options.location);
  if (options?.currency) q.set("currency", options.currency);
  if (options?.status) q.set("status", options.status);
  if (options?.from) q.set("from", options.from);
  if (options?.to) q.set("to", options.to);
  return fetchAifJSON<{ items: AifReceptionSummary[] }>(`/receptions?${q.toString()}`);
}

export function apiAifGetReception(id: string) {
  return fetchAifJSON<AifReceptionDetail>(`/receptions/${encodeURIComponent(id)}`);
}

export function apiAifUpdateReception(id: string, reception: Partial<AifReceptionInput>) {
  return fetchAifJSON<{ ok: true }>(`/receptions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ reception }),
  });
}

export function apiAifDeleteReception(id: string) {
  return fetchAifJSON<{ ok: true; mode: "deleted" }>(`/receptions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function apiAifCommitReceptionRows(id: string, rowIds?: string[]) {
  return fetchAifJSON<{ ok: true; committed: number; batches?: any[] }>(
    `/receptions/${encodeURIComponent(id)}/commit-selected`,
    {
      method: "POST",
      body: JSON.stringify({ rowIds: rowIds || [] }),
    }
  );
}

export function apiAifUpdateImportRow(rowId: string, normalized: Record<string, unknown>) {
  return fetchAifJSON<{ ok: true; status?: string; errors?: string[] }>(
    `/import-rows/${encodeURIComponent(rowId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ normalized }),
    }
  );
}

export function apiAifIgnoreImportRow(rowId: string) {
  return fetchAifJSON<{ ok: true; mode: "ignored" }>(
    `/import-rows/${encodeURIComponent(rowId)}`,
    { method: "DELETE" }
  );
}

export function apiAifReceptionExportCsvUrl(id: string) {
  return `/api/aif/receptions/${encodeURIComponent(id)}/export.csv`;
}


export function apiAifMoveImportRow(rowId: string, targetReceptionId: string) {
  return fetchAifJSON<{ ok: true; targetBatchId?: string }>(`/import-rows/${encodeURIComponent(rowId)}/move-reception`, {
    method: "POST",
    body: JSON.stringify({ targetReceptionId }),
  });
}

export const apiAifCommitReceptionSelected = apiAifCommitReceptionRows;


export type AifPurchaseOrderStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";

export type AifPurchaseOrderLine = {
  id: string;
  order_id: string;
  line_no: number;
  variant_id?: string | null;
  supplier_product_code?: string | null;
  supplier_variant_code?: string | null;
  model_code?: string | null;
  product_title: string;
  brand_name?: string | null;
  category_name?: string | null;
  barcode?: string | null;
  sn_cod?: string | null;
  customs_tariff_code?: string | null;
  color_name?: string | null;
  color_code?: string | null;
  size?: string | null;
  gender?: string | null;
  product_type?: string | null;
  material?: string | null;
  description_ro?: string | null;
  image_url?: string | null;
  qty_ordered: number | string;
  qty_received: number | string;
  qty_remaining?: number | string;
  unit_price?: number | string | null;
  sell_price?: number | string | null;
  line_total?: number | string | null;
  currency_code?: string | null;
  note?: string | null;
  raw?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AifPurchaseOrderSummary = {
  id: string;
  order_number: string;
  series?: string | null;
  sequence_number?: number | string | null;
  sequence_year?: number | string | null;
  status: AifPurchaseOrderStatus;
  supplier_id: string;
  supplier_name?: string | null;
  target_location_id?: string | null;
  location_name?: string | null;
  currency_code: string;
  order_date: string;
  expected_date?: string | null;
  external_reference?: string | null;
  note?: string | null;
  ordered_at?: string | null;
  ordered_by?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  line_count?: number | string | null;
  total_qty?: number | string | null;
  received_qty?: number | string | null;
  remaining_qty?: number | string | null;
  total_value?: number | string | null;
};

export type AifPurchaseOrderReceipt = {
  id: string;
  order_id: string;
  order_line_id: string;
  reception_id?: string | null;
  import_batch_id?: string | null;
  import_row_id?: number | string | null;
  qty: number | string;
  actor?: string | null;
  raw?: Record<string, unknown> | null;
  received_at: string;
  line_no?: number | string | null;
  product_title?: string | null;
  variant_id?: string | null;
  invoice_number?: string | null;
  reception_date?: string | null;
  reception_status?: string | null;
  source_file_name?: string | null;
};

export type AifPurchaseOrderDetail = {
  item: AifPurchaseOrderSummary;
  lines: AifPurchaseOrderLine[];
  receipts?: AifPurchaseOrderReceipt[];
  history?: Array<{
    id: string;
    from_status?: string | null;
    to_status: string;
    note?: string | null;
    actor?: string | null;
    created_at: string;
  }>;
};

export type AifPurchaseOrderSettings = {
  series: string;
  nextNumber: number;
  digits: number;
  includeYear: boolean;
  yearlyReset: boolean;
  sequenceYear: number;
  documentTitle: string;
  documentSubtitle: string;
  previewNumber: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export type AifPurchaseOrderInputLine = {
  id?: string;
  variantId?: string | null;
  variant_id?: string | null;
  supplierProductCode?: string | null;
  supplier_product_code?: string | null;
  supplierVariantCode?: string | null;
  supplier_variant_code?: string | null;
  modelCode?: string | null;
  model_code?: string | null;
  productTitle?: string | null;
  product_title?: string | null;
  brandName?: string | null;
  brand_name?: string | null;
  categoryName?: string | null;
  category_name?: string | null;
  barcode?: string | null;
  snCod?: string | null;
  sn_cod?: string | null;
  customsTariffCode?: string | null;
  customs_tariff_code?: string | null;
  colorName?: string | null;
  color_name?: string | null;
  colorCode?: string | null;
  color_code?: string | null;
  size?: string | null;
  gender?: string | null;
  productType?: string | null;
  product_type?: string | null;
  material?: string | null;
  descriptionRo?: string | null;
  description_ro?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  qty?: number | string;
  qtyOrdered?: number | string;
  qty_ordered?: number | string;
  unitPrice?: number | string | null;
  unit_price?: number | string | null;
  sellPrice?: number | string | null;
  sell_price?: number | string | null;
  note?: string | null;
};

export type AifPurchaseOrderInput = {
  supplierId: string;
  targetLocationId?: string | null;
  currencyCode?: string;
  orderDate?: string;
  expectedDate?: string | null;
  externalReference?: string | null;
  note?: string | null;
  lines: AifPurchaseOrderInputLine[];
};

export function apiAifListPurchaseOrders(options?: {
  search?: string;
  supplier?: string;
  location?: string;
  status?: AifPurchaseOrderStatus | "all";
  from?: string;
  to?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (options?.search?.trim()) q.set("q", options.search.trim());
  if (options?.supplier) q.set("supplier", options.supplier);
  if (options?.location) q.set("location", options.location);
  if (options?.status && options.status !== "all") q.set("status", options.status);
  if (options?.from) q.set("from", options.from);
  if (options?.to) q.set("to", options.to);
  q.set("limit", String(options?.limit || 500));
  return fetchAifJSON<{
    ok: true;
    items: AifPurchaseOrderSummary[];
    summary: {
      total: number;
      draft: number;
      ordered: number;
      partiallyReceived: number;
      received: number;
      cancelled: number;
      totalQty: number;
      receivedQty: number;
      remainingQty: number;
      totalValue: number;
    };
  }>(`/purchase-orders?${q.toString()}`);
}

export function apiAifGetPurchaseOrder(id: string) {
  return fetchAifJSON<AifPurchaseOrderDetail>(`/purchase-orders/${encodeURIComponent(id)}`);
}

export function apiAifCreatePurchaseOrder(input: AifPurchaseOrderInput) {
  return fetchAifJSON<{ ok: true; item: AifPurchaseOrderSummary; lines: AifPurchaseOrderLine[] }>("/purchase-orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifUpdatePurchaseOrder(id: string, input: AifPurchaseOrderInput) {
  return fetchAifJSON<{ ok: true; item: AifPurchaseOrderSummary; lines: AifPurchaseOrderLine[] }>(`/purchase-orders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export type AifOpenPurchaseOrderWorkItem = {
  supplierId: string;
  variantId: string;
  qty: number | string;
  unitPrice?: number | string | null;
  note?: string | null;
};

export type AifOpenPurchaseOrderWorkResult = {
  supplierId: string;
  supplierName?: string | null;
  orderId: string;
  orderNumber: string;
  status: AifPurchaseOrderStatus;
  created: boolean;
  addedLines: number;
  mergedLines: number;
  addedQty: number;
  lineCount?: number;
  totalQty?: number;
  currencyCode?: string | null;
  targetLocationId?: string | null;
  locationName?: string | null;
};

export function apiAifAddItemsToOpenPurchaseOrders(input: {
  items: AifOpenPurchaseOrderWorkItem[];
  targetLocationId?: string | null;
  currencyCode?: string;
  note?: string | null;
  idempotencyKey?: string;
}) {
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  return fetchAifJSON<{
    ok: true;
    duplicate?: boolean;
    orders: AifOpenPurchaseOrderWorkResult[];
    addedItems: number;
    addedQty: number;
  }>("/purchase-orders/open/add-items", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    body: JSON.stringify({
      items: input.items,
      targetLocationId: input.targetLocationId || null,
      currencyCode: input.currencyCode || "RON",
      note: input.note || null,
      idempotencyKey: idempotencyKey || null,
    }),
  });
}

export function apiAifMarkPurchaseOrderOrdered(id: string, note?: string) {
  return fetchAifJSON<{ ok: true; item: AifPurchaseOrderSummary }>(`/purchase-orders/${encodeURIComponent(id)}/ordered`, {
    method: "POST",
    body: JSON.stringify({ note: note || null }),
  });
}

export function apiAifCancelPurchaseOrder(id: string, note?: string) {
  return fetchAifJSON<{ ok: true; item: AifPurchaseOrderSummary }>(`/purchase-orders/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ note: note || null }),
  });
}

export function apiAifDeletePurchaseOrder(id: string) {
  return fetchAifJSON<{ ok: true; mode: "deleted" }>(`/purchase-orders/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function apiAifGetPurchaseOrderSettings() {
  return fetchAifJSON<{ ok: true; settings: AifPurchaseOrderSettings; item?: AifPurchaseOrderSettings }>("/purchase-orders/settings");
}

export function apiAifSavePurchaseOrderSettings(settings: Partial<AifPurchaseOrderSettings>) {
  return fetchAifJSON<{ ok: true; settings: AifPurchaseOrderSettings; item?: AifPurchaseOrderSettings }>("/purchase-orders/settings", {
    method: "PATCH",
    body: JSON.stringify({ settings }),
  });
}

export type AifShopifyStatus = {
  ok: boolean;
  config: {
    enabled: boolean;
    shopDomain: string;
    apiVersion: string;
    missing: string[];
    shopifyLocations: { csikszereda: string; kezdi: string };
    aifLocations: {
      csikszereda: { id: string; code: string };
      kezdi: { id: string; code: string };
    };
  };
  shop?: { id?: string; name?: string; myshopifyDomain?: string } | null;
  scope?: string | null;
  locations?: Record<string, unknown>;
  database?: Record<string, number | string>;
};

export type AifShopifyAudit = {
  generatedAt: string;
  counts: {
    allInVariants: number;
    allInWithSku: number;
    allInWithoutSku: number;
    shopifyVariants: number;
    shopifyWithSku: number;
    shopifyWithoutSku: number;
    safeMatches: number;
    allInDuplicateSkus: number;
    shopifyDuplicateSkus: number;
    missingInShopify: number;
    shopifyOnly: number;
    caseMismatches: number;
    mappedRows: number;
  };
  safeMatches?: Array<Record<string, unknown>>;
  samples?: Record<string, unknown>;
};

export function apiAifShopifyEnsureSchema() {
  return fetchAifJSON<{ ok: true }>("/shopify/schema", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function apiAifShopifyStatus() {
  return fetchAifJSON<AifShopifyStatus>("/shopify/status");
}

export function apiAifShopifyAudit(sample = 30) {
  return fetchAifJSON<{ ok: true; audit: AifShopifyAudit }>(`/shopify/audit?sample=${encodeURIComponent(String(sample))}`);
}

export function apiAifShopifyMap(options?: { dryRun?: boolean; sampleLimit?: number }) {
  return fetchAifJSON<{ ok: true; dryRun: boolean; mapped: number; wouldMap?: number; errors?: unknown[]; audit: AifShopifyAudit }>("/shopify/map", {
    method: "POST",
    body: JSON.stringify({ dryRun: options?.dryRun !== false, sampleLimit: options?.sampleLimit || 30 }),
  });
}

export function apiAifShopifyMappings(limit = 200) {
  return fetchAifJSON<{ ok: true; items: Array<Record<string, unknown>> }>(`/shopify/mappings?limit=${encodeURIComponent(String(limit))}`);
}

export function apiAifShopifyEnqueueAll(reason = "manual_full_sync") {
  return fetchAifJSON<{ ok: true; queued: number; status?: string }>("/shopify/enqueue-all", {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function apiAifShopifyProcess(limit = 20) {
  return fetchAifJSON<{ ok: true; enabled: boolean; processed: number; success: number; errors: number; message?: string }>("/shopify/process", {
    method: "POST",
    body: JSON.stringify({ limit }),
  });
}

export type AifShopifyProductExportSelectionMode = "selected_variants" | "all_model_variants";
export type AifShopifyProductExportStatus = "draft" | "active";

export type AifShopifyProductExportPreviewItem = {
  variantId: string;
  modelId: string;
  title?: string | null;
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
  availableQty?: number | string | null;
  mapped?: boolean | null;
  state: "valid" | "invalid" | "skipped_mapped" | string;
  errors: string[];
  warnings: string[];
};

export type AifShopifyProductExportPreview = {
  ok: true;
  selectionMode: AifShopifyProductExportSelectionMode;
  productStatus: AifShopifyProductExportStatus;
  location: { id?: string | null; name: string };
  summary: {
    selectedVariantCount: number;
    modelCount: number;
    validModelCount: number;
    variantCount: number;
    validVariantCount: number;
    invalidVariantCount: number;
    skippedMappedCount: number;
    warningCount: number;
    totalAvailableQty: number;
    locationId?: string | null;
    locationName: string;
  };
  items: AifShopifyProductExportPreviewItem[];
};

export type AifShopifyProductExportCreateResult = {
  ok: true;
  exportId: string;
  fileName: string;
  downloadUrl: string;
  summary: AifShopifyProductExportPreview["summary"];
  location: AifShopifyProductExportPreview["location"];
  productRows: number;
  inventoryRows?: number;
  stockMode?: "pair_then_sync" | string;
};

export function apiAifPreviewShopifyProductExport(input: {
  variantIds: string[];
  selectionMode?: AifShopifyProductExportSelectionMode;
  productStatus?: AifShopifyProductExportStatus;
  includeMapped?: boolean;
}) {
  return fetchAifJSON<AifShopifyProductExportPreview>("/shopify/product-exports/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifCreateShopifyProductExport(input: {
  variantIds: string[];
  selectionMode?: AifShopifyProductExportSelectionMode;
  productStatus?: AifShopifyProductExportStatus;
  includeMapped?: boolean;
}) {
  return fetchAifJSON<AifShopifyProductExportCreateResult>("/shopify/product-exports", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function apiAifListShopifyProductExports(limit = 20) {
  return fetchAifJSON<{ ok: true; items: Array<Record<string, unknown>> }>(`/shopify/product-exports?limit=${encodeURIComponent(String(limit))}`);
}

export function apiAifReconcileShopifyProductExport(exportId: string, options?: { enqueueStock?: boolean }) {
  return fetchAifJSON<{
    ok: true;
    exportId: string;
    status: string;
    mapped: number;
    errors: number;
    errorItems?: Array<{ variantId?: string; sku?: string; error?: string }>;
    totals?: Record<string, number | string>;
  }>(`/shopify/product-exports/${encodeURIComponent(exportId)}/reconcile`, {
    method: "POST",
    body: JSON.stringify({ enqueueStock: options?.enqueueStock !== false }),
  });
}

export function aifShopifyProductExportDownloadUrl(exportId: string) {
  return `${AIF_BASE}/shopify/product-exports/${encodeURIComponent(exportId)}/download`;
}

export type AifShopifyAddress = {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  province_code?: string | null;
  zip?: string | null;
  country?: string | null;
  country_code?: string | null;
  phone?: string | null;
  [key: string]: unknown;
};

export type AifShopifyOrderSummary = {
  id: string;
  shopify_order_id?: string | number | null;
  shopify_graphql_id?: string | null;
  order_number?: string | number | null;
  name?: string | null;
  status?: string | null;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  currency?: string | null;
  subtotal_price?: string | number | null;
  total_discounts?: string | number | null;
  total_tax?: string | number | null;
  total_price?: string | number | null;
  total_refunded?: string | number | null;
  customer_id?: string | number | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  email?: string | null;
  phone?: string | null;
  shipping_address?: AifShopifyAddress | string | null;
  billing_address?: AifShopifyAddress | string | null;
  line_count?: number | string | null;
  mapped_line_count?: number | string | null;
  unmapped_line_count?: number | string | null;
  refund_count?: number | string | null;
  test?: boolean | null;
  test_order?: boolean | null;
  processed_at?: string | null;
  cancelled_at?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  raw?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type AifShopifyOrderLine = {
  id?: string | null;
  order_id?: string | null;
  shopify_line_item_id?: string | number | null;
  shopify_product_id?: string | number | null;
  shopify_variant_id?: string | number | null;
  aif_variant_id?: string | null;
  allin_variant_id?: string | null;
  mapped_variant_id?: string | null;
  sku?: string | null;
  internal_sku?: string | null;
  title?: string | null;
  variant_title?: string | null;
  allin_title?: string | null;
  title_ro?: string | null;
  color?: string | null;
  color_name?: string | null;
  size?: string | null;
  quantity?: number | string | null;
  current_quantity?: number | string | null;
  refundable_quantity?: number | string | null;
  price?: string | number | null;
  total_discount?: string | number | null;
  fulfillment_status?: string | null;
  mapped?: boolean | null;
  raw?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type AifShopifyRefundLine = {
  id?: string | null;
  refund_id?: string | null;
  order_line_id?: string | null;
  shopify_refund_line_id?: string | number | null;
  shopify_line_item_id?: string | number | null;
  aif_variant_id?: string | null;
  sku?: string | null;
  title?: string | null;
  quantity?: number | string | null;
  subtotal?: string | number | null;
  total_tax?: string | number | null;
  restock_type?: string | null;
  location_id?: string | number | null;
  raw?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type AifShopifyRefund = {
  id?: string | null;
  order_id?: string | null;
  shopify_refund_id?: string | number | null;
  amount?: string | number | null;
  currency?: string | null;
  reason?: string | null;
  note?: string | null;
  status?: string | null;
  restock?: boolean | null;
  location_id?: string | number | null;
  location_name?: string | null;
  created_at?: string | null;
  processed_at?: string | null;
  lines?: AifShopifyRefundLine[];
  refund_lines?: AifShopifyRefundLine[];
  raw?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type AifShopifyOrderEvent = {
  id?: string | null;
  webhook_id?: string | null;
  topic?: string | null;
  status?: string | null;
  attempts?: number | string | null;
  error?: string | null;
  received_at?: string | null;
  processed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  order_id?: string | null;
  shopify_order_id?: string | number | null;
  result?: Record<string, unknown> | string | null;
  payload?: Record<string, unknown> | null;
  raw?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type AifShopifyOrderListResponse = {
  ok?: true;
  items: AifShopifyOrderSummary[];
  count?: number;
  total?: number;
  totals?: Record<string, number | string>;
};

export type AifShopifyOrderDetail = {
  ok?: true;
  item?: AifShopifyOrderSummary;
  order?: AifShopifyOrderSummary;
  lines?: AifShopifyOrderLine[];
  orderLines?: AifShopifyOrderLine[];
  order_lines?: AifShopifyOrderLine[];
  refunds?: AifShopifyRefund[];
  refundLines?: AifShopifyRefundLine[];
  refund_lines?: AifShopifyRefundLine[];
  events?: AifShopifyOrderEvent[];
  [key: string]: unknown;
};

export function apiAifListShopifyOrders(options?: {
  limit?: number;
  search?: string;
  status?: string;
  from?: string;
  to?: string;
}) {
  const q = new URLSearchParams();
  q.set("limit", String(options?.limit || 100));
  if (options?.search?.trim()) q.set("q", options.search.trim());
  if (options?.status?.trim()) q.set("status", options.status.trim());
  if (options?.from) q.set("from", options.from);
  if (options?.to) q.set("to", options.to);
  return fetchAifJSON<AifShopifyOrderListResponse>(`/shopify/orders?${q.toString()}`);
}

export function apiAifGetShopifyOrder(id: string) {
  return fetchAifJSON<AifShopifyOrderDetail>(`/shopify/orders/${encodeURIComponent(id)}`);
}

export function apiAifListShopifyOrderEvents(options?: {
  limit?: number;
  status?: string;
  topic?: string;
}) {
  const q = new URLSearchParams();
  q.set("limit", String(options?.limit || 50));
  if (options?.status?.trim()) q.set("status", options.status.trim());
  if (options?.topic?.trim()) q.set("topic", options.topic.trim());
  return fetchAifJSON<{ ok?: true; items: AifShopifyOrderEvent[] }>(`/shopify/order-events?${q.toString()}`);
}

export const apiAifShopifyOrders = apiAifListShopifyOrders;
export const apiAifShopifyOrder = apiAifGetShopifyOrder;
export const apiAifShopifyOrderEvents = apiAifListShopifyOrderEvents;

export type AifAdminShopOverviewSummary = {
  revenue: number;
  salesBeforeDiscount: number;
  transactions: number;
  itemsSold: number;
  averageBasket: number;
  discountTotal: number;
  unpaidTotal: number;
  unpaidSales: number;
  creditSales: number;
  paidTotal: number;
  estimatedCost: number;
  grossProfit: number;
  grossMargin: number;
  cancelledSales: number;
  refundedSales: number;
};

export type AifAdminShopRankingItem = {
  name: string;
  revenue: number;
  qty: number;
  transactions?: number;
  share?: number;
  productCode?: string | null;
};

export type AifAdminShopTrendItem = {
  date: string;
  label: string;
  revenue: number;
  transactions: number;
  itemsSold: number;
  discountTotal: number;
  unpaidTotal: number;
};

export type AifAdminShopPaymentItem = {
  method: string;
  label: string;
  amount: number;
  transactions: number;
  share: number;
};

export type AifAdminShopEmployeeItem = {
  actor: string;
  revenue: number;
  transactions: number;
  itemsSold: number;
  discountTotal: number;
  unpaidTotal: number;
  averageBasket: number;
};

export type AifAdminShopRecentSale = {
  id: string;
  saleNumber: string;
  soldAt: string;
  actor: string;
  customerName?: string | null;
  customerPhone?: string | null;
  status: string;
  paymentStatus: string;
  saleType: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  paidTotal: number;
  balanceDue: number;
  itemCount: number;
  lineCount: number;
};

export type AifAdminShopOverviewResponse = {
  ok: true;
  generatedAt: string;
  location: {
    id: string;
    code: string;
    name: string;
  };
  period: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    days: number;
  };
  summary: AifAdminShopOverviewSummary;
  previousSummary: AifAdminShopOverviewSummary;
  stockSnapshot: {
    variantCount: number;
    totalQty: number;
    reservedQty: number;
    availableQty: number;
    retailValue: number;
    lowStockVariants: number;
  };
  movementSummary: {
    movementCount: number;
    distinctVariants: number;
    incomingQty: number;
    outgoingQty: number;
    netQty: number;
  };
  trend: AifAdminShopTrendItem[];
  brands: AifAdminShopRankingItem[];
  categories: AifAdminShopRankingItem[];
  products: AifAdminShopRankingItem[];
  payments: AifAdminShopPaymentItem[];
  employees: AifAdminShopEmployeeItem[];
  recentSales: AifAdminShopRecentSale[];
  filterOptions: {
    employees: string[];
    brands: string[];
    categories: string[];
  };
};

export function apiAifAdminShopOverview(options: {
  location: string;
  from?: string;
  to?: string;
  employee?: string;
  paymentStatus?: string;
  saleType?: string;
  brand?: string;
  category?: string;
  search?: string;
}) {
  const q = new URLSearchParams();
  q.set("location", options.location);
  if (options.from) q.set("from", options.from);
  if (options.to) q.set("to", options.to);
  if (options.employee) q.set("employee", options.employee);
  if (options.paymentStatus) q.set("paymentStatus", options.paymentStatus);
  if (options.saleType) q.set("saleType", options.saleType);
  if (options.brand) q.set("brand", options.brand);
  if (options.category) q.set("category", options.category);
  if (options.search?.trim()) q.set("search", options.search.trim());
  return fetchAifJSON<AifAdminShopOverviewResponse>(`/admin-shops/overview?${q.toString()}`);
}

