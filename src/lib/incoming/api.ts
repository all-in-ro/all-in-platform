import type { IncomingBatchDetail, IncomingBatchSummary, Location } from "./types";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data as T;
}

export async function apiGetLocations(): Promise<Location[]> {
  // Backend: GET /api/shops
  return fetchJSON<Location[]>("/api/shops");
}

export async function apiCreateIncomingBatch(input: {
  supplier: string;
  sourceType: "csv" | "manual";
  locationId: string;
  note?: string;
}): Promise<{ id: string }> {
  return fetchJSON<{ id: string }>("/api/incoming/batches", {
    method: "POST",
    body: JSON.stringify({
      supplier: input.supplier,
      source_type: input.sourceType,
      location_id: input.locationId,
      note: input.note || "",
    }),
  });
}

export async function apiReplaceIncomingItems(batchId: string, items: Array<{
  product_code: string;
  product_name: string;
  color_code: string;
  color_name: string;
  size: string;
  category: string;
  qty: number;
  raw?: any;
}>): Promise<{ ok: true; count: number }> {
  return fetchJSON<{ ok: true; count: number }>(`/api/incoming/batches/${encodeURIComponent(batchId)}/items`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function apiListIncomingBatches(params?: { limit?: number; offset?: number }): Promise<{ items: IncomingBatchSummary[] }> {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchJSON<{ items: IncomingBatchSummary[] }>(`/api/incoming/batches${suffix}`);
}

export async function apiGetIncomingBatch(batchId: string): Promise<IncomingBatchDetail> {
  return fetchJSON<IncomingBatchDetail>(`/api/incoming/batches/${encodeURIComponent(batchId)}`);
}

export async function apiCommitIncomingBatch(batchId: string): Promise<{ ok: true }> {
  return fetchJSON<{ ok: true }>(`/api/incoming/batches/${encodeURIComponent(batchId)}/commit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
} 
