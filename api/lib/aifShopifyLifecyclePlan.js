/** Pure, fail-closed quantity planner. No database or Shopify writes. */
const text = value => String(value ?? '').trim();
export const shopifyLineId = value => {
  const v = text(value);
  return v.startsWith('gid://') ? v : v ? `gid://shopify/LineItem/${v}` : '';
};
function count(value, label) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${label}: érvénytelen darabszám.`);
  return n;
}
export function planAifShopifyLifecycle({ order, lines, warehouseLines = [], fulfillments = [], refunds = [] }) {
  const issues = [];
  const cancelled = Boolean(order.cancelled_at) || order.status === 'cancelled';
  const shipped = new Map();
  const cancelledFulfillments = new Set();
  const uniqueFulfillments = new Map();
  for (const f of fulfillments) {
    const id = text(f.shopify_fulfillment_id || f.admin_graphql_api_id || f.id);
    if (!id) { issues.push('Teljesítésazonosító hiányzik.'); continue; }
    uniqueFulfillments.set(id, f.raw || f);
  }
  for (const f of uniqueFulfillments.values()) {
    const status = text(f.status).toLowerCase();
    for (const l of Array.isArray(f.line_items) ? f.line_items : []) {
      const id = shopifyLineId(l.admin_graphql_api_id || l.id || l.line_item_id);
      if (!id) { issues.push('Teljesítési terméksor azonosító nélkül.'); continue; }
      if (['cancelled', 'canceled'].includes(status)) cancelledFulfillments.add(id);
      if (status === 'success') shipped.set(id, (shipped.get(id) || 0) + count(l.quantity, 'Teljesített mennyiség'));
    }
  }
  const refundByLine = new Map();
  const seenRefundLines = new Set();
  for (const r of refunds) {
    const id = shopifyLineId(r.shopify_line_item_id || r.line_item_id || r.line_item?.id);
    const key = text(r.shopify_refund_line_id || r.id);
    if (key && seenRefundLines.has(key)) continue;
    if (key) seenRefundLines.add(key);
    if (!id) continue;
    const row = refundByLine.get(id) || { cancel: 0, no_restock: 0, return: 0, legacy_restock: 0 };
    const kind = text(r.restock_type).toLowerCase();
    if (!(kind in row)) { issues.push(`${id}: nem ismert visszatérítési készletutasítás.`); continue; }
    row[kind] += count(r.quantity, 'Visszatérítési mennyiség');
    refundByLine.set(id, row);
  }
  const saved = new Map(warehouseLines.map(l => [text(l.shopify_line_item_id), l]));
  const input = new Map(lines.map(l => [text(l.shopify_line_item_id), l]));
  for (const id of saved.keys()) if (!input.has(id)) issues.push(`${id}: a korábbi rendelési sor hiányzik, automatikus visszavétel tiltva.`);
  for (const id of shipped.keys()) if (!input.has(id)) issues.push(`${id}: teljesített, de nem azonosított rendelési sor.`);
  const plans = [];
  for (const line of lines) {
    const id = text(line.shopify_line_item_id);
    const old = saved.get(id);
    if(!old && !line.aif_variant_id && (line.raw?.gift_card===true || line.requires_shipping===false)) continue;
    const allocated = count(old?.allocated_qty ?? 0, 'Átadott mennyiség');
    const shippedBefore = count(old?.shipped_qty ?? 0, 'Korábbi kiadás');
    const released = count(old?.released_qty ?? 0, 'Visszaadott mennyiség');
    const returned = count(old?.returned_qty ?? 0, 'Visszaérkezett mennyiség');
    const held = allocated - shippedBefore - released;
    if (held < 0 || returned > shippedBefore) { issues.push(`${line.sku || id}: hibás belső mennyiségi egyenleg.`); continue; }
    if (old && text(old.variant_id) !== text(line.aif_variant_id)) { issues.push(`${line.sku || id}: a termékpárosítás megváltozott.`); continue; }
    const original = count(line.quantity ?? 0, 'Rendelt mennyiség');
    const current = count(line.current_quantity ?? original, 'Aktuális mennyiség');
    if (current > original) { issues.push(`${line.sku || id}: az aktuális mennyiség nagyobb a rendelt mennyiségnél.`); continue; }
    const refund = refundByLine.get(id) || { cancel: 0, no_restock: 0, return: 0, legacy_restock: 0 };
    if (refund.legacy_restock > 0) issues.push(`${line.sku || id}: régi, nem egyértelmű készlet-visszatérítés; kézi ellenőrzés szükséges.`);
    const remoteShipped = shipped.get(id) || 0;
    if (remoteShipped < shippedBefore && cancelledFulfillments.has(id) && returned < shippedBefore) {
      issues.push(`${line.sku || id}: korábban kiadott teljesítést visszavontak. A készletet csak tényleges visszaérkezés után szabad növelni.`);
    }
    if (remoteShipped < shippedBefore && !cancelledFulfillments.has(id)) {
      issues.push(`${line.sku || id}: hiányos korábbi teljesítési előzmény.`);
    }
    // A canceled dispatched fulfillment followed by another fulfillment of the
    // same line is a second shipment cycle, not a replay. Never silently net it.
    if (cancelledFulfillments.has(id) && shippedBefore > 0 && remoteShipped > 0) {
      issues.push(`${line.sku || id}: visszavont feladás után új teljesítés látható. Új csere-rendelés vagy külön audit szükséges.`);
    }
    if (remoteShipped > original) issues.push(`${line.sku || id}: a teljesítések összege meghaladja a rendelt darabszámot.`);
    if (line.fulfillment_status === 'fulfilled' && remoteShipped === 0 && original > 0) {
      issues.push(`${line.sku || id}: teljesített állapot tételes teljesítési bizonyíték nélkül.`);
    }
    if (line.is_active !== false && current < original && !refundByLine.has(id) && !Array.isArray(order.raw?.refunds)) {
      issues.push(`${line.sku || id}: hiányos refund-adatok; a mennyiségcsökkenést nem tekintem automatikus lemondásnak.`);
    }
    // current_quantity excludes refunds too. NO_RESTOCK and RETURN are not a
    // release of an unshipped reservation. CANCEL is explicit cancellation.
    const keep = line.is_active === false ? 0 : Math.min(
      Math.max(0, original - refund.cancel), current + refund.no_restock + refund.return,
    );
    const targetShipped = Math.max(shippedBefore, remoteShipped);
    const targetDemand = cancelled ? targetShipped : Math.max(targetShipped, keep);
    const add = Math.max(0, targetDemand - (allocated - released));
    const ship = targetShipped - shippedBefore;
    const targetHeld = Math.max(0, targetDemand - targetShipped);
    const release = held + add - ship - targetHeld;
    if (release < 0 || ship > held + add) { issues.push(`${line.sku || id}: nem egyeztethető készletigény.`); continue; }
    if ((add || ship || release) && !line.aif_variant_id) issues.push(`${line.sku || id}: nincs termékpárosítás.`);
    plans.push({ id, variantId: line.aif_variant_id, line, old, allocated, shippedBefore, released, returned,
      held, add, ship, release, targetHeld, targetShipped, targetDemand,
      expectedReturn: Math.max(0, refund.return - returned) });
  }
  if (issues.length) throw Object.assign(new Error([...new Set(issues)].join('\n')), { code: 'shopify_lifecycle_review_required' });
  return { cancelled, lines: plans, add: plans.reduce((n,l)=>n+l.add,0), ship: plans.reduce((n,l)=>n+l.ship,0),
    release: plans.reduce((n,l)=>n+l.release,0), pending: plans.reduce((n,l)=>n+l.targetHeld,0) };
}
