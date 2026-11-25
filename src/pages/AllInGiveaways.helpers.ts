export type GiveawayStatus = "draft" | "open" | "locked" | "drawn" | "archived";

export interface GiveawayGame {
  id: string;
  title: string;
  description: string;
  prize_title: string;
  prize_image_url: string | null;
  winners_count: number;
  reserves_count: number;
  closes_at: string | null;
  closes_at_local: string | null;
  facebook_post_url: string | null;
  status: GiveawayStatus;
  revision: number;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
  drawn_at: string | null;
  archived_at: string | null;
  participant_count: number;
  eligible_count: number;
  excluded_count: number;
  snapshot_hash: string | null;
}

export interface GiveawayParticipant {
  id: string;
  display_name: string;
  external_id: string | null;
  note: string | null;
  eligible: boolean;
  exclusion_reason: string | null;
  created_at: string;
}

export interface GiveawaySelection {
  participant_id: string;
  display_name: string;
  external_id: string | null;
  rank: number;
}

export interface GiveawayDraw {
  id: string;
  game_id: string;
  drawn_at: string;
  actor: unknown;
  eligible_count: number;
  snapshot_hash: string;
  winners: GiveawaySelection[];
  reserves: GiveawaySelection[];
}

export interface GiveawayEvent {
  id: string;
  created_at: string;
  actor: unknown;
  event_type: string;
  details: Record<string, unknown>;
}

export interface GiveawayDetail {
  item: GiveawayGame;
  participants: GiveawayParticipant[];
  draw: GiveawayDraw | null;
  events: GiveawayEvent[];
}

export interface ImportParticipant {
  display_name: string;
  external_id?: string;
  note?: string;
}

export interface ParticipantParseResult {
  rows: ImportParticipant[];
  errors: string[];
  warnings: string[];
  delimiter: string | null;
  hasHeader: boolean;
}

const normalizeHeader = (value: string) => value.trim().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s-]+/g, "_");

const HEADER_NAMES = new Set(["display_name", "name", "nev", "nume", "full_name", "teljes_nev", "participant", "resztvevo"]);
const HEADER_IDS = new Set(["external_id", "id", "azonosito", "kulso_azonosito", "profile", "profile_url", "profil", "profil_url", "facebook_id"]);
const HEADER_NOTES = new Set(["note", "notes", "megjegyzes", "observatii"]);

