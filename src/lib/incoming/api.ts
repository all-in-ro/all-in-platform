// Legacy incoming/transfer API was removed from index.js.
// Keep this tiny shim temporarily so old imports do not bring back old endpoints.

function disabled(): never {
  throw new Error("Legacy incoming API disabled. Use src/lib/aif/api.ts and /api/aif instead.");
}

export async function apiGetLocations() { return disabled(); }
export async function apiCreateIncomingBatch() { return disabled(); }
export async function apiReplaceIncomingItems() { return disabled(); }
export async function apiListIncomingBatches() { return disabled(); }
export async function apiGetIncomingBatch() { return disabled(); }
export async function apiCommitIncomingBatch() { return disabled(); }
export async function apiCreateTransfer() { return disabled(); }
export async function apiSaveTransferItems() { return disabled(); }
export async function apiListTransfers() { return disabled(); }
export async function apiGetTransfer() { return disabled(); }
export async function apiCommitTransfer() { return disabled(); }
export async function apiCancelTransfer() { return disabled(); }
