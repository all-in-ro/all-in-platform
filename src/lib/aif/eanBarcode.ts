/**
 * AIF barcode label helper.
 * Render valid 13-digit EAN and 8-digit EAN in their original retail symbology,
 * never change their underlying identifiers. Everything else stays Code128.
 */
export type AifEanBarcodeRender = {
  ok: true;
  svg: string;
  width: number;
  symbology: "ean13" | "ean8";
};

const EAN_L = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011",
];
const EAN_G = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111",
];
const EAN_R = [
  "1110010", "1100110", "1101100", "1000010", "1011100",
  "1001110", "1010000", "1000100", "1001000", "1110100",
];
const EAN13_PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
];

/** Modulo-10 GTIN check digit, read right-to-left with alternating 3/1 weights. */
export function aifGtinCheckDigit(base: string): number {
  let sum = 0;
  for (let index = base.length - 1, position = 0; index >= 0; index--, position++) {
    sum += Number(base[index]) * (position % 2 === 0 ? 3 : 1);
  }
  return (10 - sum % 10) % 10;
}

export function aifValidEan13(value: string): boolean {
  return /^\d{13}$/.test(value) && aifGtinCheckDigit(value.slice(0, 12)) === Number(value[12]);
}

export function aifValidEan8(value: string): boolean {
  return /^\d{8}$/.test(value) && aifGtinCheckDigit(value.slice(0, 7)) === Number(value[7]);
}

function aifEanSvg(code: string, bits: string, kind: "ean13" | "ean8", height: number): AifEanBarcodeRender {
  // The white zones are vital. On a 40 mm Zebra label the 113 EAN13 modules
  // fit at approximately 0.34 mm each, unlike the former 198-module Code128B.
  const quietLeft = kind === "ean13" ? 11 : 7;
  const quietRight = kind === "ean13" ? 7 : 7;
  const width = quietLeft + bits.length + quietRight;
  const cleanHeight = Math.max(28, Math.min(120, Number(height) || 62));
  const bars: string[] = [];
  for (let index = 0; index < bits.length;) {
    if (bits[index] === "0") { index++; continue; }
    let end = index + 1;
    while (end < bits.length && bits[end] === "1") end++;
    bars.push(`<rect x="${quietLeft + index}" y="0" width="${end - index}" height="${cleanHeight}" />`);
    index = end;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" data-aif-symbology="${kind}" viewBox="0 0 ${width} ${cleanHeight + 12}" preserveAspectRatio="none" role="img" aria-label="${kind.toUpperCase()} ${code}"><rect width="${width}" height="${cleanHeight + 12}" fill="#fff"/><g fill="#000" shape-rendering="crispEdges">${bars.join("")}</g><text x="${width / 2}" y="${cleanHeight + 9}" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.2" fill="#111">${code}</text></svg>`;
  return { ok: true, svg, width, symbology: kind };
}

/** Null means the identifier is not a valid EAN and must be encoded as Code128. */
export function aifRetailEanBarcodeSvg(value: string, height = 62): AifEanBarcodeRender | null {
  const code = String(value ?? "").trim();
  if (aifValidEan13(code)) {
    const parity = EAN13_PARITY[Number(code[0])];
    const left = code.slice(1, 7).split("").map((digit, index) =>
      (parity[index] === "L" ? EAN_L : EAN_G)[Number(digit)]
    ).join("");
    const right = code.slice(7).split("").map((digit) => EAN_R[Number(digit)]).join("");
    return aifEanSvg(code, `101${left}01010${right}101`, "ean13", height);
  }
  if (aifValidEan8(code)) {
    const left = code.slice(0, 4).split("").map((digit) => EAN_L[Number(digit)]).join("");
    const right = code.slice(4).split("").map((digit) => EAN_R[Number(digit)]).join("");
    return aifEanSvg(code, `101${left}01010${right}101`, "ean8", height);
  }
  return null;
}