/** Parse text only; CSV values are never evaluated and no participant is silently merged. */
export function parseParticipantInput(input: string): ParticipantParseResult {
  const result: ParticipantParseResult = { rows: [], errors: [], warnings: [], delimiter: null, hasHeader: false };
  if (input.length > 2_000_000) {
    result.errors.push("A lista legfeljebb 2 MB szöveget tartalmazhat. Oszd több feltöltésre.");
    return result;
  }
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return result;

  const counts: Record<string, number> = { "\t": 0, ";": 0, ",": 0 };
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === "\n") {
        if (Object.values(counts).some(Boolean) || text.slice(0, index).trim()) break;
      } else if (char in counts) counts[char] += 1;
    }
  }
  const delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  result.delimiter = counts[delimiter] ? delimiter : null;

  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  let line = 1;
  const appendRow = () => {
    row.push(field.trim());
    if (row.some((value) => value.trim())) records.push(row);
    row = [];
    field = "";
    afterQuote = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; }
        else { inQuotes = false; afterQuote = true; }
      } else { field += char; if (char === "\n") line += 1; }
      continue;
    }
    if (char === "\n") { appendRow(); line += 1; continue; }
    if (result.delimiter && char === result.delimiter) {
      row.push(field.trim()); field = ""; afterQuote = false; continue;
    }
    if (afterQuote) {
      if (/\s/.test(char)) continue;
      result.errors.push(`Hibás CSV a(z) ${line}. sornál: az idézőjel után csak elválasztó vagy sortörés állhat.`);
      return result;
    }
    if (char === '"') {
      if (field.trim()) {
        result.errors.push(`Hibás CSV a(z) ${line}. sornál: az idézőjeles mező teljes értékét tedd idézőjelek közé.`);
        return result;
      }
      field = ""; inQuotes = true; continue;
    }
    field += char;
  }
  if (inQuotes) {
    result.errors.push("A CSV-ben lezáratlan idézőjel van. Ellenőrizd a fájl utolsó idézőjeles mezőjét.");
    return result;
  }
  appendRow();
  if (!records.length) return result;

  const headers = records[0].map(normalizeHeader);
  const nameHeader = headers.findIndex((header) => HEADER_NAMES.has(header));
  result.hasHeader = nameHeader >= 0;
  const nameIndex = result.hasHeader ? nameHeader : 0;
  const idIndex = result.hasHeader ? headers.findIndex((header) => HEADER_IDS.has(header)) : 1;
  const noteIndex = result.hasHeader ? headers.findIndex((header) => HEADER_NOTES.has(header)) : 2;
  const data = result.hasHeader ? records.slice(1) : records;
  if (data.length > 2000) {
    result.errors.push(`Egyszerre legfeljebb 2000 résztvevő importálható. Ebben a listában ${data.length} sor van.`);
    return result;
  }
  if (!result.hasHeader && data.some((record) => record.length > 3)) {
    result.errors.push("Fejléc nélkül legfeljebb három oszlop használható: név, azonosító, megjegyzés. A névben lévő elválasztót tedd idézőjelek közé.");
    return result;
  }
  if (result.hasHeader && headers.some((header) => !HEADER_NAMES.has(header) && !HEADER_IDS.has(header) && !HEADER_NOTES.has(header))) {
    result.warnings.push("Csak a név, azonosító és megjegyzés oszlopot használjuk; a többi oszlop kimarad.");
  }
  const seenIds = new Set<string>();
  let repeatedIds = 0;
  for (let index = 0; index < data.length; index += 1) {
    const record = data[index];
    const display_name = (record[nameIndex] || "").trim();
    const external_id = idIndex >= 0 ? (record[idIndex] || "").trim() : "";
    const note = noteIndex >= 0 ? (record[noteIndex] || "").trim() : "";
    const rowNumber = index + (result.hasHeader ? 2 : 1);
    if (!display_name) result.errors.push(`A(z) ${rowNumber}. adatsorból hiányzik a név.`);
    else if (display_name.length > 160) result.errors.push(`A(z) ${rowNumber}. adatsor neve hosszabb 160 karakternél.`);
    if (external_id.length > 300) result.errors.push(`A(z) ${rowNumber}. adatsor azonosítója hosszabb 300 karakternél.`);
    if (note.length > 500) result.errors.push(`A(z) ${rowNumber}. adatsor megjegyzése hosszabb 500 karakternél.`);
    if (external_id) {
      if (seenIds.has(external_id)) repeatedIds += 1;
      seenIds.add(external_id);
    }
    result.rows.push({ display_name, ...(external_id ? { external_id } : {}), ...(note ? { note } : {}) });
  }
  if (repeatedIds) result.warnings.push(`${repeatedIds} sor ismétlődő azonosítót tartalmaz. A szerver az azonos azonosítóhoz tartozó újabb sorokat kihagyja.`);
  if (result.errors.length > 8) result.errors = [...result.errors.slice(0, 8), "További hibás sorok is vannak; javítsd a listát importálás előtt."];
  return result;
}

/** Protect spreadsheet consumers from formula execution, including control/space prefixes. */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f\u007f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}

export function formatGiveawayDate(value: string | null | undefined): string {
  if (!value) return "Nincs megadva";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Bucharest", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatGiveawayActor(actor: unknown): string {
  if (typeof actor === "string") return actor || "—";
  if (!actor || typeof actor !== "object") return "—";
  const value = actor as Record<string, unknown>;
  return [value.display_name || value.name || value.username || value.email, value.role].filter((part) => typeof part === "string" && part).join(" · ") || "—";
}

export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

