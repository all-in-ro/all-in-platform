/**
 * Egyazon fizikai termék eltérő számlákon eltérő beszerzési áron érkezhet.
 * A beszerzési ár eltérése NEM variánsütközés; a soronkénti számlaár megmarad.
 * A jelenlegi eladási ár egyezése viszont feltétel a 833-as, célzott javításhoz.
 */
export function price2(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : null;
}

export function checkReusePrices({
  existingBuyPrice,
  existingSellPrice,
  incomingBuyPrice,
  incomingSellPrice,
  previousInvoiceSellPrice = null,
}) {
  const oldBuy = price2(existingBuyPrice);
  const oldSell = price2(existingSellPrice);
  const newBuy = price2(incomingBuyPrice);
  const newSell = price2(incomingSellPrice);
  const invoiceSell = price2(previousInvoiceSellPrice);
  if ([oldBuy, oldSell, newBuy, newSell].some(value => value === null || value < 0)) {
    return { ok: false, reason: 'Hiányzó vagy érvénytelen vételár/eladási ár' };
  }
  if (oldSell !== newSell) {
    return { ok: false, reason: `Eltérő aktuális eladási ár: régi ${oldSell}, 833-as ${newSell}` };
  }
  if (previousInvoiceSellPrice !== null && (invoiceSell === null || invoiceSell !== oldSell)) {
    return { ok: false, reason: `A 832-es forrássor eladási ára nem egyezik a meglevő variánssal: ${invoiceSell} / ${oldSell}` };
  }
  return {
    ok: true,
    oldBuyPrice: oldBuy,
    incomingBuyPrice: newBuy,
    sellPrice: newSell,
    historicalBuyPriceDiffers: oldBuy !== newBuy,
    buyPriceDifference: price2(newBuy - oldBuy),
    // A javítás megőrzi a célvariáns jelenlegi vételárát; a 833-as vételár
    // külön a 833-as importsorban marad. Nem könyvelünk vissza régi számlát.
    preserveExistingVariantBuyPrice: true,
  };
}
