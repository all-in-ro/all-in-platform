#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

let PDFDocument;
try {
  PDFDocument = require("pdfkit");
} catch (error) {
  console.error("HIBA: a pdfkit modul nem erheto el. Futtasd a csomagban levo scripts/run_aif_system_architecture.sh fajlt.");
  process.exit(2);
}

const argv = process.argv.slice(2);
function argValue(name, fallback = "") {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  return argv[index + 1] === undefined ? fallback : argv[index + 1];
}
function hasArg(name) { return argv.includes(name); }

const scriptDir = __dirname;
const defaultConfigPath = path.join(scriptDir, "aif_system_architecture.config.json");
const configPath = path.resolve(argValue("--config", defaultConfigPath));
const root = path.resolve(argValue("--root", process.cwd()));
const timestamp = new Date();
const dateStamp = timestamp.toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.resolve(argValue("--out-dir", path.join(root, "artifacts", "system-documentation")));
const pdfPath = path.resolve(argValue("--pdf", path.join(outDir, `AllInFashion_teljes_rendszerterkep_${dateStamp}.pdf`)));
const mdPath = path.resolve(argValue("--md", pdfPath.replace(/\.pdf$/i, ".md")));
const jsonPath = path.resolve(argValue("--json", pdfPath.replace(/\.pdf$/i, ".json")));
const noDb = hasArg("--no-db");

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
fs.mkdirSync(path.dirname(mdPath), { recursive: true });
fs.mkdirSync(path.dirname(jsonPath), { recursive: true });

const COLORS = {
  navy: "#26384b",
  navy2: "#334154",
  teal: "#2a8d8b",
  tealDark: "#176b69",
  tealLight: "#d7fffd",
  orange: "#ff6a00",
  red: "#d31126",
  green: "#208d8b",
  blue: "#2f80ed",
  grey: "#5f6b7a",
  light: "#eef3f6",
  line: "#cdd6dc",
  text: "#172033",
  muted: "#65717f",
  white: "#ffffff",
  black: "#000000"
};

function rel(file) { return path.relative(root, file).split(path.sep).join("/"); }
function sha1(text) { return crypto.createHash("sha1").update(text).digest("hex"); }
function lineNumberAt(text, index) { return text.slice(0, Math.max(0, index)).split("\n").length; }
function unique(values) { return Array.from(new Set(values.filter(Boolean))); }
function text(value) { return String(value === undefined || value === null ? "" : value); }
function normalizePathLike(value) {
  return text(value)
    .replace(/https?:\/\/[^/]+/g, "")
    .replace(/\?.*$/, "")
    .replace(/\$\{[^}]+\}/g, ":param")
    .replace(/encodeURIComponent\([^)]*\)/g, ":param")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";
}
function canonicalPath(value) {
  return normalizePathLike(value)
    .split("/")
    .map((segment) => {
      if (!segment) return "";
      if (segment.startsWith(":")) return ":param";
      if (/^[{<].*[}>]$/.test(segment)) return ":param";
      if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(segment)) return ":param";
      return segment;
    })
    .join("/");
}
function pathMatches(frontendPath, backendPath) {
  const a = canonicalPath(frontendPath).split("/").filter(Boolean);
  const b = canonicalPath(backendPath).split("/").filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((segment, i) => segment === b[i] || segment === ":param" || b[i] === ":param");
}
function safeJsonParse(raw, fallback = null) {
  try { return JSON.parse(raw); } catch { return fallback; }
}
function command(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, ...(options.env || {}) },
    input: options.input,
    shell: false
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: text(result.stdout).trim(),
    stderr: text(result.stderr).trim()
  };
}
function gitValue(args, fallback = "-") {
  const result = command("git", args);
  return result.ok && result.stdout ? result.stdout : fallback;
}
function discoverFont() {
  const regularCandidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf"
  ];
  const boldCandidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"
  ];
  return {
    regular: regularCandidates.find(fs.existsSync) || null,
    bold: boldCandidates.find(fs.existsSync) || null
  };
}

const excludedDirectories = new Set(config.excludeDirectories || []);
const extensions = new Set(config.extensions || []);
const maxSourceFileBytes = Number(config.maxSourceFileBytes || 2500000);