export function drawCsv(game: GiveawayGame, draw: GiveawayDraw): string {
  const rows: unknown[][] = [["Játék", "Nyeremény", "Eredmény", "Sorszám", "Név", "Azonosító", "Sorsolás időpontja (UTC)", "Sorsolás azonosítója", "Lista ellenőrzőazonosítója"]];
  for (const [kind, selections] of [["Nyertes", draw.winners], ["Tartalék", draw.reserves]] as const) {
    selections.forEach((person) => rows.push([game.title, game.prize_title, kind, person.rank, person.display_name, person.external_id || "", draw.drawn_at, draw.id, draw.snapshot_hash]));
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

export function giveawayPrintHtml(game: GiveawayGame, draw: GiveawayDraw): string {
  const selectionRows = (items: GiveawaySelection[]) => items.map((person) => `<tr><td>${escapeHtml(person.rank)}.</td><td>${escapeHtml(person.display_name)}</td><td>${escapeHtml(person.external_id || "—")}</td></tr>`).join("");
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(game.title)} – sorsolási jegyzőkönyv</title><style>
  @page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:12px/1.6 Arial,sans-serif;color:#243144;margin:30px auto;max-width:780px}h1{font-size:27px;line-height:1.2;margin:8px 0}h2{font-size:15px;margin-top:26px}p{margin:5px 0}.brand{letter-spacing:3px;color:#108d8b;font-size:11px}.muted{color:#617080}.meta{background:#f2f6f7;border-left:3px solid #108d8b;padding:14px;margin:22px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{padding:9px;text-align:left;border-bottom:1px solid #dbe2e8;overflow-wrap:anywhere}td:first-child,th:first-child{width:48px}th{font-size:10px;text-transform:uppercase;background:#f2f6f7}.hash{font:10px/1.7 monospace;overflow-wrap:anywhere}.note{margin-top:24px;border-top:1px solid #dbe2e8;padding-top:14px;font-size:11px;color:#617080}header{border-bottom:2px solid #108d8b;padding-bottom:18px}tr{break-inside:avoid}@media print{body{margin:0;max-width:none}}</style></head><body>
  <header><div class="brand">ALLINFASHION</div><p class="muted">Sorsolási jegyzőkönyv</p><h1>${escapeHtml(game.title)}</h1><p>Nyeremény: <strong>${escapeHtml(game.prize_title)}</strong></p></header>
  <div class="meta"><p><strong>Sorsolás:</strong> ${escapeHtml(formatGiveawayDate(draw.drawn_at))} (Europe/Bucharest)</p><p><strong>Rögzítette:</strong> ${escapeHtml(formatGiveawayActor(draw.actor))}</p><p><strong>Sorsolásban részt vevő személyek:</strong> ${escapeHtml(draw.eligible_count)}</p><p><strong>Nyertesek:</strong> ${escapeHtml(draw.winners.length)} · <strong>Tartalékok:</strong> ${escapeHtml(draw.reserves.length)}</p></div>
  <h2>Nyertesek</h2><table><thead><tr><th>#</th><th>Név</th><th>Azonosító</th></tr></thead><tbody>${selectionRows(draw.winners)}</tbody></table>
  ${draw.reserves.length ? `<h2>Tartalékok, sorrendben</h2><table><thead><tr><th>#</th><th>Név</th><th>Azonosító</th></tr></thead><tbody>${selectionRows(draw.reserves)}</tbody></table>` : "<p class=\"muted\">Ehhez a sorsoláshoz nem tartozik tartalék.</p>"}
  <div class="note"><p>A jegyzőkönyv a mentett sorsolási eredményt tartalmazza. A résztvevőket kézi vagy CSV-listából rögzítették; jogosultságukat a lezárás előtt az adminisztrátor ellenőrizte.</p><p>Sorsolás azonosítója: <span class="hash">${escapeHtml(draw.id)}</span></p><p>Lezárt lista ellenőrzőazonosítója: <span class="hash">${escapeHtml(draw.snapshot_hash)}</span></p></div></body></html>`;
}
