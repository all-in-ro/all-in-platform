import { useEffect, useMemo, useState } from "react";

type PageProps = {
  apiBase?: string;
  actor?: string;
  role?: string;
  shopId?: string;
  onLogout?: () => void;
};

type BarcodeRender = {
  ok: boolean;
  svg: string;
  width: number;
  error?: string;
};

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

function parseHashParams() {
  const raw = window.location.hash || "";
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
  return new URLSearchParams(query);
}

function cleanInternalCode(input: string) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function makeInternalCode(seed = "") {
  const base = cleanInternalCode(seed).slice(0, 12) || "AIF";
  const date = new Date();
  const y = String(date.getFullYear()).slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const t = String(Date.now()).slice(-6);
  return cleanInternalCode(`${base}-${y}${m}${d}-${t}`);
}

function code128Svg(value: string, height = 74): BarcodeRender {
  const code = String(value || "").trim();
  if (!code) return { ok: false, svg: "", width: 0, error: "A vonalkód mező üres." };

  const values: number[] = [];
  for (const ch of code) {
    const charCode = ch.charCodeAt(0);
    if (charCode < 32 || charCode > 127) {
      return {
        ok: false,
        svg: "",
        width: 0,
        error: "A Code128-B ebben a verzióban csak latin betűket, számokat és egyszerű jeleket kezel.",
      };
    }
    values.push(charCode - 32);
  }

  const startB = 104;
  let checksum = startB;
  values.forEach((v, index) => {
    checksum += v * (index + 1);
  });
  checksum = checksum % 103;
  const sequence = [startB, ...values, checksum, 106];
  const patterns = sequence.map((v) => CODE128_PATTERNS[v]).filter(Boolean);
  const totalModules = patterns.reduce((sum, p) => sum + p.split("").reduce((a, n) => a + Number(n), 0), 0);
  const quiet = 10;
  const width = totalModules + quiet * 2;
  let x = quiet;
  const bars: string[] = [];

  for (const pattern of patterns) {
    let black = true;
    for (const digit of pattern) {
      const w = Number(digit);
      if (black) bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}" />`);
      x += w;
      black = !black;
    }
  }

  const safeText = code.replace(/[<&>]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m] || m));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 20}" role="img" aria-label="Vonalkód ${safeText}"><rect width="${width}" height="${height + 20}" fill="#fff"/><g fill="#000">${bars.join("")}</g><text x="${width / 2}" y="${height + 15}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9">${safeText}</text></svg>`;
  return { ok: true, svg, width };
}

function downloadFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AllInBarcodes(_props: PageProps) {
  const [variantId, setVariantId] = useState("");
  const [title, setTitle] = useState("");
  const [barcode, setBarcode] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("RON");
  const [labelWidth, setLabelWidth] = useState("50");
  const [labelHeight, setLabelHeight] = useState("30");
  const [copies, setCopies] = useState("1");
  const [showPrice, setShowPrice] = useState(true);
  const [showBrand, setShowBrand] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const params = parseHashParams();
    setVariantId(params.get("variant") || params.get("variantId") || "");
    setTitle(params.get("title") || "");
    setBarcode(params.get("barcode") || "");
    setBrand(params.get("brand") || "");
    setSize(params.get("size") || "");
    setColor(params.get("color") || "");
    setPrice(params.get("price") || "");
  }, []);

  const render = useMemo(() => code128Svg(barcode, 72), [barcode]);
  const copyCount = Math.max(1, Math.min(100, Number.parseInt(copies || "1", 10) || 1));
  const labels = useMemo(() => Array.from({ length: copyCount }), [copyCount]);
  const safeFile = cleanInternalCode(barcode || title || "aif-vonalkod") || "aif-vonalkod";

  const canPrint = Boolean(barcode.trim()) && render.ok;

  const generateCode = () => {
    const generated = makeInternalCode(variantId || title || brand || "AIF");
    setBarcode(generated);
    setStatus("Belső vonalkód létrehozva. Mentés termékhez későbbi lépésben kerül bekötésre.");
  };

  const copyBarcode = async () => {
    try {
      await navigator.clipboard.writeText(barcode);
      setStatus("Vonalkód másolva.");
    } catch {
      setStatus("A másolás nem sikerült a böngészőben.");
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Termeknev", "Marka", "Meret", "Szin", "Vonalkod", "Ar", "Penznem", "Peldany"],
      [title, brand, size, color, barcode, price, currency, String(copyCount)],
    ];
    const csv = "\ufeff" + rows.map((r) => r.map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(";")).join("\n");
    downloadFile(`${safeFile}.csv`, csv, "text/csv;charset=utf-8");
  };

  const exportSvg = () => {
    if (!render.ok) {
      setStatus(render.error || "Nem exportálható vonalkód.");
      return;
    }
    downloadFile(`${safeFile}.svg`, render.svg, "image/svg+xml;charset=utf-8");
  };

  const printLabels = () => {
    if (!canPrint) {
      setStatus(render.error || "Nyomtatáshoz érvényes vonalkód kell.");
      return;
    }
    window.print();
  };

  return (
    <main className="aifBarcodePage">
      <style>{`
        .aifBarcodePage {
          min-height: 100vh;
          padding: 52px clamp(14px, 5vw, 72px);
          background: #4f5a6b;
          color: #ffffff;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .barcodeShell { max-width: 1180px; margin: 0 auto; }
        .barcodeHeader, .barcodePanel, .barcodeCard {
          border: 1px solid rgba(255,255,255,.72);
          border-radius: 18px;
          background: rgba(58,70,88,.78);
          box-shadow: 0 16px 34px rgba(0,0,0,.12);
        }
        .barcodeHeader { padding: 22px 24px; display:flex; gap:16px; justify-content:space-between; align-items:flex-start; }
        .eyebrow { font-size: 12px; letter-spacing: .13em; text-transform: uppercase; color: #d9f2ef; }
        h1 { margin: 5px 0 6px; font-size: clamp(24px, 3vw, 34px); line-height: 1.05; font-weight: 400; }
        .muted { color: rgba(255,255,255,.72); font-size: 14px; }
        .actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
        button, .buttonLike {
          border: 1px solid rgba(255,255,255,.65);
          background: #334056;
          color: #fff;
          border-radius: 10px;
          padding: 9px 12px;
          cursor: pointer;
          font: inherit;
          font-size: 14px;
          line-height: 1;
        }
        button:hover { background: #3f4d64; }
        button.primary { background: #23745f; border-color: #8fe6ce; }
        button.danger { background: #cf1234; border-color: rgba(255,255,255,.8); }
        button:disabled { opacity: .45; cursor: not-allowed; }
        .barcodeGrid { display:grid; grid-template-columns: minmax(280px, .85fr) minmax(320px, 1.15fr); gap:16px; margin-top:16px; }
        .barcodePanel { padding: 16px; }
        .panelTitle { display:flex; justify-content:space-between; align-items:center; border-radius: 12px; background:#111a29; padding:12px 14px; border-left:4px solid #6ee7c8; letter-spacing:.12em; text-transform:uppercase; font-size:14px; margin-bottom:14px; }
        .formGrid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
        .field { display:flex; flex-direction:column; gap:6px; }
        .field.full { grid-column: 1 / -1; }
        label { font-size: 12px; text-transform: uppercase; letter-spacing:.04em; color:#ecf6f5; }
        input, select, textarea {
          background:#2f3a4d;
          color:#fff;
          border:1px solid rgba(255,255,255,.75);
          border-radius:10px;
          padding:10px 11px;
          min-height:39px;
          font: inherit;
          outline:none;
        }
        input::placeholder, textarea::placeholder { color:rgba(255,255,255,.48); }
        .helpBox { border:1px solid rgba(255,255,255,.62); border-radius:12px; padding:12px; background:rgba(17,26,41,.28); margin-top:12px; font-size:13px; color:rgba(255,255,255,.78); }
        .previewBox { display:grid; grid-template-columns: 1fr; gap:14px; }
        .labelPreview {
          width: min(100%, 520px);
          min-height: 240px;
          margin: 0 auto;
          background:#ffffff;
          color:#111;
          border-radius:16px;
          padding:18px;
          display:flex;
          flex-direction:column;
          justify-content:center;
          box-shadow: inset 0 0 0 1px #d6d6d6;
        }
        .labelBrand { font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:#333; margin-bottom:6px; }
        .labelTitle { font-size:18px; line-height:1.15; margin-bottom:7px; }
        .labelMeta { display:flex; gap:10px; flex-wrap:wrap; color:#333; font-size:13px; margin-bottom:8px; }
        .barcodeSvgWrap { width:100%; overflow:hidden; }
        .barcodeSvgWrap svg { display:block; width:100%; height:auto; }
        .labelPrice { margin-top:8px; font-size:18px; text-align:right; }
        .errorBox { border:1px solid #ff8da0; background:rgba(207,18,52,.16); color:#ffe2e7; border-radius:12px; padding:11px; }
        .statusBox { border:1px solid rgba(142,230,206,.65); background:rgba(35,116,95,.18); border-radius:12px; padding:11px; color:#e9fffa; }
        .printSheet { display:none; }
        @media (max-width: 900px) { .barcodeGrid { grid-template-columns:1fr; } .barcodeHeader { flex-direction:column; } .formGrid { grid-template-columns:1fr; } }
        @media print {
          body * { visibility:hidden !important; }
          .printSheet, .printSheet * { visibility:visible !important; }
          .printSheet { display:grid !important; position:absolute; inset:0; padding:0; background:#fff; grid-template-columns: repeat(auto-fill, minmax(var(--label-w), 1fr)); align-content:start; gap:2mm; }
          .printLabel { width:var(--label-w); height:var(--label-h); border:1px solid #ddd; padding:2mm; color:#111; background:#fff; overflow:hidden; font-family:Arial, sans-serif; page-break-inside:avoid; }
          .printLabel .labelBrand { font-size:8pt; }
          .printLabel .labelTitle { font-size:10pt; margin-bottom:1mm; }
          .printLabel .labelMeta { font-size:8pt; margin-bottom:1mm; }
          .printLabel svg { width:100%; max-height:15mm; }
          .printLabel .labelPrice { font-size:10pt; }
        }
      `}</style>

      <div className="barcodeShell">
        <section className="barcodeHeader">
          <div>
            <div className="eyebrow">AllInFashion</div>
            <h1>Vonalkód / címke</h1>
            <div className="muted">Belső vonalkód előkészítés, címke előnézet és nyomtatás.</div>
          </div>
          <div className="actions">
            <button type="button" onClick={() => { window.location.hash = "allinwarehouse"; }}>← Vissza a raktárba</button>
            <button type="button" onClick={printLabels} className="primary" disabled={!canPrint}>Nyomtatás</button>
          </div>
        </section>

        <section className="barcodeGrid">
          <div className="barcodePanel">
            <div className="panelTitle">Adatok</div>
            <div className="formGrid">
              <div className="field full">
                <label>Terméknév</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Termék neve" />
              </div>
              <div className="field">
                <label>Márka</label>
                <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="pl. Under Armour" />
              </div>
              <div className="field">
                <label>Variáns ID</label>
                <input value={variantId} onChange={(e) => setVariantId(e.target.value)} placeholder="AIF variáns azonosító" />
              </div>
              <div className="field full">
                <label>Vonalkód / Shopify SKU alap</label>
                <input value={barcode} onChange={(e) => setBarcode(cleanInternalCode(e.target.value))} placeholder="Egyedi variánsazonosító" />
              </div>
              <div className="field">
                <label>Méret</label>
                <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="pl. M vagy 42" />
              </div>
              <div className="field">
                <label>Szín</label>
                <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="pl. fekete" />
              </div>
              <div className="field">
                <label>Ár</label>
                <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="pl. 129.90" inputMode="decimal" />
              </div>
              <div className="field">
                <label>Pénznem</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="RON">RON</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="HUF">HUF</option>
                </select>
              </div>
              <div className="field">
                <label>Címke szélesség mm</label>
                <input value={labelWidth} onChange={(e) => setLabelWidth(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>Címke magasság mm</label>
                <input value={labelHeight} onChange={(e) => setLabelHeight(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>Példány</label>
                <input value={copies} onChange={(e) => setCopies(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>Megjelenítés</label>
                <select value={`${showBrand ? "brand" : "no-brand"}:${showPrice ? "price" : "no-price"}`} onChange={(e) => {
                  const [b, p] = e.target.value.split(":");
                  setShowBrand(b === "brand");
                  setShowPrice(p === "price");
                }}>
                  <option value="brand:price">Márka és ár</option>
                  <option value="brand:no-price">Márka, ár nélkül</option>
                  <option value="no-brand:price">Ár, márka nélkül</option>
                  <option value="no-brand:no-price">Csak termékadat</option>
                </select>
              </div>
            </div>

            <div className="actions" style={{ marginTop: 14, justifyContent: "flex-start" }}>
              <button type="button" className="primary" onClick={generateCode}>Belső vonalkód generálása</button>
              <button type="button" onClick={copyBarcode} disabled={!barcode}>Másolás</button>
              <button type="button" onClick={exportSvg} disabled={!render.ok}>SVG export</button>
              <button type="button" onClick={exportCsv}>CSV export</button>
            </div>

            <div className="helpBox">
              A vonalkód itt belső AllIn / Shopify SKU azonosítóként készül. Hivatalos GS1 EAN/GTIN generálást csak licencelt prefixszel szabad később bekötni.
            </div>
            {status && <div className="statusBox" style={{ marginTop: 10 }}>{status}</div>}
          </div>

          <div className="barcodePanel">
            <div className="panelTitle">Címke előnézet</div>
            <div className="previewBox">
              {!render.ok && <div className="errorBox">{render.error}</div>}
              <div className="labelPreview">
                {showBrand && brand && <div className="labelBrand">{brand}</div>}
                <div className="labelTitle">{title || "Termék megnevezése"}</div>
                <div className="labelMeta">
                  {size && <span>Méret: {size}</span>}
                  {color && <span>Szín: {color}</span>}
                </div>
                <div className="barcodeSvgWrap" dangerouslySetInnerHTML={{ __html: render.ok ? render.svg : "" }} />
                {showPrice && price && <div className="labelPrice">{price} {currency}</div>}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="printSheet" style={{ "--label-w": `${Number(labelWidth) || 50}mm`, "--label-h": `${Number(labelHeight) || 30}mm` } as any}>
        {labels.map((_, index) => (
          <div className="printLabel" key={index}>
            {showBrand && brand && <div className="labelBrand">{brand}</div>}
            <div className="labelTitle">{title || "Termék"}</div>
            <div className="labelMeta">
              {size && <span>Méret: {size}</span>}
              {color && <span>Szín: {color}</span>}
            </div>
            <div dangerouslySetInnerHTML={{ __html: render.ok ? render.svg : "" }} />
            {showPrice && price && <div className="labelPrice">{price} {currency}</div>}
          </div>
        ))}
      </div>
    </main>
  );
}
