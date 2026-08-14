import fs from "node:fs";

const COMPANY = {
  name: "TITAN EURO-COM SRL",
  cui: "RO17495362",
  reg: "J19/420/2005",
  address: "Str. Mihail Sadoveanu nr. 33, Miercurea-Ciuc, jud. Harghita",
};

function money(value) {
  const n = Number(value || 0);
  return `${(Number.isFinite(n) ? n : 0).toLocaleString("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} RON`;
}

function roDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function roDate(value) {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function safeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function payment(snapshot, method) {
  const rows = Array.isArray(snapshot?.payments) ? snapshot.payments : [];
  return rows.find((item) => item?.method === method) || { amount: 0 };
}

export async function createAifShopProofPdf(input = {}) {
  let PDFDocument;
  try {
    const mod = await import("pdfkit");
    PDFDocument = mod.default || mod;
  } catch {
    const error = new Error("PDF engine (pdfkit) is not installed on the server.");
    error.statusCode = 500;
    throw error;
  }

  const doc = new PDFDocument({ size: "A4", margin: 0, info: {
    Title: safeText(input.title, "AllInFashion bizonylat"),
    Author: COMPANY.name,
    Subject: safeText(input.documentNumber),
  }});

  const regularCandidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  ];
  const boldCandidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
  ];
  const regular = regularCandidates.find((candidate) => fs.existsSync(candidate));
  const bold = boldCandidates.find((candidate) => fs.existsSync(candidate));
  if (regular) doc.registerFont("AllInRegular", regular);
  if (bold) doc.registerFont("AllInBold", bold);
  const fontRegular = regular ? "AllInRegular" : "Helvetica";
  const fontBold = bold ? "AllInBold" : "Helvetica-Bold";

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const teal = "#2a8d8b";
  const dark = "#172033";
  const muted = "#64748b";
  const pale = "#f4f8f8";
  const border = "#d8e4e2";
  const red = "#c30d1c";
  const left = 48;
  const right = pageWidth - 48;
  const width = right - left;

  const section = (y, title, rows, options = {}) => {
    const rowHeight = options.rowHeight || 25;
    const titleHeight = 24;
    const height = titleHeight + rows.length * rowHeight + 12;
    doc.save();
    doc.roundedRect(left, y, width, height, 8).fillAndStroke("#ffffff", border);
    doc.restore();
    doc.font(fontBold).fontSize(8).fillColor(teal).text(title.toUpperCase(), left + 14, y + 9, { width: width - 28 });
    let rowY = y + titleHeight;
    rows.forEach(([label, value], index) => {
      if (index > 0) {
        doc.moveTo(left + 14, rowY).lineTo(right - 14, rowY).lineWidth(0.5).strokeColor(border).stroke();
      }
      doc.font(fontRegular).fontSize(7.5).fillColor(muted).text(String(label), left + 14, rowY + 8, { width: 155 });
      doc.font(fontBold).fontSize(9.2).fillColor(dark).text(safeText(value), left + 175, rowY + 7, { width: width - 203, align: "right" });
      rowY += rowHeight;
    });
    return y + height;
  };

  // Frame + header
  doc.roundedRect(34, 30, pageWidth - 68, pageHeight - 60, 12).lineWidth(1).strokeColor(border).stroke();

  doc.font(fontBold).fontSize(13).fillColor("#173f3d").text(COMPANY.name, left, 51, { width: 250 });
  doc.font(fontRegular).fontSize(7.7).fillColor(muted)
    .text(`CUI: ${COMPANY.cui}  |  Nr. Reg. Com.: ${COMPANY.reg}`, left, 70, { width: 300 })
    .text(COMPANY.address, left, 82, { width: 340 });

  const registryWidth = 180;
  const registryX = right - registryWidth;
  doc.roundedRect(registryX, 49, registryWidth, 47, 7).fillAndStroke(pale, border);
  doc.font(fontBold).fontSize(6.8).fillColor(muted).text("NUMĂR DOCUMENT", registryX + 10, 57, { width: registryWidth - 20 });
  doc.font(fontBold).fontSize(11).fillColor("#173f3d").text(safeText(input.documentNumber), registryX + 10, 70, { width: registryWidth - 20 });
  doc.font(fontRegular).fontSize(6.8).fillColor(muted).text(`Generat: ${roDateTime(new Date())}`, registryX + 10, 85, { width: registryWidth - 20 });

  doc.moveTo(left, 108).lineTo(right, 108).lineWidth(1.6).strokeColor(teal).stroke();

  const kind = String(input.kind || "");
  let title = "DOCUMENT INTERN";
  let subtitle = "";
  if (kind === "cash_movement") {
    const movementType = input.data?.movementType;
    title = movementType === "bank_deposit"
      ? "DOVADĂ DE DEPUNERE / IEȘIRE NUMERAR"
      : "PROCES-VERBAL DE PREDARE-PRIMIRE NUMERAR";
    subtitle = movementType === "bank_deposit"
      ? "Înregistrare internă a depunerii bancare"
      : "Predare numerar către conducere";
  } else if (kind === "shift_handover") {
    title = "PROCES-VERBAL DE PREDARE-PRIMIRE CASIERIE";
    subtitle = "Predare de schimb și verificare numerar";
  } else if (kind === "day_closure") {
    title = "PROCES-VERBAL DE ÎNCHIDERE ZILNICĂ";
    subtitle = "Închidere casierie și reconciliere numerar";
  }

  doc.font(fontBold).fontSize(15).fillColor(dark).text(title, left, 126, { width, align: "center" });
  doc.font(fontRegular).fontSize(8.5).fillColor(muted).text(subtitle, left, 148, { width, align: "center" });

  let y = 178;
  const data = input.data || {};

  if (kind === "cash_movement") {
    const typeLabel = data.movementType === "bank_deposit" ? "Depunere bancară" : "Predare către conducere";
    y = section(y, "Identificare", [
      ["Unitate", data.locationName],
      ["Tip operațiune", typeLabel],
      ["Status", data.status === "confirmed" ? "CONFIRMAT" : safeText(data.status).toUpperCase()],
    ]);
    y += 10;
    y = section(y, "Predare / confirmare", [
      ["Predător / solicitant", data.requestedBy],
      ["Primitor / confirmat de", data.confirmedBy || (data.movementType === "bank_deposit" ? data.requestedBy : "-")],
      ["Data predării", roDateTime(data.requestedAt)],
      ["Data confirmării", roDateTime(data.confirmedAt || data.effectiveAt)],
    ]);
    y += 10;
    y = section(y, "Valoare și referință", [
      ["Sumă", money(data.amount)],
      ["Referință / document", data.reference],
      ["Observații", data.note],
    ], { rowHeight: 28 });
  }

  if (kind === "shift_handover") {
    y = section(y, "Identificare", [
      ["Unitate", data.locationName],
      ["Data de lucru", roDate(data.workDate)],
      ["Status", data.status === "accepted" ? "PRELUAT / ACCEPTAT" : safeText(data.status).toUpperCase()],
    ]);
    y += 10;
    y = section(y, "Predare schimb", [
      ["Predător", data.fromActor],
      ["Primitor", data.toActor],
      ["Început schimb", roDateTime(data.shiftStartAt)],
      ["Moment predare", roDateTime(data.cutoffAt)],
      ["Acceptat la", roDateTime(data.acceptedAt)],
    ]);
    y += 10;
    y = section(y, "Casierie", [
      ["Numerar sistem", money(data.expectedCash)],
      ["Numerar numărat", money(data.countedCash)],
      ["Diferență", money(data.cashDifference)],
      ["Vânzări schimb", money(data.snapshot?.shift?.revenue || 0)],
      ["Numerar schimb", money(payment(data.snapshot?.shift, "cash").amount)],
      ["Card schimb", money(payment(data.snapshot?.shift, "card").amount)],
    ]);
  }

  if (kind === "day_closure") {
    y = section(y, "Identificare", [
      ["Unitate", data.locationName],
      ["Data de lucru", roDate(data.workDate)],
      ["Închis de", data.actor],
      ["Închis la", roDateTime(data.closedAt)],
    ]);
    y += 10;
    y = section(y, "Reconciliere numerar", [
      ["Numerar sistem", money(data.expectedCash)],
      ["Numerar numărat", money(data.countedCash)],
      ["Diferență", money(data.cashDifference)],
      ["Observații", data.note],
    ], { rowHeight: 28 });
  }

  // Warning / validity
  y += 14;
  const available = pageHeight - y - 160;
  if (available > 46) {
    doc.roundedRect(left, y, width, 46, 7).fillAndStroke("#fff8f8", "#f1c5c9");
    doc.font(fontBold).fontSize(7.2).fillColor(red).text("NOTĂ DE AUDIT", left + 12, y + 9, { width: 100 });
    doc.font(fontRegular).fontSize(7.4).fillColor(dark).text(
      "Documentul este generat din înregistrarea salvată în AllInFashion. Numărul documentului este stabil și se reutilizează la retipărire.",
      left + 12, y + 22, { width: width - 24 }
    );
    y += 60;
  }

  // Signatures
  const sigY = Math.min(pageHeight - 126, Math.max(y + 14, 610));
  const gap = 40;
  const sigW = (width - gap) / 2;
  const sigs = kind === "day_closure"
    ? [["Responsabil casierie", data.actor], ["Administrator / verificator", ""]]
    : kind === "shift_handover"
      ? [["Predător", data.fromActor], ["Primitor", data.toActor]]
      : [["Predător / solicitant", data.requestedBy], ["Primitor / confirmator", data.confirmedBy || ""]];

  sigs.forEach(([label, name], index) => {
    const x = left + index * (sigW + gap);
    doc.font(fontBold).fontSize(8.5).fillColor("#173f3d").text(label, x, sigY, { width: sigW, align: "center" });
    if (name) doc.font(fontRegular).fontSize(8).fillColor(dark).text(name, x, sigY + 16, { width: sigW, align: "center" });
    doc.moveTo(x + 20, sigY + 55).lineTo(x + sigW - 20, sigY + 55).lineWidth(1).strokeColor(muted).stroke();
    doc.font(fontRegular).fontSize(6.8).fillColor(muted).text("Nume și semnătură", x, sigY + 63, { width: sigW, align: "center" });
  });

  doc.font(fontRegular).fontSize(6.5).fillColor("#94a3b8")
    .text("Document intern generat din sistemul AllInFashion.", left, pageHeight - 55, { width, align: "center" });

  return doc;
}
