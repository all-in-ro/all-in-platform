export type Location = {
  id: string;
  name: string;
  kind: "shop" | "warehouse";
};

export type IncomingSourceMeta = {
  id: string;
  kind: "csv" | "manual";
  label: string; // file name or short label
  supplier: string;
  createdAtISO: string;
  locationId: string;
};

export type IncomingItemDraft = {
  sku: string;
  name: string;
  colorCode: string;
  colorName: string;
  size: string;
  category: string;
  qty: number;
  sourceMetaId: string; // points to IncomingSourceMeta.id
};

export type IncomingBatchSummary = {
  id: string;
  created_at: string;
  supplier: string;
  source_type: "csv" | "manual";
  location_id: string;
  status: "draft" | "committed" | "cancelled";
  note: string | null;
};

export type IncomingBatchDetail = IncomingBatchSummary & {
  items: Array<{
    id: number;
    product_code: string | null;
    product_name: string | null;
    color_code: string | null;
    color_name: string | null;
    size: string | null;
    category: string | null;
    qty: number;
    matched_product_id: string | null;
    raw: any;
  }>;
};

export type TransferDraftItem = {
  sku: string;
  name: string;
  colorCode: string;
  colorName: string;
  size: string;
  category: string;
  qty: number;
};

export type TransferDraft = {
  fromLocationId: string;
  toLocationId: string;
  items: TransferDraftItem[];
};

export type DocType = "aviz" | "receptie";

export type DocDraftItem = TransferDraftItem;

export type DocDraft = {
  docType: DocType;
  number: string;
  dateISO: string; // YYYY-MM-DD
  fromLocationId: string;
  toLocationId: string;
  partnerName: string;
  notes: string;
  items: DocDraftItem[];
};


export type TransferItemDraft = {
  sku: string;
  name: string;
  colorCode: string;
  colorName: string;
  size: string;
  category: string;
  qty: number;
  matchedProductId?: string | null;
  raw?: any;
};

export type TransferSummary = {
  id: string;
  createdAtISO: string;
  status: "draft" | "committed" | "cancelled";
  fromLocationId: string;
  toLocationId: string;
  note?: string | null;
  createdBy: string;
  actor: string;
};

export type TransferDetail = TransferSummary & {
  items: TransferItemDraft[];
}; 