function shouldExclude(fullPath) {
  const relative = rel(fullPath);
  const segments = relative.split("/");
  return segments.some((segment) => excludedDirectories.has(segment));
}
function walk(entry, output = []) {
  if (!fs.existsSync(entry) || shouldExclude(entry)) return output;
  const stat = fs.statSync(entry);
  if (stat.isFile()) {
    const ext = path.extname(entry).toLowerCase();
    const base = path.basename(entry);
    if (extensions.has(ext) || ["package.json", "render.yaml", "render.yml"].includes(base)) output.push(entry);
    return output;
  }
  if (!stat.isDirectory()) return output;
  for (const name of fs.readdirSync(entry).sort()) walk(path.join(entry, name), output);
  return output;
}
function discoverFiles() {
  const found = [];
  for (const include of config.include || ["src", "api", "jobs", "migrations", "package.json"]) {
    walk(path.join(root, include), found);
  }
  return unique(found.map((file) => path.resolve(file))).sort((a, b) => rel(a).localeCompare(rel(b), "en"));
}
function readSource(file) {
  const stat = fs.statSync(file);
  if (stat.size > maxSourceFileBytes) return { content: "", skipped: `Tul nagy fajl: ${stat.size} byte` };
  try { return { content: fs.readFileSync(file, "utf8"), skipped: "" }; }
  catch (error) { return { content: "", skipped: error.message }; }
}
function resolveImport(sourceFile, specifier, allPaths) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(sourceFile), specifier);
  const candidates = [
    base,
    ...Array.from(extensions).map((ext) => `${base}${ext}`),
    ...Array.from(extensions).map((ext) => path.join(base, `index${ext}`))
  ];
  return candidates.find((candidate) => allPaths.has(path.resolve(candidate))) || null;
}
function extractImports(content) {
  const rows = [];
  const patterns = [
    /\bimport\s+(?:[^'"`]+?\s+from\s+)?["'`]([^"'`]+)["'`]/g,
    /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g
  ];
  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(content))) rows.push({ specifier: match[1], line: lineNumberAt(content, match.index) });
  }
  return rows;
}
function extractExports(content) {
  const rows = [];
  const regex = /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  let match;
  while ((match = regex.exec(content))) rows.push({ name: match[1], line: lineNumberAt(content, match.index) });
  if (/module\.exports\s*=/.test(content)) rows.push({ name: "module.exports", line: lineNumberAt(content, content.indexOf("module.exports")) });
  return rows;
}
function extractEnvVars(content) {
  const values = [];
  const regexes = [
    /process\.env\.([A-Z0-9_]+)/g,
    /process\.env\[["'`]([A-Z0-9_]+)["'`]\]/g,
    /import\.meta\.env\.([A-Z0-9_]+)/g
  ];
  for (const regex of regexes) {
    let match;
    while ((match = regex.exec(content))) values.push(match[1]);
  }
  return unique(values).sort();
}
function extractHashRoutes(content) {
  const values = [];
  const regex = /#[A-Za-z0-9_/?=&.-]+/g;
  let match;
  while ((match = regex.exec(content))) {
    if (match[0].startsWith("#")) values.push({ hash: match[0], line: lineNumberAt(content, match.index) });
  }
  return values;
}
function extractDirectApiCalls(content) {
  const calls = [];
  const patterns = [
    { regex: /\b(fetch|fetchJSON|axios)\s*\(\s*(["'`])([^"'`]*\/api\/[^"'`]*)\2/g, defaultMethod: "GET" },
    { regex: /\b(fetch|fetchJSON)\s*<[^>]+>\s*\(\s*(["'`])([^"'`]*\/api\/[^"'`]*)\2/g, defaultMethod: "GET" }
  ];
  for (const { regex, defaultMethod } of patterns) {
    let match;
    while ((match = regex.exec(content))) {
      const nearby = content.slice(match.index, Math.min(content.length, match.index + 500));
      const methodMatch = nearby.match(/method\s*:\s*["'`]([A-Z]+)["'`]/i);
      calls.push({
        method: (methodMatch ? methodMatch[1] : defaultMethod).toUpperCase(),
        endpoint: normalizePathLike(match[3]),
        line: lineNumberAt(content, match.index),
        kind: "direct"
      });
    }
  }
  return calls;
}
function balancedBlock(content, openIndex) {
  let depth = 0;
  let quote = null;
  let escape = false;
  for (let i = openIndex; i < content.length; i += 1) {
    const ch = content[i];
    if (quote) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return content.slice(openIndex, i + 1);
    }
  }
  return content.slice(openIndex);
}
function extractApiHelperDefinitions(content, filePath) {
  const helpers = [];
  const regex = /(?:export\s+)?(?:async\s+)?function\s+(api[A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/g;
  let match;
  while ((match = regex.exec(content))) {
    const open = content.indexOf("{", match.index);
    const body = balancedBlock(content, open);
    const endpointMatches = [...body.matchAll(/(["'`])([^"'`]*\/api\/[^"'`]*)\1/g)];
    if (!endpointMatches.length) continue;
    const endpoint = normalizePathLike(endpointMatches[0][2]);
    const methodMatch = body.match(/method\s*:\s*["'`]([A-Z]+)["'`]/i);
    helpers.push({
      name: match[1],
      file: filePath,
      line: lineNumberAt(content, match.index),
      method: (methodMatch ? methodMatch[1] : "GET").toUpperCase(),
      endpoint,
      bodyPreview: body.slice(0, 700)
    });
  }
  return helpers;
}
function extractApiHelperUsages(content, helperNames) {
  const rows = [];
  for (const name of helperNames) {
    const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*\\(`, "g");
    let match;
    while ((match = regex.exec(content))) rows.push({ helper: name, line: lineNumberAt(content, match.index) });
  }
  return rows;
}
function normalizeTableName(raw) {
  const clean = text(raw).replace(/["'`;(),]/g, "").trim().split(".").pop();
  if (!clean || clean.startsWith("$") || clean.startsWith(":")) return "";
  if (/^(select|values|set|where|returning|unnest|jsonb|now)$/i.test(clean)) return "";
  return clean;
}
function extractSqlRefs(content) {
  const reads = [];
  const writes = [];
  const definitions = [];
  const references = [];
  const patterns = [
    { regex: /\b(?:FROM|JOIN)\s+([a-zA-Z_][\w."$]*)/gi, target: reads },
    { regex: /\bINSERT\s+INTO\s+([a-zA-Z_][\w."$]*)/gi, target: writes },
    { regex: /\bUPDATE\s+([a-zA-Z_][\w."$]*)/gi, target: writes },
    { regex: /\bDELETE\s+FROM\s+([a-zA-Z_][\w."$]*)/gi, target: writes },
    { regex: /\bCREATE\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW)(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z_][\w."$]*)/gi, target: definitions },
    { regex: /\bALTER\s+TABLE(?:\s+IF\s+EXISTS)?\s+([a-zA-Z_][\w."$]*)/gi, target: definitions },
    { regex: /\bREFERENCES\s+([a-zA-Z_][\w."$]*)/gi, target: references }
  ];
  for (const { regex, target } of patterns) {
    let match;
    while ((match = regex.exec(content))) {
      const table = normalizeTableName(match[1]);
      if (table) target.push({ table, line: lineNumberAt(content, match.index) });
    }
  }
  return {
    reads: unique(reads.map((x) => x.table)).sort(),
    writes: unique(writes.map((x) => x.table)).sort(),
    definitions: unique(definitions.map((x) => x.table)).sort(),
    references: unique(references.map((x) => x.table)).sort(),
    evidence: [...reads.map((x) => ({ ...x, kind: "read" })), ...writes.map((x) => ({ ...x, kind: "write" })), ...definitions.map((x) => ({ ...x, kind: "define" })), ...references.map((x) => ({ ...x, kind: "reference" }))]
  };
}
function routeBaseFor(filePath) {
  const relative = rel(filePath);
  if (config.routeBases && config.routeBases[relative] !== undefined) return config.routeBases[relative];
  const base = path.basename(relative, path.extname(relative));
  if (relative.includes("api/routes/")) return `/api/${base}`;
  return "";
}
function extractBackendRoutes(content, filePath) {
  const routes = [];
  const regex = /\b(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*(["'`])([^"'`]+)\2/g;
  let match;
  while ((match = regex.exec(content))) {
    const method = match[1].toUpperCase();
    const localPath = normalizePathLike(match[3]);
    const fullPath = normalizePathLike(`${routeBaseFor(filePath)}${localPath === "/" ? "" : localPath}`);
    const nextIndex = (() => {
      regex.lastIndex = match.index + match[0].length;
      const next = regex.exec(content);
      if (next) { const idx = next.index; regex.lastIndex = match.index + match[0].length; return idx; }
      regex.lastIndex = match.index + match[0].length;
      return content.length;
    })();
    const body = content.slice(match.index, nextIndex);
    const sql = extractSqlRefs(body);
    routes.push({
      method,
      localPath,
      fullPath,
      file: filePath,
      line: lineNumberAt(content, match.index),
      reads: sql.reads,
      writes: sql.writes,
      bodyPreview: body.slice(0, 1000)
    });
  }
  return routes;
}
function analyzeFiles(files) {
  const allPathSet = new Set(files.map((file) => path.resolve(file)));
  const prelim = [];
  const helperDefinitions = [];
  const backendRoutes = [];
  for (const file of files) {
    const stat = fs.statSync(file);
    const source = readSource(file);
    const content = source.content;
    const imports = content ? extractImports(content) : [];
    const resolvedImports = imports.map((row) => ({
      ...row,
      resolved: resolveImport(file, row.specifier, allPathSet),
      resolvedRelative: resolveImport(file, row.specifier, allPathSet) ? rel(resolveImport(file, row.specifier, allPathSet)) : null
    }));
    const sql = content ? extractSqlRefs(content) : { reads: [], writes: [], definitions: [], references: [], evidence: [] };
    const record = {
      file,
      path: rel(file),
      extension: path.extname(file).toLowerCase(),
      bytes: stat.size,
      lines: content ? content.split("\n").length : 0,
      hash: content ? sha1(content) : "",
      skipped: source.skipped,
      imports: resolvedImports,
      exports: content ? extractExports(content) : [],
      envVars: content ? extractEnvVars(content) : [],
      hashRoutes: content ? extractHashRoutes(content) : [],
      directApiCalls: content ? extractDirectApiCalls(content) : [],
      sql
    };
    prelim.push(record);
    if (content) {
      helperDefinitions.push(...extractApiHelperDefinitions(content, file));
      backendRoutes.push(...extractBackendRoutes(content, file));
    }
  }
  const helperNames = unique(helperDefinitions.map((helper) => helper.name));
  for (const record of prelim) {
    const content = record.skipped ? "" : fs.readFileSync(record.file, "utf8");
    record.apiHelperUsages = extractApiHelperUsages(content, helperNames)
      .filter((usage) => !helperDefinitions.some((definition) => definition.file === record.file && definition.name === usage.helper && definition.line === usage.line));
  }
  return { files: prelim, helperDefinitions, backendRoutes };
}

function psqlJsonRows(sql, databaseUrl) {
  if (!databaseUrl) return { ok: false, rows: [], error: "Hianyzik a DATABASE_URL." };
  const result = command("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-c", sql], {
    env: {
      PGOPTIONS: `${process.env.PGOPTIONS || ""} -c default_transaction_read_only=on -c statement_timeout=45000`.trim()
    }
  });
  if (!result.ok) return { ok: false, rows: [], error: result.stderr || result.stdout || "psql hiba" };
  const rows = result.stdout.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => safeJsonParse(line)).filter(Boolean);
  return { ok: true, rows, error: "" };
}
function collectDatabaseSnapshot() {
  if (noDb) return { status: "skipped", reason: "--no-db", databases: [] };
  const databases = [];
  for (const envName of config.databaseEnvVars || ["DATABASE_URL"]) {
    const databaseUrl = process.env[envName];
    if (!databaseUrl) {
      databases.push({ envName, status: "missing", error: `${envName} nincs beallitva.` });
      continue;
    }
    const meta = psqlJsonRows(`SELECT json_build_object('database', current_database(), 'user', current_user, 'server_version', current_setting('server_version'), 'timezone', current_setting('TimeZone'), 'generated_at', now());`, databaseUrl);
    const tables = psqlJsonRows(`SELECT json_build_object('schema', n.nspname, 'name', c.relname, 'kind', CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE c.relkind::text END, 'estimated_rows', COALESCE(s.n_live_tup, c.reltuples)::bigint, 'total_bytes', CASE WHEN c.relkind IN ('r','p','m') THEN pg_total_relation_size(c.oid) ELSE 0 END) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') ORDER BY c.relname;`, databaseUrl);
    const columns = psqlJsonRows(`SELECT json_build_object('schema', table_schema, 'table', table_name, 'position', ordinal_position, 'column', column_name, 'data_type', data_type, 'udt_name', udt_name, 'nullable', is_nullable, 'default', column_default) FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position;`, databaseUrl);
    const constraints = psqlJsonRows(`SELECT json_build_object('schema', n.nspname, 'table', c.relname, 'name', con.conname, 'type', con.contype, 'definition', pg_get_constraintdef(con.oid, true)) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname, con.conname;`, databaseUrl);
    const indexes = psqlJsonRows(`SELECT json_build_object('schema', schemaname, 'table', tablename, 'name', indexname, 'definition', indexdef) FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname;`, databaseUrl);
    const triggers = psqlJsonRows(`SELECT json_build_object('schema', event_object_schema, 'table', event_object_table, 'name', trigger_name, 'timing', action_timing, 'event', event_manipulation, 'statement', action_statement) FROM information_schema.triggers WHERE event_object_schema='public' ORDER BY event_object_table, trigger_name, event_manipulation;`, databaseUrl);
    const sequences = psqlJsonRows(`SELECT json_build_object('schema', sequence_schema, 'name', sequence_name, 'data_type', data_type, 'start_value', start_value, 'minimum_value', minimum_value, 'maximum_value', maximum_value, 'increment', increment) FROM information_schema.sequences WHERE sequence_schema='public' ORDER BY sequence_name;`, databaseUrl);
    const ok = [meta, tables, columns, constraints, indexes, triggers, sequences].every((item) => item.ok);
    databases.push({
      envName,
      status: ok ? "ok" : "partial",
      meta: meta.rows[0] || null,
      tables: tables.rows,
      columns: columns.rows,
      constraints: constraints.rows,
      indexes: indexes.rows,
      triggers: triggers.rows,
      sequences: sequences.rows,
      errors: [meta, tables, columns, constraints, indexes, triggers, sequences].filter((item) => !item.ok).map((item) => item.error)
    });
  }
  return { status: databases.some((db) => db.status === "ok") ? "ok" : "unavailable", databases };
}

function classifyFile(filePath) {
  for (const [prefix, label] of Object.entries(config.projectLabels || {})) {
    if (filePath === prefix || filePath.startsWith(`${prefix}/`)) return label;
  }
  if (filePath.startsWith("src/")) return "Frontend egyeb";
  if (filePath.startsWith("api/")) return "Backend egyeb";
  return "Projekt egyeb";
}
function buildFlows(analysis) {
  const helperMap = new Map(analysis.helperDefinitions.map((helper) => [helper.name, helper]));
  const flows = [];
  const findBackend = (method, endpoint) => analysis.backendRoutes.find((route) => route.method === method && pathMatches(endpoint, route.fullPath))
    || analysis.backendRoutes.find((route) => pathMatches(endpoint, route.fullPath));
  for (const file of analysis.files) {
    for (const usage of file.apiHelperUsages || []) {
      const helper = helperMap.get(usage.helper);
      if (!helper) continue;
      const backend = findBackend(helper.method, helper.endpoint);
      flows.push({
        sourceFile: file.path,
        sourceLine: usage.line,
        callKind: "helper",
        helper: helper.name,
        helperFile: rel(helper.file),
        helperLine: helper.line,
        method: helper.method,
        endpoint: helper.endpoint,
        backendFile: backend ? rel(backend.file) : null,
        backendLine: backend ? backend.line : null,
        reads: backend ? backend.reads : [],
        writes: backend ? backend.writes : [],
        resolved: Boolean(backend)
      });
    }
    for (const call of file.directApiCalls || []) {
      const backend = findBackend(call.method, call.endpoint);
      flows.push({
        sourceFile: file.path,
        sourceLine: call.line,
        callKind: "direct",
        helper: null,
        helperFile: null,
        helperLine: null,
        method: call.method,
        endpoint: call.endpoint,
        backendFile: backend ? rel(backend.file) : null,
        backendLine: backend ? backend.line : null,
        reads: backend ? backend.reads : [],
        writes: backend ? backend.writes : [],
        resolved: Boolean(backend)
      });
    }
  }
  const key = (flow) => [flow.sourceFile, flow.sourceLine, flow.helper, flow.method, flow.endpoint].join("|");
  return Array.from(new Map(flows.map((flow) => [key(flow), flow])).values())
    .sort((a, b) => a.sourceFile.localeCompare(b.sourceFile) || a.sourceLine - b.sourceLine);
}
function buildWarnings(analysis, dbSnapshot, flows) {
  const warnings = [];
  for (const file of analysis.files) {
    for (const imp of file.imports || []) {
      if (imp.specifier.startsWith(".") && !imp.resolved) warnings.push({ severity: "warning", type: "unresolved_import", message: `${file.path}:${imp.line} - nem feloldhato relativ import: ${imp.specifier}` });
    }
  }
  for (const flow of flows.filter((row) => !row.resolved)) warnings.push({ severity: "warning", type: "unresolved_endpoint", message: `${flow.sourceFile}:${flow.sourceLine} - backend route nem talalhato: ${flow.method} ${flow.endpoint}` });
  const liveTables = new Set();
  for (const db of dbSnapshot.databases || []) for (const table of db.tables || []) liveTables.add(table.name);
  if (liveTables.size) {
    for (const file of analysis.files) {
      for (const table of unique([...(file.sql.reads || []), ...(file.sql.writes || []), ...(file.sql.definitions || [])])) {
        if (/^aif_|^core_|^avize_|^public\./.test(table) && !liveTables.has(table)) warnings.push({ severity: "info", type: "table_not_live", message: `${file.path} hivatkozik erre, de a live public semaban nem talalhato: ${table}` });
      }
    }
  }
  const routeKeys = new Map();
  for (const route of analysis.backendRoutes) {
    const key = `${route.method} ${canonicalPath(route.fullPath)}`;
    const rows = routeKeys.get(key) || [];
    rows.push(route);
    routeKeys.set(key, rows);
  }
  for (const [key, rows] of routeKeys) if (rows.length > 1) warnings.push({ severity: "warning", type: "duplicate_route", message: `Tobbszor definialt route: ${key} - ${rows.map((row) => `${rel(row.file)}:${row.line}`).join(", ")}` });
  return warnings;
}

const projectFiles = discoverFiles();
const analysis = analyzeFiles(projectFiles);
const dbSnapshot = collectDatabaseSnapshot();
const flows = buildFlows(analysis);
const warnings = buildWarnings(analysis, dbSnapshot, flows);

const git = {
  commit: gitValue(["rev-parse", "HEAD"]),
  shortCommit: gitValue(["rev-parse", "--short", "HEAD"]),
  branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
  lastCommit: gitValue(["log", "-1", "--pretty=format:%h | %ad | %an | %s", "--date=iso-strict"]),
  status: gitValue(["status", "--short"], "tiszta vagy git nem erheto el")
};

const report = {
  generatedAt: timestamp.toISOString(),
  generator: "jobs/aif_generate_system_architecture.cjs",
  root,
  config,
  git,
  summary: {
    files: analysis.files.length,
    sourceLines: analysis.files.reduce((sum, file) => sum + file.lines, 0),
    imports: analysis.files.reduce((sum, file) => sum + file.imports.length, 0),
    apiHelpers: analysis.helperDefinitions.length,
    backendRoutes: analysis.backendRoutes.length,
    dataFlows: flows.length,
    databaseConnections: dbSnapshot.databases?.length || 0,
    databaseTables: (dbSnapshot.databases || []).reduce((sum, db) => sum + (db.tables?.length || 0), 0),
    warnings: warnings.length
  },
  files: analysis.files.map((file) => ({ ...file, file: undefined })),
  apiHelpers: analysis.helperDefinitions.map((helper) => ({ ...helper, file: rel(helper.file) })),
  backendRoutes: analysis.backendRoutes.map((route) => ({ ...route, file: rel(route.file) })),
  flows,
  databases: dbSnapshot,
  warnings
};
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

function markdownReport(data) {
  const out = [];
  out.push(`# ${config.title}`);
  out.push("");
  out.push(`- Vallalat: ${config.company}`);
  out.push(`- Generalas: ${data.generatedAt}`);
  out.push(`- Git: ${data.git.branch} / ${data.git.shortCommit}`);
  out.push(`- Gyoker: \`${data.root}\``);
  out.push(`- Biztonsag: a live adatbazis vizsgalata read-only modban tortent.`);
  out.push("");
  out.push("## Osszesites");
  out.push("");
  Object.entries(data.summary).forEach(([key, value]) => out.push(`- ${key}: ${value}`));
  out.push("");
  out.push("## Adatfolyamok");
  out.push("");
  for (const flow of data.flows) {
    out.push(`- \`${flow.sourceFile}:${flow.sourceLine}\` -> ${flow.helper ? `\`${flow.helper}()\` -> ` : ""}\`${flow.method} ${flow.endpoint}\` -> ${flow.backendFile ? `\`${flow.backendFile}:${flow.backendLine}\`` : "NINCS FELOLDVA"}${flow.reads.length ? ` -> olvas: ${flow.reads.join(", ")}` : ""}${flow.writes.length ? ` -> ir: ${flow.writes.join(", ")}` : ""}`);
  }
  out.push("");
  out.push("## Backend route-ok");
  out.push("");
  for (const route of data.backendRoutes) out.push(`- \`${route.method} ${route.fullPath}\` - \`${route.file}:${route.line}\` - olvas: ${route.reads.join(", ") || "-"}; ir: ${route.writes.join(", ") || "-"}`);
  out.push("");
  out.push("## Fajlstruktura");
  out.push("");
  for (const file of data.files) out.push(`- \`${file.path}\` - ${file.lines} sor - import: ${file.imports.length} - API: ${(file.directApiCalls || []).length + (file.apiHelperUsages || []).length} - DB olvas: ${file.sql.reads.join(", ") || "-"} - DB ir: ${file.sql.writes.join(", ") || "-"}`);
  out.push("");
  out.push("## Live adatbazis");
  out.push("");
  for (const db of data.databases.databases || []) {
    out.push(`### ${db.envName} - ${db.meta?.database || db.status}`);
    out.push("");
    for (const table of db.tables || []) out.push(`- \`${table.name}\` - ${table.kind} - becsult sor: ${table.estimated_rows} - meret: ${table.total_bytes} byte`);
  }
  out.push("");
  out.push("## Figyelmeztetesek");
  out.push("");
  if (!data.warnings.length) out.push("- Nincs statikus ellenorzesi figyelmeztetes.");
  else data.warnings.forEach((warning) => out.push(`- [${warning.severity}] ${warning.message}`));
  return out.join("\n");
}
fs.writeFileSync(mdPath, markdownReport(report));

function createPdf(data) {
  const fonts = discoverFont();
  const doc = new PDFDocument({ size: "A4", margins: { top: 46, bottom: 46, left: 44, right: 44 }, bufferPages: true, autoFirstPage: true, info: {
    Title: config.title,
    Author: config.company,
    Subject: "Forraskod, API, adatfolyam es adatbazis dokumentacio",
    Keywords: "AllInFashion, rendszerterkep, API, PostgreSQL, adatfolyam"
  }});
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);
  if (fonts.regular) doc.registerFont("AIFRegular", fonts.regular);
  if (fonts.bold) doc.registerFont("AIFBold", fonts.bold);
  const regularFont = fonts.regular ? "AIFRegular" : "Helvetica";
  const boldFont = fonts.bold ? "AIFBold" : "Helvetica-Bold";
  const monoFont = "Courier";
  const toc = [];
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - doc.page.margins.left - doc.page.margins.right;

  function setFont(bold = false, size = 9, color = COLORS.text) {
    doc.font(bold ? boldFont : regularFont).fontSize(size).fillColor(color);
  }
  function ensureSpace(height = 30) {
    if (doc.y + height > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
  }
  function section(title, subtitle = "") {
    doc.addPage();
    toc.push({ title, page: doc.bufferedPageRange().count });
    doc.rect(0, 0, doc.page.width, 16).fill(COLORS.teal);
    setFont(true, 19, COLORS.navy);
    doc.text(title, doc.page.margins.left, 44, { width: contentWidth });
    if (subtitle) {
      setFont(false, 9, COLORS.muted);
      doc.moveDown(0.35).text(subtitle, { width: contentWidth });
    }
    doc.moveDown(0.8);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(COLORS.line).stroke();
    doc.moveDown(0.7);
  }
  function h2(title) {
    ensureSpace(34);
    doc.x = doc.page.margins.left;
    setFont(true, 13, COLORS.navy);
    doc.text(title, doc.page.margins.left, doc.y, { width: contentWidth });
    doc.moveDown(0.35);
    doc.x = doc.page.margins.left;
  }
  function paragraph(value, options = {}) {
    doc.x = doc.page.margins.left;
    setFont(false, options.size || 8.6, options.color || COLORS.text);
    doc.text(text(value), doc.page.margins.left, doc.y, { width: contentWidth, lineGap: 1.5, ...options });
    doc.moveDown(options.after === undefined ? 0.45 : options.after);
    doc.x = doc.page.margins.left;
  }
  function badge(value, color = COLORS.teal) {
    const label = text(value);
    doc.x = doc.page.margins.left;
    setFont(true, 7.5, COLORS.white);
    const width = Math.min(contentWidth, doc.widthOfString(label) + 16);
    const x = doc.page.margins.left;
    const y = doc.y;
    doc.roundedRect(x, y, width, 16, 7).fill(color);
    doc.fillColor(COLORS.white).text(label, x + 6, y + 4, { width: width - 12, lineBreak: false });
    doc.y = y + 20;
    doc.x = doc.page.margins.left;
  }
  function codeLine(value, color = "#f6f8fa") {
    const raw = text(value);
    doc.x = doc.page.margins.left;
    setFont(false, 7.2, COLORS.text);
    const height = doc.heightOfString(raw, { width: contentWidth - 14, font: monoFont, fontSize: 7.2, lineGap: 1 }) + 12;
    ensureSpace(Math.min(height, 120));
    const y = doc.y;
    doc.roundedRect(doc.page.margins.left, y, contentWidth, height, 4).fill(color);
    doc.font(monoFont).fontSize(7.2).fillColor(COLORS.text).text(raw, doc.page.margins.left + 7, y + 6, { width: contentWidth - 14, lineGap: 1 });
    doc.y = y + height + 6;
    doc.x = doc.page.margins.left;
  }
  function keyValueGrid(rows, columns = 2) {
    const gap = 8;
    const boxWidth = (contentWidth - gap * (columns - 1)) / columns;
    for (let i = 0; i < rows.length; i += columns) {
      const chunk = rows.slice(i, i + columns);
      const heights = chunk.map(([key, value]) => {
        setFont(false, 8, COLORS.text);
        return 34 + doc.heightOfString(text(value), { width: boxWidth - 16, fontSize: 8 });
      });
      const height = Math.max(...heights, 52);
      ensureSpace(height + 8);
      const y = doc.y;
      chunk.forEach(([key, value], index) => {
        const x = doc.page.margins.left + index * (boxWidth + gap);
        doc.roundedRect(x, y, boxWidth, height, 6).fillAndStroke("#f7f9fb", COLORS.line);
        setFont(true, 7.2, COLORS.tealDark);
        doc.text(text(key).toUpperCase(), x + 8, y + 8, { width: boxWidth - 16 });
        setFont(false, 8.5, COLORS.text);
        doc.text(text(value), x + 8, y + 23, { width: boxWidth - 16, lineGap: 1 });
      });
      doc.y = y + height + 8;
      doc.x = doc.page.margins.left;
    }
  }
  function flowBox(flow) {
    const parts = [
      `${flow.sourceFile}:${flow.sourceLine}`,
      flow.helper ? `${flow.helper}() [${flow.helperFile}:${flow.helperLine}]` : "kozvetlen HTTP hivas",
      `${flow.method} ${flow.endpoint}`,
      flow.backendFile ? `${flow.backendFile}:${flow.backendLine}` : "BACKEND NINCS FELOLDVA",
      flow.reads.length ? `OLVAS: ${flow.reads.join(", ")}` : "OLVAS: -",
      flow.writes.length ? `IR: ${flow.writes.join(", ")}` : "IR: -"
    ];
    const colors = [COLORS.navy, COLORS.blue, COLORS.teal, flow.resolved ? COLORS.navy2 : COLORS.red, "#607d8b", flow.writes.length ? COLORS.orange : "#607d8b"];
    const gap = 4;
    const widths = [0.19, 0.18, 0.18, 0.18, 0.13, 0.14].map((ratio) => contentWidth * ratio - gap);
    setFont(false, 6.3, COLORS.white);
    const heights = parts.map((part, i) => doc.heightOfString(part, { width: widths[i] - 10, fontSize: 6.3, lineGap: 0.5 }) + 12);
    const height = Math.max(32, ...heights);
    ensureSpace(height + 8);
    const y = doc.y;
    let x = doc.page.margins.left;
    parts.forEach((part, i) => {
      doc.roundedRect(x, y, widths[i], height, 4).fill(colors[i]);
      setFont(i === 0 || i === 2 || i === 3, 6.3, COLORS.white);
      doc.text(part, x + 5, y + 6, { width: widths[i] - 10, lineGap: 0.5 });
      x += widths[i] + gap;
    });
    doc.y = y + height + 7;
    doc.x = doc.page.margins.left;
  }
  function table(headers, rows, widths, options = {}) {
    const x0 = doc.page.margins.left;
    const headerHeight = 22;
    function drawHeader() {
      ensureSpace(headerHeight + 20);
      const y = doc.y;
      let x = x0;
      headers.forEach((header, i) => {
        doc.rect(x, y, widths[i], headerHeight).fill(COLORS.navy);
        setFont(true, 6.4, COLORS.white);
        doc.text(text(header), x + 4, y + 6, { width: widths[i] - 8, lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      doc.y = y + headerHeight;
    }
    drawHeader();
    rows.forEach((row, rowIndex) => {
      const cellHeights = row.map((cell, i) => {
        setFont(false, options.fontSize || 6.8, COLORS.text);
        return doc.heightOfString(text(cell), { width: widths[i] - 8, fontSize: options.fontSize || 6.8, lineGap: 0.5 }) + 10;
      });
      const height = Math.max(20, ...cellHeights);
      if (doc.y + height > doc.page.height - doc.page.margins.bottom - 18) {
        doc.addPage();
        drawHeader();
      }
      const y = doc.y;
      let x = x0;
      row.forEach((cell, i) => {
        doc.rect(x, y, widths[i], height).fillAndStroke(rowIndex % 2 ? "#f7f9fb" : COLORS.white, COLORS.line);
        setFont(false, options.fontSize || 6.8, COLORS.text);
        doc.text(text(cell), x + 4, y + 5, { width: widths[i] - 8, lineGap: 0.5 });
        x += widths[i];
      });
      doc.y = y + height;
    });
    doc.moveDown(0.6);
    doc.x = doc.page.margins.left;
  }

  // Borito
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#f4f7f9");
  doc.rect(0, 0, doc.page.width, 250).fill(COLORS.navy);
  doc.rect(0, 0, 16, doc.page.height).fill(COLORS.teal);
  setFont(true, 11, COLORS.tealLight);
  doc.text("ALLINFASHION / TECHNIKAI ATADAS", 52, 52, { characterSpacing: 1.4 });
  setFont(true, 25, COLORS.white);
  doc.text(config.title, 52, 82, { width: doc.page.width - 100, lineGap: 2 });
  setFont(false, 11, COLORS.tealLight);
  doc.text(config.company, 52, 218);
  doc.y = 282;
  doc.x = doc.page.margins.left;
  keyValueGrid([
    ["Generalt", new Date(data.generatedAt).toLocaleString("hu-HU")],
    ["Git commit", `${data.git.branch} / ${data.git.shortCommit}`],
    ["Forrasgyoker", data.root],
    ["Live adatbazis", data.databases.status === "ok" ? "Read-only vizsgalat sikeres" : `Nem teljes: ${data.databases.status}`],
    ["Forrasfajlok", `${data.summary.files} fajl / ${data.summary.sourceLines.toLocaleString("hu-HU")} sor`],
    ["Feltart adatfolyam", `${data.summary.dataFlows} frontend -> API -> backend kapcsolat`]
  ], 2);
  doc.moveDown(0.4);
  paragraph("Cel: egyetlen, bizonyithato rendszerterkepben megmutatni, melyik fajl mit hasznal, melyik API-t hivja, a backend hol kezeli, mely tablakat olvassa vagy irja, es a live PostgreSQL semaban ezek hogyan kapcsolodnak.", { size: 10 });
  badge("READ-ONLY LIVE DB", COLORS.teal);
  paragraph("A dokumentumgenerator nem futtat INSERT, UPDATE, DELETE vagy DDL parancsot a live adatbazison. A psql kapcsolat default_transaction_read_only=on beallitassal indul.", { size: 8.5, color: COLORS.muted });

  // TOC placeholder
  doc.addPage();
  const tocPageIndex = doc.bufferedPageRange().count - 1;
  setFont(true, 21, COLORS.navy);
  doc.text("Tartalomjegyzek", 44, 46);
  setFont(false, 9, COLORS.muted);
  doc.text("A vegso oldalszamok a generalas vegen automatikusan kerulnek ide.", 44, 78);

  section("1. Vezetoi osszefoglalo", "A tenylegesen feltart projektmeret, kapcsolat- es adatbazis-allapot.");
  keyValueGrid([
    ["Forrasfajlok", data.summary.files],
    ["Forrassorok", data.summary.sourceLines.toLocaleString("hu-HU")],
    ["Importkapcsolatok", data.summary.imports],
    ["Frontend API helper", data.summary.apiHelpers],
    ["Backend route", data.summary.backendRoutes],
    ["Adatfolyam", data.summary.dataFlows],
    ["Live tablazat / view", data.summary.databaseTables],
    ["Ellenorzesi jelzes", data.summary.warnings]
  ], 4);
  h2("Generalt build azonosito");
  codeLine(`${data.git.lastCommit}\nBranch: ${data.git.branch}\nCommit: ${data.git.commit}\nGit status:\n${data.git.status}`);
  h2("Mit bizonyit ez a dokumentum?");
  paragraph("A statikus forraselemzesbol szarmazo allitasok fajl- es sorszamhivatkozast kapnak. A live adatbazisresz kozvetlenul a PostgreSQL information_schema es pg_catalog read-only lekerdezeseibol keszul. Ahol dinamikus kod miatt nincs biztos feloldas, a dokumentum figyelmeztetest ad, nem talal ki kapcsolatot.");

  section("2. Effektiv fajlstruktura", "Fajlonkent: szerep, importok, exportok, API-hivasok es SQL tablaerintesek.");
  const grouped = new Map();
  for (const file of data.files) {
    const group = classifyFile(file.path);
    const rows = grouped.get(group) || [];
    rows.push(file);
    grouped.set(group, rows);
  }
  for (const [group, files] of grouped) {
    h2(`${group} (${files.length})`);
    table(
      ["Fajl", "Sor", "Import", "API", "DB olvas", "DB ir"],
      files.map((file) => [
        file.path,
        file.lines,
        file.imports.length,
        (file.directApiCalls || []).length + (file.apiHelperUsages || []).length,
        file.sql.reads.join(", ") || "-",
        file.sql.writes.join(", ") || "-"
      ]),
      [contentWidth * 0.35, contentWidth * 0.07, contentWidth * 0.08, contentWidth * 0.07, contentWidth * 0.21, contentWidth * 0.22],
      { fontSize: 6.4 }
    );
  }

  section("3. Fajl-fajl fuggosegi terkep", "A relativ importok feloldasa, valamint a kulso csomagkapcsolatok.");
  for (const file of data.files.filter((row) => row.imports.length)) {
    h2(file.path);
    const internal = file.imports.filter((row) => row.resolvedRelative);
    const external = file.imports.filter((row) => !row.specifier.startsWith("."));
    const unresolved = file.imports.filter((row) => row.specifier.startsWith(".") && !row.resolvedRelative);
    if (internal.length) {
      paragraph("Belső kapcsolatok", { size: 7.8, color: COLORS.tealDark, after: 0.2 });
      internal.forEach((row) => codeLine(`${file.path}:${row.line} -> ${row.resolvedRelative}`, "#eef9f8"));
    }
    if (external.length) paragraph(`Kulso csomagok: ${unique(external.map((row) => row.specifier)).join(", ")}`, { size: 7.5, color: COLORS.muted });
    if (unresolved.length) paragraph(`Nem feloldott relativ import: ${unresolved.map((row) => `${row.specifier} (${row.line}. sor)`).join(", ")}`, { size: 7.5, color: COLORS.red });
  }

  section("4. Frontend -> API -> backend -> adatbazis", "A legfontosabb vegponttol vegpontig kovetheto adatfolyamok.");
  if (!data.flows.length) paragraph("Nem talaltam statikusan feloldhato adatfolyamot.");
  else data.flows.forEach(flowBox);

  section("5. Frontend API helper-k", "Az API kliensfuggvenyek, HTTP metodusok es endpointok.");
  table(
    ["Helper", "Metodus", "Endpoint", "Definicio"],
    data.apiHelpers.map((helper) => [helper.name, helper.method, helper.endpoint, `${helper.file}:${helper.line}`]),
    [contentWidth * 0.25, contentWidth * 0.10, contentWidth * 0.40, contentWidth * 0.25],
    { fontSize: 6.7 }
  );

  section("6. Backend route terkep", "Route-onkent az olvasott es irt tablakkal.");
  table(
    ["Metodus / endpoint", "Backend fajl", "Olvas", "Ir"],
    data.backendRoutes.map((route) => [
      `${route.method} ${route.fullPath}`,
      `${route.file}:${route.line}`,
      route.reads.join(", ") || "-",
      route.writes.join(", ") || "-"
    ]),
    [contentWidth * 0.31, contentWidth * 0.25, contentWidth * 0.22, contentWidth * 0.22],
    { fontSize: 6.2 }
  );

  section("7. Live PostgreSQL adatbazis", "A DATABASE_URL kapcsolaton read-only modban feltart tenyleges sema.");
  for (const db of data.databases.databases || []) {
    h2(`${db.envName}: ${db.meta?.database || db.status}`);
    keyValueGrid([
      ["Allapot", db.status],
      ["Adatbazis", db.meta?.database || "-"],
      ["Felhasznalo", db.meta?.user || "-"],
      ["PostgreSQL", db.meta?.server_version || "-"],
      ["Idozona", db.meta?.timezone || "-"],
      ["Objektumok", `${db.tables?.length || 0} tabla/view, ${db.columns?.length || 0} oszlop`]
    ], 3);
    if (db.errors?.length) paragraph(db.errors.join(" | "), { color: COLORS.red });
    table(
      ["Tabla / view", "Tipus", "Becsult sor", "Meret byte"],
      (db.tables || []).map((row) => [row.name, row.kind, row.estimated_rows, row.total_bytes]),
      [contentWidth * 0.42, contentWidth * 0.24, contentWidth * 0.17, contentWidth * 0.17],
      { fontSize: 6.8 }
    );
  }

  section("8. Tabla- es oszlopszintu dokumentacio", "Oszlopok, tipusaik, nullazhatosag es alapertelmezett ertekek.");
  for (const db of data.databases.databases || []) {
    const byTable = new Map();
    for (const column of db.columns || []) {
      const rows = byTable.get(column.table) || [];
      rows.push(column);
      byTable.set(column.table, rows);
    }
    for (const [tableName, columns] of byTable) {
      h2(`${db.meta?.database || db.envName}.public.${tableName}`);
      const constraints = (db.constraints || []).filter((row) => row.table === tableName);
      const indexes = (db.indexes || []).filter((row) => row.table === tableName);
      const triggers = (db.triggers || []).filter((row) => row.table === tableName);
      if (constraints.length) paragraph(`Constraints: ${constraints.map((row) => `${row.name}: ${row.definition}`).join(" | ")}`, { size: 6.8, color: COLORS.muted });
      if (indexes.length) paragraph(`Indexek: ${indexes.map((row) => row.name).join(", ")}`, { size: 6.8, color: COLORS.muted });
      if (triggers.length) paragraph(`Triggerek: ${triggers.map((row) => `${row.name} [${row.timing} ${row.event}]`).join(", ")}`, { size: 6.8, color: COLORS.muted });
      table(
        ["#", "Oszlop", "Tipus", "NULL", "Default"],
        columns.map((row) => [row.position, row.column, row.udt_name || row.data_type, row.nullable, row.default || "-"]),
        [contentWidth * 0.06, contentWidth * 0.27, contentWidth * 0.20, contentWidth * 0.08, contentWidth * 0.39],
        { fontSize: 6.4 }
      );
    }
  }

  section("9. Migraciok es semavaltozasok", "A migrations konyvtarban talalt CREATE / ALTER / REFERENCES kapcsolatok.");
  const migrations = data.files.filter((file) => file.path.startsWith("migrations/") || file.extension === ".sql");
  for (const migration of migrations) {
    h2(migration.path);
    keyValueGrid([
      ["Definial", migration.sql.definitions.join(", ") || "-"],
      ["Hivatkozik", migration.sql.references.join(", ") || "-"],
      ["Olvas", migration.sql.reads.join(", ") || "-"],
      ["Ir", migration.sql.writes.join(", ") || "-"]
    ], 2);
  }

  section("10. Kornyezeti valtozok es kulso kapcsolatok", "Csak valtozonevek szerepelnek; titkos ertek soha nem kerul a PDF-be.");
  const envUsage = new Map();
  for (const file of data.files) for (const envName of file.envVars || []) {
    const rows = envUsage.get(envName) || [];
    rows.push(file.path);
    envUsage.set(envName, rows);
  }
  table(
    ["ENV nev", "Hasznalo fajlok"],
    Array.from(envUsage.entries()).sort().map(([name, files]) => [name, unique(files).join(", ")]),
    [contentWidth * 0.28, contentWidth * 0.72],
    { fontSize: 6.6 }
  );
  h2("Frontend hash route-ok");
  const hashRows = [];
  for (const file of data.files) for (const route of file.hashRoutes || []) hashRows.push([route.hash, `${file.path}:${route.line}`]);
  table(["Hash route", "Forras"], hashRows, [contentWidth * 0.40, contentWidth * 0.60], { fontSize: 6.7 });

  section("11. Ellenorzesi figyelmeztetesek", "A statikus elemzes bizonytalansagai es a teszteles utan ellenorizendo pontok.");
  if (!data.warnings.length) paragraph("Nincs feltart figyelmeztetes.");
  for (const warning of data.warnings) {
    ensureSpace(28);
    badge(warning.type, warning.severity === "warning" ? COLORS.orange : COLORS.grey);
    paragraph(warning.message, { size: 8.2 });
  }

  section("12. Teszteles utani atadasi checklist", "A vegleges PDF-et csak a tesztelesek utan erdemes archiv atadasnak tekinteni.");
  const checklist = [
    "A Render deploy Live allapotban van, es a PDF-ben szereplo Git commit egyezik a deploy commitjaval.",
    "A frontend kritikus oldalak megnyilnak konzolhiba nelkul.",
    "A beszerzesi rendeles nyitott listat boviti, es a vetelarat hasznalja.",
    "A keszletmozgas PV-elokeszitesbe kerul, majd lezarhato.",
    "A serult termek elokeszites es veglegesites megfeleloen csokkenti a keszletet.",
    "A Shopify stock outbox es sync job ellenorzott.",
    "A live adatbazis semaja read-only modban ujra beolvasva.",
    "A warnings fejezet minden nyitott pontja ellenorizve vagy javitva.",
    "A vegleges PDF, JSON es Markdown fajl ugyanabba az archiv mappaba mentve."
  ];
  checklist.forEach((item, i) => {
    ensureSpace(32);
    const y = doc.y;
    doc.roundedRect(doc.page.margins.left, y, 20, 20, 4).strokeColor(COLORS.teal).stroke();
    setFont(true, 8, COLORS.tealDark);
    doc.text(String(i + 1), doc.page.margins.left + 7, y + 6);
    setFont(false, 9, COLORS.text);
    doc.text(item, doc.page.margins.left + 28, y + 2, { width: contentWidth - 28, lineGap: 1.5 });
    doc.y = Math.max(y + 27, doc.y + 4);
  });
  h2("Archiv csomag");
  codeLine(`${pdfPath}\n${mdPath}\n${jsonPath}`);

  // TOC kitoltese
  doc.switchToPage(tocPageIndex);
  doc.rect(0, 0, doc.page.width, 16).fill(COLORS.teal);
  let tocY = 110;
  toc.forEach((entry) => {
    if (tocY > doc.page.height - 70) return;
    setFont(false, 9, COLORS.text);
    doc.text(entry.title, 52, tocY, { width: contentWidth - 45, lineBreak: false, ellipsis: true });
    const pageLabel = String(entry.page);
    setFont(true, 9, COLORS.tealDark);
    doc.text(pageLabel, doc.page.width - 80, tocY, { width: 30, align: "right" });
    doc.moveTo(52, tocY + 13).lineTo(doc.page.width - 50, tocY + 13).strokeColor("#e0e5e9").stroke();
    tocY += 27;
  });

  // Labfejlec es oldalszam
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    if (i > 0) {
      const originalBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      setFont(false, 7, COLORS.muted);
      doc.text(`${config.company} | AllInFashion rendszerterkep`, 44, 22, { width: contentWidth - 70, lineBreak: false });
      doc.text(`${i + 1} / ${range.count}`, doc.page.width - 95, doc.page.height - 28, { width: 50, align: "right", lineBreak: false });
      doc.moveTo(44, doc.page.height - 35).lineTo(doc.page.width - 44, doc.page.height - 35).strokeColor("#e0e5e9").stroke();
      doc.page.margins.bottom = originalBottomMargin;
    }
  }

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

createPdf(report)
  .then(() => {
    console.log("=== ALLINFASHION RENDSZERDOKUMENTACIO ELKESZULT ===");
    console.log(`PDF:  ${pdfPath}`);
    console.log(`MD:   ${mdPath}`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`Fajlok: ${report.summary.files} | Route-ok: ${report.summary.backendRoutes} | Adatfolyamok: ${report.summary.dataFlows} | DB objektumok: ${report.summary.databaseTables}`);
  })
  .catch((error) => {
    console.error("PDF generalasi hiba:", error);
    process.exit(1);
  });
