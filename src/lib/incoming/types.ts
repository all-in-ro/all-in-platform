export type Location = {
  id: string; // csikszereda, kezdivasarhely, raktar...
  name: string;
  kind: "shop" | "warehouse";
};

export type IncomingSourceMeta = {
  id: string;
  kind: "csv" | "manual";
  label: string; // file name or supplier label
  supplier: string;
  createdAtISO: string;
};

export type IncomingItemDraft = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  colorName: string;
  colorCode: string;
  size: string;
  qty: number;
  sourceMetaId: string; // links to IncomingSourceMeta
};

export type TransferItemDraft = {
  key: string; // derived (sku|size|colorCode)
  sku: string;
  name: string;
  brand: string;
  category: string;
  colorName: string;
  colorCode: string;
  size: string;
  qty: number;
};

export type TransferDraft = {
  fromLocationId: string;
  toLocationId: string;
  items: TransferItemDraft[];
};

export type DocType = "aviz" | "receptie";

export type DocDraftItem = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  colorName: string;
  colorCode: string;
  size: string;
  qty: number;
};

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
