import express from "express";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startAifShopifyEmbeddedWorker } from "../lib/aifShopifyEmbeddedWorker.js";
import {
  listAifShopifyInboundEvents,
  processAifShopifyInboundBatch,
  receiveAifShopifyInventoryWebhook,
} from "../lib/aifShopifyInbound.js";
import {
  deleteAifShopifyOrder,
  deleteAifShopifyOrders,
  getAifShopifyOrder,
  listAifShopifyOrderEvents,
  listAifShopifyOrders,
  processAifShopifyOrderBatch,
  receiveAifShopifyOrderWebhook,
} from "../lib/aifShopifyOrders.js";
import {
  auditAifShopifySkus,
  enqueueAllMappedAifShopifyVariants,
  ensureAifShopifyTables,
  getAifShopifyStatus,
  listAifShopifyMappings,
  mapAifShopifyVariants,
  processAifShopifyOutboxBatch,
} from "../lib/aifShopify.js";
import {
  createAifShopifyProductExport,
  deleteAifShopifyProductExport,
  deleteAifShopifyProductExports,
  ensureAifShopifyExportSchema,
  getAifShopifyProductExportCsv,
  listAifShopifyProductExports,
  previewAifShopifyProductExport,
  reconcileAifShopifyProductExport,
  refreshAifShopifyMappings,
} from "../lib/aifShopifyExport.js";

export default function createAifRouter({ pool, requireAuthed, requireAdminOrSecret }) {
  const router = express.Router();

  startAifShopifyEmbeddedWorker(pool);

  const AIF_JSON_BODY_LIMIT = "80mb";
  let aifShopifyInventorySchemaPromise = null;

  let aifStockTransferIdempotencySchemaPromise = null;
  let aifStockTransferDocumentsSchemaPromise = null;
  let aifPurchaseOrderSchemaPromise = null;

  function ensureAifStockTransferIdempotencySchema() {
    if (!aifStockTransferIdempotencySchemaPromise) {
      aifStockTransferIdempotencySchemaPromise = (async () => {
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_stock_transfer_requests (
          owner_key text NOT NULL,
          idempotency_key text NOT NULL,
          request_hash text NOT NULL,
          status text NOT NULL DEFAULT 'processing',
          transfer_id text NULL,
          response jsonb NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (owner_key, idempotency_key),
          CHECK (status IN ('processing','completed'))
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_requests_updated_idx
          ON aif_stock_transfer_requests (updated_at DESC)`);
        return true;
      })().catch((error) => {
        aifStockTransferIdempotencySchemaPromise = null;
        throw error;
      });
    }
    return aifStockTransferIdempotencySchemaPromise;
  }


  function ensureAifStockTransferDocumentsSchema() {
    if (!aifStockTransferDocumentsSchemaPromise) {
      aifStockTransferDocumentsSchemaPromise = (async () => {
        await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_stock_transfer_document_settings (
          id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
          series text NOT NULL DEFAULT 'PV',
          next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
          digits integer NOT NULL DEFAULT 6 CHECK (digits BETWEEN 3 AND 10),
          include_year boolean NOT NULL DEFAULT true,
          yearly_reset boolean NOT NULL DEFAULT true,
          sequence_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,
          document_title text NOT NULL DEFAULT 'PROCES-VERBAL DE PREDARE-PRIMIRE',
          document_subtitle text NOT NULL DEFAULT 'Transfer intern de stoc',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          updated_by text NULL
        )`);
        await pool.query(`INSERT INTO aif_stock_transfer_document_settings (id)
          VALUES (1) ON CONFLICT (id) DO NOTHING`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_stock_transfer_documents (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          transfer_id text NOT NULL UNIQUE,
          document_number text NOT NULL UNIQUE,
          series text NOT NULL,
          sequence_number bigint NOT NULL,
          sequence_year integer NULL,
          title text NOT NULL,
          subtitle text NULL,
          note text NULL,
          status text NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','preparation','issued','cancelled')),
          actor text NULL,
          owner_key text NULL,
          line_count integer NOT NULL DEFAULT 0,
          total_qty integer NOT NULL DEFAULT 0,
          from_location_summary text NULL,
          to_location_summary text NULL,
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_documents_created_idx
          ON aif_stock_transfer_documents (created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_documents_number_idx
          ON aif_stock_transfer_documents (document_number)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_stock_transfer_document_lines (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          document_id uuid NOT NULL REFERENCES aif_stock_transfer_documents(id) ON DELETE CASCADE,
          line_no integer NOT NULL,
          variant_id text NULL,
          product_title text NULL,
          brand_name text NULL,
          category_name text NULL,
          product_code text NULL,
          barcode text NULL,
          color_name text NULL,
          size text NULL,
          image_url text NULL,
          from_location_id text NULL,
          from_location_name text NULL,
          to_location_id text NULL,
          to_location_name text NULL,
          qty integer NOT NULL CHECK (qty > 0),
          source_before integer NULL,
          source_after integer NULL,
          target_before integer NULL,
          target_after integer NULL,
          raw jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (document_id, line_no)
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_document_lines_document_idx
          ON aif_stock_transfer_document_lines (document_id, line_no)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_document_lines_variant_idx
          ON aif_stock_transfer_document_lines (variant_id)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS aif_stock_transfer_document_deletions (
          transfer_id text PRIMARY KEY,
          document_number text NULL,
          source text NOT NULL DEFAULT 'archive' CHECK (source IN ('official','legacy','archive')),
          deleted_at timestamptz NOT NULL DEFAULT now(),
          deleted_by text NULL,
          raw jsonb NOT NULL DEFAULT '{}'::jsonb
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_document_deletions_deleted_idx
          ON aif_stock_transfer_document_deletions (deleted_at DESC)`);

        // A korábbi transfer-táblákból általános készletbizonylat-központ lett.
        // Az ALTER-ek szándékosan idempotensek, mert a Renderen a régi és az új
        // adatbázisverziók is ugyanazzal a kóddal indulhatnak.
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'internal_transfer'`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS source_location_id text NULL`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS target_location_id text NULL`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS supplier_id text NULL`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS supplier_name text NULL`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS reception_id text NULL`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS external_reference text NULL`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS reason_code text NULL`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS reason_text text NULL`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS operation_direction text NULL`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS price_basis text NOT NULL DEFAULT 'selling_price'`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS total_value numeric(14,2) NOT NULL DEFAULT 0`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_documents ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'RON'`);
        await pool.query(`UPDATE aif_stock_transfer_documents SET status='issued' WHERE status NOT IN ('draft','preparation','issued','cancelled')`);
        await pool.query(`DO $$
          DECLARE c record;
          BEGIN
            FOR c IN
              SELECT conname
              FROM pg_constraint
              WHERE conrelid='aif_stock_transfer_documents'::regclass
                AND contype='c'
                AND pg_get_constraintdef(oid) ILIKE '%status%'
            LOOP
              EXECUTE format('ALTER TABLE aif_stock_transfer_documents DROP CONSTRAINT %I', c.conname);
            END LOOP;
          END $$`);
        await pool.query(`ALTER TABLE aif_stock_transfer_documents
          ADD CONSTRAINT aif_stock_transfer_documents_status_check
          CHECK (status IN ('draft','preparation','issued','cancelled'))`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_document_lines ADD COLUMN IF NOT EXISTS unit_price numeric(14,2) NULL`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_document_lines ADD COLUMN IF NOT EXISTS line_total numeric(14,2) NULL`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_document_lines ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'RON'`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_document_lines ADD COLUMN IF NOT EXISTS price_basis text NULL`);
        await pool.query(`ALTER TABLE IF EXISTS aif_stock_transfer_document_lines ADD COLUMN IF NOT EXISTS qty_delta integer NULL`);
        await pool.query(`CREATE INDEX IF NOT EXISTS aif_stock_transfer_documents_type_created_idx
          ON aif_stock_transfer_documents (document_type, created_at DESC)`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS aif_stock_transfer_documents_open_preparation_owner_uq
          ON aif_stock_transfer_documents (owner_key)
          WHERE status='preparation' AND document_type='internal_transfer' AND owner_key IS NOT NULL`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS aif_stock_transfer_documents_open_preparation_owner_type_uq
          ON aif_stock_transfer_documents (owner_key, document_type)
          WHERE status='preparation'
            AND document_type IN ('internal_transfer','damaged_writeoff')
            AND owner_key IS NOT NULL`);

        await pool.query(`CREATE TABLE IF NOT EXISTS aif_stock_document_settings (
          document_type text PRIMARY KEY,
          series text NOT NULL,
          next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
          digits integer NOT NULL DEFAULT 6 CHECK (digits BETWEEN 3 AND 10),
          include_year boolean NOT NULL DEFAULT true,
          yearly_reset boolean NOT NULL DEFAULT true,
          sequence_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,
          document_title text NOT NULL,
          document_subtitle text NULL,
          updated_by text NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )`);
        await pool.query(`INSERT INTO aif_stock_document_settings (
            document_type, series, next_number, digits, include_year, yearly_reset,
            sequence_year, document_title, document_subtitle
          ) VALUES
            ('internal_transfer','PV',1,6,true,true,EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,'PROCES-VERBAL DE PREDARE-PRIMIRE','Transfer intern de stoc'),
            ('supplier_return','RET',1,6,true,true,EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,'AVIZ DE RETUR CĂTRE FURNIZOR','Retur de marfă către furnizor'),
            ('damaged_writeoff','DET',1,6,true,true,EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,'PROCES-VERBAL DE CONSTATARE ȘI SCOATERE DIN GESTIUNE','Produse deteriorate / scoatere din gestiune'),
            ('stock_correction','COR',1,6,true,true,EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,'NOTĂ DE CORECȚIE A STOCULUI','Corecție justificată de stoc')
          ON CONFLICT (document_type) DO NOTHING`);
        await pool.query(`UPDATE aif_stock_document_settings g
          SET series=s.series,
              next_number=GREATEST(g.next_number,s.next_number),
              digits=s.digits,
              include_year=s.include_year,
              yearly_reset=s.yearly_reset,
              sequence_year=CASE WHEN s.sequence_year > g.sequence_year THEN s.sequence_year ELSE g.sequence_year END,
              document_title=s.document_title,
              document_subtitle=s.document_subtitle,
              updated_at=now()
          FROM aif_stock_transfer_document_settings s
          WHERE g.document_type='internal_transfer' AND s.id=1`);

        // Régi átadások értékpillanatképe kizárólag az ELADÁSI árból készül.
        await pool.query(`UPDATE aif_stock_transfer_document_lines l
          SET unit_price=round(v.sell_price::numeric,2),
              line_total=round(l.qty::numeric * v.sell_price::numeric,2),
              currency_code='RON',
              price_basis=COALESCE(l.price_basis,'selling_price')
          FROM aif_product_variants v
          WHERE l.variant_id::text=v.id::text
            AND l.unit_price IS NULL
            AND v.sell_price IS NOT NULL`);
        await pool.query(`UPDATE aif_stock_transfer_document_lines
          SET line_total=round(qty::numeric * unit_price::numeric,2)
          WHERE line_total IS NULL AND unit_price IS NOT NULL`);
        await pool.query(`UPDATE aif_stock_transfer_documents d
          SET total_value=x.total_value, currency_code='RON'
          FROM (
            SELECT document_id, round(COALESCE(sum(line_total),0)::numeric,2) AS total_value
            FROM aif_stock_transfer_document_lines
            GROUP BY document_id
          ) x
          WHERE x.document_id=d.id AND d.total_value IS DISTINCT FROM x.total_value`);
        return true;
      })().catch((error) => {
        aifStockTransferDocumentsSchemaPromise = null;
        throw error;
      });
    }
    return aifStockTransferDocumentsSchemaPromise;
  }

  function cleanAifTransferDocumentSeries(value) {
    return text(value || 'PV')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, '')
      .slice(0, 20) || 'PV';
  }

  function aifTransferDocumentNumber(settings, sequenceNumber, year) {
    const series = cleanAifTransferDocumentSeries(settings?.series || 'PV');
    const digits = Math.min(10, Math.max(3, Number(settings?.digits || 6)));
    const sequence = String(Math.max(1, Number(sequenceNumber || 1))).padStart(digits, '0');
    return settings?.include_year === false ? `${series}/${sequence}` : `${series}/${year}/${sequence}`;
  }

  function aifTransferSettingsResponse(row = {}) {
    const year = Number(row.sequence_year || new Date().getFullYear());
    const nextNumber = Math.max(1, Number(row.next_number || 1));
    const settings = {
      series: cleanAifTransferDocumentSeries(row.series || 'PV'),
      nextNumber,
      digits: Math.min(10, Math.max(3, Number(row.digits || 6))),
      includeYear: row.include_year !== false,
      yearlyReset: row.yearly_reset !== false,
      sequenceYear: year,
      documentTitle: text(row.document_title || 'PROCES-VERBAL DE PREDARE-PRIMIRE'),
      documentSubtitle: text(row.document_subtitle || 'Transfer intern de stoc'),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      updatedBy: row.updated_by || null,
    };
    return {
      ...settings,
      previewNumber: aifTransferDocumentNumber(
        { series: settings.series, digits: settings.digits, include_year: settings.includeYear },
        nextNumber,
        year,
      ),
    };
  }

  async function readAifTransferDocumentSettings(client = pool) {
    await ensureAifStockTransferDocumentsSchema();
    const result = await client.query(`SELECT * FROM aif_stock_transfer_document_settings WHERE id=1 LIMIT 1`);
    return aifTransferSettingsResponse(result.rows[0] || {});
  }

  async function allocateAifTransferDocumentNumber(client) {
    const currentYearResult = await client.query(`SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer AS year`);
    const currentYear = Number(currentYearResult.rows[0]?.year || new Date().getFullYear());
    const locked = await client.query(`SELECT * FROM aif_stock_transfer_document_settings WHERE id=1 FOR UPDATE`);
    let row = locked.rows[0] || {};
    let nextNumber = Math.max(1, Number(row.next_number || 1));
    let sequenceYear = Number(row.sequence_year || currentYear);
    if (row.yearly_reset !== false && sequenceYear !== currentYear) {
      nextNumber = 1;
      sequenceYear = currentYear;
    }
    const number = aifTransferDocumentNumber(row, nextNumber, sequenceYear);
    await client.query(
      `UPDATE aif_stock_transfer_document_settings
       SET next_number=$1, sequence_year=$2, updated_at=now()
       WHERE id=1`,
      [nextNumber + 1, sequenceYear]
    );
    return {
      documentNumber: number,
      sequenceNumber: nextNumber,
      sequenceYear,
      series: cleanAifTransferDocumentSeries(row.series || 'PV'),
      title: text(row.document_title || 'PROCES-VERBAL DE PREDARE-PRIMIRE'),
      subtitle: text(row.document_subtitle || 'Transfer intern de stoc'),
    };
  }

  const AIF_STOCK_DOCUMENT_TYPES = Object.freeze({
    internal_transfer: {
      series: 'PV',
      title: 'PROCES-VERBAL DE PREDARE-PRIMIRE',
      subtitle: 'Transfer intern de stoc',
      priceBasis: 'selling_price',
    },
    supplier_return: {
      series: 'RET',
      title: 'AVIZ DE RETUR CĂTRE FURNIZOR',
      subtitle: 'Retur de marfă către furnizor',
      priceBasis: 'purchase_price',
    },
    damaged_writeoff: {
      series: 'DET',
      title: 'PROCES-VERBAL DE CONSTATARE ȘI SCOATERE DIN GESTIUNE',
      subtitle: 'Produse deteriorate / scoatere din gestiune',
      priceBasis: 'purchase_price',
    },
    stock_correction: {
      series: 'COR',
      title: 'NOTĂ DE CORECȚIE A STOCULUI',
      subtitle: 'Corecție justificată de stoc',
      priceBasis: 'purchase_price',
    },
  });

  function cleanAifStockDocumentType(value, fallback = null) {
    const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const aliases = {
      transfer: 'internal_transfer',
      stock_transfer: 'internal_transfer',
      internal: 'internal_transfer',
      aviz: 'internal_transfer',
      retur: 'supplier_return',
      return: 'supplier_return',
      supplier_retur: 'supplier_return',
      damaged: 'damaged_writeoff',
      deteriorated: 'damaged_writeoff',
      produse_deteriorate: 'damaged_writeoff',
      writeoff: 'damaged_writeoff',
      correction: 'stock_correction',
      stock_adjustment: 'stock_correction',
      adjustment: 'stock_correction',
    };
    const normalized = aliases[raw] || raw;
    return Object.prototype.hasOwnProperty.call(AIF_STOCK_DOCUMENT_TYPES, normalized) ? normalized : fallback;
  }

  function aifStockDocumentSettingsResponse(row = {}) {
    const type = cleanAifStockDocumentType(row.document_type, 'internal_transfer');
    const defaults = AIF_STOCK_DOCUMENT_TYPES[type];
    const year = Number(row.sequence_year || new Date().getFullYear());
    const nextNumber = Math.max(1, Number(row.next_number || 1));
    const digits = Math.min(10, Math.max(3, Number(row.digits || 6)));
    const includeYear = row.include_year !== false;
    const series = cleanAifTransferDocumentSeries(row.series || defaults.series);
    return {
      documentType: type,
      series,
      nextNumber,
      digits,
      includeYear,
      yearlyReset: row.yearly_reset !== false,
      sequenceYear: year,
      documentTitle: text(row.document_title || defaults.title),
      documentSubtitle: text(row.document_subtitle || defaults.subtitle),
      previewNumber: aifTransferDocumentNumber({ series, digits, include_year: includeYear }, nextNumber, year),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      updatedBy: row.updated_by || null,
    };
  }

  async function readAifStockDocumentSettings(client = pool, type = null, lock = false) {
    await ensureAifStockTransferDocumentsSchema();
    const normalizedType = cleanAifStockDocumentType(type, null);
    const args = [];
    let where = '';
    if (normalizedType) {
      args.push(normalizedType);
      where = `WHERE document_type=$1`;
    }
    const result = await client.query(
      `SELECT * FROM aif_stock_document_settings ${where} ORDER BY document_type ${lock ? 'FOR UPDATE' : ''}`,
      args
    );
    return normalizedType
      ? aifStockDocumentSettingsResponse(result.rows[0] || { document_type: normalizedType })
      : result.rows.map(aifStockDocumentSettingsResponse);
  }

  async function allocateAifStockDocumentNumber(client, type) {
    const documentType = cleanAifStockDocumentType(type, null);
    if (!documentType) throw Object.assign(new Error('Érvénytelen készletbizonylat-típus.'), { statusCode: 400 });
    const defaults = AIF_STOCK_DOCUMENT_TYPES[documentType];
    const currentYearResult = await client.query(`SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer AS year`);
    const currentYear = Number(currentYearResult.rows[0]?.year || new Date().getFullYear());
    const locked = await client.query(`SELECT * FROM aif_stock_document_settings WHERE document_type=$1 FOR UPDATE`, [documentType]);
    const row = locked.rows[0] || {
      document_type: documentType,
      series: defaults.series,
      next_number: 1,
      digits: 6,
      include_year: true,
      yearly_reset: true,
      sequence_year: currentYear,
      document_title: defaults.title,
      document_subtitle: defaults.subtitle,
    };
    let nextNumber = Math.max(1, Number(row.next_number || 1));
    let sequenceYear = Number(row.sequence_year || currentYear);
    if (row.yearly_reset !== false && sequenceYear !== currentYear) {
      nextNumber = 1;
      sequenceYear = currentYear;
    }
    const documentNumber = aifTransferDocumentNumber(row, nextNumber, sequenceYear);
    await client.query(
      `UPDATE aif_stock_document_settings
       SET next_number=$2, sequence_year=$3, updated_at=now()
       WHERE document_type=$1`,
      [documentType, nextNumber + 1, sequenceYear]
    );
    if (documentType === 'internal_transfer') {
      await client.query(
        `UPDATE aif_stock_transfer_document_settings
         SET series=$1, next_number=$2, digits=$3, include_year=$4,
             yearly_reset=$5, sequence_year=$6, document_title=$7,
             document_subtitle=$8, updated_at=now()
         WHERE id=1`,
        [
          cleanAifTransferDocumentSeries(row.series || defaults.series),
          nextNumber + 1,
          Math.min(10, Math.max(3, Number(row.digits || 6))),
          row.include_year !== false,
          row.yearly_reset !== false,
          sequenceYear,
          text(row.document_title || defaults.title),
          text(row.document_subtitle || defaults.subtitle),
        ]
      );
    }
    return {
      documentType,
      documentNumber,
      sequenceNumber: nextNumber,
      sequenceYear,
      series: cleanAifTransferDocumentSeries(row.series || defaults.series),
      title: text(row.document_title || defaults.title),
      subtitle: text(row.document_subtitle || defaults.subtitle),
      priceBasis: defaults.priceBasis,
    };
  }

  function legacyAifTransferDocumentNumber(transferId, createdAt) {
    const date = createdAt ? new Date(createdAt) : new Date();
    const safeDate = Number.isNaN(date.getTime())
      ? '00000000'
      : `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const suffix = createHash('sha1').update(String(transferId || '')).digest('hex').slice(0, 6).toUpperCase();
    return `ARH/${safeDate}/${suffix}`;
  }

  function ensureAifShopifyInventorySchema() {
    if (!aifShopifyInventorySchemaPromise) {
      aifShopifyInventorySchemaPromise = ensureAifShopifyExportSchema(pool).catch((error) => {
        aifShopifyInventorySchemaPromise = null;
        throw error;
      });
    }
    return aifShopifyInventorySchemaPromise;
  }

  router.use(express.json({
    limit: AIF_JSON_BODY_LIMIT,
    verify: (req, _res, buffer) => {
      req.rawBody = Buffer.from(buffer);
    },
  }));
  router.use(express.urlencoded({ extended: true, limit: AIF_JSON_BODY_LIMIT }));
  router.use((err, _req, res, next) => {
    if (err?.type === "entity.too.large" || err?.status === 413 || err?.statusCode === 413) {
      return res.status(413).json({
        error: `A küldött import csomag túl nagy. Limit: ${AIF_JSON_BODY_LIMIT}.`,
        code: "payload_too_large",
        limit: AIF_JSON_BODY_LIMIT,
      });
    }
    return next(err);
  });

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    next();
  });

  const text = (v) => String(v ?? "").trim();
  const emptyToNull = (v) => {
    const s = text(v);
    return s ? s : null;
  };
  const toInt = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number.parseInt(String(v).replace(",", "."), 10);
    return Number.isFinite(n) ? n : null;
  };
  const toMoney = (v) => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = Number(String(v).replace(",", ".").trim());
    return Number.isFinite(n) ? n : null;
  };
  const normCode = (v) => text(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const uuidTextRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isUuidText(value) {
    return uuidTextRegex.test(text(value));
  }

  function invalidImportBatchId(res) {
    return res.status(404).json({
      error: "Import előzmény nem található.",
      code: "invalid_import_batch_id",
    });
  }

  function rawValueByHeaders(raw, headers) {
    if (!raw || typeof raw !== "object") return null;
    const wanted = new Set((headers || []).map((x) => normCode(x)).filter(Boolean));
    for (const [key, value] of Object.entries(raw)) {
      if (wanted.has(normCode(key))) return emptyToNull(value);
    }
    return null;
  }


  const SN_COD_HEADER_ALIASES = [
    "S/N/COD", "S/N COD", "SN/COD", "SN COD", "S N COD", "S.N.COD", "S.N. COD",
    "S/N", "SN", "S/N EV HONAP", "S/N ÉV HÓNAP", "SN EV HONAP", "SN ÉV HÓNAP", "SERIE COD", "SERIE/COD", "SERIAL COD", "SERIAL CODE",
    "COD SERIAL", "COD SERIE", "COD INTERN", "INTERNAL CODE", "INTERNAL ID", "CLIENT CODE"
  ];

  function snCodFromSource(src = {}, raw = {}) {
    return emptyToNull(
      src.snCod || src.sn_cod || src.snCode || src.sn_code || src.serialCode || src.serial_code ||
      src.internalCode || src.internal_code || src.internalIdentifier || src.internal_identifier ||
      rawValueByHeaders(raw, SN_COD_HEADER_ALIASES)
    );
  }


  const CUSTOMS_TARIFF_HEADER_ALIASES = [
    "Vámtarifa kód", "VAMTARIFA KOD", "VAMTARIFA", "VÁMTARIFA", "Vamtarifa", "vamtarifa",
    "Cod vamal", "COD VAMAL", "Cod tarifar", "COD TARIFAR", "Cod tarifar vamal", "COD TARIFAR VAMAL",
    "Tarif vamal", "TARIF VAMAL", "Tarif code", "TARIFF CODE", "Customs tariff", "CUSTOMS TARIFF",
    "HS CODE", "HSCode", "HS", "TARIC", "TARIC CODE", "CN CODE", "NC CODE", "Commodity code",
    "Intrastat code", "Intrastat", "Customs code", "VTSZ"
  ];

  function customsTariffCodeFromSource(src = {}, raw = {}) {
    const attrs = src?.attributes && typeof src.attributes === "object" && !Array.isArray(src.attributes) ? src.attributes : {};
    return emptyToNull(
      src.customsTariffCode || src.customs_tariff_code || src.tariffCode || src.tariff_code ||
      src.hsCode || src.hs_code || src.taricCode || src.taric_code || src.cnCode || src.cn_code ||
      src.ncCode || src.nc_code || src.commodityCode || src.commodity_code || src.intrastatCode || src.intrastat_code ||
      attrs.customsTariffCode || attrs.customs_tariff_code || attrs.tariffCode || attrs.tariff_code || attrs.hsCode || attrs.hs_code || attrs.taricCode || attrs.taric_code ||
      rawValueByHeaders(raw, CUSTOMS_TARIFF_HEADER_ALIASES)
    );
  }

  function customsTariffCodeFromNormalized(normalized = {}) {
    const attrs = normalized?.attributes && typeof normalized.attributes === "object" && !Array.isArray(normalized.attributes) ? normalized.attributes : {};
    return emptyToNull(
      normalized.customsTariffCode || normalized.customs_tariff_code || normalized.tariffCode || normalized.tariff_code ||
      normalized.hsCode || normalized.hs_code || normalized.taricCode || normalized.taric_code ||
      normalized.cnCode || normalized.cn_code || normalized.ncCode || normalized.nc_code ||
      normalized.commodityCode || normalized.commodity_code || normalized.intrastatCode || normalized.intrastat_code ||
      attrs.customsTariffCode || attrs.customs_tariff_code || attrs.tariffCode || attrs.tariff_code || attrs.hsCode || attrs.hs_code || attrs.taricCode || attrs.taric_code
    );
  }

  function variantAttributesFromNormalized(normalized = {}) {
    const attrs = normalized.attributes && typeof normalized.attributes === "object" && !Array.isArray(normalized.attributes)
      ? { ...normalized.attributes }
      : {};
    const tariff = customsTariffCodeFromNormalized(normalized);
    if (tariff !== null && tariff !== undefined && String(tariff).trim() !== "") {
      attrs.customsTariffCode = tariff;
      attrs.customs_tariff_code = tariff;
      attrs.tariffCode = tariff;
      attrs.tariff_code = tariff;
      attrs.hsCode = tariff;
      attrs.hs_code = tariff;
    }
    return attrs;
  }

  function variantAttributesJsonFromNormalized(normalized = {}) {
    return JSON.stringify(variantAttributesFromNormalized(normalized));
  }

  function customsTariffSql(alias = "v") {
    return `COALESCE(${alias}.attributes->>'customsTariffCode', ${alias}.attributes->>'customs_tariff_code', ${alias}.attributes->>'tariffCode', ${alias}.attributes->>'tariff_code', ${alias}.attributes->>'hsCode', ${alias}.attributes->>'hs_code', ${alias}.attributes->>'taricCode', ${alias}.attributes->>'taric_code')`;
  }


  let snCodSchemaEnsured = false;
  let snCodSchemaPromise = null;

  async function ensureSnCodSchema(client = pool) {
    if (snCodSchemaEnsured) return true;

    const run = async () => {
      await client.query(`ALTER TABLE IF EXISTS aif_product_variants ADD COLUMN IF NOT EXISTS sn_cod text`);
      await client.query(`ALTER TABLE IF EXISTS aif_import_rows ADD COLUMN IF NOT EXISTS sn_cod text`);
      try {
        await client.query(`CREATE INDEX IF NOT EXISTS idx_aif_product_variants_sn_cod_lower ON aif_product_variants (lower(sn_cod)) WHERE sn_cod IS NOT NULL`);
      } catch (indexError) {
        console.error("AIF S/N/COD product variant index warning", indexError);
      }
      try {
        await client.query(`CREATE INDEX IF NOT EXISTS idx_aif_import_rows_sn_cod_lower ON aif_import_rows (lower(sn_cod)) WHERE sn_cod IS NOT NULL`);
      } catch (indexError) {
        console.error("AIF S/N/COD import rows index warning", indexError);
      }
      snCodSchemaEnsured = true;
      return true;
    };

    if (client === pool) {
      if (!snCodSchemaPromise) {
        snCodSchemaPromise = run().finally(() => { snCodSchemaPromise = null; });
      }
      return snCodSchemaPromise;
    }

    return run();
  }

  async function ensureAifSubcategorySchema(client = pool) {
    try {
      await client.query(`ALTER TABLE IF EXISTS aif_categories ADD COLUMN IF NOT EXISTS parent_id uuid NULL REFERENCES aif_categories(id)`);
      await client.query(`ALTER TABLE IF EXISTS aif_product_models ADD COLUMN IF NOT EXISTS subcategory_id uuid NULL REFERENCES aif_categories(id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_categories_parent_idx ON aif_categories (parent_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_product_models_subcategory_idx ON aif_product_models (subcategory_id)`);
    } catch (e) {
      console.error("AIF subcategory schema ensure warning", e);
      throw e;
    }
  }


  // Kompatibilitási alias a régebbi segédfüggvényekhez; a tényleges méret-séma és alapértékek az ensureAifSizeTables() alatt vannak.
  async function ensureSizeMasterDataSchema(client = pool) {
    return ensureAifSizeTables(client);
  }
  router.use(async (_req, res, next) => {
    try {
      await ensureSnCodSchema(pool);
      await ensureAifSubcategorySchema(pool);
      await ensureSizeMasterDataSchema(pool);
      await ensureAifPurchaseOrderSchema(pool);
      next();
    } catch (e) {
      console.error("AIF AIF schema ensure failed", e);
      res.status(500).json({ error: "Az AllInFashion adatbázis mezők előkészítése nem sikerült.", code: e?.code || null });
    }
  });

  function splitBrandProductCode(value) {
    const raw = text(value);
    if (!raw) return { fullCode: null, modelCode: null, colorCode: null };
    const match = raw.match(/^(.+)-([A-Za-z0-9]{1,16})$/);
    if (!match) return { fullCode: raw, modelCode: raw, colorCode: null };
    return {
      fullCode: raw,
      modelCode: text(match[1]),
      colorCode: text(match[2]),
    };
  }

  function applyProductCodeSplit(normalized) {
    if (!normalized || typeof normalized !== "object") return normalized;
    const split = splitBrandProductCode(normalized.supplierProductCode || normalized.productCode || normalized.modelCode);
    if (split.fullCode) normalized.supplierProductCode = normalized.supplierProductCode || split.fullCode;
    if (split.modelCode && (!normalized.modelCode || String(normalized.modelCode) === String(split.fullCode))) normalized.modelCode = split.modelCode;
    if (split.colorCode && !normalized.colorCode) normalized.colorCode = split.colorCode;
    if (split.colorCode && !normalized.supplierColorCode) normalized.supplierColorCode = split.colorCode;
    return normalized;
  }

  function actorFrom(req) {
    return text(req.session?.actor || req.session?.shopId || req.session?.role || "system") || "system";
  }

  function selectionOwnerKey(req) {
    const session = req.session || {};
    const user = req.user || {};
    const sessionUser = session.user && typeof session.user === "object" ? session.user : {};
    const candidates = [
      session.userId, session.user_id, session.adminId, session.admin_id,
      session.employeeId, session.employee_id, session.email, session.username,
      session.shopId, session.shop_id, session.actor,
      sessionUser.id, sessionUser.userId, sessionUser.user_id, sessionUser.email, sessionUser.username,
      user.id, user.userId, user.user_id, user.email, user.username,
      session.role,
    ];
    for (const candidate of candidates) {
      const value = text(candidate);
      if (value) return value.slice(0, 200);
    }
    return "system";
  }

  function cleanSelectedWorkAction(value) {
    const action = normCode(value);
    return ["label", "order", "move", "shopify"].includes(action) ? action : null;
  }

  function selectedRowsFromBody(body) {
    const sourceItems = Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.selectedVariantIds)
        ? body.selectedVariantIds
        : Array.isArray(body?.selected_variant_ids)
          ? body.selected_variant_ids
          : Array.isArray(body?.variantIds)
            ? body.variantIds
            : Array.isArray(body?.variant_ids)
              ? body.variant_ids
              : [];
    const actionMap = body?.actions && typeof body.actions === "object" && !Array.isArray(body.actions) ? body.actions : {};
    const selectedObject = body?.selectedVariants && typeof body.selectedVariants === "object" && !Array.isArray(body.selectedVariants)
      ? body.selectedVariants
      : body?.selected_variants && typeof body.selected_variants === "object" && !Array.isArray(body.selected_variants)
        ? body.selected_variants
        : null;
    const rows = [];

    if (sourceItems.length) {
      for (const item of sourceItems) {
        const id = text(typeof item === "object" && item !== null ? (item.variantId || item.variant_id || item.id) : item);
        if (!id) continue;
        const action = cleanSelectedWorkAction(typeof item === "object" && item !== null ? (item.action || item.selectedAction || item.selected_action || actionMap[id]) : actionMap[id]);
        rows.push({ variantId: id, action });
      }
    } else if (selectedObject) {
      for (const [idRaw, selected] of Object.entries(selectedObject)) {
        const id = text(idRaw);
        if (!id || !selected) continue;
        rows.push({ variantId: id, action: cleanSelectedWorkAction(actionMap[id]) });
      }
    }

    const seen = new Set();
    return rows.filter((row) => {
      if (!row.variantId || seen.has(row.variantId)) return false;
      seen.add(row.variantId);
      return true;
    }).slice(0, 1000);
  }


  function selectedVariantIdsFromBody(body) {
    const rows = selectedRowsFromBody(body || {});
    if (rows.length) return rows.map((row) => row.variantId);

    const source = Array.isArray(body?.variantIds)
      ? body.variantIds
      : Array.isArray(body?.variant_ids)
        ? body.variant_ids
        : Array.isArray(body?.ids)
          ? body.ids
          : [];
    return Array.from(new Set(source.map((value) => text(value)).filter(Boolean))).slice(0, 1000);
  }

  async function lockSelectedVariantsOwner(client, ownerKey) {
    // Ugyanazon közös munkalista párhuzamos módosításait szerializáljuk.
    // Így két gép egyszerre történő kattintása sem tapossa el a másik módosítását.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [ownerKey]);
  }

  async function ensureSelectedVariantsTable(client) {
    await client.query(`CREATE TABLE IF NOT EXISTS aif_user_selected_variants (
      owner_key text NOT NULL,
      variant_id text NOT NULL,
      action text NULL,
      sort_order integer NOT NULL DEFAULT 0,
      raw jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (owner_key, variant_id),
      CHECK (action IS NULL OR action IN ('label','order','move','shopify'))
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS aif_user_selected_variants_owner_sort_idx
      ON aif_user_selected_variants (owner_key, sort_order, updated_at)`);
  }

  async function loadSelectedVariantRows(client, ownerKey) {
    return client.query(
      `SELECT i.*, v.sn_cod,
              s.variant_id AS selected_variant_id,
              s.action,
              s.sort_order,
              s.created_at AS selected_at,
              s.updated_at AS selected_updated_at
       FROM aif_user_selected_variants s
       LEFT JOIN aif_inventory_summary i ON i.variant_id::text=s.variant_id
       LEFT JOIN aif_product_variants v ON v.id::text=s.variant_id
       WHERE s.owner_key=$1
       ORDER BY s.sort_order ASC, s.updated_at ASC`,
      [ownerKey]
    );
  }

  function selectedVariantResponseFromRows(rows) {
    const selectedVariantIds = [];
    const actions = {};
    const items = [];
    let updatedAt = null;
    for (const row of rows || []) {
      const id = text(row?.selected_variant_id || row?.variant_id);
      if (!id) continue;
      selectedVariantIds.push(id);
      const action = cleanSelectedWorkAction(row?.action);
      if (action) actions[id] = action;
      items.push({ ...row, variant_id: row?.variant_id || id });
      const ts = row?.selected_updated_at || row?.selected_at;
      if (ts && (!updatedAt || new Date(ts).getTime() > new Date(updatedAt).getTime())) updatedAt = ts;
    }
    return {
      ok: true,
      items,
      selectedVariantIds,
      actions,
      updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
      count: selectedVariantIds.length,
    };
  }


  const SALES_TVA_SETTING_KEY = "incoming_sales_tva";
  const DEFAULT_SALES_TVA_SETTINGS = Object.freeze({
    salesTvaRate: 21,
    sellPriceIncludesTva: true,
    salesPriceIncludesTva: true,
    sellPriceCurrency: "RON",
  });

  function boolFrom(value, fallback = false) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "boolean") return value;
    const raw = text(value).toLowerCase();
    if (["1", "true", "yes", "da", "igen", "on"].includes(raw)) return true;
    if (["0", "false", "no", "nu", "nem", "off"].includes(raw)) return false;
    return fallback;
  }

  function normalizeSalesTvaSettings(input = {}, fallback = DEFAULT_SALES_TVA_SETTINGS) {
    const src = input && typeof input === "object" ? input : {};
    const rateRaw = toMoney(src.salesTvaRate ?? src.sales_tva_rate ?? src.saleTvaRate ?? src.sale_tva_rate ?? src.rate ?? fallback.salesTvaRate);
    const salesTvaRate = rateRaw !== null && rateRaw >= 0 && rateRaw <= 100 ? Number(rateRaw) : Number(fallback.salesTvaRate || 21);
    const sellPriceIncludesTva = boolFrom(
      src.sellPriceIncludesTva ?? src.sell_price_includes_tva ?? src.salesPriceIncludesTva ?? src.sales_price_includes_tva ?? src.priceIncludesTva ?? src.price_includes_tva,
      fallback.sellPriceIncludesTva !== false
    );
    const sellPriceCurrency = currencyCode(src.sellPriceCurrency ?? src.sell_price_currency ?? fallback.sellPriceCurrency ?? "RON") || "RON";
    return {
      salesTvaRate,
      sellPriceIncludesTva,
      salesPriceIncludesTva: sellPriceIncludesTva,
      sellPriceCurrency,
    };
  }

  function cleanSellPriceCurrencyMode(value, fallback = "invoice") {
    const mode = normCode(value);
    if (mode === "ron") return "ron";
    if (mode === "invoice" || mode === "invoice_currency" || mode === "reception_currency") return "invoice";
    return fallback === "ron" ? "ron" : "invoice";
  }

  function receptionSellPricePolicy(reception = {}) {
    const source = reception && typeof reception === "object" ? reception : {};
    const rawMeta = source.rawMeta && typeof source.rawMeta === "object"
      ? source.rawMeta
      : source.raw_meta && typeof source.raw_meta === "object"
        ? source.raw_meta
        : {};
    const invoiceCurrency = currencyCode(
      source.currencyCode || source.currency_code || rawMeta.currencyCode || rawMeta.currency_code || "RON"
    ) || "RON";
    const explicitMode = source.sellPriceCurrencyMode ?? source.sell_price_currency_mode ??
      rawMeta.sellPriceCurrencyMode ?? rawMeta.sell_price_currency_mode;
    const mode = cleanSellPriceCurrencyMode(explicitMode, invoiceCurrency === "RON" ? "ron" : "invoice");
    const sourceCurrency = mode === "ron" ? "RON" : invoiceCurrency;
    return {
      mode,
      invoiceCurrency,
      sourceCurrency,
      isRon: sourceCurrency === "RON",
    };
  }

  function applyReceptionSellPricePolicyToNormalized(normalized, reception = {}) {
    if (!normalized || typeof normalized !== "object") return normalized;
    const policy = receptionSellPricePolicy(reception);
    normalized.sellPriceCurrencyMode = policy.mode;
    normalized.sell_price_currency_mode = policy.mode;
    normalized.sellPriceCurrency = policy.sourceCurrency;
    normalized.sell_price_currency = policy.sourceCurrency;
    normalized.sellPriceIsRon = policy.isRon;
    normalized.sell_price_is_ron = policy.isRon;
    return normalized;
  }

  async function ensureAifSettingsTable(client = pool) {
    await client.query(`CREATE TABLE IF NOT EXISTS aif_app_settings (
      key text PRIMARY KEY,
      value jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by text NULL
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS aif_app_settings_updated_idx ON aif_app_settings (updated_at DESC)`);
    await client.query(
      `INSERT INTO aif_app_settings (key, value, updated_by)
       VALUES ($1, $2::jsonb, 'system')
       ON CONFLICT (key) DO NOTHING`,
      [SALES_TVA_SETTING_KEY, JSON.stringify(DEFAULT_SALES_TVA_SETTINGS)]
    );
  }

  async function readSalesTvaSettings(client = pool) {
    await ensureAifSettingsTable(client);
    const r = await client.query(
      `SELECT value, updated_at, updated_by FROM aif_app_settings WHERE key=$1 LIMIT 1`,
      [SALES_TVA_SETTING_KEY]
    );
    const row = r.rows[0] || {};
    return {
      ...normalizeSalesTvaSettings(row.value || DEFAULT_SALES_TVA_SETTINGS),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      updated_by: row.updated_by || null,
      updatedBy: row.updated_by || null,
    };
  }

  async function saveSalesTvaSettings(client, input, actor = "system") {
    await ensureAifSettingsTable(client);
    const current = await readSalesTvaSettings(client);
    const settings = normalizeSalesTvaSettings(input || {}, current);
    const r = await client.query(
      `INSERT INTO aif_app_settings (key, value, updated_by, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3, now(), now())
       ON CONFLICT (key) DO UPDATE SET
         value=EXCLUDED.value,
         updated_by=EXCLUDED.updated_by,
         updated_at=now()
       RETURNING value, updated_at, updated_by`,
      [SALES_TVA_SETTING_KEY, JSON.stringify(settings), actor]
    );
    const row = r.rows[0] || {};
    return {
      ...normalizeSalesTvaSettings(row.value || settings),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      updated_by: row.updated_by || actor,
      updatedBy: row.updated_by || actor,
    };
  }

  function applySalesTvaSettingsToNormalized(normalized, settings) {
    if (!normalized || typeof normalized !== "object") return normalized;
    const cfg = normalizeSalesTvaSettings(settings || DEFAULT_SALES_TVA_SETTINGS);
    if (normalized.sellPriceCurrency === undefined || normalized.sellPriceCurrency === null || String(normalized.sellPriceCurrency).trim() === "") normalized.sellPriceCurrency = cfg.sellPriceCurrency || "RON";
    if (normalized.salePriceCurrency === undefined || normalized.salePriceCurrency === null || String(normalized.salePriceCurrency).trim() === "") normalized.salePriceCurrency = cfg.sellPriceCurrency || "RON";
    if (normalized.sellPriceIsRon === undefined && normalized.salePriceIsRon === undefined) normalized.sellPriceIsRon = String(normalized.sellPriceCurrency || "RON").toUpperCase() === "RON";
    if (normalized.sellPriceIncludesTva === undefined && normalized.salesPriceIncludesTva === undefined) normalized.sellPriceIncludesTva = cfg.sellPriceIncludesTva;
    if (normalized.salesPriceIncludesTva === undefined) normalized.salesPriceIncludesTva = Boolean(normalized.sellPriceIncludesTva);
    if (normalized.salesTvaRate === undefined || normalized.salesTvaRate === null || String(normalized.salesTvaRate).trim() === "") normalized.salesTvaRate = cfg.salesTvaRate;
    if (normalized.saleTvaRate === undefined || normalized.saleTvaRate === null || String(normalized.saleTvaRate).trim() === "") normalized.saleTvaRate = cfg.salesTvaRate;
    if ((normalized.sellPriceGrossRon === undefined || normalized.sellPriceGrossRon === null || String(normalized.sellPriceGrossRon).trim() === "") && normalized.sellPrice !== undefined && normalized.sellPrice !== null && String(normalized.sellPrice).trim() !== "") {
      normalized.sellPriceGrossRon = toMoney(normalized.sellPrice);
    }
    return normalized;
  }

  async function findByIdOrCode(client, table, idOrCode) {
    const v = text(idOrCode);
    if (!v) return null;
    const r = await client.query(
      `SELECT id, code, name, is_active FROM ${table} WHERE id::text = $1 OR code = $1 LIMIT 1`,
      [v]
    );
    return r.rows[0] || null;
  }

  async function findColorTypeByIdOrCode(client, idOrCode) {
    const v = text(idOrCode);
    if (!v) return null;
    const r = await client.query(
      `SELECT id, code, name_ro, is_active
       FROM aif_color_types
       WHERE id::text=$1 OR code=$1 OR lower(name_ro)=lower($1) OR lower(COALESCE(name_hu,''))=lower($1)
       LIMIT 1`,
      [v]
    );
    return r.rows[0] || null;
  }

  async function getDefaultLocationId(client) {
    const r = await client.query(`
      SELECT id
      FROM aif_locations
      WHERE code='main_warehouse' OR COALESCE(is_active,true)=true
      ORDER BY CASE WHEN code='main_warehouse' THEN 0 ELSE 1 END, name ASC
      LIMIT 1
    `);
    return r.rows[0]?.id || null;
  }

  function canonicalGender(v) {
    const code = normCode(v || "unisex") || "unisex";
    const map = {
      men: "men", man: "men", male: "men", masculin: "men", barbati: "men", barbat: "men", bărbat: "men", ferfi: "men", ffi: "men", herren: "men", homme: "men", uomo: "men",
      women: "women", woman: "women", female: "women", feminin: "women", femei: "women", femeie: "women", dama: "women", damă: "women", dame: "women", noi: "women", no: "women", ladies: "women", lady: "women", damen: "women", femme: "women",
      kids: "kids", kid: "kids", copii: "kids", copil: "kids", gyerek: "kids", junior: "kids", youth: "kids", child: "kids", children: "kids", copii_tineri: "kids",
      unisex: "unisex", universal: "unisex", mixt: "unisex", mixed: "unisex"
    };
    return map[code] || (['men', 'women', 'kids', 'unisex'].includes(code) ? code : 'unisex');
  }

  function normalizeRowInput(input, rowNo) {
    const src = input?.normalized && typeof input.normalized === "object" ? input.normalized : input || {};
    const raw = input?.raw && typeof input.raw === "object" ? input.raw : input || {};

    const rawProductCode = rawValueByHeaders(raw, ["CODPRODUS", "COD PRODUS", "COD_PRODUS", "Cod produs", "product code", "cod produs"]);
    const rawTitle = rawValueByHeaders(raw, ["ARTICOL", "ARTICLE", "DENUMIRE", "DENUMIRE PRODUS", "DENUMIRE_PRODUS", "NUME PRODUS", "PRODUCT NAME", "PRODUCT", "ITEM", "ITEM NAME", "NÉV", "NEV"]);
    const rawBrand = rawValueByHeaders(raw, ["BRAND", "MARCA", "MARCĂ", "MÁRKA", "MARKA", "BRAND NAME"]);
    const rawProductType = rawValueByHeaders(raw, ["RODESCR", "RO DESCR", "RO_DESCR", "TIP PRODUS", "PRODUCT TYPE", "TYPE", "MODEL TYPE"]);
    const rawCategory = rawValueByHeaders(raw, ["CATEGORIE", "CATEGORY", "CATEGORIA", "CATEGORIE PRODUS", "PRODUCT CATEGORY"]);
    const rawSubcategory = rawValueByHeaders(raw, ["SUBCATEGORIE", "SUB CATEGORY", "SUBCATEGORY", "ALCATEGORIE", "ALKATEGORIA", "ALKATEGÓRIA", "AL KATEGORIA", "AL-KATEGORIA"]);
    const rawDescription = rawValueByHeaders(raw, ["DESCRIERE", "DESCRIERE PRODUS", "DESCRIERE LUNGA", "DESCRIERE LUNGĂ", "LONG DESCRIPTION", "DESCRIPTION", "PRODUCT DESCRIPTION", "LEIRAS", "LEÍRÁS"]);
    const rawBarcode = rawValueByHeaders(raw, ["BARCODE", "BAR CODE", "BARKOD", "BÁRKÓD", "VONALKOD", "VONALKÓD", "EAN", "EAN13", "UPC", "COD BARE", "COD DE BARE", "CODBAR", "SKU"]);
    const rawGender = rawValueByHeaders(raw, ["GEN", "GENDER", "SEX", "DEPT", "DEPARTMENT", "DEPARTMENT NAME"]);
    const rawMaterial = rawValueByHeaders(raw, ["COMPOZITIE", "COMPOZIȚIE", "COMPOSITION", "MATERIAL", "MATERIAL COMPOSITION", "FABRIC"]);
    const rawSeason = rawValueByHeaders(raw, ["COLECTIE", "COLECȚIE", "COLLECTION", "SEZON", "SEASON"]);
    const rawSize = rawValueByHeaders(raw, ["MARIME", "MĂRIME", "MARIMI", "MĂRIMI", "MERET", "MÉRET", "SIZE", "TALLA", "GRÖSSE", "GROSIME"]);
    const rawQty = rawValueByHeaders(raw, ["CANTITATE", "CANT.", "CANT", "QTY", "QUANTITY", "DARAB", "DB", "BUC", "BUCĂȚI"]);
    const rawBuyPrice = rawValueByHeaders(raw, ["PRET DE ACHIZITIE", "PREȚ DE ACHIZIȚIE", "PRET ACHIZITIE", "PRET ACHIZIȚIE", "PURCHASE PRICE", "BUY PRICE", "VETELAR", "VÉTELÁR"]);
    const rawSellPrice = rawValueByHeaders(raw, ["PRET DE VINZARE", "PRET DE VANZARE", "PREȚ DE VÂNZARE", "PRET VANZARE", "PRET VINZARE", "SELL PRICE", "SALE PRICE", "ELADASI AR", "ELADÁSI ÁR"]);
    const rawImageUrl = rawValueByHeaders(raw, ["IMAGE", "IMAGE URL", "KÉP", "KEP", "KÉP URL", "KEP URL", "IMG", "PHOTO", "FOTO", "FOTO URL", "URL FOTO", "LINK FOTO", "POZA", "POZĂ", "POZA URL", "IMAGINE", "IMAGINE URL", "PICTURE", "PICTURE URL"]);
    const supplierProductCodeRaw = emptyToNull(
      src.supplierProductCode || src.supplier_product_code || src.productCode || src.product_code || src.code || input?.product_code || rawProductCode
    );
    const productSplit = splitBrandProductCode(supplierProductCodeRaw);
    const supplierProductCode = productSplit.fullCode || supplierProductCodeRaw;
    const supplierVariantCode = emptyToNull(
      src.supplierVariantCode || src.supplier_variant_code || src.variantCode || src.variant_code || input?.variant_code
    );
    const supplierColorCode = emptyToNull(src.supplierColorCode || src.supplier_color_code || src.colorCode || src.color_code || productSplit.colorCode);
    const supplierSize = emptyToNull(src.supplierSize || src.supplier_size || src.size || rawSize);

    const brandRaw = emptyToNull(src.brandCode || src.brand_code || src.brandId || src.brand_id || src.brandName || src.brand_name || src.brand || rawBrand);
    const categoryRaw = emptyToNull(src.categoryCode || src.category_code || src.categoryId || src.category_id || src.categoryName || src.category_name || rawCategory || src.productType || src.product_type || rawProductType);
    const subcategoryRaw = emptyToNull(src.subcategoryId || src.subcategory_id || src.subCategoryId || src.sub_category_id || src.subcategoryCode || src.subcategory_code || src.subCategoryCode || src.sub_category_code || src.subcategoryName || src.subcategory_name || src.subCategoryName || src.sub_category_name || rawSubcategory);

    const normalized = {
      brandId: emptyToNull(src.brandId || src.brand_id),
      brandCode: brandRaw ? normCode(brandRaw) : null,
      brandName: emptyToNull(src.brandName || src.brand_name || src.brand || rawBrand),
      categoryId: emptyToNull(src.categoryId || src.category_id),
      categoryCode: categoryRaw ? normCode(categoryRaw) : null,
      categoryName: emptyToNull(src.categoryName || src.category_name || src.category || rawCategory || src.productType || src.product_type || rawProductType),
        subcategoryId: emptyToNull(src.subcategoryId || src.subcategory_id || src.subCategoryId || src.sub_category_id),
        subcategoryCode: rawSubcategory || src.subcategoryCode || src.subcategory_code || src.subCategoryCode || src.sub_category_code ? normCode(src.subcategoryCode || src.subcategory_code || src.subCategoryCode || src.sub_category_code || rawSubcategory) : null,
        subcategoryName: emptyToNull(src.subcategoryName || src.subcategory_name || src.subCategoryName || src.sub_category_name || rawSubcategory),
      modelCode: emptyToNull(src.modelCode || src.model_code || productSplit.modelCode || supplierProductCode),
      titleRo: emptyToNull(src.titleRo || src.title_ro || src.nameRo || src.name_ro || src.productName || src.product_name || src.name || src.title || rawTitle),
      titleHu: emptyToNull(src.titleHu || src.title_hu),
      descriptionRo: emptyToNull(src.descriptionRo || src.description_ro || src.description || rawDescription || rawProductType),
      genderRaw: emptyToNull(src.gender || src.genderCode || src.gender_code || src.dept || src.department || src.departmentName || src.department_name || rawGender),
      gender: canonicalGender(src.gender || src.genderCode || src.gender_code || src.dept || src.department || src.departmentName || src.department_name || rawGender || "unisex"),
      productType: emptyToNull(src.productType || src.product_type || src.subCategoryName || src.sub_category_name || rawProductType),
      season: emptyToNull(src.season || src.collection || src.colectie || rawSeason),
      material: emptyToNull(src.material || src.composition || src.compositionRo || src.composition_ro || src.materialComposition || src.material_composition || src.fabric || src.bodyFabric || src.body_fabric || rawMaterial),
      colorCode: emptyToNull(src.colorCode || src.color_code || supplierColorCode || productSplit.colorCode),
      colorName: emptyToNull(src.colorName || src.color_name),
      colorHex: emptyToNull(src.colorHex || src.color_hex),
      size: emptyToNull(src.size || supplierSize || rawSize),
      barcode: emptyToNull(src.barcode || src.ean || src.ean13 || src.supplierBarcode || src.supplier_barcode || rawBarcode),
      snCod: snCodFromSource(src, raw),
      sn_cod: snCodFromSource(src, raw),
      customsTariffCode: customsTariffCodeFromSource(src, raw),
      customs_tariff_code: customsTariffCodeFromSource(src, raw),
      buyPrice: toMoney(src.buyPrice ?? src.buy_price ?? rawBuyPrice),
      sellPrice: toMoney(src.sellPrice ?? src.sell_price ?? rawSellPrice),
      sellPriceCurrency: emptyToNull(src.sellPriceCurrency || src.sell_price_currency || src.salePriceCurrency || src.sale_price_currency || "RON"),
      sellPriceIsRon: src.sellPriceIsRon !== undefined || src.sell_price_is_ron !== undefined || src.salePriceIsRon !== undefined
        ? Boolean(src.sellPriceIsRon ?? src.sell_price_is_ron ?? src.salePriceIsRon)
        : true,
      sellPriceIncludesTva: src.sellPriceIncludesTva !== undefined || src.sell_price_includes_tva !== undefined || src.salesPriceIncludesTva !== undefined
        ? Boolean(src.sellPriceIncludesTva ?? src.sell_price_includes_tva ?? src.salesPriceIncludesTva)
        : true,
      salesTvaRate: toMoney(src.salesTvaRate ?? src.sales_tva_rate ?? src.saleTvaRate ?? src.sale_tva_rate),
      sellPriceGrossRon: toMoney(src.sellPriceGrossRon ?? src.sell_price_gross_ron ?? src.sellPrice ?? src.sell_price ?? rawSellPrice),
      compareAtPrice: toMoney(src.compareAtPrice ?? src.compare_at_price),
      weightGrams: toInt(src.weightGrams ?? src.weight_grams),
      imageUrl: emptyToNull(src.imageUrl || src.image_url || rawImageUrl),
      supplierProductCode,
      supplierVariantCode,
      supplierColorCode,
      supplierSize,
      qty: toInt(src.qty ?? src.quantity ?? input?.qty ?? rawQty),
    };

    const errors = [];
    if (!normalized.titleRo) errors.push("product name/title missing");
    if (!normalized.size) errors.push("size missing");
    if (normalized.qty === null || normalized.qty <= 0) errors.push("qty must be > 0");
    if (!normalized.modelCode && !normalized.supplierProductCode) errors.push("model/product code missing");
    normalized.gender = canonicalGender(normalized.gender);

    return {
      rowNo: toInt(input?.rowNo ?? input?.row_no ?? rowNo) || rowNo,
      raw: input?.raw && typeof input.raw === "object" ? input.raw : input,
      normalized,
      status: errors.length ? "error" : "parsed",
      errors,
    };
  }

  async function ensureBrand(client, normalized, fallbackSupplierCode) {
    const candidates = [
      emptyToNull(normalized.brandId),
      emptyToNull(normalized.brandCode),
      emptyToNull(normalized.brandName),
    ].filter(Boolean);

    for (const candidate of candidates) {
      const r = await client.query(
        `SELECT id FROM aif_brands
         WHERE id::text=$1 OR code=$1 OR lower(name)=lower($1)
         LIMIT 1`,
        [candidate]
      );
      if (r.rowCount) return r.rows[0].id;
    }

    const rawCode = normCode(normalized.brandCode || normalized.brandName || fallbackSupplierCode);
    if (!rawCode) return null;
    const name = normalized.brandName || text(rawCode).replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

    const existing = await client.query(`SELECT id FROM aif_brands WHERE code=$1 LIMIT 1`, [rawCode]);
    if (existing.rowCount) return existing.rows[0].id;

    const r = await client.query(
      `INSERT INTO aif_brands (code, name)
       VALUES ($1, $2)
       RETURNING id`,
      [rawCode, name]
    );
    return r.rows[0].id;
  }

  async function findCategoryId(client, normalizedOrCode) {
    const raw = typeof normalizedOrCode === "object" && normalizedOrCode
      ? emptyToNull(
          normalizedOrCode.parentCategoryId || normalizedOrCode.parent_category_id ||
          normalizedOrCode.parentCategoryCode || normalizedOrCode.parent_category_code ||
          normalizedOrCode.parentCategoryName || normalizedOrCode.parent_category_name ||
          normalizedOrCode.categoryId || normalizedOrCode.category_id ||
          normalizedOrCode.categoryCode || normalizedOrCode.category_code ||
          normalizedOrCode.categoryName || normalizedOrCode.category_name ||
          normalizedOrCode.subCategoryId || normalizedOrCode.sub_category_id ||
          normalizedOrCode.subCategoryCode || normalizedOrCode.sub_category_code ||
          normalizedOrCode.subCategoryName || normalizedOrCode.sub_category_name
        )
      : emptyToNull(normalizedOrCode);
    if (!raw) return null;
    const code = normCode(raw);
    const r = await client.query(
      `SELECT id FROM aif_categories
       WHERE id::text=$1
          OR code=$1
          OR code=$2
          OR lower(name_ro)=lower($1)
          OR lower(COALESCE(name_hu,''))=lower($1)
          OR EXISTS (
            SELECT 1 FROM unnest(COALESCE(aliases, '{}'::text[])) a
            WHERE lower(a)=lower($1) OR lower(a)=lower($2)
          )
       ORDER BY is_active DESC, sort_order ASC
       LIMIT 1`,
      [raw, code]
    );
    return r.rows[0]?.id || null;
  }

  async function findSubcategoryId(client, normalized = {}) {
    const raw = emptyToNull(
      normalized.subcategoryId || normalized.subcategory_id || normalized.subCategoryId || normalized.sub_category_id ||
      normalized.subcategoryCode || normalized.subcategory_code || normalized.subCategoryCode || normalized.sub_category_code ||
      normalized.subcategoryName || normalized.subcategory_name || normalized.subCategoryName || normalized.sub_category_name
    );
    if (!raw) return null;
    const code = normCode(raw);
    const parentRaw = emptyToNull(normalized.categoryId || normalized.category_id || normalized.categoryCode || normalized.category_code || normalized.categoryName || normalized.category_name);
    const args = [raw, code];
    let parentFilter = "";
    if (parentRaw) {
      args.push(parentRaw, normCode(parentRaw));
      parentFilter = ` AND (parent_id IS NULL OR parent_id IN (SELECT id FROM aif_categories WHERE id::text=$3 OR code=$3 OR code=$4 OR lower(name_ro)=lower($3) OR lower(COALESCE(name_hu,''))=lower($3)))`;
    }
    const r = await client.query(
      `SELECT id FROM aif_categories
       WHERE (id::text=$1 OR code=$1 OR code=$2 OR lower(name_ro)=lower($1) OR lower(COALESCE(name_hu,''))=lower($1)
          OR EXISTS (SELECT 1 FROM unnest(COALESCE(aliases, '{}'::text[])) a WHERE lower(a)=lower($1) OR lower(a)=lower($2)))
         ${parentFilter}
       ORDER BY parent_id IS NULL ASC, is_active DESC, sort_order ASC
       LIMIT 1`,
      args
    );
    return r.rows[0]?.id || null;
  }

  function cleanModelLifecycleStatus(value, fallback = "active") {
    const raw = text(value || fallback).toLowerCase();
    return ["draft", "active", "archived"].includes(raw) ? raw : fallback;
  }

  function cleanVariantLifecycleStatus(value, fallback = "active") {
    const raw = text(value || fallback).toLowerCase();
    return ["draft", "active", "inactive", "archived"].includes(raw) ? raw : fallback;
  }

  async function upsertModel(client, { supplierCode, normalized, createStatus = "active", updateStatus = "active" }) {
    const safeNormalized = { ...normalized, gender: normalized.gender ? normCode(normalized.gender) : "unisex" };
    const brandId = await ensureBrand(client, safeNormalized, supplierCode);
    const categoryId = await findCategoryId(client, safeNormalized);
    const subcategoryId = await findSubcategoryId(client, safeNormalized);
    applyProductCodeSplit(safeNormalized);
    const baseModelCode = safeNormalized.modelCode || safeNormalized.supplierProductCode || safeNormalized.titleRo;
    const brandKey = normCode(safeNormalized.brandCode || safeNormalized.brandName || supplierCode || "aif");
    const modelCode = `${brandKey}:${normCode(baseModelCode)}`;
    const modelCreateStatus = cleanModelLifecycleStatus(safeNormalized.modelStatus || safeNormalized.model_status || createStatus, "active");
    const modelUpdateStatus = updateStatus === null || updateStatus === undefined
      ? null
      : cleanModelLifecycleStatus(safeNormalized.modelStatus || safeNormalized.model_status || updateStatus, "active");

    const existing = await client.query(
      `SELECT id FROM aif_product_models WHERE model_code=$1 LIMIT 1`,
      [modelCode]
    );

    if (existing.rowCount) {
      const id = existing.rows[0].id;
      await client.query(
        `UPDATE aif_product_models SET
           brand_id = COALESCE($2, brand_id),
           category_id = COALESCE($3, category_id),
           subcategory_id = COALESCE($13, subcategory_id),
           title_ro = $4,
           title_hu = COALESCE($5, title_hu),
           description_ro = COALESCE($6, description_ro),
           gender = $7,
           product_type = COALESCE($8, product_type),
           season = COALESCE($9, season),
           material = COALESCE($10, material),
           shopify_title = COALESCE($11, shopify_title),
           status = CASE
             WHEN status='archived' THEN COALESCE($12::text, 'draft')
             WHEN $12::text IS NULL THEN status
             ELSE $12::text
           END,
           updated_at = now()
         WHERE id=$1`,
        [
          id,
          brandId,
          categoryId,
          safeNormalized.titleRo,
          safeNormalized.titleHu,
          safeNormalized.descriptionRo,
          safeNormalized.gender,
          safeNormalized.productType,
          safeNormalized.season,
          safeNormalized.material,
          safeNormalized.titleRo,
          modelUpdateStatus,
          subcategoryId,
        ]
      );
      return id;
    }

    const r = await client.query(
      `INSERT INTO aif_product_models (
         brand_id, category_id, subcategory_id, model_code, title_ro, title_hu, description_ro,
         gender, product_type, season, material, shopify_title, status
       )
       VALUES ($1,$2,$13,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        brandId,
        categoryId,
        modelCode,
        safeNormalized.titleRo,
        safeNormalized.titleHu,
        safeNormalized.descriptionRo,
        safeNormalized.gender,
        safeNormalized.productType,
        safeNormalized.season,
        safeNormalized.material,
        safeNormalized.titleRo,
        modelCreateStatus,
        subcategoryId,
      ]
    );
    return r.rows[0].id;
  }

  async function upsertVariant(client, { modelId, normalized, createStatus = "active", updateStatus = "active" }) {
    const colorCode = normalized.colorCode || "";
    const colorName = normalized.colorName || "";
    const size = normalized.size;
    const barcode = emptyToNull(normalized.barcode);
    const snCod = emptyToNull(normalized.snCod ?? normalized.sn_cod);
    const variantAttributesJson = variantAttributesJsonFromNormalized(normalized);
    const variantCreateStatus = cleanVariantLifecycleStatus(normalized.variantStatus || normalized.variant_status || normalized.status || createStatus, "active");
    const variantUpdateStatus = updateStatus === null || updateStatus === undefined
      ? null
      : cleanVariantLifecycleStatus(normalized.variantStatus || normalized.variant_status || normalized.status || updateStatus, "active");

    const barcodeUsableForVariant = async (candidateBarcode, variantId = null) => {
      const candidate = emptyToNull(candidateBarcode);
      if (!candidate) return null;
      const conflict = await client.query(
        `SELECT id, model_id, color_code, color_name, size
         FROM aif_product_variants
         WHERE barcode=$1
           AND ($2::text = '' OR id::text <> $2)
         LIMIT 1`,
        [candidate, variantId ? String(variantId) : ""]
      );
      return conflict.rowCount ? null : candidate;
    };

    const updateVariantById = async (id) => {
      const safeBarcode = await barcodeUsableForVariant(barcode, id);
      await client.query(
        `UPDATE aif_product_variants SET
           barcode = COALESCE($2, barcode),
           sn_cod = COALESCE($11, sn_cod),
           color_code = NULLIF($3, ''),
           color_name = NULLIF($4, ''),
           color_hex = COALESCE($5, color_hex),
           buy_price = COALESCE($6, buy_price),
           sell_price = COALESCE($7, sell_price),
           compare_at_price = COALESCE($8, compare_at_price),
           weight_grams = COALESCE($9, weight_grams),
           image_url = COALESCE($10, image_url),
           attributes = COALESCE(attributes, '{}'::jsonb) || $12::jsonb,
           status = CASE
             WHEN status='archived' THEN COALESCE($13::text, 'active')
             WHEN $13::text IS NULL THEN status
             ELSE $13::text
           END,
           updated_at = now()
         WHERE id=$1`,
        [
          id,
          safeBarcode,
          colorCode,
          colorName,
          normalized.colorHex,
          normalized.buyPrice,
          normalized.sellPrice,
          normalized.compareAtPrice,
          normalized.weightGrams,
          normalized.imageUrl,
          snCod,
          variantAttributesJson,
          variantUpdateStatus,
        ]
      );
      return id;
    };

    // A ruházati importnál a variáns alapja: modell + szín + méret.
    // A vonalkód sok beszállítói Excelben modell-szintű vagy csonkolt kód lehet,
    // ezért nem olvaszthat össze külön méreteket.
    const existing = await client.query(
      `SELECT id
       FROM aif_product_variants
       WHERE model_id=$1
         AND lower(COALESCE(color_code,'')) = lower($2)
         AND lower(COALESCE(color_name,'')) = lower($3)
         AND lower(size) = lower($4)
       LIMIT 1`,
      [modelId, colorCode, colorName, size]
    );

    if (existing.rowCount) return updateVariantById(existing.rows[0].id);

    // Ha ugyanaz a vonalkód, modell, szín és méret, akkor frissíthetjük a meglévő sort.
    // Más méretre vagy színre nem állunk rá csak vonalkód alapján.
    if (barcode && size) {
      const byBarcodeSameSize = await client.query(
        `SELECT id
         FROM aif_product_variants
         WHERE model_id=$1
           AND barcode=$2
           AND lower(size)=lower($3)
           AND lower(COALESCE(color_code,'')) = lower($4)
           AND lower(COALESCE(color_name,'')) = lower($5)
         LIMIT 1`,
        [modelId, barcode, size, colorCode, colorName]
      );
      if (byBarcodeSameSize.rowCount) return updateVariantById(byBarcodeSameSize.rows[0].id);
    }

    const safeInsertBarcode = await barcodeUsableForVariant(barcode, null);

    try {
      const inserted = await client.query(
        `INSERT INTO aif_product_variants (
           model_id, barcode, color_code, color_name, color_hex, size,
           buy_price, sell_price, compare_at_price, weight_grams, image_url, sn_cod, attributes, status
         )
         VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)
         RETURNING id`,
        [
          modelId,
          safeInsertBarcode,
          colorCode,
          colorName,
          normalized.colorHex,
          size,
          normalized.buyPrice,
          normalized.sellPrice,
          normalized.compareAtPrice,
          normalized.weightGrams,
          normalized.imageUrl,
          snCod,
          variantAttributesJson,
          variantCreateStatus,
        ]
      );
      return inserted.rows[0].id;
    } catch (e) {
      if (e?.code === "23505" && barcode) {
        // Ha a barcode egyedi constraint miatt ütközik, akkor is létrehozzuk a méret szerinti variánst.
        // Az eredeti beszállítói kód a supplier-code táblában megmarad.
        const insertedWithoutBarcode = await client.query(
          `INSERT INTO aif_product_variants (
             model_id, barcode, color_code, color_name, color_hex, size,
             buy_price, sell_price, compare_at_price, weight_grams, image_url, sn_cod, attributes, status
           )
           VALUES ($1,NULL,NULLIF($2,''),NULLIF($3,''),$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
           RETURNING id`,
          [
            modelId,
            colorCode,
            colorName,
            normalized.colorHex,
            size,
            normalized.buyPrice,
            normalized.sellPrice,
            normalized.compareAtPrice,
            normalized.weightGrams,
            normalized.imageUrl,
            snCod,
            variantAttributesJson,
            variantCreateStatus,
          ]
        );
        return insertedWithoutBarcode.rows[0].id;
      }
      throw e;
    }
  }

  async function upsertSupplierCode(client, { variantId, supplierId, normalized }) {
    const keys = [
      normalized.supplierProductCode || "",
      normalized.supplierVariantCode || "",
      normalized.supplierColorCode || "",
      normalized.supplierSize || "",
    ];

    const existing = await client.query(
      `SELECT id FROM aif_variant_supplier_codes
       WHERE supplier_id=$1
         AND COALESCE(supplier_product_code,'')=$2
         AND COALESCE(supplier_variant_code,'')=$3
         AND COALESCE(supplier_color_code,'')=$4
         AND COALESCE(supplier_size,'')=$5
       LIMIT 1`,
      [supplierId, ...keys]
    );

    if (existing.rowCount) {
      await client.query(
        `UPDATE aif_variant_supplier_codes SET
           variant_id=$2,
           supplier_color_name=$3,
           supplier_barcode=$4,
           supplier_sku=$5,
           raw=$6::jsonb,
           is_active=true,
           updated_at=now()
         WHERE id=$1`,
        [
          existing.rows[0].id,
          variantId,
          normalized.colorName,
          normalized.barcode,
          normalized.supplierVariantCode || null,
          JSON.stringify(normalized),
        ]
      );
      return;
    }

    await client.query(
      `INSERT INTO aif_variant_supplier_codes (
         variant_id, supplier_id, supplier_product_code, supplier_variant_code,
         supplier_color_code, supplier_color_name, supplier_size,
         supplier_barcode, supplier_sku, raw
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [
        variantId,
        supplierId,
        normalized.supplierProductCode,
        normalized.supplierVariantCode,
        normalized.supplierColorCode,
        normalized.colorName,
        normalized.supplierSize,
        normalized.barcode,
        normalized.supplierVariantCode || null,
        JSON.stringify(normalized),
      ]
    );
  }

  async function addStock(client, { locationId, variantId, qty, actor, sourceId, rowId, raw }) {
    const current = await client.query(
      `SELECT qty, reserved_qty FROM aif_stock WHERE location_id=$1 AND variant_id=$2 FOR UPDATE`,
      [locationId, variantId]
    );
    const before = current.rowCount ? Number(current.rows[0].qty || 0) : 0;
    const after = before + qty;
    if (after < 0) throw new Error("stock cannot go negative");

    await client.query(
      `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
       VALUES ($1,$2,$3,0,now())
       ON CONFLICT (location_id, variant_id)
       DO UPDATE SET qty=$3, updated_at=now()`,
      [locationId, variantId, after]
    );

    await insertStockMovementSafe(client, {
      movementType: "incoming",
      sourceType: "import_batch",
      sourcePrefix: "import_batch",
      fallbackSourceType: "manual_stock_edit",
      sourceId: sourceId ? String(sourceId) : null,
      locationId,
      variantId,
      qtyDelta: qty,
      qtyBefore: before,
      qtyAfter: after,
      actor,
      raw: {
        rowId,
        raw,
        importBatchId: sourceId ? String(sourceId) : null,
        reason: "import_batch_commit",
      },
    });
  }

  function periodWhere(req, startIndex = 1) {
    const from = emptyToNull(req.query.from);
    const to = emptyToNull(req.query.to);
    const args = [];
    const parts = [];
    let i = startIndex;
    if (from) {
      args.push(from);
      parts.push(`COALESCE(b.committed_at, b.created_at) >= $${i++}::date`);
    }
    if (to) {
      args.push(to);
      parts.push(`COALESCE(b.committed_at, b.created_at) < ($${i++}::date + interval '1 day')`);
    }
    return { args, parts, nextIndex: i };
  }

  async function locationUsage(client, locationId) {
    const r = await client.query(
      `SELECT
         (SELECT count(*)::int FROM aif_import_batches WHERE target_location_id=$1) AS import_batches,
         (SELECT count(*)::int FROM aif_stock WHERE location_id=$1) AS stock_rows,
         (SELECT count(*)::int FROM aif_stock_movements WHERE location_id=$1) AS stock_movements`,
      [locationId]
    );
    return r.rows[0] || { import_batches: 0, stock_rows: 0, stock_movements: 0 };
  }

  async function locationTypeUsage(client, typeCode) {
    const r = await client.query(
      `SELECT count(*)::int AS locations
       FROM aif_locations
       WHERE location_type=$1`,
      [typeCode]
    );
    return r.rows[0] || { locations: 0 };
  }

  async function activeLocationTypeExists(client, typeCode) {
    const r = await client.query(
      `SELECT 1 FROM aif_location_types WHERE code=$1 AND is_active=true LIMIT 1`,
      [typeCode]
    );
    return r.rowCount > 0;
  }

  async function supplierUsage(client, supplierId) {
    const r = await client.query(
      `SELECT
         (SELECT count(*)::int FROM aif_import_batches WHERE supplier_id=$1) AS import_batches,
         (SELECT count(*)::int FROM aif_variant_supplier_codes WHERE supplier_id=$1) AS supplier_codes,
         (SELECT count(*)::int FROM aif_supplier_import_profiles WHERE supplier_id=$1) AS profiles`,
      [supplierId]
    );
    return r.rows[0] || { import_batches: 0, supplier_codes: 0, profiles: 0 };
  }


  async function categoryUsage(client, categoryId) {
    const r = await client.query(
      `SELECT
         (SELECT count(*)::int FROM aif_product_models WHERE category_id=$1 OR subcategory_id=$1) AS product_models,
         (SELECT count(*)::int FROM aif_categories WHERE parent_id=$1) AS child_categories`,
      [categoryId]
    );
    return r.rows[0] || { product_models: 0, child_categories: 0 };
  }

  async function genderTypeUsage(client, code) {
    const r = await client.query(
      `SELECT count(*)::int AS product_models
       FROM aif_product_models
       WHERE gender=$1`,
      [code]
    );
    return r.rows[0] || { product_models: 0 };
  }

  async function activeGenderTypeExists(client, code) {
    const r = await client.query(
      `SELECT 1 FROM aif_gender_types WHERE code=$1 AND is_active=true LIMIT 1`,
      [code]
    );
    return r.rowCount > 0;
  }

  function splitAliasesFromInput(value) {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map((x) => text(x)).filter(Boolean)));
    }
    return Array.from(new Set(text(value).split(/[\n,;]+/).map((x) => text(x)).filter(Boolean)));
  }

  function colorAliasesFromInput(value) {
    return splitAliasesFromInput(value);
  }

  function categoryAliasesFromInput(value) {
    return splitAliasesFromInput(value);
  }

  function genderAliasesFromInput(value) {
    return splitAliasesFromInput(value);
  }

  function materialAliasesFromInput(value) {
    return splitAliasesFromInput(value);
  }

  async function brandSizeCodeUsage(client, id) {
    await ensureAifSizeTables(client);
    const r = await client.query(
      `SELECT count(*)::int AS product_variants
       FROM aif_brand_size_codes bsc
       JOIN aif_size_types st ON st.id=bsc.size_type_id
       JOIN aif_brands b ON b.id=bsc.brand_id
       JOIN aif_product_models m ON m.brand_id=b.id
       JOIN aif_product_variants v ON v.model_id=m.id
       WHERE bsc.id::text=$1
         AND lower(COALESCE(v.size,'')) IN (lower(st.code), lower(st.name))`,
      [text(id)]
    );
    return r.rows[0] || { product_variants: 0 };
  }

  async function normalizeGenderCode(client, value) {
    const raw = emptyToNull(value);
    if (!raw) return "unisex";
    const rawKey = normCode(raw);
    try {
      const r = await client.query(
        `SELECT code, name, aliases
         FROM aif_gender_types
         WHERE is_active=true
         ORDER BY sort_order ASC, name ASC`
      );
      const found = r.rows.find((g) => {
        const aliases = Array.isArray(g.aliases) ? g.aliases : [];
        return [g.code, g.name, ...aliases].filter(Boolean).some((x) => normCode(x) === rawKey);
      });
      if (found?.code) return found.code;
    } catch (e) {
      if (e?.code !== "42P01" && e?.code !== "42703") console.error("AIF gender normalize warning", e);
    }
    return canonicalGender(raw);
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async function normalizeMaterialText(client, value) {
    const raw = emptyToNull(value);
    if (!raw) return null;
    try {
      const r = await client.query(
        `SELECT code, name_ro, name_hu, name_en, name_de, aliases
         FROM aif_material_types
         WHERE is_active=true
         ORDER BY sort_order ASC, length(name_ro) DESC`
      );
      let out = raw
        .replace(/\bBODY\s+FABRIC\b\s*:?/gi, "Material exterior:")
        .replace(/\bMAIN\s+FABRIC\b\s*:?/gi, "Material principal:")
        .replace(/\bADDITIONAL\s+FABRIC\b\s*:?/gi, "Material suplimentar:")
        .replace(/\bLINING\b\s*:?/gi, "Căptușeală:")
        .replace(/\bSHELL\b\s*:?/gi, "Exterior:");
      const replacements = [];
      for (const item of r.rows) {
        const aliases = Array.isArray(item.aliases) ? item.aliases : [];
        for (const v of [item.code, item.name_ro, item.name_hu, item.name_en, item.name_de, ...aliases]) {
          const candidate = text(v);
          if (!candidate || normCode(candidate) === normCode(item.name_ro)) continue;
          replacements.push({ from: candidate, to: item.name_ro });
        }
      }
      replacements.sort((a, b) => b.from.length - a.from.length);
      for (const rep of replacements) {
        const pattern = escapeRegex(rep.from).replace(/\\s+/g, "\\s+");
        out = out.replace(new RegExp(`\\b${pattern}\\b`, "gi"), rep.to);
      }
      return out;
    } catch (e) {
      if (e?.code !== "42P01" && e?.code !== "42703") console.error("AIF material normalize warning", e);
      return raw;
    }
  }

  async function findBrandIdForNormalized(client, normalized) {
    const candidates = [
      emptyToNull(normalized?.brandId),
      emptyToNull(normalized?.brandCode),
      emptyToNull(normalized?.brandName),
    ].filter(Boolean);
    for (const candidate of candidates) {
      const r = await client.query(
        `SELECT id FROM aif_brands
         WHERE id::text=$1 OR code=$1 OR lower(name)=lower($1)
         LIMIT 1`,
        [candidate]
      );
      if (r.rowCount) return r.rows[0].id;
    }
    return null;
  }

  async function applyBrandColorCodeMapping(client, normalized) {
    if (!normalized || typeof normalized !== "object") return false;
    const colorCode = emptyToNull(normalized.colorCode || normalized.supplierColorCode);
    if (!colorCode) return false;
    const brandId = await findBrandIdForNormalized(client, normalized);
    if (!brandId) return false;
    const r = await client.query(
      `SELECT bcc.id, c.code AS color_type_code, c.name_ro, c.name_hu, c.name_en, c.name_de, c.hex
       FROM aif_brand_color_codes bcc
       JOIN aif_color_types c ON c.id=bcc.color_type_id
       WHERE bcc.brand_id=$1
         AND bcc.is_active=true
         AND c.is_active=true
         AND lower(bcc.color_code)=lower($2)
       LIMIT 1`,
      [brandId, colorCode]
    );
    const found = r.rows[0];
    if (!found) return false;
    normalized.colorName = found.name_ro;
    normalized.colorCode = colorCode;
    normalized.supplierColorCode = normalized.supplierColorCode || colorCode;
    normalized.colorHex = found.hex || normalized.colorHex || null;
    normalized.brandColorCodeId = found.id;
    normalized.colorTypeCode = found.color_type_code;
    return true;
  }

  async function enrichNormalizedRow(client, nr) {
    if (nr?.normalized) {
      applyProductCodeSplit(nr.normalized);
      const brandColorMapped = await applyBrandColorCodeMapping(client, nr.normalized);
      if (!brandColorMapped && nr.normalized.colorName) nr.normalized.colorName = await normalizeColorName(client, nr.normalized.colorName);
      nr.normalized.gender = await normalizeGenderCode(client, nr.normalized.genderRaw || nr.normalized.gender);
      const brandSizeMapped = await applyBrandSizeCodeMapping(client, nr.normalized);
      if (!brandSizeMapped && nr.normalized.size) nr.normalized.size = await normalizeSizeValue(client, nr.normalized.size);
      if (nr.normalized.material) nr.normalized.material = await normalizeMaterialText(client, nr.normalized.material);
    }
    return nr;
  }

  async function normalizeColorName(client, value) {
    const raw = emptyToNull(value);
    if (!raw) return null;
    const rawKey = normCode(raw);
    if (!rawKey) return raw;

    const r = await client.query(
      `SELECT id, code, name_ro, name_hu, name_en, name_de, aliases
       FROM aif_color_types
       WHERE is_active=true
       ORDER BY sort_order ASC, name_ro ASC`
    );

    const direct = r.rows.find((color) => {
      const aliases = Array.isArray(color.aliases) ? color.aliases : [];
      const values = [color.code, color.name_ro, color.name_hu, color.name_en, color.name_de, ...aliases];
      return values.some((x) => normCode(x) === rawKey);
    });
    if (direct) return direct.name_ro;

    const parts = rawKey.split(/_+/).filter(Boolean);
    if (parts.length > 1) {
      const translated = [];
      for (const part of parts) {
        const match = r.rows.find((color) => {
          const aliases = Array.isArray(color.aliases) ? color.aliases : [];
          const values = [color.code, color.name_ro, color.name_hu, color.name_en, color.name_de, ...aliases];
          return values.some((x) => normCode(x) === part);
        });
        if (!match) return raw;
        translated.push(match.name_ro);
      }
      return Array.from(new Set(translated)).join(" / ");
    }

    return raw;
  }

  async function colorUsage(client, colorIdOrCode) {
    const c = await client.query(
      `SELECT id, code, name_ro FROM aif_color_types WHERE id::text=$1 OR code=$1 LIMIT 1`,
      [text(colorIdOrCode)]
    );
    if (!c.rowCount) return { product_variants: 0 };
    const r = await client.query(
      `SELECT count(*)::int AS product_variants
       FROM aif_product_variants
       WHERE lower(COALESCE(color_name,''))=lower($1)`,
      [c.rows[0].name_ro]
    );
    return r.rows[0] || { product_variants: 0 };
  }


  function currencyCode(v) {
    return text(v).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  }

  function tvaMode(v) {
    const raw = text(v);
    if (!raw) return null;
    const mode = normCode(raw);
    if (["without_tva", "with_tva", "no_tva"].includes(mode)) return mode;
    return null;
  }

  async function currencyUsage(client, code) {
    const r = await client.query(
      `SELECT
         (SELECT count(*)::int FROM aif_receptions WHERE currency_code=$1) AS receptions,
         (SELECT count(*)::int FROM aif_exchange_rates WHERE currency_code=$1) AS exchange_rates,
         (SELECT count(*)::int FROM aif_import_batches WHERE currency_code=$1) AS import_batches`,
      [code]
    );
    return r.rows[0] || { receptions: 0, exchange_rates: 0, import_batches: 0 };
  }

  function receptionFromBody(body) {
    const src = body?.reception && typeof body.reception === "object" ? body.reception : {};
    const code = currencyCode(src.currencyCode || src.currency_code || body.currencyCode || body.currency_code);
    const exchangeRate = toMoney(src.exchangeRateToRon ?? src.exchange_rate_to_ron ?? body.exchangeRateToRon ?? body.exchange_rate_to_ron);
    const mode = tvaMode(src.tvaMode || src.tva_mode || body.tvaMode || body.tva_mode);
    return {
      invoiceNumber: emptyToNull(src.invoiceNumber || src.invoice_number || body.invoiceNumber || body.invoice_number),
      invoiceDate: emptyToNull(src.invoiceDate || src.invoice_date || body.invoiceDate || body.invoice_date),
      receptionDate: emptyToNull(src.receptionDate || src.reception_date || body.receptionDate || body.reception_date),
      currencyCode: code || null,
      exchangeRateToRon: exchangeRate && exchangeRate > 0 ? exchangeRate : null,
      sellPriceCurrencyMode: cleanSellPriceCurrencyMode(
        src.sellPriceCurrencyMode ?? src.sell_price_currency_mode ?? body.sellPriceCurrencyMode ?? body.sell_price_currency_mode,
        code === "RON" ? "ron" : "invoice"
      ),
      tvaMode: mode,
      tvaRate: toMoney(src.tvaRate ?? src.tva_rate ?? body.tvaRate ?? body.tva_rate),
      shippingCost: toMoney(src.shippingCost ?? src.shipping_cost ?? body.shippingCost ?? body.shipping_cost) ?? 0,
      goodsValue: toMoney(src.goodsValue ?? src.goods_value ?? body.goodsValue ?? body.goods_value),
      invoiceNet: toMoney(src.invoiceNet ?? src.invoice_net ?? body.invoiceNet ?? body.invoice_net),
      invoiceVat: toMoney(src.invoiceVat ?? src.invoice_vat ?? body.invoiceVat ?? body.invoice_vat),
      invoiceGross: toMoney(src.invoiceGross ?? src.invoice_gross ?? body.invoiceGross ?? body.invoice_gross),
      lineCount: toInt(src.lineCount ?? src.line_count ?? body.lineCount ?? body.line_count) || 0,
      totalQty: toInt(src.totalQty ?? src.total_qty ?? body.totalQty ?? body.total_qty) || 0,
      note: emptyToNull(src.note || body.note),
      rawMeta: src && typeof src === "object" ? src : {},
    };
  }

  function isRonCurrencyCode(value) {
    return currencyCode(value) === "RON";
  }

  function effectiveReceptionExchangeRateToRon(reception) {
    const code = currencyCode(reception?.currencyCode || reception?.currency_code);
    if (code === "RON") return 1;
    const rate = toMoney(reception?.exchangeRateToRon ?? reception?.exchange_rate_to_ron);
    return rate && rate > 0 ? rate : null;
  }

  function isSellPriceRon(normalized) {
    const n = normalized && typeof normalized === "object" ? normalized : {};
    const currency = currencyCode(n.sellPriceCurrency || n.salePriceCurrency || n.priceCurrency || "");
    return currency === "RON" || String(n.sellPriceIsRon ?? n.salePriceIsRon ?? "").toLowerCase() === "true";
  }

  function calcSellPriceRon(normalized, exchangeRate) {
    const n = normalized && typeof normalized === "object" ? normalized : {};
    if (n.sellPrice === null || n.sellPrice === undefined || String(n.sellPrice).trim() === "") return null;
    const value = Number(String(n.sellPrice).replace(",", "."));
    if (!Number.isFinite(value)) return null;
    if (isSellPriceRon(n)) return value;
    const rate = Number(exchangeRate || 1);
    return Number.isFinite(rate) ? value * rate : value;
  }

  function sellPriceRonSql(priceExpr, normalizedExpr, rateExpr) {
    return `CASE
      WHEN ${priceExpr} IS NULL THEN NULL
      WHEN lower(COALESCE(${normalizedExpr}->>'sellPriceCurrency', ${normalizedExpr}->>'salePriceCurrency', '')) = 'ron'
        OR lower(COALESCE(${normalizedExpr}->>'sellPriceIsRon', ${normalizedExpr}->>'salePriceIsRon', 'false')) = 'true'
      THEN round(${priceExpr}::numeric, 2)
      ELSE round(${priceExpr} * ${rateExpr}::numeric, 2)
    END`;
  }

  router.get("/settings/sales-tva", requireAuthed, async (_req, res) => {
    try {
      const settings = await readSalesTvaSettings(pool);
      res.json({ ok: true, settings, item: settings });
    } catch (e) {
      console.error("AIF sales TVA settings load failed", e);
      res.status(500).json({ error: "Az eladási TVA beállítás betöltése nem sikerült." });
    }
  });

  router.get("/settings/incoming-sales-tva", requireAuthed, async (_req, res) => {
    try {
      const settings = await readSalesTvaSettings(pool);
      res.json({ ok: true, settings, item: settings });
    } catch (e) {
      console.error("AIF incoming sales TVA settings load failed", e);
      res.status(500).json({ error: "Az eladási TVA beállítás betöltése nem sikerült." });
    }
  });

  async function handleSalesTvaSettingsSave(req, res) {
    try {
      const source = req.body?.settings && typeof req.body.settings === "object" ? req.body.settings : req.body || {};
      const settings = await saveSalesTvaSettings(pool, source, actorFrom(req));
      res.json({ ok: true, settings, item: settings });
    } catch (e) {
      console.error("AIF sales TVA settings save failed", e);
      res.status(500).json({ error: "Az eladási TVA beállítás mentése nem sikerült." });
    }
  }

  router.put("/settings/sales-tva", requireAuthed, handleSalesTvaSettingsSave);
  router.patch("/settings/sales-tva", requireAuthed, handleSalesTvaSettingsSave);
  router.post("/settings/sales-tva", requireAuthed, handleSalesTvaSettingsSave);
  router.put("/settings/incoming-sales-tva", requireAuthed, handleSalesTvaSettingsSave);
  router.patch("/settings/incoming-sales-tva", requireAuthed, handleSalesTvaSettingsSave);
  router.post("/settings/incoming-sales-tva", requireAuthed, handleSalesTvaSettingsSave);

  router.get("/suppliers", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const withStats = ["1", "true", "yes"].includes(text(req.query.withStats || req.query.with_stats).toLowerCase());

    if (!withStats) {
      const r = await pool.query(
        `SELECT id, code, name, is_active, notes, created_at, updated_at
         FROM aif_suppliers
         ${includeInactive ? "" : "WHERE is_active=true"}
         ORDER BY is_active DESC, name ASC`
      );
      return res.json({ items: r.rows });
    }

    const r = await pool.query(
      `SELECT
         s.id, s.code, s.name, s.is_active, s.notes, s.created_at, s.updated_at,
         count(DISTINCT b.id)::int AS import_batches,
         count(rw.id)::int AS imported_rows,
         COALESCE(sum(CASE WHEN b.status='committed' THEN COALESCE(rw.qty,0) ELSE 0 END),0)::int AS purchased_qty,
         COALESCE(sum(CASE WHEN b.status='committed' THEN COALESCE(rw.qty,0) * COALESCE(rw.buy_price_ron, rw.buy_price,0) ELSE 0 END),0)::numeric(14,2) AS purchased_value,
         max(CASE WHEN b.status='committed' THEN COALESCE(b.committed_at, b.created_at) END) AS last_purchase_at
       FROM aif_suppliers s
       LEFT JOIN aif_import_batches b ON b.supplier_id=s.id
       LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id AND rw.status <> 'ignored'
       ${includeInactive ? "" : "WHERE s.is_active=true"}
       GROUP BY s.id
       ORDER BY s.is_active DESC, s.name ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/suppliers", requireAdminOrSecret, async (req, res) => {
    const body = req.body || {};
    const name = text(body.name);
    const code = normCode(body.code || name);
    const notes = emptyToNull(body.notes);
    if (!name) return res.status(400).json({ error: "supplier name required" });
    if (!code) return res.status(400).json({ error: "supplier code required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `INSERT INTO aif_suppliers (code, name, notes, is_active)
         VALUES ($1,$2,$3,true)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name,
           notes=COALESCE(EXCLUDED.notes, aif_suppliers.notes),
           is_active=true,
           updated_at=now()
         RETURNING id, code, name, is_active, notes, created_at, updated_at`,
        [code, name, notes]
      );
      await client.query(
        `INSERT INTO aif_supplier_import_profiles (supplier_id, name, source_format, version)
         VALUES ($1, 'Default XLS', 'xls', 1)
         ON CONFLICT (supplier_id, name, version) DO NOTHING`,
        [r.rows[0].id]
      );
      await client.query("COMMIT");
      res.json({ item: r.rows[0] });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF create supplier failed", e);
      res.status(500).json({ error: "failed to save supplier" });
    } finally {
      client.release();
    }
  });

  router.patch("/suppliers/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;

    if (body.name !== undefined) {
      const name = text(body.name);
      if (!name) return res.status(400).json({ error: "supplier name required" });
      sets.push(`name=$${i++}`);
      args.push(name);
    }
    if (body.code !== undefined) {
      const code = normCode(body.code);
      if (!code) return res.status(400).json({ error: "supplier code required" });
      sets.push(`code=$${i++}`);
      args.push(code);
    }
    if (body.notes !== undefined) {
      sets.push(`notes=$${i++}`);
      args.push(emptyToNull(body.notes));
    }
    if (body.is_active !== undefined || body.isActive !== undefined) {
      sets.push(`is_active=$${i++}`);
      args.push(Boolean(body.is_active ?? body.isActive));
    }

    if (!sets.length) return res.json({ ok: true });
    args.push(id);

    try {
      const r = await pool.query(
        `UPDATE aif_suppliers
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i} OR code=$${i}
         RETURNING id, code, name, is_active, notes, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "supplier not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update supplier failed", e);
      res.status(500).json({ error: "failed to update supplier" });
    }
  });

  router.delete("/suppliers/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const supplier = await client.query(
        `SELECT id, code, name FROM aif_suppliers WHERE id::text=$1 OR code=$1 FOR UPDATE`,
        [id]
      );
      if (!supplier.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "supplier not found" });
      }
      const usage = await supplierUsage(client, supplier.rows[0].id);

      if (Number(usage.import_batches || 0) > 0 || Number(usage.supplier_codes || 0) > 0) {
        await client.query(`UPDATE aif_suppliers SET is_active=false, updated_at=now() WHERE id=$1`, [supplier.rows[0].id]);
        await client.query(`UPDATE aif_supplier_import_profiles SET is_active=false, updated_at=now() WHERE supplier_id=$1`, [supplier.rows[0].id]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }

      await client.query(`DELETE FROM aif_suppliers WHERE id=$1`, [supplier.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete supplier failed", e);
      res.status(500).json({ error: "failed to delete supplier" });
    } finally {
      client.release();
    }
  });

  router.get("/suppliers/report", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const p = periodWhere(req, 1);
    const whereBatch = [`b.status='committed'`, ...p.parts];
    const args = [...p.args];

    const r = await pool.query(
      `SELECT
         s.id, s.code, s.name, s.is_active,
         count(DISTINCT b.id)::int AS purchase_batches,
         count(rw.id)::int AS purchase_rows,
         COALESCE(sum(COALESCE(rw.qty,0)),0)::int AS purchase_qty,
         COALESCE(sum(COALESCE(rw.qty,0) * COALESCE(rw.buy_price_ron, rw.buy_price,0)),0)::numeric(14,2) AS purchase_value,
         count(rw.id) FILTER (WHERE rw.buy_price IS NULL)::int AS rows_without_buy_price,
         max(COALESCE(b.committed_at, b.created_at)) AS last_purchase_at
       FROM aif_suppliers s
       LEFT JOIN aif_import_batches b ON b.supplier_id=s.id AND ${whereBatch.join(" AND ")}
       LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id AND rw.status <> 'ignored'
       ${includeInactive ? "" : "WHERE s.is_active=true"}
       GROUP BY s.id
       ORDER BY purchase_value DESC, purchase_qty DESC, s.name ASC`,
      args
    );

    const totals = r.rows.reduce((acc, x) => {
      acc.purchase_batches += Number(x.purchase_batches || 0);
      acc.purchase_rows += Number(x.purchase_rows || 0);
      acc.purchase_qty += Number(x.purchase_qty || 0);
      acc.purchase_value += Number(x.purchase_value || 0);
      acc.rows_without_buy_price += Number(x.rows_without_buy_price || 0);
      return acc;
    }, { purchase_batches: 0, purchase_rows: 0, purchase_qty: 0, purchase_value: 0, rows_without_buy_price: 0 });

    res.json({ items: r.rows, totals });
  });

  router.get("/supplier-brands", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const supplier = text(req.query.supplier || req.query.supplierId || req.query.supplier_id);
    const args = [];
    const where = [];
    if (!includeInactive) where.push(`sb.is_active=true AND s.is_active=true AND b.is_active=true`);
    if (supplier) {
      args.push(supplier);
      where.push(`(s.id::text=$${args.length} OR s.code=$${args.length})`);
    }
    const r = await pool.query(
      `SELECT sb.id, sb.supplier_id, sb.brand_id, sb.is_preferred, sb.is_active, sb.notes, sb.created_at, sb.updated_at,
              s.name AS supplier_name, b.name AS brand_name
       FROM aif_supplier_brands sb
       JOIN aif_suppliers s ON s.id=sb.supplier_id
       JOIN aif_brands b ON b.id=sb.brand_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY s.name ASC, sb.is_preferred DESC, b.name ASC`,
      args
    );
    res.json({ items: r.rows });
  });

  router.post("/supplier-brands", requireAdminOrSecret, async (req, res) => {
    const body = req.body || {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const supplier = await findByIdOrCode(client, "aif_suppliers", body.supplierId || body.supplier_id || body.supplier);
      const brand = await findByIdOrCode(client, "aif_brands", body.brandId || body.brand_id || body.brand);
      if (!supplier) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "supplier required" });
      }
      if (!brand) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "brand required" });
      }
      const preferred = Boolean(body.isPreferred ?? body.is_preferred);
      if (preferred) {
        await client.query(`UPDATE aif_supplier_brands SET is_preferred=false, updated_at=now() WHERE supplier_id=$1`, [supplier.id]);
      }
      const r = await client.query(
        `INSERT INTO aif_supplier_brands (supplier_id, brand_id, is_preferred, is_active, notes)
         VALUES ($1,$2,$3,true,$4)
         ON CONFLICT (supplier_id, brand_id) DO UPDATE SET
           is_active=true,
           is_preferred=EXCLUDED.is_preferred,
           notes=COALESCE(EXCLUDED.notes, aif_supplier_brands.notes),
           updated_at=now()
         RETURNING id, supplier_id, brand_id, is_preferred, is_active, notes, created_at, updated_at`,
        [supplier.id, brand.id, preferred, emptyToNull(body.notes)]
      );
      await client.query("COMMIT");
      res.json({ item: r.rows[0] });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF create supplier brand link failed", e);
      res.status(500).json({ error: "failed to save supplier brand link" });
    } finally {
      client.release();
    }
  });

  router.patch("/supplier-brands/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(`SELECT * FROM aif_supplier_brands WHERE id::text=$1 FOR UPDATE`, [id]);
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "supplier brand link not found" });
      }
      const sets = [];
      const args = [];
      let i = 1;
      if (body.is_preferred !== undefined || body.isPreferred !== undefined) {
        const preferred = Boolean(body.is_preferred ?? body.isPreferred);
        if (preferred) {
          await client.query(
            `UPDATE aif_supplier_brands SET is_preferred=false, updated_at=now() WHERE supplier_id=$1 AND id <> $2`,
            [current.rows[0].supplier_id, current.rows[0].id]
          );
        }
        sets.push(`is_preferred=$${i++}`);
        args.push(preferred);
      }
      if (body.is_active !== undefined || body.isActive !== undefined) {
        sets.push(`is_active=$${i++}`);
        args.push(Boolean(body.is_active ?? body.isActive));
      }
      if (body.notes !== undefined) {
        sets.push(`notes=$${i++}`);
        args.push(emptyToNull(body.notes));
      }
      if (!sets.length) {
        await client.query("COMMIT");
        return res.json({ ok: true });
      }
      args.push(id);
      const r = await client.query(
        `UPDATE aif_supplier_brands
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i}
         RETURNING id, supplier_id, brand_id, is_preferred, is_active, notes, created_at, updated_at`,
        args
      );
      await client.query("COMMIT");
      res.json({ item: r.rows[0] });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF update supplier brand link failed", e);
      res.status(500).json({ error: "failed to update supplier brand link" });
    } finally {
      client.release();
    }
  });

  router.delete("/supplier-brands/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    try {
      const r = await pool.query(`DELETE FROM aif_supplier_brands WHERE id::text=$1`, [id]);
      if (!r.rowCount) return res.status(404).json({ error: "supplier brand link not found" });
      res.json({ ok: true, mode: "deleted" });
    } catch (e) {
      console.error("AIF delete supplier brand link failed", e);
      res.status(500).json({ error: "failed to delete supplier brand link" });
    }
  });



  router.get("/currencies", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT code, name, symbol, sort_order, is_active, created_at, updated_at
       FROM aif_currencies
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, sort_order ASC, code ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/currencies", requireAdminOrSecret, async (req, res) => {
    const body = req.body || {};
    const code = currencyCode(body.code);
    const name = text(body.name);
    const symbol = emptyToNull(body.symbol);
    const sortOrder = toInt(body.sortOrder ?? body.sort_order) || 100;
    if (!code) return res.status(400).json({ error: "currency code required" });
    if (!name) return res.status(400).json({ error: "currency name required" });
    try {
      const r = await pool.query(
        `INSERT INTO aif_currencies (code, name, symbol, sort_order, is_active)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name,
           symbol=EXCLUDED.symbol,
           sort_order=EXCLUDED.sort_order,
           is_active=true,
           updated_at=now()
         RETURNING code, name, symbol, sort_order, is_active, created_at, updated_at`,
        [code, name, symbol, sortOrder]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create currency failed", e);
      res.status(500).json({ error: "failed to save currency" });
    }
  });

  router.patch("/currencies/:code", requireAdminOrSecret, async (req, res) => {
    const codeParam = currencyCode(req.params.code);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;
    if (body.name !== undefined) {
      const name = text(body.name);
      if (!name) return res.status(400).json({ error: "currency name required" });
      sets.push(`name=$${i++}`);
      args.push(name);
    }
    if (body.symbol !== undefined) {
      sets.push(`symbol=$${i++}`);
      args.push(emptyToNull(body.symbol));
    }
    if (body.sortOrder !== undefined || body.sort_order !== undefined) {
      sets.push(`sort_order=$${i++}`);
      args.push(toInt(body.sortOrder ?? body.sort_order) || 100);
    }
    if (body.parentId !== undefined || body.parent_id !== undefined || body.parentCode !== undefined || body.parent_code !== undefined) {
      const parentInput = emptyToNull(body.parentId ?? body.parent_id ?? body.parentCode ?? body.parent_code);
      let parentId = null;
      if (parentInput) {
        const parent = await pool.query(`SELECT id FROM aif_categories WHERE id::text=$1 OR code=$1 LIMIT 1`, [parentInput]);
        if (!parent.rowCount) return res.status(400).json({ error: "parent category not found" });
        if (String(parent.rows[0].id) === String(id)) return res.status(400).json({ error: "category cannot be its own parent" });
        parentId = parent.rows[0].id;
      }
      sets.push(`parent_id=NULLIF($${i++}, '')::uuid`);
      args.push(parentId || '');
    }
    if (body.is_active !== undefined || body.isActive !== undefined) {
      sets.push(`is_active=$${i++}`);
      args.push(Boolean(body.is_active ?? body.isActive));
    }
    if (!sets.length) return res.json({ ok: true });
    args.push(codeParam);
    try {
      const r = await pool.query(
        `UPDATE aif_currencies SET ${sets.join(", ")}, updated_at=now()
         WHERE code=$${i}
         RETURNING code, name, symbol, sort_order, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "currency not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update currency failed", e);
      res.status(500).json({ error: "failed to update currency" });
    }
  });

  router.delete("/currencies/:code", requireAdminOrSecret, async (req, res) => {
    const codeParam = currencyCode(req.params.code);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const c = await client.query(`SELECT code FROM aif_currencies WHERE code=$1 FOR UPDATE`, [codeParam]);
      if (!c.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "currency not found" });
      }
      const activeCount = await client.query(`SELECT count(*)::int AS c FROM aif_currencies WHERE is_active=true AND code <> $1`, [codeParam]);
      if (Number(activeCount.rows[0]?.c || 0) <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "at least one active currency is required" });
      }
      const usage = await currencyUsage(client, codeParam);
      if (Number(usage.receptions || 0) > 0 || Number(usage.exchange_rates || 0) > 0 || Number(usage.import_batches || 0) > 0) {
        await client.query(`UPDATE aif_currencies SET is_active=false, updated_at=now() WHERE code=$1`, [codeParam]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }
      await client.query(`DELETE FROM aif_currencies WHERE code=$1`, [codeParam]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete currency failed", e);
      res.status(500).json({ error: "failed to delete currency" });
    } finally {
      client.release();
    }
  });

  function csvCell(v) {
    const s = String(v ?? "");
    if (/["\n\r,;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function csvLine(values) {
    return values.map(csvCell).join(";");
  }

  router.get("/receptions", requireAuthed, async (req, res) => {
    const limit = Math.min(300, Math.max(1, Number(req.query.limit || 80)));
    const search = text(req.query.q || req.query.search);
    const supplier = text(req.query.supplier || req.query.supplier_id || req.query.supplierId);
    const location = text(req.query.location || req.query.location_id || req.query.locationId);
    const currency = currencyCode(req.query.currency || req.query.currency_code);
    const status = text(req.query.status);
    const from = emptyToNull(req.query.from);
    const to = emptyToNull(req.query.to);

    const args = [];
    const where = [];
    const addArg = (value) => {
      args.push(value);
      return `$${args.length}`;
    };

    if (search) {
      const p = addArg(`%${search}%`);
      where.push(`(
        r.invoice_number ILIKE ${p}
        OR r.note ILIKE ${p}
        OR s.name ILIKE ${p}
        OR l.name ILIKE ${p}
        OR r.currency_code ILIKE ${p}
      )`);
    }
    if (supplier) {
      const p = addArg(supplier);
      where.push(`(s.id::text=${p} OR s.code=${p})`);
    }
    if (location) {
      const p = addArg(location);
      where.push(`(l.id::text=${p} OR l.code=${p})`);
    }
    if (currency) {
      const p = addArg(currency);
      where.push(`r.currency_code=${p}`);
    }
    if (status) {
      const p = addArg(status);
      where.push(`r.status=${p}`);
    }
    if (from) {
      const p = addArg(from);
      where.push(`r.reception_date >= ${p}::date`);
    }
    if (to) {
      const p = addArg(to);
      where.push(`r.reception_date < (${p}::date + interval '1 day')`);
    }

    const limitParam = addArg(limit);
    const sql = `
      SELECT
        r.id, r.created_at, r.updated_at, r.status, r.invoice_number, r.invoice_date, r.reception_date,
        r.currency_code, r.exchange_rate_to_ron, r.tva_mode, r.tva_rate, r.goods_value,
        r.invoice_net, r.invoice_vat, r.invoice_gross, r.shipping_cost, r.total_qty, r.line_count,
        r.note, r.raw_meta, r.supplier_id, r.target_location_id, r.purchase_order_id,
        s.name AS supplier_name,
        l.name AS location_name,
        po.order_number AS purchase_order_number,
        count(DISTINCT b.id)::int AS import_batches,
        count(rw.id) FILTER (WHERE rw.status <> 'ignored')::int AS import_rows,
        count(rw.id) FILTER (WHERE rw.status = 'committed')::int AS committed_rows,
        count(rw.id) FILTER (WHERE rw.status = 'error')::int AS error_rows,
        count(rw.id) FILTER (WHERE rw.status = 'ignored')::int AS ignored_rows,
        count(rw.id) FILTER (WHERE rw.status NOT IN ('ignored','committed'))::int AS remaining_rows,
        count(DISTINCT b.id) FILTER (WHERE b.status='committed')::int AS committed_batches,
        (count(sm.id) > 0) AS has_stock_movements,
        (
          r.status <> 'committed'
          AND count(DISTINCT b.id) FILTER (WHERE b.status='committed') = 0
          AND count(sm.id) = 0
        ) AS can_delete
      FROM aif_receptions r
      LEFT JOIN aif_suppliers s ON s.id=r.supplier_id
      LEFT JOIN aif_locations l ON l.id=r.target_location_id
      LEFT JOIN aif_purchase_orders po ON po.id=r.purchase_order_id
      LEFT JOIN aif_import_batches b ON b.reception_id=r.id
      LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id
      LEFT JOIN aif_stock_movements sm ON sm.source_type='import_batch' AND sm.source_id=b.id::text
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY r.id, s.name, l.name, po.order_number
      ORDER BY r.created_at DESC
      LIMIT ${limitParam}
    `;
    const r = await pool.query(sql, args);
    res.json({ items: r.rows });
  });


  async function handleReceptionHeaderUpdate(req, res) {
    const id = text(req.params.id);
    const body = req.body || {};
    const src = body.reception && typeof body.reception === "object" ? body.reception : body;
    const client = await pool.connect();
    let receptionId = null;
    try {
      await client.query("BEGIN");
      const rec = await client.query(`SELECT id, currency_code FROM aif_receptions WHERE id::text=$1 FOR UPDATE`, [id]);
      if (!rec.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Receptió nem található." });
      }
      receptionId = rec.rows[0].id;
      const sets = [];
      const args = [];
      let i = 1;
      const add = (col, value) => { sets.push(`${col}=$${i++}`); args.push(value); };

      if (src.invoiceNumber !== undefined || src.invoice_number !== undefined) add("invoice_number", emptyToNull(src.invoiceNumber ?? src.invoice_number));
      if (src.invoiceDate !== undefined || src.invoice_date !== undefined) add("invoice_date", emptyToNull(src.invoiceDate ?? src.invoice_date));
      if (src.receptionDate !== undefined || src.reception_date !== undefined) add("reception_date", emptyToNull(src.receptionDate ?? src.reception_date));
      let nextCurrencyCode = rec.rows[0].currency_code;
      if (src.currencyCode !== undefined || src.currency_code !== undefined) {
        const c = currencyCode(src.currencyCode ?? src.currency_code);
        const exists = await client.query(`SELECT 1 FROM aif_currencies WHERE code=$1 AND is_active=true LIMIT 1`, [c]);
        if (!exists.rowCount) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "A kiválasztott pénznem nem létezik vagy inaktív." });
        }
        nextCurrencyCode = c;
        add("currency_code", c);
      }
      const exchangeRateProvided = src.exchangeRateToRon !== undefined || src.exchange_rate_to_ron !== undefined;
      if (isRonCurrencyCode(nextCurrencyCode)) {
        // RON -> RON árfolyamot nem kérünk a felületen. A DB-ben 1 marad technikai számolási alapnak.
        add("exchange_rate_to_ron", 1);
      } else if (exchangeRateProvided) {
        const rate = toMoney(src.exchangeRateToRon ?? src.exchange_rate_to_ron);
        if (!rate || rate <= 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Pozitív RON árfolyam szükséges." });
        }
        add("exchange_rate_to_ron", rate);
      } else if (src.currencyCode !== undefined || src.currency_code !== undefined) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Pozitív RON árfolyam szükséges." });
      }
      if (src.tvaMode !== undefined || src.tva_mode !== undefined) {
        const mode = tvaMode(src.tvaMode ?? src.tva_mode);
        if (!mode) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Érvénytelen TVA kezelés." });
        }
        add("tva_mode", mode);
        if (mode === "no_tva") add("tva_rate", 0);
      }
      if (src.tvaRate !== undefined || src.tva_rate !== undefined) add("tva_rate", toMoney(src.tvaRate ?? src.tva_rate) ?? 0);
      if (src.shippingCost !== undefined || src.shipping_cost !== undefined) add("shipping_cost", toMoney(src.shippingCost ?? src.shipping_cost) ?? 0);
      if (src.goodsValue !== undefined || src.goods_value !== undefined) add("goods_value", toMoney(src.goodsValue ?? src.goods_value));
      if (src.invoiceNet !== undefined || src.invoice_net !== undefined) add("invoice_net", toMoney(src.invoiceNet ?? src.invoice_net));
      if (src.invoiceVat !== undefined || src.invoice_vat !== undefined) add("invoice_vat", toMoney(src.invoiceVat ?? src.invoice_vat));
      if (src.invoiceGross !== undefined || src.invoice_gross !== undefined) add("invoice_gross", toMoney(src.invoiceGross ?? src.invoice_gross));
      if (src.note !== undefined) add("note", emptyToNull(src.note));
      if (src && typeof src === "object") {
        sets.push(`raw_meta=COALESCE(raw_meta,'{}'::jsonb) || $${i++}::jsonb`);
        args.push(JSON.stringify(src));
      }

      if (sets.length) {
        args.push(receptionId);
        await client.query(`UPDATE aif_receptions SET ${sets.join(", ")}, updated_at=now() WHERE id=$${i}`, args);
      }
      await client.query("COMMIT");

      let recalcWarning = null;
      try {
        await client.query("BEGIN");
        const fresh = await client.query(
          `SELECT currency_code, exchange_rate_to_ron, raw_meta
           FROM aif_receptions
           WHERE id=$1
           FOR UPDATE`,
          [receptionId]
        );
        const freshRow = fresh.rows[0] || {};
        const rate = Number(freshRow.exchange_rate_to_ron || 1);
        const currency = currencyCode(freshRow.currency_code || "RON") || "RON";
        const sellPolicy = receptionSellPricePolicy({
          currencyCode: currency,
          exchangeRateToRon: rate,
          rawMeta: freshRow.raw_meta || {},
        });
        const sellRate = sellPolicy.isRon ? 1 : rate;

        await client.query(
          `UPDATE aif_import_rows rw
           SET buy_price_ron = CASE
                 WHEN rw.status='committed' THEN rw.buy_price_ron
                 WHEN rw.buy_price IS NULL THEN NULL
                 ELSE round(rw.buy_price * $2::numeric, 2)
               END,
               sell_price_ron = CASE
                 WHEN rw.sell_price IS NULL THEN NULL
                 ELSE round(rw.sell_price * $3::numeric, 2)
               END,
               normalized = COALESCE(rw.normalized,'{}'::jsonb) || jsonb_build_object(
                 'currencyCode', $4,
                 'exchangeRateToRon', $2,
                 'sellPriceCurrencyMode', $5,
                 'sell_price_currency_mode', $5,
                 'sellPriceCurrency', $6,
                 'sell_price_currency', $6,
                 'sellPriceIsRon', $7,
                 'sell_price_is_ron', $7,
                 'sellPriceGrossRon', CASE WHEN rw.sell_price IS NULL THEN NULL ELSE round(rw.sell_price * $3::numeric, 2) END,
                 'sellPriceRon', CASE WHEN rw.sell_price IS NULL THEN NULL ELSE round(rw.sell_price * $3::numeric, 2) END
               ),
               updated_at=now()
           FROM aif_import_batches b
           WHERE rw.batch_id=b.id
             AND b.reception_id=$1`,
          [
            receptionId,
            rate,
            sellRate,
            currency,
            sellPolicy.mode,
            sellPolicy.sourceCurrency,
            sellPolicy.isRon,
          ]
        );

        // Csak akkor írjuk át a termék jelenlegi eladási árát, ha ennek a receptiónak
        // a sora a legutóbbi készletre vett árforrás az adott variánshoz.
        await client.query(
          `WITH latest_committed AS (
             SELECT DISTINCT ON (rw.variant_id)
                    rw.variant_id,
                    rw.sell_price_ron,
                    b.reception_id
             FROM aif_import_rows rw
             JOIN aif_import_batches b ON b.id=rw.batch_id
             WHERE rw.status='committed'
               AND rw.variant_id IS NOT NULL
               AND rw.sell_price_ron IS NOT NULL
             ORDER BY rw.variant_id,
                      COALESCE(b.committed_at, b.created_at) DESC,
                      rw.row_no DESC,
                      rw.id DESC
           )
           UPDATE aif_product_variants v
           SET sell_price=lc.sell_price_ron,
               updated_at=now()
           FROM latest_committed lc
           WHERE v.id=lc.variant_id
             AND lc.reception_id=$1`,
          [receptionId]
        );

        await client.query("COMMIT");
      } catch (recalcError) {
        try { await client.query("ROLLBACK"); } catch {}
        recalcWarning = recalcError?.message || "A terméksorok és az eladási árak RON újraszámolása nem sikerült.";
        console.error("AIF reception row recalculation warning", recalcError);
      }

      const updated = await pool.query(
        `SELECT r.id, r.created_at, r.updated_at, r.status, r.invoice_number, r.invoice_date, r.reception_date,
                r.currency_code, r.exchange_rate_to_ron, r.tva_mode, r.tva_rate, r.goods_value,
                r.invoice_net, r.invoice_vat, r.invoice_gross, r.shipping_cost, r.total_qty, r.line_count,
                r.note, r.raw_meta, r.supplier_id, r.target_location_id, r.purchase_order_id,
                s.name AS supplier_name, l.name AS location_name, po.order_number AS purchase_order_number
         FROM aif_receptions r
         LEFT JOIN aif_suppliers s ON s.id=r.supplier_id
         LEFT JOIN aif_locations l ON l.id=r.target_location_id
         LEFT JOIN aif_purchase_orders po ON po.id=r.purchase_order_id
         WHERE r.id=$1
         LIMIT 1`,
        [receptionId]
      );
      res.json({ ok: true, item: updated.rows[0] || null, warning: recalcWarning });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF update reception failed", e);
      res.status(500).json({ error: e?.message || "A receptió mentése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  }



  router.patch("/receptions/:id", requireAuthed, handleReceptionHeaderUpdate);
  router.post("/receptions/:id/update", requireAuthed, handleReceptionHeaderUpdate);

  router.get("/receptions/:id/export.csv", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: "reception id required" });
    try {
      const rec = await pool.query(
        `SELECT r.*, s.name AS supplier_name, l.name AS location_name
         FROM aif_receptions r
         LEFT JOIN aif_suppliers s ON s.id=r.supplier_id
         LEFT JOIN aif_locations l ON l.id=r.target_location_id
         WHERE r.id::text=$1
         LIMIT 1`,
        [id]
      );
      if (!rec.rowCount) return res.status(404).json({ error: "reception not found" });

      const rows = await pool.query(
        `SELECT
           b.id AS batch_id, b.status AS batch_status, b.source_file_name,
           rw.row_no, rw.status AS row_status, rw.qty, rw.buy_price, rw.buy_price_ron,
           rw.sell_price, rw.sell_price_ron, rw.sn_cod, rw.supplier_product_code, rw.supplier_variant_code,
           rw.supplier_color_code, rw.supplier_size, rw.normalized
         FROM aif_import_batches b
         LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id
         WHERE b.reception_id=$1
         ORDER BY b.created_at ASC, rw.row_no ASC NULLS LAST`,
        [rec.rows[0].id]
      );

      const head = rec.rows[0];
      const lines = [];
      lines.push(csvLine(["Receptio", head.invoice_number || ""]));
      lines.push(csvLine(["Beszallito", head.supplier_name || ""]));
      lines.push(csvLine(["Cel hely", head.location_name || ""]));
      lines.push(csvLine(["Szamla datum", head.invoice_date ? String(head.invoice_date).slice(0, 10) : ""]));
      lines.push(csvLine(["Receptio datum", head.reception_date ? String(head.reception_date).slice(0, 10) : ""]));
      lines.push(csvLine(["Penznem", head.currency_code || ""]));
      lines.push(csvLine(["Arfolyam RON", head.exchange_rate_to_ron || ""]));
      lines.push(csvLine(["Szamla vegosszeg", head.invoice_gross || ""]));
      lines.push("");
      lines.push(csvLine([
        "Sor", "Allapot", "Termekkod", "Variant kod", "Nev", "Marka", "Fokategoria", "Nem",
        "Szin", "Szinkod", "Meret", "S/N/COD", "Darab", "Vetelar", "Vetelar RON", "Eladasi ar", "Eladasi ar RON", "Forras fajl"
      ]));
      for (const x of rows.rows) {
        const n = x.normalized || {};
        lines.push(csvLine([
          x.row_no || "",
          x.row_status || x.batch_status || "",
          x.supplier_product_code || n.supplierProductCode || n.modelCode || "",
          x.supplier_variant_code || n.supplierVariantCode || "",
          n.titleRo || n.productName || "",
          n.brandName || n.brandCode || "",
          n.categoryCode || "",
          n.gender || "",
          n.colorName || "",
          x.supplier_color_code || n.colorCode || "",
          x.supplier_size || n.size || "",
          x.sn_cod || n.snCod || n.sn_cod || "",
          x.qty || n.qty || "",
          x.buy_price || "",
          x.buy_price_ron || "",
          x.sell_price || "",
          x.sell_price_ron || "",
          x.source_file_name || "",
        ]));
      }
      const csv = "\ufeff" + lines.join("\n");
      const safeName = String(head.invoice_number || "receptio").replace(/[^a-zA-Z0-9._-]+/g, "_");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="receptio_${safeName}.csv"`);
      res.send(csv);
    } catch (e) {
      console.error("AIF reception CSV export failed", e);
      res.status(500).json({ error: "failed to export reception" });
    }
  });

  router.get("/receptions/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: "reception id required" });
    try {
      const item = await pool.query(
        `SELECT r.id, r.created_at, r.updated_at, r.status, r.invoice_number, r.invoice_date, r.reception_date,
                r.currency_code, r.exchange_rate_to_ron, r.tva_mode, r.tva_rate, r.goods_value,
                r.invoice_net, r.invoice_vat, r.invoice_gross, r.shipping_cost, r.total_qty, r.line_count,
                r.note, r.raw_meta, r.supplier_id, r.target_location_id, r.purchase_order_id,
                s.name AS supplier_name, l.name AS location_name, po.order_number AS purchase_order_number,
                count(DISTINCT b.id)::int AS import_batches,
                count(rw.id) FILTER (WHERE rw.status <> 'ignored')::int AS import_rows,
                count(rw.id) FILTER (WHERE rw.status = 'committed')::int AS committed_rows,
                count(rw.id) FILTER (WHERE rw.status = 'error')::int AS error_rows,
                count(rw.id) FILTER (WHERE rw.status = 'ignored')::int AS ignored_rows,
                count(rw.id) FILTER (WHERE rw.status NOT IN ('ignored','committed'))::int AS remaining_rows,
                count(DISTINCT b.id) FILTER (WHERE b.status='committed')::int AS committed_batches,
                (count(sm.id) > 0) AS has_stock_movements,
                (r.status <> 'committed' AND count(DISTINCT b.id) FILTER (WHERE b.status='committed') = 0 AND count(sm.id)=0) AS can_delete
         FROM aif_receptions r
         LEFT JOIN aif_suppliers s ON s.id=r.supplier_id
         LEFT JOIN aif_locations l ON l.id=r.target_location_id
         LEFT JOIN aif_purchase_orders po ON po.id=r.purchase_order_id
         LEFT JOIN aif_import_batches b ON b.reception_id=r.id
         LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id
         LEFT JOIN aif_stock_movements sm ON sm.source_type='import_batch' AND sm.source_id=b.id::text
         WHERE r.id::text=$1
         GROUP BY r.id, s.name, l.name, po.order_number
         LIMIT 1`,
        [id]
      );
      if (!item.rowCount) return res.status(404).json({ error: "reception not found" });

      const batches = await pool.query(
        `SELECT b.id, b.created_at, b.updated_at, b.status, b.row_count, b.error_count,
                b.source_file_name, b.note, b.committed_at, b.reception_id, b.purchase_order_id, b.invoice_number,
                b.currency_code, b.exchange_rate_to_ron, s.code AS supplier_code, s.name AS supplier_name,
                l.code AS location_code, l.name AS location_name, p.name AS profile_name, p.version AS profile_version
         FROM aif_import_batches b
         JOIN aif_suppliers s ON s.id=b.supplier_id
         LEFT JOIN aif_locations l ON l.id=b.target_location_id
         LEFT JOIN aif_supplier_import_profiles p ON p.id=b.profile_id
         WHERE b.reception_id=$1
         ORDER BY b.created_at ASC`,
        [item.rows[0].id]
      );
      const rows = await pool.query(
        `SELECT rw.id, rw.batch_id, rw.row_no, rw.raw, rw.normalized, rw.status, rw.error_messages,
                rw.variant_id, rw.supplier_product_code, rw.supplier_variant_code, rw.supplier_color_code,
                rw.supplier_size, rw.qty, rw.buy_price, rw.buy_price_ron, rw.sell_price, rw.sell_price_ron, rw.sn_cod,
                rw.purchase_order_id, rw.purchase_order_line_id
         FROM aif_import_batches b
         JOIN aif_import_rows rw ON rw.batch_id=b.id
         WHERE b.reception_id=$1
         ORDER BY b.created_at ASC, rw.row_no ASC`,
        [item.rows[0].id]
      );
      res.json({ item: item.rows[0], batches: batches.rows, rows: rows.rows });
    } catch (e) {
      console.error("AIF reception detail failed", e);
      res.status(500).json({ error: "failed to load reception" });
    }
  });

  router.delete("/receptions/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const rec = await client.query(`SELECT id, status FROM aif_receptions WHERE id::text=$1 FOR UPDATE`, [id]);
      if (!rec.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "reception not found" });
      }
      const batches = await client.query(`SELECT id, status FROM aif_import_batches WHERE reception_id=$1 FOR UPDATE`, [rec.rows[0].id]);
      const batchIds = batches.rows.map((x) => x.id);
      const committed = batches.rows.some((x) => x.status === "committed") || rec.rows[0].status === "committed";
      let movementCount = 0;
      if (batchIds.length) {
        const movements = await client.query(
          `SELECT count(*)::int AS c FROM aif_stock_movements WHERE source_type='import_batch' AND source_id = ANY($1::text[])`,
          [batchIds.map(String)]
        );
        movementCount = Number(movements.rows[0]?.c || 0);
      }
      if (committed || movementCount > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "A receptió már készletmozgáshoz kapcsolódik, nem törölhető közvetlenül." });
      }
      if (batchIds.length) {
        await client.query(`DELETE FROM aif_import_rows WHERE batch_id = ANY($1::uuid[])`, [batchIds]);
        await client.query(`DELETE FROM aif_import_batches WHERE id = ANY($1::uuid[])`, [batchIds]);
      }
      await client.query(`DELETE FROM aif_receptions WHERE id=$1`, [rec.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted" });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete reception failed", e);
      res.status(500).json({ error: "failed to delete reception" });
    } finally {
      client.release();
    }
  });

  router.get("/color-types", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT id, code, name_ro, name_hu, name_en, name_de, aliases, hex, sort_order, is_active, created_at, updated_at
       FROM aif_color_types
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, sort_order ASC, name_ro ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/color-types/normalize", requireAuthed, async (req, res) => {
    const input = text(req.body?.color || req.body?.name || req.body?.value);
    if (!input) return res.status(400).json({ error: "color required" });
    try {
      const color = await normalizeColorName(pool, input);
      const item = await pool.query(
        `SELECT id, code, name_ro, name_hu, name_en, name_de, aliases, hex, sort_order, is_active
         FROM aif_color_types
         WHERE is_active=true AND lower(name_ro)=lower($1)
         LIMIT 1`,
        [color]
      );
      res.json({ input, color, item: item.rows[0] || null });
    } catch (e) {
      console.error("AIF normalize color failed", e);
      res.status(500).json({ error: "failed to normalize color" });
    }
  });

  router.post("/color-types", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const nameRo = text(body.nameRo || body.name_ro || body.name || body.nameRoOfficial);
    let code = normCode(body.code || nameRo);
    const aliases = colorAliasesFromInput(body.aliases || body.alias_list || body.aliasList);
    const sortOrder = toInt(body.sortOrder ?? body.sort_order) || 100;
    if (!nameRo) return res.status(400).json({ error: "color Romanian name required" });
    if (!code) return res.status(400).json({ error: "color code required" });
    try {
      const r = await pool.query(
        `INSERT INTO aif_color_types (code, name_ro, name_hu, name_en, name_de, aliases, hex, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5,$6::text[],$7,$8,true)
         ON CONFLICT (code) DO UPDATE SET
           name_ro=EXCLUDED.name_ro,
           name_hu=EXCLUDED.name_hu,
           name_en=EXCLUDED.name_en,
           name_de=EXCLUDED.name_de,
           aliases=EXCLUDED.aliases,
           hex=EXCLUDED.hex,
           sort_order=EXCLUDED.sort_order,
           is_active=true,
           updated_at=now()
         RETURNING id, code, name_ro, name_hu, name_en, name_de, aliases, hex, sort_order, is_active, created_at, updated_at`,
        [code, nameRo, emptyToNull(body.nameHu || body.name_hu), emptyToNull(body.nameEn || body.name_en), emptyToNull(body.nameDe || body.name_de), aliases, emptyToNull(body.hex), sortOrder]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create color type failed", e);
      res.status(500).json({ error: "failed to save color" });
    }
  });

  router.patch("/color-types/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;
    if (body.nameRo !== undefined || body.name_ro !== undefined || body.name !== undefined) {
      const nameRo = text(body.nameRo ?? body.name_ro ?? body.name);
      if (!nameRo) return res.status(400).json({ error: "color Romanian name required" });
      sets.push(`name_ro=$${i++}`);
      args.push(nameRo);
    }
    if (body.code !== undefined) {
      const code = normCode(body.code);
      if (!code) return res.status(400).json({ error: "color code required" });
      sets.push(`code=$${i++}`);
      args.push(code);
    }
    if (body.nameHu !== undefined || body.name_hu !== undefined) { sets.push(`name_hu=$${i++}`); args.push(emptyToNull(body.nameHu ?? body.name_hu)); }
    if (body.nameEn !== undefined || body.name_en !== undefined) { sets.push(`name_en=$${i++}`); args.push(emptyToNull(body.nameEn ?? body.name_en)); }
    if (body.nameDe !== undefined || body.name_de !== undefined) { sets.push(`name_de=$${i++}`); args.push(emptyToNull(body.nameDe ?? body.name_de)); }
    if (body.aliases !== undefined || body.aliasList !== undefined || body.alias_list !== undefined) { sets.push(`aliases=$${i++}::text[]`); args.push(colorAliasesFromInput(body.aliases ?? body.aliasList ?? body.alias_list)); }
    if (body.hex !== undefined) { sets.push(`hex=$${i++}`); args.push(emptyToNull(body.hex)); }
    if (body.sortOrder !== undefined || body.sort_order !== undefined) { sets.push(`sort_order=$${i++}`); args.push(toInt(body.sortOrder ?? body.sort_order) || 100); }
    if (body.is_active !== undefined || body.isActive !== undefined) { sets.push(`is_active=$${i++}`); args.push(Boolean(body.is_active ?? body.isActive)); }
    if (!sets.length) return res.json({ ok: true });
    args.push(id);
    try {
      const r = await pool.query(
        `UPDATE aif_color_types
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i} OR code=$${i}
         RETURNING id, code, name_ro, name_hu, name_en, name_de, aliases, hex, sort_order, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "color not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update color type failed", e);
      res.status(500).json({ error: "failed to update color" });
    }
  });

  router.delete("/color-types/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const color = await client.query(`SELECT id, code, name_ro FROM aif_color_types WHERE id::text=$1 OR code=$1 FOR UPDATE`, [id]);
      if (!color.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "color not found" });
      }
      const usage = await colorUsage(client, color.rows[0].id);
      if (Number(usage.product_variants || 0) > 0) {
        await client.query(`UPDATE aif_color_types SET is_active=false, updated_at=now() WHERE id=$1`, [color.rows[0].id]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }
      await client.query(`DELETE FROM aif_color_types WHERE id=$1`, [color.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete color type failed", e);
      res.status(500).json({ error: "failed to delete color" });
    } finally {
      client.release();
    }
  });


  function brandColorCodeSelect() {
    return `SELECT bcc.id, bcc.brand_id, b.code AS brand_code, b.name AS brand_name,
                   bcc.color_code, bcc.color_type_id,
                   c.code AS color_type_code, c.name_ro AS color_name_ro, c.name_hu AS color_name_hu,
                   c.name_en AS color_name_en, c.name_de AS color_name_de, c.hex AS color_hex,
                   bcc.notes, bcc.is_active, bcc.created_at, bcc.updated_at
            FROM aif_brand_color_codes bcc
            JOIN aif_brands b ON b.id=bcc.brand_id
            JOIN aif_color_types c ON c.id=bcc.color_type_id`;
  }

  async function getBrandColorCodeItem(client, id) {
    const r = await client.query(
      `${brandColorCodeSelect()}
       WHERE bcc.id::text=$1
       LIMIT 1`,
      [id]
    );
    return r.rows[0] || null;
  }

  router.get("/brand-color-codes", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const brand = text(req.query.brand || req.query.brandId || req.query.brand_id || req.query.brandCode || req.query.brand_code);
    const args = [];
    const where = [];
    if (!includeInactive) where.push(`bcc.is_active=true AND b.is_active=true AND c.is_active=true`);
    if (brand) {
      args.push(brand);
      where.push(`(b.id::text=$${args.length} OR b.code=$${args.length} OR lower(b.name)=lower($${args.length}))`);
    }
    try {
      const r = await pool.query(
        `${brandColorCodeSelect()}
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY b.name ASC, bcc.color_code ASC`,
        args
      );
      res.json({ items: r.rows });
    } catch (e) {
      console.error("AIF list brand color codes failed", e);
      res.status(500).json({ error: "failed to load brand color codes" });
    }
  });

  router.post("/brand-color-codes", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const colorCode = text(body.colorCode || body.color_code).toUpperCase();
    if (!colorCode) return res.status(400).json({ error: "brand color code required" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const brand = await findByIdOrCode(client, "aif_brands", body.brandId || body.brand_id || body.brandCode || body.brand_code || body.brand);
      const color = await findColorTypeByIdOrCode(client, body.colorTypeId || body.color_type_id || body.colorTypeCode || body.color_type_code || body.color);
      if (!brand || brand.is_active === false) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "brand required or inactive" });
      }
      if (!color || color.is_active === false) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "color type required or inactive" });
      }
      const r = await client.query(
        `INSERT INTO aif_brand_color_codes (brand_id, color_code, color_type_id, notes, is_active)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (brand_id, color_code) DO UPDATE SET
           color_type_id=EXCLUDED.color_type_id,
           notes=EXCLUDED.notes,
           is_active=true,
           updated_at=now()
         RETURNING id`,
        [brand.id, colorCode, color.id, emptyToNull(body.notes)]
      );
      const item = await getBrandColorCodeItem(client, r.rows[0].id);
      await client.query("COMMIT");
      res.json({ item });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF save brand color code failed", e);
      res.status(500).json({ error: "failed to save brand color code" });
    } finally {
      client.release();
    }
  });

  router.patch("/brand-color-codes/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(`SELECT id FROM aif_brand_color_codes WHERE id::text=$1 FOR UPDATE`, [id]);
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "brand color code not found" });
      }
      const sets = [];
      const args = [];
      let i = 1;
      if (body.brandId !== undefined || body.brand_id !== undefined || body.brandCode !== undefined || body.brand_code !== undefined || body.brand !== undefined) {
        const brand = await findByIdOrCode(client, "aif_brands", body.brandId || body.brand_id || body.brandCode || body.brand_code || body.brand);
        if (!brand || brand.is_active === false) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "brand required or inactive" });
        }
        sets.push(`brand_id=$${i++}`);
        args.push(brand.id);
      }
      if (body.colorCode !== undefined || body.color_code !== undefined) {
        const colorCode = text(body.colorCode ?? body.color_code).toUpperCase();
        if (!colorCode) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "brand color code required" });
        }
        sets.push(`color_code=$${i++}`);
        args.push(colorCode);
      }
      if (body.colorTypeId !== undefined || body.color_type_id !== undefined || body.colorTypeCode !== undefined || body.color_type_code !== undefined || body.color !== undefined) {
        const color = await findColorTypeByIdOrCode(client, body.colorTypeId || body.color_type_id || body.colorTypeCode || body.color_type_code || body.color);
        if (!color || color.is_active === false) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "color type required or inactive" });
        }
        sets.push(`color_type_id=$${i++}`);
        args.push(color.id);
      }
      if (body.notes !== undefined) {
        sets.push(`notes=$${i++}`);
        args.push(emptyToNull(body.notes));
      }
      if (body.is_active !== undefined || body.isActive !== undefined) {
        sets.push(`is_active=$${i++}`);
        args.push(Boolean(body.is_active ?? body.isActive));
      }
      if (sets.length) {
        args.push(current.rows[0].id);
        await client.query(
          `UPDATE aif_brand_color_codes SET ${sets.join(", ")}, updated_at=now() WHERE id=$${i}`,
          args
        );
      }
      const item = await getBrandColorCodeItem(client, current.rows[0].id);
      await client.query("COMMIT");
      res.json({ item });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF update brand color code failed", e);
      if (e?.code === "23505") return res.status(400).json({ error: "A márkához ez a színkód már létezik." });
      res.status(500).json({ error: "failed to update brand color code" });
    } finally {
      client.release();
    }
  });

  router.delete("/brand-color-codes/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    try {
      const r = await pool.query(
        `UPDATE aif_brand_color_codes SET is_active=false, updated_at=now() WHERE id::text=$1 RETURNING id`,
        [id]
      );
      if (!r.rowCount) return res.status(404).json({ error: "brand color code not found" });
      res.json({ ok: true, mode: "deactivated" });
    } catch (e) {
      console.error("AIF delete brand color code failed", e);
      res.status(500).json({ error: "failed to delete brand color code" });
    }
  });


  async function materialUsage(client, materialIdOrCode) {
    const m = await client.query(
      `SELECT id, code, name_ro FROM aif_material_types WHERE id::text=$1 OR code=$1 LIMIT 1`,
      [text(materialIdOrCode)]
    );
    if (!m.rowCount) return { product_models: 0 };
    const r = await client.query(
      `SELECT count(*)::int AS product_models
       FROM aif_product_models
       WHERE material ILIKE $1`,
      [`%${m.rows[0].name_ro}%`]
    );
    return r.rows[0] || { product_models: 0 };
  }

  router.get("/material-types", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT id, code, name_ro, name_hu, name_en, name_de, aliases, sort_order, is_active, created_at, updated_at
       FROM aif_material_types
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, sort_order ASC, name_ro ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/material-types/normalize", requireAuthed, async (req, res) => {
    const input = text(req.body?.material || req.body?.name || req.body?.value);
    if (!input) return res.status(400).json({ error: "material required" });
    try {
      const material = await normalizeMaterialText(pool, input);
      res.json({ input, material });
    } catch (e) {
      console.error("AIF normalize material failed", e);
      res.status(500).json({ error: "failed to normalize material" });
    }
  });

  router.post("/material-types", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const nameRo = text(body.nameRo || body.name_ro || body.name || body.nameRoOfficial);
    let code = normCode(body.code || nameRo);
    const aliases = materialAliasesFromInput(body.aliases || body.alias_list || body.aliasList);
    const sortOrder = toInt(body.sortOrder ?? body.sort_order) || 100;
    if (!nameRo) return res.status(400).json({ error: "material Romanian name required" });
    if (!code) return res.status(400).json({ error: "material code required" });
    try {
      const r = await pool.query(
        `INSERT INTO aif_material_types (code, name_ro, name_hu, name_en, name_de, aliases, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5,$6::text[],$7,true)
         ON CONFLICT (code) DO UPDATE SET
           name_ro=EXCLUDED.name_ro,
           name_hu=EXCLUDED.name_hu,
           name_en=EXCLUDED.name_en,
           name_de=EXCLUDED.name_de,
           aliases=EXCLUDED.aliases,
           sort_order=EXCLUDED.sort_order,
           is_active=true,
           updated_at=now()
         RETURNING id, code, name_ro, name_hu, name_en, name_de, aliases, sort_order, is_active, created_at, updated_at`,
        [code, nameRo, emptyToNull(body.nameHu || body.name_hu), emptyToNull(body.nameEn || body.name_en), emptyToNull(body.nameDe || body.name_de), aliases, sortOrder]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create material type failed", e);
      res.status(500).json({ error: "failed to save material" });
    }
  });

  router.patch("/material-types/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;
    if (body.nameRo !== undefined || body.name_ro !== undefined || body.name !== undefined) {
      const nameRo = text(body.nameRo ?? body.name_ro ?? body.name);
      if (!nameRo) return res.status(400).json({ error: "material Romanian name required" });
      sets.push(`name_ro=$${i++}`);
      args.push(nameRo);
    }
    if (body.code !== undefined) {
      const code = normCode(body.code);
      if (!code) return res.status(400).json({ error: "material code required" });
      sets.push(`code=$${i++}`);
      args.push(code);
    }
    if (body.nameHu !== undefined || body.name_hu !== undefined) { sets.push(`name_hu=$${i++}`); args.push(emptyToNull(body.nameHu ?? body.name_hu)); }
    if (body.nameEn !== undefined || body.name_en !== undefined) { sets.push(`name_en=$${i++}`); args.push(emptyToNull(body.nameEn ?? body.name_en)); }
    if (body.nameDe !== undefined || body.name_de !== undefined) { sets.push(`name_de=$${i++}`); args.push(emptyToNull(body.nameDe ?? body.name_de)); }
    if (body.aliases !== undefined || body.aliasList !== undefined || body.alias_list !== undefined) { sets.push(`aliases=$${i++}::text[]`); args.push(materialAliasesFromInput(body.aliases ?? body.aliasList ?? body.alias_list)); }
    if (body.sortOrder !== undefined || body.sort_order !== undefined) { sets.push(`sort_order=$${i++}`); args.push(toInt(body.sortOrder ?? body.sort_order) || 100); }
    if (body.is_active !== undefined || body.isActive !== undefined) { sets.push(`is_active=$${i++}`); args.push(Boolean(body.is_active ?? body.isActive)); }
    if (!sets.length) return res.json({ ok: true });
    args.push(id);
    try {
      const r = await pool.query(
        `UPDATE aif_material_types
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i} OR code=$${i}
         RETURNING id, code, name_ro, name_hu, name_en, name_de, aliases, sort_order, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "material not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update material type failed", e);
      res.status(500).json({ error: "failed to update material" });
    }
  });

  router.delete("/material-types/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const material = await client.query(`SELECT id, code, name_ro FROM aif_material_types WHERE id::text=$1 OR code=$1 FOR UPDATE`, [id]);
      if (!material.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "material not found" });
      }
      const usage = await materialUsage(client, material.rows[0].id);
      if (Number(usage.product_models || 0) > 0) {
        await client.query(`UPDATE aif_material_types SET is_active=false, updated_at=now() WHERE id=$1`, [material.rows[0].id]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }
      await client.query(`DELETE FROM aif_material_types WHERE id=$1`, [material.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete material type failed", e);
      res.status(500).json({ error: "failed to delete material" });
    } finally {
      client.release();
    }
  });


  let sizeSchemaEnsured = false;
  let sizeSchemaPromise = null;

  async function ensureAifSizeTables(client = pool) {
    if (sizeSchemaEnsured) return true;

    const run = async () => {
      await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
      await client.query(`CREATE TABLE IF NOT EXISTS aif_size_types (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL UNIQUE,
        name text NOT NULL,
        aliases text[] NOT NULL DEFAULT '{}'::text[],
        sort_order integer NOT NULL DEFAULT 100,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query(`ALTER TABLE IF EXISTS aif_size_types ADD COLUMN IF NOT EXISTS name_hu text NULL`);
      await client.query(`ALTER TABLE IF EXISTS aif_size_types ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}'::text[]`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_size_types_active_sort_idx ON aif_size_types (is_active, sort_order, name)`);
      await client.query(`CREATE TABLE IF NOT EXISTS aif_brand_size_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id uuid NOT NULL REFERENCES aif_brands(id) ON DELETE CASCADE,
        size_code text NOT NULL,
        size_type_id uuid NOT NULL REFERENCES aif_size_types(id),
        notes text NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (brand_id, size_code)
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_brand_size_codes_brand_active_idx ON aif_brand_size_codes (brand_id, is_active, size_code)`);
      const defaults = [
        ["xxs", "XXS", 1, ["XXS", "2XS"]],
        ["xs", "XS", 2, ["XS"]],
        ["s", "S", 3, ["S", "SMALL"]],
        ["m", "M", 4, ["M", "MEDIUM"]],
        ["l", "L", 5, ["L", "LARGE"]],
        ["xl", "XL", 6, ["XL", "X-LARGE"]],
        ["xxl", "XXL", 7, ["XXL", "2XL"]],
        ["xxxl", "XXXL", 8, ["XXXL", "3XL"]],
        ["osfm", "OSFM", 9, ["OSFM", "ONE SIZE", "ONESIZE", "ONE-SIZE", "OS", "UNI", "UNIVERSAL"]],
        ["one_size", "One Size", 10, ["ONE SIZE", "ONESIZE", "ONE-SIZE", "OS"]],
        ...Array.from({ length: 14 }, (_, index) => {
          const size = 35 + index;
          return [`eu_${size}`, `EU ${size}`, 30 + index, [`${size}`, `EU${size}`, `EU ${size}`, `${size} EU`]];
        }),
      ];
      for (const [code, name, sortOrder, aliases] of defaults) {
        await client.query(
          `INSERT INTO aif_size_types (code, name, aliases, sort_order, is_active)
           VALUES ($1,$2,$3::text[],$4,true)
           ON CONFLICT (code) DO UPDATE SET
             aliases=CASE
               WHEN array_length(aif_size_types.aliases, 1) IS NULL THEN EXCLUDED.aliases
               ELSE aif_size_types.aliases
             END,
             is_active=true`,
          [code, name, Array.isArray(aliases) ? aliases : [name], sortOrder]
        );
      }
      sizeSchemaEnsured = true;
      return true;
    };

    if (client === pool) {
      if (!sizeSchemaPromise) {
        sizeSchemaPromise = run().finally(() => { sizeSchemaPromise = null; });
      }
      return sizeSchemaPromise;
    }

    return run();
  }

  function sizeAliasesFromInput(value) {
    return splitAliasesFromInput(value);
  }

  async function findSizeTypeByIdOrCode(client, idOrCode) {
    await ensureAifSizeTables(client);
    const v = text(idOrCode);
    if (!v) return null;
    const key = normCode(v);
    const r = await client.query(
      `SELECT id, code, name, aliases, sort_order, is_active
       FROM aif_size_types
       WHERE id::text=$1 OR code=$1 OR code=$2 OR lower(name)=lower($1)
          OR EXISTS (
            SELECT 1 FROM unnest(COALESCE(aliases, '{}'::text[])) a
            WHERE lower(a)=lower($1) OR lower(a)=lower($2)
          )
       LIMIT 1`,
      [v, key]
    );
    return r.rows[0] || null;
  }

  async function normalizeSizeValue(client, value) {
    const raw = emptyToNull(value);
    if (!raw) return null;
    try {
      await ensureAifSizeTables(client);
      const rawKey = normCode(raw);
      const r = await client.query(
        `SELECT id, code, name, aliases
         FROM aif_size_types
         WHERE is_active=true
         ORDER BY sort_order ASC, name ASC`
      );
      const found = r.rows.find((size) => {
        const aliases = Array.isArray(size.aliases) ? size.aliases : [];
        return [size.code, size.name, ...aliases].filter(Boolean).some((x) => normCode(x) === rawKey);
      });
      return found?.name || raw;
    } catch (e) {
      if (e?.code !== "42P01" && e?.code !== "42703") console.error("AIF size normalize warning", e);
      return raw;
    }
  }

  async function applyBrandSizeCodeMapping(client, normalized) {
    if (!normalized || typeof normalized !== "object") return false;
    const sizeCode = emptyToNull(normalized.supplierSize || normalized.supplier_size || normalized.size);
    if (!sizeCode) return false;
    const brandId = await findBrandIdForNormalized(client, normalized);
    if (!brandId) return false;
    try {
      await ensureAifSizeTables(client);
      const r = await client.query(
        `SELECT bsc.id, st.code AS size_type_code, st.name AS size_name
         FROM aif_brand_size_codes bsc
         JOIN aif_size_types st ON st.id=bsc.size_type_id
         WHERE bsc.brand_id=$1
           AND bsc.is_active=true
           AND st.is_active=true
           AND lower(bsc.size_code)=lower($2)
         LIMIT 1`,
        [brandId, sizeCode]
      );
      const found = r.rows[0];
      if (!found) return false;
      normalized.supplierSize = normalized.supplierSize || sizeCode;
      normalized.size = found.size_name || normalized.size;
      normalized.brandSizeCodeId = found.id;
      normalized.sizeTypeCode = found.size_type_code;
      return true;
    } catch (e) {
      if (e?.code !== "42P01" && e?.code !== "42703") console.error("AIF brand size code mapping warning", e);
      return false;
    }
  }

  async function sizeUsage(client, sizeIdOrCode) {
    await ensureAifSizeTables(client);
    const s = await findSizeTypeByIdOrCode(client, sizeIdOrCode);
    if (!s) return { product_variants: 0, brand_size_codes: 0 };
    const r = await client.query(
      `SELECT
         (SELECT count(*)::int FROM aif_product_variants WHERE lower(COALESCE(size,''))=lower($1) OR lower(COALESCE(size,''))=lower($2)) AS product_variants,
         (SELECT count(*)::int FROM aif_brand_size_codes WHERE size_type_id=$3) AS brand_size_codes`,
      [s.name, s.code, s.id]
    );
    return r.rows[0] || { product_variants: 0, brand_size_codes: 0 };
  }

  function brandSizeCodeSelect() {
    return `SELECT bsc.id, bsc.brand_id, b.code AS brand_code, b.name AS brand_name,
                   bsc.size_code, bsc.size_type_id,
                   st.code AS size_type_code, st.name AS size_name,
                   bsc.notes, bsc.is_active, bsc.created_at, bsc.updated_at
            FROM aif_brand_size_codes bsc
            JOIN aif_brands b ON b.id=bsc.brand_id
            JOIN aif_size_types st ON st.id=bsc.size_type_id`;
  }

  async function getBrandSizeCodeItem(client, id) {
    await ensureAifSizeTables(client);
    const r = await client.query(
      `${brandSizeCodeSelect()}
       WHERE bsc.id::text=$1
       LIMIT 1`,
      [id]
    );
    return r.rows[0] || null;
  }




  router.get("/size-types", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    try {
      await ensureAifSizeTables(pool);
      const r = await pool.query(
        `SELECT id, code, name, name_hu, aliases, sort_order, is_active, created_at, updated_at
         FROM aif_size_types
         ${includeInactive ? "" : "WHERE is_active=true"}
         ORDER BY is_active DESC, sort_order ASC, name ASC, code ASC`
      );
      res.json({ items: r.rows });
    } catch (e) {
      console.error("AIF list size types failed", e);
      res.status(500).json({ error: "failed to load sizes" });
    }
  });

  router.post("/size-types/normalize", requireAuthed, async (req, res) => {
    const input = text(req.body?.size || req.body?.name || req.body?.value);
    if (!input) return res.status(400).json({ error: "size required" });
    try {
      const size = await normalizeSizeValue(pool, input);
      const item = await findSizeTypeByIdOrCode(pool, size || input);
      res.json({ input, size, item });
    } catch (e) {
      console.error("AIF normalize size failed", e);
      res.status(500).json({ error: "failed to normalize size" });
    }
  });

  router.post("/size-types", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const name = text(body.name || body.label || body.size || body.code);
    const code = normCode(body.code || name).toUpperCase();
    const aliases = sizeAliasesFromInput(body.aliases || body.alias_list || body.aliasList);
    const sortOrder = toInt(body.sortOrder ?? body.sort_order) || 100;
    if (!name) return res.status(400).json({ error: "size name required" });
    if (!code) return res.status(400).json({ error: "size code required" });
    try {
      await ensureAifSizeTables(pool);
      const r = await pool.query(
        `INSERT INTO aif_size_types (code, name, name_hu, aliases, sort_order, is_active)
         VALUES ($1,$2,$3,$4::text[],$5,true)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name,
           name_hu=EXCLUDED.name_hu,
           aliases=EXCLUDED.aliases,
           sort_order=EXCLUDED.sort_order,
           is_active=true,
           updated_at=now()
         RETURNING id, code, name, name_hu, aliases, sort_order, is_active, created_at, updated_at`,
        [code, name, emptyToNull(body.nameHu || body.name_hu), aliases, sortOrder]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create size type failed", e);
      res.status(500).json({ error: "failed to save size" });
    }
  });

  router.patch("/size-types/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;
    if (body.name !== undefined || body.label !== undefined || body.size !== undefined) {
      const name = text(body.name ?? body.label ?? body.size);
      if (!name) return res.status(400).json({ error: "size name required" });
      sets.push(`name=$${i++}`);
      args.push(name);
    }
    if (body.nameHu !== undefined || body.name_hu !== undefined) {
      sets.push(`name_hu=$${i++}`);
      args.push(emptyToNull(body.nameHu ?? body.name_hu));
    }
    if (body.parentId !== undefined || body.parent_id !== undefined || body.parentCode !== undefined || body.parent_code !== undefined) {
      sets.push(`parent_id=NULLIF($${i++}, '')::uuid`);
      args.push(emptyToNull(body.parentId ?? body.parent_id ?? body.parentCode ?? body.parent_code) || '');
    }
    if (body.code !== undefined) {
      const code = normCode(body.code).toUpperCase();
      if (!code) return res.status(400).json({ error: "size code required" });
      sets.push(`code=$${i++}`);
      args.push(code);
    }
    if (body.aliases !== undefined || body.aliasList !== undefined || body.alias_list !== undefined) {
      sets.push(`aliases=$${i++}::text[]`);
      args.push(sizeAliasesFromInput(body.aliases ?? body.aliasList ?? body.alias_list));
    }
    if (body.sortOrder !== undefined || body.sort_order !== undefined) {
      sets.push(`sort_order=$${i++}`);
      args.push(toInt(body.sortOrder ?? body.sort_order) || 100);
    }
    if (body.parentId !== undefined || body.parent_id !== undefined || body.parentCode !== undefined || body.parent_code !== undefined) {
      const parentInput = emptyToNull(body.parentId ?? body.parent_id ?? body.parentCode ?? body.parent_code);
      let parentId = null;
      if (parentInput) {
        const parent = await pool.query(`SELECT id FROM aif_categories WHERE id::text=$1 OR code=$1 LIMIT 1`, [parentInput]);
        if (!parent.rowCount) return res.status(400).json({ error: "parent category not found" });
        if (String(parent.rows[0].id) === String(id)) return res.status(400).json({ error: "category cannot be its own parent" });
        parentId = parent.rows[0].id;
      }
      sets.push(`parent_id=NULLIF($${i++}, '')::uuid`);
      args.push(parentId || '');
    }
    if (body.is_active !== undefined || body.isActive !== undefined) {
      sets.push(`is_active=$${i++}`);
      args.push(Boolean(body.is_active ?? body.isActive));
    }
    if (!sets.length) return res.json({ ok: true });
    args.push(id);
    try {
      await ensureAifSizeTables(pool);
      const r = await pool.query(
        `UPDATE aif_size_types
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i} OR code=$${i}
         RETURNING id, code, name, name_hu, aliases, sort_order, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "size not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update size type failed", e);
      res.status(500).json({ error: "failed to update size" });
    }
  });

  router.delete("/size-types/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureAifSizeTables(client);
      const size = await findSizeTypeByIdOrCode(client, id);
      if (!size) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "size not found" });
      }
      await client.query(`SELECT id FROM aif_size_types WHERE id=$1 FOR UPDATE`, [size.id]);
      const usage = await sizeUsage(client, size.id);
      if (Number(usage.product_variants || 0) > 0 || Number(usage.brand_size_codes || 0) > 0) {
        await client.query(`UPDATE aif_size_types SET is_active=false, updated_at=now() WHERE id=$1`, [size.id]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }
      await client.query(`DELETE FROM aif_size_types WHERE id=$1`, [size.id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete size type failed", e);
      res.status(500).json({ error: "failed to delete size" });
    } finally {
      client.release();
    }
  });

  router.get("/brand-size-codes", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const brand = text(req.query.brand || req.query.brandId || req.query.brand_id || req.query.brandCode || req.query.brand_code);
    const args = [];
    const where = [];
    if (!includeInactive) where.push(`bsc.is_active=true AND b.is_active=true AND st.is_active=true`);
    if (brand) {
      args.push(brand);
      where.push(`(b.id::text=$${args.length} OR b.code=$${args.length} OR lower(b.name)=lower($${args.length}))`);
    }
    try {
      await ensureAifSizeTables(pool);
      const r = await pool.query(
        `${brandSizeCodeSelect()}
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY b.name ASC, bsc.size_code ASC`,
        args
      );
      res.json({ items: r.rows });
    } catch (e) {
      console.error("AIF list brand size codes failed", e);
      res.status(500).json({ error: "failed to load brand size codes" });
    }
  });

  router.post("/brand-size-codes", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const sizeCode = text(body.sizeCode || body.size_code).toUpperCase();
    if (!sizeCode) return res.status(400).json({ error: "brand size code required" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureAifSizeTables(client);
      const brand = await findByIdOrCode(client, "aif_brands", body.brandId || body.brand_id || body.brandCode || body.brand_code || body.brand);
      const size = await findSizeTypeByIdOrCode(client, body.sizeTypeId || body.size_type_id || body.sizeTypeCode || body.size_type_code || body.size || body.standardSize);
      if (!brand || brand.is_active === false) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "brand required or inactive" });
      }
      if (!size || size.is_active === false) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "standard size required or inactive" });
      }
      const r = await client.query(
        `INSERT INTO aif_brand_size_codes (brand_id, size_code, size_type_id, notes, is_active)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (brand_id, size_code) DO UPDATE SET
           size_type_id=EXCLUDED.size_type_id,
           notes=EXCLUDED.notes,
           is_active=true,
           updated_at=now()
         RETURNING id`,
        [brand.id, sizeCode, size.id, emptyToNull(body.notes)]
      );
      const item = await getBrandSizeCodeItem(client, r.rows[0].id);
      await client.query("COMMIT");
      res.json({ item });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF save brand size code failed", e);
      res.status(500).json({ error: "failed to save brand size code" });
    } finally {
      client.release();
    }
  });

  router.patch("/brand-size-codes/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureAifSizeTables(client);
      const current = await client.query(`SELECT id FROM aif_brand_size_codes WHERE id::text=$1 FOR UPDATE`, [id]);
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "brand size code not found" });
      }
      const sets = [];
      const args = [];
      let i = 1;
      if (body.brandId !== undefined || body.brand_id !== undefined || body.brandCode !== undefined || body.brand_code !== undefined || body.brand !== undefined) {
        const brand = await findByIdOrCode(client, "aif_brands", body.brandId || body.brand_id || body.brandCode || body.brand_code || body.brand);
        if (!brand || brand.is_active === false) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "brand required or inactive" });
        }
        sets.push(`brand_id=$${i++}`);
        args.push(brand.id);
      }
      if (body.sizeCode !== undefined || body.size_code !== undefined) {
        const sizeCode = text(body.sizeCode ?? body.size_code).toUpperCase();
        if (!sizeCode) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "brand size code required" });
        }
        sets.push(`size_code=$${i++}`);
        args.push(sizeCode);
      }
      if (body.sizeTypeId !== undefined || body.size_type_id !== undefined || body.sizeTypeCode !== undefined || body.size_type_code !== undefined || body.size !== undefined || body.standardSize !== undefined) {
        const size = await findSizeTypeByIdOrCode(client, body.sizeTypeId || body.size_type_id || body.sizeTypeCode || body.size_type_code || body.size || body.standardSize);
        if (!size || size.is_active === false) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "standard size required or inactive" });
        }
        sets.push(`size_type_id=$${i++}`);
        args.push(size.id);
      }
      if (body.notes !== undefined) {
        sets.push(`notes=$${i++}`);
        args.push(emptyToNull(body.notes));
      }
      if (body.is_active !== undefined || body.isActive !== undefined) {
        sets.push(`is_active=$${i++}`);
        args.push(Boolean(body.is_active ?? body.isActive));
      }
      if (sets.length) {
        args.push(current.rows[0].id);
        await client.query(
          `UPDATE aif_brand_size_codes SET ${sets.join(", ")}, updated_at=now() WHERE id=$${i}`,
          args
        );
      }
      const item = await getBrandSizeCodeItem(client, current.rows[0].id);
      await client.query("COMMIT");
      res.json({ item });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF update brand size code failed", e);
      if (e?.code === "23505") return res.status(400).json({ error: "A márkához ez a méretkód már létezik." });
      res.status(500).json({ error: "failed to update brand size code" });
    } finally {
      client.release();
    }
  });

  router.delete("/brand-size-codes/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    try {
      await ensureAifSizeTables(pool);
      const usage = await brandSizeCodeUsage(pool, id);
      if (Number(usage.product_variants || 0) > 0) {
        const r = await pool.query(`UPDATE aif_brand_size_codes SET is_active=false, updated_at=now() WHERE id::text=$1 RETURNING id`, [id]);
        if (!r.rowCount) return res.status(404).json({ error: "brand size code not found" });
        return res.json({ ok: true, mode: "deactivated", usage });
      }
      const r = await pool.query(`DELETE FROM aif_brand_size_codes WHERE id::text=$1`, [id]);
      if (!r.rowCount) return res.status(404).json({ error: "brand size code not found" });
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      console.error("AIF delete brand size code failed", e);
      res.status(500).json({ error: "failed to delete brand size code" });
    }
  });

  router.get("/brands", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `WITH ranked AS (
         SELECT id, code, name, is_active,
                row_number() OVER (
                  PARTITION BY lower(regexp_replace(trim(COALESCE(name, code, '')), '\\s+', ' ', 'g'))
                  ORDER BY is_active DESC, name ASC, code ASC, id::text ASC
                ) AS rn
          FROM aif_brands
          ${includeInactive ? "" : "WHERE is_active=true"}
       )
       SELECT id, code, name, is_active
       FROM ranked
       WHERE rn=1
       ORDER BY is_active DESC, name ASC`
    );
    res.json({ items: r.rows });
  });

  router.get("/categories", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT id, code, parent_id, name_ro, name_hu, aliases, shopify_collection_handle, sort_order, is_active, created_at, updated_at
       FROM aif_categories
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, sort_order ASC, name_ro ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/categories", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const nameRo = text(body.nameRo || body.name_ro || body.name);
    const nameHu = emptyToNull(body.nameHu || body.name_hu);
    let code = normCode(body.code || nameRo);
    const sortOrder = toInt(body.sortOrder ?? body.sort_order) || 100;
    const aliases = categoryAliasesFromInput(body.aliases || body.alias_list || body.aliasList);
    const shopifyHandle = emptyToNull(body.shopifyCollectionHandle || body.shopify_collection_handle);
    const parentInput = emptyToNull(body.parentId ?? body.parent_id ?? body.parentCode ?? body.parent_code);
    if (!nameRo) return res.status(400).json({ error: "category name required" });
    if (!code) return res.status(400).json({ error: "category code required" });
    try {
      let parentId = null;
      if (parentInput) {
        const parent = await pool.query(`SELECT id, code FROM aif_categories WHERE id::text=$1 OR code=$1 LIMIT 1`, [parentInput]);
        if (!parent.rowCount) return res.status(400).json({ error: "parent category not found" });
        parentId = parent.rows[0].id;
        if (!emptyToNull(body.code)) code = normCode(`${parent.rows[0].code || parentId}_${nameRo}`);
      }
      const r = await pool.query(
        `INSERT INTO aif_categories (code, parent_id, name_ro, name_hu, aliases, shopify_collection_handle, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5::text[],$6,$7,true)
         ON CONFLICT (code) DO UPDATE SET
           parent_id=EXCLUDED.parent_id,
           name_ro=EXCLUDED.name_ro,
           name_hu=EXCLUDED.name_hu,
           aliases=EXCLUDED.aliases,
           shopify_collection_handle=EXCLUDED.shopify_collection_handle,
           sort_order=EXCLUDED.sort_order,
           is_active=true,
           updated_at=now()
         RETURNING id, code, parent_id, name_ro, name_hu, aliases, shopify_collection_handle, sort_order, is_active, created_at, updated_at`,
        [code, parentId, nameRo, nameHu, aliases, shopifyHandle, sortOrder]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create category failed", e);
      res.status(500).json({ error: "failed to save category" });
    }
  });

  router.patch("/categories/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;

    if (body.nameRo !== undefined || body.name_ro !== undefined || body.name !== undefined) {
      const nameRo = text(body.nameRo ?? body.name_ro ?? body.name);
      if (!nameRo) return res.status(400).json({ error: "category name required" });
      sets.push(`name_ro=$${i++}`);
      args.push(nameRo);
    }
    if (body.nameHu !== undefined || body.name_hu !== undefined) {
      sets.push(`name_hu=$${i++}`);
      args.push(emptyToNull(body.nameHu ?? body.name_hu));
    }
    if (body.aliases !== undefined || body.aliasList !== undefined || body.alias_list !== undefined) {
      sets.push(`aliases=$${i++}::text[]`);
      args.push(categoryAliasesFromInput(body.aliases ?? body.aliasList ?? body.alias_list));
    }
    if (body.code !== undefined) {
      const code = normCode(body.code);
      if (!code) return res.status(400).json({ error: "category code required" });
      sets.push(`code=$${i++}`);
      args.push(code);
    }
    if (body.parentId !== undefined || body.parent_id !== undefined || body.parentCode !== undefined || body.parent_code !== undefined || body.parentCategoryId !== undefined || body.parent_category_id !== undefined || body.parentCategoryCode !== undefined || body.parent_category_code !== undefined) {
      const parentInput = emptyToNull(body.parentId ?? body.parent_id ?? body.parentCode ?? body.parent_code ?? body.parentCategoryId ?? body.parent_category_id ?? body.parentCategoryCode ?? body.parent_category_code);
      let parentId = null;
      if (parentInput) {
        const parent = await pool.query(`SELECT id FROM aif_categories WHERE id::text=$1 OR code=$1 LIMIT 1`, [parentInput]);
        if (!parent.rowCount) return res.status(400).json({ error: "parent category not found" });
        if (String(parent.rows[0].id) === String(id)) return res.status(400).json({ error: "category cannot be its own parent" });
        parentId = parent.rows[0].id;
      }
      sets.push(`parent_id=$${i++}`);
      args.push(parentId);
    }
    if (body.shopifyCollectionHandle !== undefined || body.shopify_collection_handle !== undefined) {
      sets.push(`shopify_collection_handle=$${i++}`);
      args.push(emptyToNull(body.shopifyCollectionHandle ?? body.shopify_collection_handle));
    }
    if (body.sortOrder !== undefined || body.sort_order !== undefined) {
      sets.push(`sort_order=$${i++}`);
      args.push(toInt(body.sortOrder ?? body.sort_order) || 100);
    }
    if (body.is_active !== undefined || body.isActive !== undefined) {
      sets.push(`is_active=$${i++}`);
      args.push(Boolean(body.is_active ?? body.isActive));
    }

    if (!sets.length) return res.json({ ok: true });
    args.push(id);

    try {
      const r = await pool.query(
        `UPDATE aif_categories
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i} OR code=$${i}
         RETURNING id, code, parent_id, name_ro, name_hu, aliases, shopify_collection_handle, sort_order, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "category not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update category failed", e);
      res.status(500).json({ error: "failed to update category" });
    }
  });

  router.delete("/categories/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const category = await client.query(
        `SELECT id, code, name_ro FROM aif_categories WHERE id::text=$1 OR code=$1 FOR UPDATE`,
        [id]
      );
      if (!category.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "category not found" });
      }
      const usage = await categoryUsage(client, category.rows[0].id);
      if (Number(usage.product_models || 0) > 0 || Number(usage.child_categories || 0) > 0) {
        await client.query(`UPDATE aif_categories SET is_active=false, updated_at=now() WHERE id=$1`, [category.rows[0].id]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }
      await client.query(`DELETE FROM aif_categories WHERE id=$1`, [category.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete category failed", e);
      res.status(500).json({ error: "failed to delete category" });
    } finally {
      client.release();
    }
  });

  router.get("/gender-types", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT code, name, aliases, sort_order, is_active, created_at, updated_at
       FROM aif_gender_types
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, sort_order ASC, name ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/gender-types", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const name = text(body.name);
    const code = normCode(body.code || name);
    const sortOrder = toInt(body.sortOrder ?? body.sort_order) || 100;
    const aliases = genderAliasesFromInput(body.aliases || body.alias_list || body.aliasList);
    if (!name) return res.status(400).json({ error: "gender name required" });
    if (!code) return res.status(400).json({ error: "gender code required" });
    try {
      const r = await pool.query(
        `INSERT INTO aif_gender_types (code, name, aliases, sort_order, is_active)
         VALUES ($1,$2,$3::text[],$4,true)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name,
           aliases=EXCLUDED.aliases,
           sort_order=EXCLUDED.sort_order,
           is_active=true,
           updated_at=now()
         RETURNING code, name, aliases, sort_order, is_active, created_at, updated_at`,
        [code, name, aliases, sortOrder]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create gender type failed", e);
      res.status(500).json({ error: "failed to save gender" });
    }
  });

  router.patch("/gender-types/:code", requireAuthed, async (req, res) => {
    const codeParam = normCode(req.params.code);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;

    if (body.name !== undefined) {
      const name = text(body.name);
      if (!name) return res.status(400).json({ error: "gender name required" });
      sets.push(`name=$${i++}`);
      args.push(name);
    }
    if (body.aliases !== undefined || body.aliasList !== undefined || body.alias_list !== undefined) {
      sets.push(`aliases=$${i++}::text[]`);
      args.push(genderAliasesFromInput(body.aliases ?? body.aliasList ?? body.alias_list));
    }
    if (body.sortOrder !== undefined || body.sort_order !== undefined) {
      sets.push(`sort_order=$${i++}`);
      args.push(toInt(body.sortOrder ?? body.sort_order) || 100);
    }
    if (body.parentId !== undefined || body.parent_id !== undefined || body.parentCode !== undefined || body.parent_code !== undefined) {
      const parentInput = emptyToNull(body.parentId ?? body.parent_id ?? body.parentCode ?? body.parent_code);
      let parentId = null;
      if (parentInput) {
        const parent = await pool.query(`SELECT id FROM aif_categories WHERE id::text=$1 OR code=$1 LIMIT 1`, [parentInput]);
        if (!parent.rowCount) return res.status(400).json({ error: "parent category not found" });
        if (String(parent.rows[0].id) === String(id)) return res.status(400).json({ error: "category cannot be its own parent" });
        parentId = parent.rows[0].id;
      }
      sets.push(`parent_id=NULLIF($${i++}, '')::uuid`);
      args.push(parentId || '');
    }
    if (body.is_active !== undefined || body.isActive !== undefined) {
      sets.push(`is_active=$${i++}`);
      args.push(Boolean(body.is_active ?? body.isActive));
    }

    if (!sets.length) return res.json({ ok: true });
    args.push(codeParam);

    try {
      const r = await pool.query(
        `UPDATE aif_gender_types
         SET ${sets.join(", ")}, updated_at=now()
         WHERE code=$${i}
         RETURNING code, name, aliases, sort_order, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "gender not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update gender type failed", e);
      res.status(500).json({ error: "failed to update gender" });
    }
  });

  router.delete("/gender-types/:code", requireAuthed, async (req, res) => {
    const codeParam = normCode(req.params.code);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const gt = await client.query(`SELECT code, name FROM aif_gender_types WHERE code=$1 FOR UPDATE`, [codeParam]);
      if (!gt.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "gender not found" });
      }
      const activeCount = await client.query(`SELECT count(*)::int AS c FROM aif_gender_types WHERE is_active=true AND code <> $1`, [codeParam]);
      if (Number(activeCount.rows[0]?.c || 0) <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "at least one active gender is required" });
      }
      const usage = await genderTypeUsage(client, codeParam);
      if (Number(usage.product_models || 0) > 0) {
        await client.query(`UPDATE aif_gender_types SET is_active=false, updated_at=now() WHERE code=$1`, [codeParam]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }
      await client.query(`DELETE FROM aif_gender_types WHERE code=$1`, [codeParam]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete gender type failed", e);
      res.status(500).json({ error: "failed to delete gender" });
    } finally {
      client.release();
    }
  });

  router.get("/location-types", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT id, code, name, sort_order, is_active, created_at, updated_at
       FROM aif_location_types
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, sort_order ASC, name ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/location-types", requireAdminOrSecret, async (req, res) => {
    const body = req.body || {};
    const name = text(body.name);
    const code = normCode(body.code || name);
    const sortOrder = toInt(body.sortOrder ?? body.sort_order) || 100;

    if (!name) return res.status(400).json({ error: "location type name required" });
    if (!code) return res.status(400).json({ error: "location type code required" });

    try {
      const r = await pool.query(
        `INSERT INTO aif_location_types (code, name, sort_order, is_active)
         VALUES ($1,$2,$3,true)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name,
           sort_order=EXCLUDED.sort_order,
           is_active=true,
           updated_at=now()
         RETURNING id, code, name, sort_order, is_active, created_at, updated_at`,
        [code, name, sortOrder]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create location type failed", e);
      res.status(500).json({ error: "failed to save location type" });
    }
  });

  router.patch("/location-types/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;

    if (body.name !== undefined) {
      const name = text(body.name);
      if (!name) return res.status(400).json({ error: "location type name required" });
      sets.push(`name=$${i++}`);
      args.push(name);
    }
    if (body.code !== undefined) {
      const code = normCode(body.code);
      if (!code) return res.status(400).json({ error: "location type code required" });
      sets.push(`code=$${i++}`);
      args.push(code);
    }
    if (body.sortOrder !== undefined || body.sort_order !== undefined) {
      sets.push(`sort_order=$${i++}`);
      args.push(toInt(body.sortOrder ?? body.sort_order) || 100);
    }
    if (body.parentId !== undefined || body.parent_id !== undefined || body.parentCode !== undefined || body.parent_code !== undefined) {
      const parentInput = emptyToNull(body.parentId ?? body.parent_id ?? body.parentCode ?? body.parent_code);
      let parentId = null;
      if (parentInput) {
        const parent = await pool.query(`SELECT id FROM aif_categories WHERE id::text=$1 OR code=$1 LIMIT 1`, [parentInput]);
        if (!parent.rowCount) return res.status(400).json({ error: "parent category not found" });
        if (String(parent.rows[0].id) === String(id)) return res.status(400).json({ error: "category cannot be its own parent" });
        parentId = parent.rows[0].id;
      }
      sets.push(`parent_id=NULLIF($${i++}, '')::uuid`);
      args.push(parentId || '');
    }
    if (body.is_active !== undefined || body.isActive !== undefined) {
      sets.push(`is_active=$${i++}`);
      args.push(Boolean(body.is_active ?? body.isActive));
    }

    if (!sets.length) return res.json({ ok: true });
    args.push(id);

    try {
      const r = await pool.query(
        `UPDATE aif_location_types
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i} OR code=$${i}
         RETURNING id, code, name, sort_order, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "location type not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update location type failed", e);
      res.status(500).json({ error: "failed to update location type" });
    }
  });

  router.delete("/location-types/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const typeRes = await client.query(
        `SELECT id, code, name FROM aif_location_types WHERE id::text=$1 OR code=$1 FOR UPDATE`,
        [id]
      );
      if (!typeRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "location type not found" });
      }

      const activeCount = await client.query(
        `SELECT count(*)::int AS c FROM aif_location_types WHERE is_active=true AND id <> $1`,
        [typeRes.rows[0].id]
      );
      if (Number(activeCount.rows[0]?.c || 0) <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "at least one active location type is required" });
      }

      const usage = await locationTypeUsage(client, typeRes.rows[0].code);
      if (Number(usage.locations || 0) > 0) {
        await client.query(`UPDATE aif_location_types SET is_active=false, updated_at=now() WHERE id=$1`, [typeRes.rows[0].id]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }

      await client.query(`DELETE FROM aif_location_types WHERE id=$1`, [typeRes.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete location type failed", e);
      res.status(500).json({ error: "failed to delete location type" });
    } finally {
      client.release();
    }
  });

  router.get("/locations", requireAuthed, async (req, res) => {
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const r = await pool.query(
      `SELECT id, code, name, location_type, is_active, created_at, updated_at
       FROM aif_locations
       ${includeInactive ? "" : "WHERE is_active=true"}
       ORDER BY is_active DESC, name ASC`
    );
    res.json({ items: r.rows });
  });

  router.post("/locations", requireAdminOrSecret, async (req, res) => {
    const body = req.body || {};
    const name = text(body.name);
    const code = normCode(body.code || name);
    const locationType = normCode(body.locationType || body.location_type || "warehouse") || "warehouse";

    if (!name) return res.status(400).json({ error: "location name required" });
    if (!code) return res.status(400).json({ error: "location code required" });

    try {
      if (!(await activeLocationTypeExists(pool, locationType))) {
        return res.status(400).json({ error: "invalid location type" });
      }
      const r = await pool.query(
        `INSERT INTO aif_locations (code, name, location_type, is_active)
         VALUES ($1,$2,$3,true)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name,
           location_type=EXCLUDED.location_type,
           is_active=true,
           updated_at=now()
         RETURNING id, code, name, location_type, is_active, created_at, updated_at`,
        [code, name, locationType]
      );
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF create location failed", e);
      res.status(500).json({ error: "failed to save location" });
    }
  });

  router.patch("/locations/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    const sets = [];
    const args = [];
    let i = 1;

    if (body.name !== undefined) {
      const name = text(body.name);
      if (!name) return res.status(400).json({ error: "location name required" });
      sets.push(`name=$${i++}`);
      args.push(name);
    }
    if (body.code !== undefined) {
      const code = normCode(body.code);
      if (!code) return res.status(400).json({ error: "location code required" });
      sets.push(`code=$${i++}`);
      args.push(code);
    }
    if (body.locationType !== undefined || body.location_type !== undefined) {
      const locationType = normCode(body.locationType || body.location_type || "warehouse") || "warehouse";
      if (!(await activeLocationTypeExists(pool, locationType))) return res.status(400).json({ error: "invalid location type" });
      sets.push(`location_type=$${i++}`);
      args.push(locationType);
    }
    if (body.is_active !== undefined || body.isActive !== undefined) {
      sets.push(`is_active=$${i++}`);
      args.push(Boolean(body.is_active ?? body.isActive));
    }

    if (!sets.length) return res.json({ ok: true });
    args.push(id);

    try {
      const r = await pool.query(
        `UPDATE aif_locations
         SET ${sets.join(", ")}, updated_at=now()
         WHERE id::text=$${i} OR code=$${i}
         RETURNING id, code, name, location_type, is_active, created_at, updated_at`,
        args
      );
      if (!r.rowCount) return res.status(404).json({ error: "location not found" });
      res.json({ item: r.rows[0] });
    } catch (e) {
      console.error("AIF update location failed", e);
      res.status(500).json({ error: "failed to update location" });
    }
  });

  router.delete("/locations/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const location = await client.query(
        `SELECT id, code, name FROM aif_locations WHERE id::text=$1 OR code=$1 FOR UPDATE`,
        [id]
      );
      if (!location.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "location not found" });
      }

      const activeCount = await client.query(
        `SELECT count(*)::int AS c FROM aif_locations WHERE is_active=true AND id <> $1`,
        [location.rows[0].id]
      );
      if (Number(activeCount.rows[0]?.c || 0) <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "at least one active location is required" });
      }

      const usage = await locationUsage(client, location.rows[0].id);
      if (
        Number(usage.import_batches || 0) > 0 ||
        Number(usage.stock_rows || 0) > 0 ||
        Number(usage.stock_movements || 0) > 0
      ) {
        await client.query(`UPDATE aif_locations SET is_active=false, updated_at=now() WHERE id=$1`, [location.rows[0].id]);
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "deactivated", usage });
      }

      await client.query(`DELETE FROM aif_locations WHERE id=$1`, [location.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted", usage });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete location failed", e);
      res.status(500).json({ error: "failed to delete location" });
    } finally {
      client.release();
    }
  });

  router.get("/meta", requireAuthed, async (_req, res) => {
    await ensureAifSizeTables(pool);
    const [suppliers, brands, categories, genderTypes, locations, locationTypes, currencies, colorTypes, brandColorCodes, sizeTypes, brandSizeCodes, materialTypes, supplierBrands, profiles] = await Promise.all([
      pool.query(`SELECT id, code, name, is_active FROM aif_suppliers WHERE is_active=true ORDER BY name ASC`),
      pool.query(`WITH ranked AS (
                    SELECT id, code, name, is_active,
                           row_number() OVER (
                             PARTITION BY lower(regexp_replace(trim(COALESCE(name, code, '')), '\s+', ' ', 'g'))
                             ORDER BY is_active DESC, name ASC, code ASC, id::text ASC
                           ) AS rn
                    FROM aif_brands
                    WHERE is_active=true
                  )
                  SELECT id, code, name, is_active
                  FROM ranked
                  WHERE rn=1
                  ORDER BY name ASC`),
      pool.query(`SELECT id, code, parent_id, name_ro, name_hu, aliases, sort_order, is_active FROM aif_categories WHERE is_active=true ORDER BY parent_id NULLS FIRST, sort_order ASC, name_ro ASC`),
      pool.query(`SELECT code, name, aliases, sort_order, is_active FROM aif_gender_types WHERE is_active=true ORDER BY sort_order ASC, name ASC`),
      pool.query(`SELECT id, code, name, location_type, is_active FROM aif_locations WHERE is_active=true ORDER BY name ASC`),
      pool.query(`SELECT id, code, name, sort_order, is_active FROM aif_location_types WHERE is_active=true ORDER BY sort_order ASC, name ASC`),
      pool.query(`SELECT code, name, symbol, sort_order, is_active FROM aif_currencies WHERE is_active=true ORDER BY sort_order ASC, code ASC`),
      pool.query(`SELECT id, code, name_ro, name_hu, name_en, name_de, aliases, hex, sort_order, is_active
                  FROM aif_color_types
                  WHERE is_active=true
                  ORDER BY sort_order ASC, name_ro ASC`),
      pool.query(`${brandColorCodeSelect()}
                  WHERE bcc.is_active=true AND b.is_active=true AND c.is_active=true
                  ORDER BY b.name ASC, bcc.color_code ASC`),
      pool.query(`SELECT id, code, name, name_hu, aliases, sort_order, is_active
                  FROM aif_size_types
                  WHERE is_active=true
                  ORDER BY sort_order ASC, name ASC, code ASC`),
      pool.query(`${brandSizeCodeSelect()}
                  WHERE bsc.is_active=true AND b.is_active=true AND st.is_active=true
                  ORDER BY b.name ASC, bsc.size_code ASC`),
      pool.query(`SELECT id, code, name_ro, name_hu, name_en, name_de, aliases, sort_order, is_active
                  FROM aif_material_types
                  WHERE is_active=true
                  ORDER BY sort_order ASC, name_ro ASC`),
      pool.query(`SELECT sb.id, sb.supplier_id, sb.brand_id, sb.is_preferred, sb.is_active,
                         s.name AS supplier_name, b.name AS brand_name
                  FROM aif_supplier_brands sb
                  JOIN aif_suppliers s ON s.id=sb.supplier_id
                  JOIN aif_brands b ON b.id=sb.brand_id
                  WHERE sb.is_active=true AND s.is_active=true AND b.is_active=true
                  ORDER BY s.name ASC, b.name ASC`),
      pool.query(`SELECT p.id, p.supplier_id, s.code AS supplier_code, p.name, p.source_format, p.version, p.is_active
                  FROM aif_supplier_import_profiles p
                  JOIN aif_suppliers s ON s.id=p.supplier_id
                  WHERE s.is_active=true AND p.is_active=true
                  ORDER BY s.name ASC, p.name ASC, p.version DESC`),
    ]);
    const salesTvaSettings = await readSalesTvaSettings(pool);
    res.json({
      suppliers: suppliers.rows,
      brands: brands.rows,
      categories: categories.rows,
      genderTypes: genderTypes.rows,
      locations: locations.rows,
      locationTypes: locationTypes.rows,
      currencies: currencies.rows,
      colorTypes: colorTypes.rows,
      brandColorCodes: brandColorCodes.rows,
      sizeTypes: sizeTypes.rows,
      brandSizeCodes: brandSizeCodes.rows,
      materialTypes: materialTypes.rows,
      supplierBrands: supplierBrands.rows,
      profiles: profiles.rows,
      salesTvaSettings,
      settings: { incomingSales: salesTvaSettings },
      appSettings: { incomingSales: salesTvaSettings },
    });
  });

  router.get("/import-profiles", requireAuthed, async (req, res) => {
    const supplier = text(req.query.supplier || req.query.supplierCode || req.query.supplier_id);
    const includeInactive = ["1", "true", "yes"].includes(text(req.query.includeInactive || req.query.include_inactive).toLowerCase());
    const args = [];
    const where = [];
    if (!includeInactive) {
      where.push(`s.is_active=true`);
      where.push(`p.is_active=true`);
    }
    if (supplier) {
      args.push(supplier);
      where.push(`(s.code=$${args.length} OR s.id::text=$${args.length})`);
    }
    const r = await pool.query(
      `SELECT p.id, p.supplier_id, s.code AS supplier_code, s.name AS supplier_name,
              p.name, p.source_format, p.version, p.sheet_name_hint, p.header_row_hint, p.is_active, p.settings
       FROM aif_supplier_import_profiles p
       JOIN aif_suppliers s ON s.id=p.supplier_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY s.name ASC, p.name ASC, p.version DESC`,
      args
    );
    res.json({ items: r.rows });
  });

  router.post("/import-batches", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const client = await pool.connect();
    try {
      const supplier = await findByIdOrCode(client, "aif_suppliers", body.supplierId || body.supplier_id || body.supplierCode || body.supplier);
      if (!supplier) return res.status(400).json({ error: "supplier required or unknown" });
      if (supplier.is_active === false) return res.status(400).json({ error: "supplier is inactive" });

      let profileId = emptyToNull(body.profileId || body.profile_id);
      if (!profileId) {
        const pr = await client.query(
          `SELECT id FROM aif_supplier_import_profiles
           WHERE supplier_id=$1 AND is_active=true
           ORDER BY version DESC
           LIMIT 1`,
          [supplier.id]
        );
        profileId = pr.rows[0]?.id || null;
      }

      let location = null;
      const locInput = body.targetLocationId || body.target_location_id || body.locationId || body.location_id || body.locationCode || body.location;
      if (locInput) location = await findByIdOrCode(client, "aif_locations", locInput);
      const targetLocationId = location?.id || await getDefaultLocationId(client);
      if (!targetLocationId) return res.status(400).json({ error: "target location missing" });

      const reception = receptionFromBody(body);
      if (!reception.invoiceNumber) return res.status(400).json({ error: "invoice number required" });
      if (!reception.invoiceDate) return res.status(400).json({ error: "invoice date required" });
      if (!reception.receptionDate) return res.status(400).json({ error: "reception date required" });
      if (!reception.currencyCode) return res.status(400).json({ error: "currency required" });
      const receptionExchangeRateToRon = effectiveReceptionExchangeRateToRon(reception);
      if (!receptionExchangeRateToRon || receptionExchangeRateToRon <= 0) return res.status(400).json({ error: "exchange rate required" });
      if (!reception.tvaMode) return res.status(400).json({ error: "TVA mode required" });
      if (reception.tvaMode !== "no_tva" && (reception.tvaRate === null || reception.tvaRate === undefined)) return res.status(400).json({ error: "TVA rate required" });
      if (reception.invoiceGross === null || reception.invoiceGross === undefined) return res.status(400).json({ error: "invoice total required" });

      const curr = await client.query(`SELECT code FROM aif_currencies WHERE code=$1 AND is_active=true LIMIT 1`, [reception.currencyCode]);
      if (!curr.rowCount) return res.status(400).json({ error: "currency is inactive or unknown" });

      await client.query("BEGIN");

      const receptionRes = await client.query(
        `INSERT INTO aif_receptions (
           supplier_id, target_location_id, invoice_number, invoice_date, reception_date,
           currency_code, exchange_rate_to_ron, tva_mode, tva_rate, shipping_cost,
           goods_value, invoice_net, invoice_vat, invoice_gross, total_qty, line_count,
           status, note, raw_meta, created_by, actor
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'draft',$17,$18::jsonb,$19,$20)
         RETURNING id`,
        [
          supplier.id,
          targetLocationId,
          reception.invoiceNumber,
          reception.invoiceDate,
          reception.receptionDate,
          reception.currencyCode,
          receptionExchangeRateToRon,
          reception.tvaMode,
          reception.tvaRate,
          reception.shippingCost,
          reception.goodsValue,
          reception.invoiceNet,
          reception.invoiceVat,
          reception.invoiceGross,
          reception.totalQty,
          reception.lineCount,
          reception.note,
          JSON.stringify(reception.rawMeta || {}),
          req.session?.role || "system",
          actorFrom(req),
        ]
      );

      const r = await client.query(
        `INSERT INTO aif_import_batches (
           supplier_id, profile_id, target_location_id, reception_id, source_file_name,
           source_file_url, source_format, status, created_by, actor, note, raw_meta,
           currency_code, exchange_rate_to_ron, invoice_number
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11::jsonb,$12,$13,$14)
         RETURNING id`,
        [
          supplier.id,
          profileId,
          targetLocationId,
          receptionRes.rows[0].id,
          emptyToNull(body.sourceFileName || body.source_file_name || body.fileName),
          emptyToNull(body.sourceFileUrl || body.source_file_url || body.fileUrl),
          normCode(body.sourceFormat || body.source_format || "xls") || "xls",
          req.session?.role || "system",
          actorFrom(req),
          emptyToNull(body.note),
          JSON.stringify(body.rawMeta || body.raw_meta || {}),
          reception.currencyCode,
          receptionExchangeRateToRon,
          reception.invoiceNumber,
        ]
      );
      await client.query("COMMIT");
      res.json({ id: r.rows[0].id, receptionId: receptionRes.rows[0].id });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF create import batch failed", e);
      res.status(500).json({ error: "failed to create import batch" });
    } finally {
      client.release();
    }
  });

  router.post("/import-batches/full", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const rowsInput = Array.isArray(body.rows) ? body.rows : Array.isArray(body.items) ? body.items : [];
    if (!rowsInput.length) return res.status(400).json({ error: "Nincs kijelölt menthető terméksor." });

    const client = await pool.connect();
    try {
      const supplier = await findByIdOrCode(client, "aif_suppliers", body.supplierId || body.supplier_id || body.supplierCode || body.supplier);
      if (!supplier) return res.status(400).json({ error: "Beszállító kiválasztása kötelező." });
      if (supplier.is_active === false) return res.status(400).json({ error: "A kiválasztott beszállító inaktív." });

      let profileId = emptyToNull(body.profileId || body.profile_id);
      if (!profileId) {
        const pr = await client.query(
          `SELECT id FROM aif_supplier_import_profiles
           WHERE supplier_id=$1 AND is_active=true
           ORDER BY version DESC
           LIMIT 1`,
          [supplier.id]
        );
        profileId = pr.rows[0]?.id || null;
      }

      let location = null;
      const locInput = body.targetLocationId || body.target_location_id || body.locationId || body.location_id || body.locationCode || body.location;
      if (locInput) location = await findByIdOrCode(client, "aif_locations", locInput);
      const targetLocationId = location?.id || await getDefaultLocationId(client);
      if (!targetLocationId) return res.status(400).json({ error: "Cél hely kiválasztása kötelező." });

      const purchaseOrderContext = await resolvePurchaseOrderContext(client, body);
      if (purchaseOrderContext && String(purchaseOrderContext.supplier_id) !== String(supplier.id)) {
        return res.status(400).json({ error: "A bevételezés beszállítója nem egyezik a beszerzési rendelés beszállítójával." });
      }
      if (purchaseOrderContext?.target_location_id && String(purchaseOrderContext.target_location_id) !== String(targetLocationId)) {
        return res.status(400).json({ error: "A bevételezés célhelye nem egyezik a beszerzési rendelés célhelyével." });
      }

      const reception = receptionFromBody(body);
      if (!reception.invoiceNumber) return res.status(400).json({ error: "Számlaszám megadása kötelező." });
      if (!reception.invoiceDate) return res.status(400).json({ error: "Számla dátuma kötelező." });
      if (!reception.receptionDate) return res.status(400).json({ error: "Receptió dátuma kötelező." });
      if (!reception.currencyCode) return res.status(400).json({ error: "Pénznem kiválasztása kötelező." });
      const receptionExchangeRateToRon = effectiveReceptionExchangeRateToRon(reception);
      if (!receptionExchangeRateToRon || receptionExchangeRateToRon <= 0) return res.status(400).json({ error: "Pozitív RON árfolyam megadása kötelező." });
      if (!reception.tvaMode) return res.status(400).json({ error: "TVA kezelés kiválasztása kötelező." });
      if (reception.tvaMode !== "no_tva" && (reception.tvaRate === null || reception.tvaRate === undefined)) return res.status(400).json({ error: "TVA százalék megadása kötelező." });
      if (reception.invoiceGross === null || reception.invoiceGross === undefined) return res.status(400).json({ error: "Számla végösszeg megadása kötelező." });

      const curr = await client.query(`SELECT code FROM aif_currencies WHERE code=$1 AND is_active=true LIMIT 1`, [reception.currencyCode]);
      if (!curr.rowCount) return res.status(400).json({ error: "A kiválasztott pénznem inaktív vagy nem létezik." });

      const normalizedRows = [];
      let rowNo = 1;
      for (const input of rowsInput) {
        const nr = normalizeRowInput(input, rowNo++);
        await enrichNormalizedRow(client, nr);
        if (nr.errors.length) {
          return res.status(400).json({
            error: `A(z) ${nr.rowNo}. terméksor hiányos vagy hibás: ${nr.errors.join(" ")}`,
            rowNo: nr.rowNo,
            errors: nr.errors,
          });
        }
        normalizedRows.push(nr);
      }

      await client.query("BEGIN");
      await ensureSnCodSchema(client);

      const existingReceptionId = emptyToNull(body.receptionId || body.reception_id);
      let receptionId = null;

      if (existingReceptionId) {
        const currentReception = await client.query(
          `SELECT id, status FROM aif_receptions WHERE id::text=$1 FOR UPDATE`,
          [existingReceptionId]
        );
        if (!currentReception.rowCount) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "A kiválasztott receptió nem található." });
        }
        receptionId = currentReception.rows[0].id;
        await client.query(
          `UPDATE aif_receptions SET
             supplier_id=$2,
             target_location_id=$3,
             invoice_number=$4,
             invoice_date=$5,
             reception_date=$6,
             currency_code=$7,
             exchange_rate_to_ron=$8,
             tva_mode=$9,
             tva_rate=$10,
             shipping_cost=$11,
             goods_value=COALESCE(goods_value,0) + COALESCE($12,0),
             invoice_net=COALESCE($13, invoice_net),
             invoice_vat=COALESCE($14, invoice_vat),
             invoice_gross=$15,
             total_qty=COALESCE(total_qty,0) + $16,
             line_count=COALESCE(line_count,0) + $17,
             status=CASE WHEN status='cancelled' THEN status ELSE 'draft' END,
             note=COALESCE($18, note),
             raw_meta=COALESCE(raw_meta,'{}'::jsonb) || $19::jsonb,
             updated_at=now()
           WHERE id=$1`,
          [
            receptionId,
            supplier.id,
            targetLocationId,
            reception.invoiceNumber,
            reception.invoiceDate,
            reception.receptionDate,
            reception.currencyCode,
            receptionExchangeRateToRon,
            reception.tvaMode,
            reception.tvaRate,
            reception.shippingCost,
            reception.goodsValue,
            reception.invoiceNet,
            reception.invoiceVat,
            reception.invoiceGross,
            reception.totalQty,
            reception.lineCount,
            reception.note,
            JSON.stringify(reception.rawMeta || {}),
          ]
        );
      } else {
        const receptionRes = await client.query(
          `INSERT INTO aif_receptions (
             supplier_id, target_location_id, invoice_number, invoice_date, reception_date,
             currency_code, exchange_rate_to_ron, tva_mode, tva_rate, shipping_cost,
             goods_value, invoice_net, invoice_vat, invoice_gross, total_qty, line_count,
             status, note, raw_meta, created_by, actor
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'draft',$17,$18::jsonb,$19,$20)
           RETURNING id`,
          [
            supplier.id,
            targetLocationId,
            reception.invoiceNumber,
            reception.invoiceDate,
            reception.receptionDate,
            reception.currencyCode,
            receptionExchangeRateToRon,
            reception.tvaMode,
            reception.tvaRate,
            reception.shippingCost,
            reception.goodsValue,
            reception.invoiceNet,
            reception.invoiceVat,
            reception.invoiceGross,
            reception.totalQty,
            reception.lineCount,
            reception.note,
            JSON.stringify(reception.rawMeta || {}),
            req.session?.role || "system",
            actorFrom(req),
          ]
        );
        receptionId = receptionRes.rows[0].id;
      }

      const batchRes = await client.query(
        `INSERT INTO aif_import_batches (
           supplier_id, profile_id, target_location_id, reception_id, source_file_name,
           source_file_url, source_format, status, created_by, actor, note, raw_meta,
           currency_code, exchange_rate_to_ron, invoice_number
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11::jsonb,$12,$13,$14)
         RETURNING id`,
        [
          supplier.id,
          profileId,
          targetLocationId,
          receptionId,
          emptyToNull(body.sourceFileName || body.source_file_name || body.fileName),
          emptyToNull(body.sourceFileUrl || body.source_file_url || body.fileUrl),
          normCode(body.sourceFormat || body.source_format || "manual") || "manual",
          req.session?.role || "system",
          actorFrom(req),
          emptyToNull(body.note),
          JSON.stringify(body.rawMeta || body.raw_meta || {}),
          reception.currencyCode,
          receptionExchangeRateToRon,
          reception.invoiceNumber,
        ]
      );

      const batchId = batchRes.rows[0].id;
      if (purchaseOrderContext) {
        const purchaseMeta = JSON.stringify({
          purchaseOrderId: String(purchaseOrderContext.id),
          purchaseOrderNumber: purchaseOrderContext.order_number,
        });
        await client.query(
          `UPDATE aif_receptions
           SET purchase_order_id=$2,
               raw_meta=COALESCE(raw_meta,'{}'::jsonb) || $3::jsonb,
               updated_at=now()
           WHERE id=$1`,
          [receptionId, purchaseOrderContext.id, purchaseMeta]
        );
        await client.query(
          `UPDATE aif_import_batches
           SET purchase_order_id=$2,
               raw_meta=COALESCE(raw_meta,'{}'::jsonb) || $3::jsonb,
               updated_at=now()
           WHERE id=$1`,
          [batchId, purchaseOrderContext.id, purchaseMeta]
        );
      }
      const exchangeRate = Number(receptionExchangeRateToRon);
      const salesTvaSettings = await readSalesTvaSettings(client);
      let errorCount = 0;
      for (const nr of normalizedRows) {
        applyReceptionSellPricePolicyToNormalized(nr.normalized, reception);
        applySalesTvaSettingsToNormalized(nr.normalized, salesTvaSettings);
        const buyPriceRon = nr.normalized.buyPrice == null || !Number.isFinite(exchangeRate)
          ? null
          : Number(nr.normalized.buyPrice) * exchangeRate;
        const sellPriceRon = calcSellPriceRon(nr.normalized, exchangeRate);
        const normalizedForDb = {
          ...nr.normalized,
          currencyCode: reception.currencyCode,
          exchangeRateToRon: exchangeRate,
          buyPriceRon,
          sellPriceRon,
        };

        await client.query(
          `INSERT INTO aif_import_rows (
             batch_id, row_no, raw, normalized, status, error_messages,
             supplier_product_code, supplier_variant_code, supplier_color_code, supplier_size,
             qty, buy_price, buy_price_ron, sell_price, sell_price_ron, sn_cod,
             purchase_order_id, purchase_order_line_id
           )
           VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6::text[],$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            batchId,
            nr.rowNo,
            JSON.stringify(nr.raw || {}),
            JSON.stringify(normalizedForDb),
            nr.status,
            nr.errors,
            nr.normalized.supplierProductCode,
            nr.normalized.supplierVariantCode,
            nr.normalized.supplierColorCode,
            nr.normalized.supplierSize,
            nr.normalized.qty,
            nr.normalized.buyPrice,
            buyPriceRon,
            nr.normalized.sellPrice,
            sellPriceRon,
            nr.normalized.snCod || nr.normalized.sn_cod,
            purchaseOrderContext ? purchaseOrderContext.id : null,
            purchaseOrderLineIdFromNormalized(nr.normalized),
          ]
        );
      }

      await client.query(
        `UPDATE aif_import_batches
         SET row_count=$2, error_count=$3, status=$4, updated_at=now()
         WHERE id=$1`,
        [batchId, normalizedRows.length, errorCount, errorCount ? "needs_review" : "parsed"]
      );

      await client.query("COMMIT");
      res.json({ ok: true, id: batchId, receptionId, rowCount: normalizedRows.length, errorCount });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF create full import batch failed", e);
      if (e && e.code === "23514") {
        return res.status(400).json({ error: "A mentés nem sikerült: egy terméksor mennyisége vagy ára hibás." });
      }
      res.status(500).json({ error: "A mentés nem sikerült. Ellenőrizd a receptiót és a kijelölt terméksorokat." });
    } finally {
      client.release();
    }
  });

  router.get("/import-batches", requireAuthed, async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const r = await pool.query(
      `SELECT b.id, b.created_at, b.updated_at, b.status, b.row_count, b.error_count,
              b.source_file_name, b.note, b.committed_at,
              b.reception_id, b.invoice_number, b.currency_code, b.exchange_rate_to_ron,
              r.invoice_gross, r.invoice_date, r.reception_date,
              s.code AS supplier_code, s.name AS supplier_name,
              l.code AS location_code, l.name AS location_name,
              p.name AS profile_name, p.version AS profile_version
       FROM aif_import_batches b
       JOIN aif_suppliers s ON s.id=b.supplier_id
       LEFT JOIN aif_locations l ON l.id=b.target_location_id
       LEFT JOIN aif_supplier_import_profiles p ON p.id=b.profile_id
       LEFT JOIN aif_receptions r ON r.id=b.reception_id
       ORDER BY COALESCE(b.committed_at, b.updated_at, b.created_at) DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ items: r.rows });
  });


  async function refreshReceptionAfterImportHistoryDelete(client, receptionId) {
    if (!receptionId) return;

    const stats = await client.query(
      `SELECT
         count(rw.id) FILTER (WHERE rw.status <> 'ignored')::int AS line_count,
         COALESCE(sum(COALESCE(rw.qty,0)) FILTER (WHERE rw.status <> 'ignored'),0)::int AS total_qty,
         COALESCE(sum(COALESCE(rw.qty,0) * COALESCE(rw.buy_price,0)) FILTER (WHERE rw.status <> 'ignored'),0)::numeric(14,2) AS goods_value,
         count(rw.id) FILTER (WHERE rw.status = 'committed')::int AS committed_rows,
         count(rw.id) FILTER (WHERE rw.status NOT IN ('ignored','committed'))::int AS remaining_rows,
         count(rw.id) FILTER (WHERE rw.status = 'error')::int AS error_rows
       FROM aif_import_batches b
       LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id
       WHERE b.reception_id=$1`,
      [receptionId]
    );

    const st = stats.rows[0] || {};
    const lineCount = Number(st.line_count || 0);
    const totalQty = Number(st.total_qty || 0);
    const goodsValue = Number(st.goods_value || 0);
    const committedRows = Number(st.committed_rows || 0);
    const remainingRows = Number(st.remaining_rows || 0);
    const errorRows = Number(st.error_rows || 0);

    await client.query(
      `UPDATE aif_receptions
       SET line_count=$2,
           total_qty=$3,
           goods_value=$4,
           status=CASE
             WHEN $5::int > 0 OR $6::int > 0 THEN 'draft'
             WHEN $7::int > 0 THEN 'committed'
             ELSE 'draft'
           END,
           updated_at=now()
       WHERE id=$1`,
      [receptionId, lineCount, totalQty, goodsValue, remainingRows, errorRows, committedRows]
    );
  }

  async function deleteImportBatchHistory(req, res) {
    const batchId = text(req.params.id);
    if (!batchId) return res.status(400).json({ error: "Import előzmény azonosító kötelező." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const batchRes = await client.query(
        `SELECT id, reception_id, status, row_count, source_file_name
         FROM aif_import_batches
         WHERE id::text=$1
         FOR UPDATE`,
        [batchId]
      );

      if (!batchRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Import előzmény nem található." });
      }

      const batch = batchRes.rows[0];

      const rowStats = await client.query(
        `SELECT
           count(*)::int AS rows,
           count(*) FILTER (WHERE status='committed')::int AS committed_rows
         FROM aif_import_rows
         WHERE batch_id=$1`,
        [batch.id]
      );

      const deletedRows = Number(rowStats.rows[0]?.rows || 0);
      const committedRows = Number(rowStats.rows[0]?.committed_rows || 0);

      /*
        Csak az import előzményt töröljük:
        - aif_import_rows
        - aif_import_batches

        Direkt NEM nyúlunk ezekhez:
        - aif_product_models
        - aif_product_variants
        - aif_stock
        - aif_stock_movements
        - aif_variant_supplier_codes

        Tehát a már feltöltött / készletre vett termékek maradnak. Az Exceles régészeti ásatás meg végre nem hagy maga után 1000 fölös import előzményt.
      */
      await client.query(`DELETE FROM aif_import_rows WHERE batch_id=$1`, [batch.id]);
      await client.query(`DELETE FROM aif_import_batches WHERE id=$1`, [batch.id]);

      if (batch.reception_id) {
        await refreshReceptionAfterImportHistoryDelete(client, batch.reception_id);
      }

      await client.query("COMMIT");

      res.json({
        ok: true,
        mode: "history_deleted",
        deletedRows,
        committedRows,
        receptionId: batch.reception_id || null,
      });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete import history failed", e);
      res.status(500).json({ error: e?.message || "Az import előzmény törlése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  }

  router.delete("/import-batches/:id/history", requireAuthed, deleteImportBatchHistory);
  router.delete("/import-batches/:id", requireAuthed, deleteImportBatchHistory);



  // Erősített import -> raktár nézet: nem csak az inventory view-ra támaszkodik,
  // hanem az import sor normalized/raw adataiból is kitölti a terméket. Igen, mert az adat ott volt, csak a felület úgy tett, mintha vak lenne.
  router.get("/import-batches/:id/inventory", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: "Import azonosító kötelező." });
    if (!isUuidText(id)) return invalidImportBatchId(res);
    try {
      const batch = await pool.query(
        `SELECT id, status, source_file_name, committed_at, row_count, reception_id
         FROM aif_import_batches
         WHERE id::text=$1
         LIMIT 1`,
        [id]
      );
      if (!batch.rowCount) return res.status(404).json({ error: "Import előzmény nem található." });

      const rows = await pool.query(
        `SELECT
           rw.id AS import_row_id,
           rw.row_no AS import_row_no,
           rw.raw AS import_raw,
           rw.normalized AS import_normalized,
           rw.qty AS import_qty,
           rw.buy_price AS import_buy_price,
           rw.buy_price_ron AS import_buy_price_ron,
           rw.sell_price AS import_sell_price,
           rw.sell_price_ron AS import_sell_price_ron,
           rw.supplier_product_code AS import_supplier_product_code,
           rw.supplier_product_code AS supplier_product_code,
           rw.supplier_product_code AS "supplierProductCode",
           rw.supplier_variant_code AS import_supplier_variant_code,
           rw.supplier_variant_code AS supplier_variant_code,
           rw.supplier_color_code AS import_supplier_color_code,
           rw.supplier_color_code AS supplier_color_code,
           rw.supplier_size AS import_supplier_size,
           rw.supplier_size AS supplier_size,
           rw.variant_id AS variant_id,
           NULLIF(v.internal_sku,'') AS internal_sku,
           COALESCE(NULLIF(v.barcode,''), NULLIF(rw.normalized->>'barcode',''), NULLIF(rw.normalized->>'supplierBarcode','')) AS barcode,
           COALESCE(NULLIF(v.sn_cod,''), NULLIF(rw.sn_cod,''), NULLIF(rw.normalized->>'snCod',''), NULLIF(rw.normalized->>'sn_cod','')) AS sn_cod,
           COALESCE(NULLIF(v.sn_cod,''), NULLIF(rw.sn_cod,''), NULLIF(rw.normalized->>'snCod',''), NULLIF(rw.normalized->>'sn_cod','')) AS "snCod",
           COALESCE(v.attributes, '{}'::jsonb) AS attributes,
           COALESCE(v.attributes, '{}'::jsonb) AS variant_attributes,
           COALESCE(${customsTariffSql('v')}, NULLIF(rw.normalized->>'customsTariffCode',''), NULLIF(rw.normalized->>'customs_tariff_code',''), NULLIF(rw.raw->>'INTRASTAT','')) AS customs_tariff_code,
           COALESCE(${customsTariffSql('v')}, NULLIF(rw.normalized->>'customsTariffCode',''), NULLIF(rw.normalized->>'customs_tariff_code',''), NULLIF(rw.raw->>'INTRASTAT','')) AS "customsTariffCode",
           COALESCE(v.image_url, NULLIF(rw.normalized->>'imageUrl',''), NULLIF(rw.normalized->>'image_url','')) AS image_url,
           m.id AS model_id,
           COALESCE(NULLIF(m.model_code,''), NULLIF(rw.normalized->>'modelCode',''), rw.supplier_product_code) AS model_code,
           COALESCE(NULLIF(m.title_ro,''), NULLIF(rw.normalized->>'titleRo',''), NULLIF(rw.normalized->>'productName',''), NULLIF(rw.raw->>'ARTICOL',''), rw.supplier_product_code) AS title_ro,
           COALESCE(NULLIF(m.title_hu,''), NULLIF(rw.normalized->>'titleHu','')) AS title_hu,
           COALESCE(NULLIF(m.description_ro,''), NULLIF(rw.normalized->>'descriptionRo',''), NULLIF(rw.raw->>'DESCRIERE',''), NULLIF(rw.raw->>'DESCRIERE PRODUS',''), NULLIF(rw.raw->>'DESCRIPTION','')) AS description_ro,
           COALESCE(NULLIF(m.shopify_title,''), NULLIF(rw.normalized->>'shopifyTitle',''), NULLIF(rw.normalized->>'titleRo',''), NULLIF(rw.raw->>'ARTICOL','')) AS shopify_title,
           COALESCE(NULLIF(m.gender,''), NULLIF(rw.normalized->>'gender',''), NULLIF(rw.raw->>'GEN','')) AS gender,
           COALESCE(NULLIF(m.product_type,''), NULLIF(rw.normalized->>'productType',''), NULLIF(rw.raw->>'RODESCR','')) AS product_type,
           COALESCE(NULLIF(m.season,''), NULLIF(rw.normalized->>'season',''), NULLIF(rw.normalized->>'collection',''), NULLIF(rw.raw->>'COLECTIE','')) AS season,
           COALESCE(NULLIF(m.material,''), NULLIF(rw.normalized->>'material',''), NULLIF(rw.normalized->>'composition',''), NULLIF(rw.raw->>'COMPOZITIE','')) AS material,
           COALESCE(NULLIF(c.code,''), NULLIF(rw.normalized->>'categoryCode',''), NULLIF(rw.raw->>'RODESCR',''), NULLIF(rw.raw->>'CATEGORIE','')) AS category_code,
           COALESCE(NULLIF(c.name_ro,''), NULLIF(rw.normalized->>'categoryName',''), NULLIF(rw.raw->>'RODESCR',''), NULLIF(rw.raw->>'CATEGORIE','')) AS category_name_ro,
           NULLIF(c.name_hu,'') AS category_name_hu,
           COALESCE(NULLIF(v.color_code,''), rw.supplier_color_code, NULLIF(rw.normalized->>'colorCode',''), NULLIF(rw.normalized->>'supplierColorCode','')) AS color_code,
           COALESCE(NULLIF(v.color_name,''), NULLIF(rw.normalized->>'colorName','')) AS color_name,
           COALESCE(v.color_hex, NULLIF(rw.normalized->>'colorHex','')) AS color_hex,
           COALESCE(NULLIF(v.size,''), rw.supplier_size, NULLIF(rw.normalized->>'size',''), NULLIF(rw.raw->>'MARIME','')) AS size,
           COALESCE(v.buy_price, rw.buy_price_ron, rw.buy_price) AS buy_price,
           COALESCE(v.sell_price, rw.sell_price_ron, rw.sell_price) AS sell_price,
           v.compare_at_price AS compare_at_price,
           CASE
             WHEN st.total_qty IS NULL OR st.total_qty=0 THEN COALESCE(rw.qty,0)
             ELSE COALESCE(st.total_qty, 0)
           END AS total_qty,
           COALESCE(st.total_reserved_qty, 0) AS total_reserved_qty,
           CASE
             WHEN st.available_qty IS NULL OR st.available_qty=0 THEN COALESCE(rw.qty,0)
             ELSE COALESCE(st.available_qty, 0)
           END AS available_qty,
           COALESCE(st.updated_at, b.committed_at, rw.updated_at) AS last_stock_movement_at,
           COALESCE(b.committed_at, st.updated_at, rw.updated_at) AS last_incoming_at,
           COALESCE(bnd.name, NULLIF(rw.normalized->>'brandName',''), NULLIF(rw.raw->>'BRAND','')) AS brand_name,
           COALESCE(bnd.code, NULLIF(rw.normalized->>'brandCode','')) AS brand_code,
           COALESCE(v.status, 'active') AS variant_status,
           COALESCE(v.status, 'active') AS status,
           COALESCE(m.status, 'active') AS model_status
         FROM aif_import_rows rw
         JOIN aif_import_batches b ON b.id=rw.batch_id
         LEFT JOIN aif_product_variants v ON v.id=rw.variant_id
         LEFT JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN aif_brands bnd ON bnd.id=m.brand_id
         LEFT JOIN aif_categories c ON c.id=m.category_id
         LEFT JOIN LATERAL (
           SELECT
             COALESCE(sum(s.qty),0)::numeric AS total_qty,
             COALESCE(sum(s.reserved_qty),0)::numeric AS total_reserved_qty,
             COALESCE(sum(s.qty - s.reserved_qty),0)::numeric AS available_qty,
             max(s.updated_at) AS updated_at
           FROM aif_stock s
           WHERE s.variant_id=rw.variant_id
         ) st ON true
         WHERE rw.batch_id=$1
           AND rw.status='committed'
           AND rw.variant_id IS NOT NULL
           AND v.id IS NOT NULL
           AND m.id IS NOT NULL
           AND COALESCE(v.status,'active') <> 'archived'
           AND COALESCE(m.status,'active') <> 'archived'
         ORDER BY rw.row_no ASC`,
        [batch.rows[0].id]
      );

      const movementRows = await pool.query(
        `SELECT
           COALESCE(rw.id::text, sm.raw->>'rowId', sm.id::text) AS import_row_id,
           COALESCE(rw.row_no, row_number() OVER (ORDER BY sm.created_at ASC, sm.id ASC)) AS import_row_no,
           COALESCE(rw.raw, CASE WHEN jsonb_typeof(sm.raw->'raw')='object' THEN sm.raw->'raw' ELSE '{}'::jsonb END) AS import_raw,
           COALESCE(rw.normalized, '{}'::jsonb) AS import_normalized,
           COALESCE(rw.qty, ABS(sm.qty_delta)) AS import_qty,
           rw.buy_price AS import_buy_price,
           rw.buy_price_ron AS import_buy_price_ron,
           rw.sell_price AS import_sell_price,
           rw.sell_price_ron AS import_sell_price_ron,
           rw.supplier_product_code AS import_supplier_product_code,
           rw.supplier_variant_code AS import_supplier_variant_code,
           rw.supplier_color_code AS import_supplier_color_code,
           rw.supplier_size AS import_supplier_size,
           sm.variant_id AS variant_id,
           NULLIF(v.internal_sku,'') AS internal_sku,
           COALESCE(NULLIF(v.barcode,''), NULLIF(rw.normalized->>'barcode',''), NULLIF(rw.normalized->>'supplierBarcode','')) AS barcode,
           COALESCE(NULLIF(v.sn_cod,''), NULLIF(rw.sn_cod,''), NULLIF(rw.normalized->>'snCod',''), NULLIF(rw.normalized->>'sn_cod','')) AS sn_cod,
           COALESCE(NULLIF(v.sn_cod,''), NULLIF(rw.sn_cod,''), NULLIF(rw.normalized->>'snCod',''), NULLIF(rw.normalized->>'sn_cod','')) AS "snCod",
           COALESCE(v.attributes, '{}'::jsonb) AS attributes,
           COALESCE(v.attributes, '{}'::jsonb) AS variant_attributes,
           COALESCE(${customsTariffSql('v')}, NULLIF(rw.normalized->>'customsTariffCode',''), NULLIF(rw.normalized->>'customs_tariff_code',''), NULLIF(rw.raw->>'INTRASTAT',''), NULLIF((sm.raw->'raw')->>'INTRASTAT','')) AS customs_tariff_code,
           COALESCE(${customsTariffSql('v')}, NULLIF(rw.normalized->>'customsTariffCode',''), NULLIF(rw.normalized->>'customs_tariff_code',''), NULLIF(rw.raw->>'INTRASTAT',''), NULLIF((sm.raw->'raw')->>'INTRASTAT','')) AS "customsTariffCode",
           COALESCE(v.image_url, NULLIF(rw.normalized->>'imageUrl',''), NULLIF(rw.normalized->>'image_url','')) AS image_url,
           m.id AS model_id,
           COALESCE(NULLIF(m.model_code,''), NULLIF(rw.normalized->>'modelCode',''), rw.supplier_product_code) AS model_code,
           COALESCE(NULLIF(m.title_ro,''), NULLIF(rw.normalized->>'titleRo',''), NULLIF(rw.normalized->>'productName',''), NULLIF(rw.raw->>'ARTICOL',''), NULLIF((sm.raw->'raw')->>'ARTICOL',''), rw.supplier_product_code) AS title_ro,
           COALESCE(NULLIF(m.title_hu,''), NULLIF(rw.normalized->>'titleHu','')) AS title_hu,
           COALESCE(NULLIF(m.description_ro,''), NULLIF(rw.normalized->>'descriptionRo',''), NULLIF(rw.raw->>'DESCRIERE',''), NULLIF(rw.raw->>'DESCRIERE PRODUS',''), NULLIF(rw.raw->>'DESCRIPTION',''), NULLIF((sm.raw->'raw')->>'DESCRIERE',''), NULLIF((sm.raw->'raw')->>'DESCRIPTION','')) AS description_ro,
           COALESCE(NULLIF(m.shopify_title,''), NULLIF(rw.normalized->>'shopifyTitle',''), NULLIF(rw.normalized->>'titleRo',''), NULLIF(rw.raw->>'ARTICOL',''), NULLIF((sm.raw->'raw')->>'ARTICOL','')) AS shopify_title,
           COALESCE(NULLIF(m.gender,''), NULLIF(rw.normalized->>'gender',''), NULLIF(rw.raw->>'GEN',''), NULLIF((sm.raw->'raw')->>'GEN','')) AS gender,
           COALESCE(NULLIF(m.product_type,''), NULLIF(rw.normalized->>'productType',''), NULLIF(rw.raw->>'RODESCR',''), NULLIF((sm.raw->'raw')->>'RODESCR','')) AS product_type,
           COALESCE(NULLIF(m.season,''), NULLIF(rw.normalized->>'season',''), NULLIF(rw.normalized->>'collection',''), NULLIF(rw.raw->>'COLECTIE',''), NULLIF((sm.raw->'raw')->>'COLECTIE','')) AS season,
           COALESCE(NULLIF(m.material,''), NULLIF(rw.normalized->>'material',''), NULLIF(rw.normalized->>'composition',''), NULLIF(rw.raw->>'COMPOZITIE',''), NULLIF((sm.raw->'raw')->>'COMPOZITIE','')) AS material,
           COALESCE(NULLIF(c.code,''), NULLIF(rw.normalized->>'categoryCode',''), NULLIF(rw.raw->>'RODESCR',''), NULLIF(rw.raw->>'CATEGORIE',''), NULLIF((sm.raw->'raw')->>'RODESCR',''), NULLIF((sm.raw->'raw')->>'CATEGORIE','')) AS category_code,
           COALESCE(NULLIF(c.name_ro,''), NULLIF(rw.normalized->>'categoryName',''), NULLIF(rw.raw->>'RODESCR',''), NULLIF(rw.raw->>'CATEGORIE',''), NULLIF((sm.raw->'raw')->>'RODESCR',''), NULLIF((sm.raw->'raw')->>'CATEGORIE','')) AS category_name_ro,
           NULLIF(c.name_hu,'') AS category_name_hu,
           COALESCE(NULLIF(v.color_code,''), rw.supplier_color_code, NULLIF(rw.normalized->>'colorCode',''), NULLIF(rw.normalized->>'supplierColorCode','')) AS color_code,
           COALESCE(NULLIF(v.color_name,''), NULLIF(rw.normalized->>'colorName','')) AS color_name,
           COALESCE(v.color_hex, NULLIF(rw.normalized->>'colorHex','')) AS color_hex,
           COALESCE(NULLIF(v.size,''), rw.supplier_size, NULLIF(rw.normalized->>'size',''), NULLIF(rw.raw->>'MARIME',''), NULLIF((sm.raw->'raw')->>'MARIME','')) AS size,
           COALESCE(v.buy_price, rw.buy_price_ron, rw.buy_price) AS buy_price,
           COALESCE(v.sell_price, rw.sell_price_ron, rw.sell_price) AS sell_price,
           v.compare_at_price AS compare_at_price,
           COALESCE(st.total_qty, 0) AS total_qty,
           COALESCE(st.total_reserved_qty, 0) AS total_reserved_qty,
           COALESCE(st.available_qty, 0) AS available_qty,
           COALESCE(st.updated_at, sm.created_at) AS last_stock_movement_at,
           sm.created_at AS last_incoming_at,
           COALESCE(br.name, NULLIF(rw.normalized->>'brandName',''), NULLIF(rw.raw->>'BRAND',''), NULLIF((sm.raw->'raw')->>'BRAND','')) AS brand_name,
           COALESCE(br.code, NULLIF(rw.normalized->>'brandCode','')) AS brand_code,
           COALESCE(v.status, 'active') AS variant_status,
           COALESCE(v.status, 'active') AS status,
           COALESCE(m.status, 'active') AS model_status
         FROM aif_stock_movements sm
         LEFT JOIN aif_import_rows rw ON rw.id::text = sm.raw->>'rowId'
         JOIN aif_product_variants v ON v.id=sm.variant_id
         JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN aif_brands br ON br.id=m.brand_id
         LEFT JOIN aif_categories c ON c.id=m.category_id
         LEFT JOIN LATERAL (
           SELECT
             COALESCE(sum(s.qty),0)::numeric AS total_qty,
             COALESCE(sum(s.reserved_qty),0)::numeric AS total_reserved_qty,
             COALESCE(sum(s.qty - s.reserved_qty),0)::numeric AS available_qty,
             max(s.updated_at) AS updated_at
           FROM aif_stock s
           WHERE s.variant_id=sm.variant_id
         ) st ON true
         WHERE (sm.source_id=$1 OR sm.raw->>'importBatchId'=$1)
           AND COALESCE(sm.qty_delta,0) > 0
           AND COALESCE(v.status,'active') <> 'archived'
           AND COALESCE(m.status,'active') <> 'archived'
         ORDER BY sm.created_at ASC, sm.id ASC`,
        [String(batch.rows[0].id)]
      );

      const merged = new Map();
      const addMerged = (row) => {
        const variantId = text(row?.variant_id);
        if (!variantId) return;
        const key = variantId;
        const previous = merged.get(key);
        merged.set(key, previous ? { ...previous, ...row, variant_id: variantId } : { ...row, variant_id: variantId });
      };
      for (const row of movementRows.rows || []) addMerged(row);
      for (const row of rows.rows || []) addMerged(row);
      const mergedRows = Array.from(merged.values()).sort((a, b) => Number(a.import_row_no || 0) - Number(b.import_row_no || 0));

      const variantIds = Array.from(new Set(mergedRows.map((row) => text(row.variant_id)).filter(Boolean)));
      const totalQty = mergedRows.reduce((sum, row) => sum + Number(row.import_qty || 0), 0);
      res.json({
        ok: true,
        batch: batch.rows[0],
        batchId: String(batch.rows[0].id),
        items: mergedRows,
        rows: mergedRows,
        variantIds,
        rowCount: mergedRows.length,
        totalQty,
      });
    } catch (e) {
      console.error("AIF import batch inventory load failed", e);
      res.status(500).json({ error: e?.message || "A bevételezett import termékei nem tölthetők be.", code: e?.code || null });
    }
  });

  router.get("/import-batches/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: "Import azonosító kötelező." });
    if (!isUuidText(id)) return invalidImportBatchId(res);

    try {
      const batch = await pool.query(
        `SELECT b.*, s.code AS supplier_code, s.name AS supplier_name,
                l.code AS location_code, l.name AS location_name,
                p.name AS profile_name, p.version AS profile_version,
                to_jsonb(r.*) AS reception
         FROM aif_import_batches b
         JOIN aif_suppliers s ON s.id=b.supplier_id
         LEFT JOIN aif_locations l ON l.id=b.target_location_id
         LEFT JOIN aif_supplier_import_profiles p ON p.id=b.profile_id
         LEFT JOIN aif_receptions r ON r.id=b.reception_id
         WHERE b.id::text=$1
         LIMIT 1`,
        [id]
      );
      if (!batch.rowCount) return res.status(404).json({ error: "not found" });

      const rows = await pool.query(
        `SELECT id, row_no, raw, normalized, status, error_messages, variant_id,
                supplier_product_code, supplier_variant_code, supplier_color_code, supplier_size,
                qty, buy_price, buy_price_ron, sell_price, sell_price_ron, sn_cod
         FROM aif_import_rows
         WHERE batch_id::text=$1
         ORDER BY row_no ASC`,
        [id]
      );

      res.json({ batch: batch.rows[0], rows: rows.rows });
    } catch (e) {
      console.error("AIF import batch detail failed", e);
      res.status(500).json({ error: e?.message || "Az import csomag betöltése nem sikerült.", code: e?.code || null });
    }
  });

  router.post("/import-batches/:id/rows", requireAuthed, async (req, res) => {
    const batchId = text(req.params.id);
    if (!batchId) return res.status(400).json({ error: "Import azonosító kötelező." });
    if (!isUuidText(batchId)) return invalidImportBatchId(res);
    const rowsInput = Array.isArray(req.body?.rows) ? req.body.rows : Array.isArray(req.body?.items) ? req.body.items : [];
    const appendMode = Boolean(req.body?.append || req.body?.appendRows || req.body?.mode === "append");
    if (!rowsInput.length) return res.status(400).json({ error: "rows required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSnCodSchema(client);
      const batch = await client.query(
        `SELECT b.id, b.status, b.currency_code, b.exchange_rate_to_ron, b.purchase_order_id,
                r.exchange_rate_to_ron AS reception_exchange_rate, r.currency_code AS reception_currency_code,
                r.raw_meta AS reception_raw_meta
         FROM aif_import_batches b
         LEFT JOIN aif_receptions r ON r.id=b.reception_id
         WHERE b.id::text=$1
         FOR UPDATE OF b`,
        [batchId]
      );
      if (!batch.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "batch not found" });
      }
      if (!["draft", "parsed", "needs_review", "failed"].includes(batch.rows[0].status)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "batch cannot be edited" });
      }

      const exchangeRate = Number(batch.rows[0].exchange_rate_to_ron || batch.rows[0].reception_exchange_rate || 1);
      const currency = currencyCode(batch.rows[0].currency_code || batch.rows[0].reception_currency_code || "RON") || "RON";
      const receptionPricing = {
        currencyCode: currency,
        exchangeRateToRon: exchangeRate,
        rawMeta: batch.rows[0].reception_raw_meta || {},
      };
      const salesTvaSettings = await readSalesTvaSettings(client);

      let fallbackRowNo = 1;
      if (appendMode) {
        const maxRow = await client.query(
          `SELECT COALESCE(max(row_no), 0)::int AS max_row_no FROM aif_import_rows WHERE batch_id::text=$1`,
          [batchId]
        );
        fallbackRowNo = Number(maxRow.rows[0]?.max_row_no || 0) + 1;
      } else {
        await client.query(`DELETE FROM aif_import_rows WHERE batch_id::text=$1`, [batchId]);
      }

      let chunkErrorCount = 0;
      let rowNo = fallbackRowNo;
      for (const input of rowsInput) {
        const nr = normalizeRowInput(input, rowNo++);
        await enrichNormalizedRow(client, nr);
        applyReceptionSellPricePolicyToNormalized(nr.normalized, receptionPricing);
        applySalesTvaSettingsToNormalized(nr.normalized, salesTvaSettings);
        if (nr.errors.length) chunkErrorCount++;
        const buyPriceRon = nr.normalized.buyPrice == null || !Number.isFinite(exchangeRate)
          ? null
          : Number(nr.normalized.buyPrice) * exchangeRate;
        const sellPriceRon = calcSellPriceRon(nr.normalized, exchangeRate);
        const normalizedForDb = {
          ...nr.normalized,
          currencyCode: currency,
          exchangeRateToRon: exchangeRate,
          buyPriceRon,
          sellPriceRon,
        };

        await client.query(
          `INSERT INTO aif_import_rows (
             batch_id, row_no, raw, normalized, status, error_messages,
             supplier_product_code, supplier_variant_code, supplier_color_code, supplier_size,
             qty, buy_price, buy_price_ron, sell_price, sell_price_ron, sn_cod,
             purchase_order_id, purchase_order_line_id
           )
           VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6::text[],$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            batchId,
            nr.rowNo,
            JSON.stringify(nr.raw || {}),
            JSON.stringify(normalizedForDb),
            nr.status,
            nr.errors,
            nr.normalized.supplierProductCode,
            nr.normalized.supplierVariantCode,
            nr.normalized.supplierColorCode,
            nr.normalized.supplierSize,
            nr.normalized.qty,
            nr.normalized.buyPrice,
            buyPriceRon,
            nr.normalized.sellPrice,
            sellPriceRon,
            nr.normalized.snCod || nr.normalized.sn_cod,
            batch.rows[0].purchase_order_id || null,
            purchaseOrderLineIdFromNormalized(nr.normalized),
          ]
        );
      }

      const totals = await client.query(
        `SELECT
           count(*)::int AS row_count,
           count(*) FILTER (
             WHERE status='error'
                OR COALESCE(cardinality(error_messages), 0) > 0
           )::int AS error_count
         FROM aif_import_rows
         WHERE batch_id::text=$1`,
        [batchId]
      );
      const totalRowCount = Number(totals.rows[0]?.row_count || 0);
      const totalErrorCount = Number(totals.rows[0]?.error_count || 0);

      await client.query(
        `UPDATE aif_import_batches
         SET row_count=$2, error_count=$3, status=$4, updated_at=now()
         WHERE id::text=$1`,
        [batchId, totalRowCount, totalErrorCount, totalErrorCount ? "needs_review" : "parsed"]
      );

      await client.query("COMMIT");
      res.json({ ok: true, rowCount: totalRowCount, errorCount: totalErrorCount, addedRows: rowsInput.length, chunkErrorCount });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF replace import rows failed", e);
      res.status(500).json({ error: "failed to save rows" });
    } finally {
      client.release();
    }
  });


  async function commitBatchRows(client, { batchId, rowIds = null, actor = "system" }) {
    if (!isUuidText(batchId)) {
      const e = new Error("Import csomag nem található.");
      e.statusCode = 404;
      e.code = "invalid_import_batch_id";
      throw e;
    }
    await ensureSnCodSchema(client);
    const batchRes = await client.query(
      `SELECT b.*, s.code AS supplier_code
       FROM aif_import_batches b
       JOIN aif_suppliers s ON s.id=b.supplier_id
       WHERE b.id::text=$1
       FOR UPDATE OF b`,
      [batchId]
    );
    if (!batchRes.rowCount) {
      const e = new Error("Import csomag nem található.");
      e.statusCode = 404;
      throw e;
    }

    const batch = batchRes.rows[0];
    if (batch.status === "cancelled") {
      const e = new Error("Törölt import nem vehető készletre.");
      e.statusCode = 400;
      throw e;
    }
    if (!batch.target_location_id) {
      const e = new Error("Hiányzik a cél hely.");
      e.statusCode = 400;
      throw e;
    }

    const args = [batchId];
    let where = `batch_id::text=$1 AND status NOT IN ('ignored','committed')`;
    if (Array.isArray(rowIds) && rowIds.length) {
      args.push(rowIds.map(String));
      where += ` AND id::text = ANY($2::text[])`;
    }

    const rows = await client.query(
      `SELECT * FROM aif_import_rows
       WHERE ${where}
       ORDER BY row_no ASC
       FOR UPDATE`,
      args
    );

    if (!rows.rowCount) {
      const e = new Error("Nincs készletre vehető terméksor. Ellenőrizd, hogy van-e kijelölt, hibátlan és még nem készletre vett sor.");
      e.statusCode = 400;
      throw e;
    }

    const errors = rows.rows.filter((r) => r.status === "error" || (r.error_messages || []).length);
    if (errors.length) {
      // Do not block retrying a batch just because a previous commit attempt marked rows as error.
      // Each row is protected by a SAVEPOINT below; genuinely bad rows will remain error, fixed rows can now commit.
      console.error("AIF commit retrying rows that were already marked as error", { batchId, rows: errors.length });
    }

    const salesTvaSettings = await readSalesTvaSettings(client);
    let committed = 0;
    const failedRows = [];
    const committedRowResults = [];

    for (const row of rows.rows) {
      const savepointName = `aif_commit_row_${String(row.id || row.row_no || "x").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32)}`;
      try {
        await client.query(`SAVEPOINT ${savepointName}`);

        const normalized = { ...(row.normalized || {}) };
        const rowSnCod = emptyToNull(row.sn_cod);
        if (rowSnCod && !emptyToNull(normalized.snCod ?? normalized.sn_cod)) {
          normalized.snCod = rowSnCod;
          normalized.sn_cod = rowSnCod;
        }
        applySalesTvaSettingsToNormalized(normalized, salesTvaSettings);
        applyProductCodeSplit(normalized);
        normalized.gender = canonicalGender(normalized.gender);
        const brandColorMapped = await applyBrandColorCodeMapping(client, normalized);
        if (!brandColorMapped && normalized.colorName) normalized.colorName = await normalizeColorName(client, normalized.colorName);
        const brandSizeMapped = await applyBrandSizeCodeMapping(client, normalized);
        if (!brandSizeMapped && normalized.size) normalized.size = await normalizeSizeValue(client, normalized.size);
        const qty = Number(row.qty ?? normalized.qty ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error("a mennyiség hiányzik vagy nem pozitív");

        if (row.buy_price_ron !== null && row.buy_price_ron !== undefined) {
          normalized.buyPriceOriginal = row.buy_price;
          normalized.buyPrice = Number(row.buy_price_ron);
        }
        if (row.sell_price_ron !== null && row.sell_price_ron !== undefined) {
          normalized.sellPriceOriginal = row.sell_price;
          normalized.sellPrice = Number(row.sell_price_ron);
        }

        const modelId = await upsertModel(client, { supplierCode: batch.supplier_code, normalized, createStatus: "draft", updateStatus: null });
        const variantId = await upsertVariant(client, { modelId, normalized, createStatus: "active", updateStatus: null });
        await upsertSupplierCode(client, { variantId, supplierId: batch.supplier_id, normalized });
        await addStock(client, {
          locationId: batch.target_location_id,
          variantId,
          qty: Math.floor(qty),
          actor,
          sourceId: batchId,
          rowId: row.id,
          raw: row.raw,
        });

        const purchaseOrderLineId = row.purchase_order_line_id || purchaseOrderLineIdFromNormalized(normalized);
        if (batch.purchase_order_id && purchaseOrderLineId) {
          await registerAifPurchaseOrderReceipt(client, {
            orderId: batch.purchase_order_id,
            orderLineId: purchaseOrderLineId,
            receptionId: batch.reception_id || null,
            importBatchId: batch.id,
            importRowId: row.id,
            qty: Math.floor(qty),
            actor,
            raw: {
              source: 'incoming_commit',
              batchId: String(batch.id),
              receptionId: batch.reception_id ? String(batch.reception_id) : null,
              rowNo: row.row_no || null,
              variantId: String(variantId || ''),
            },
          });
        }

        await client.query(
          `UPDATE aif_import_rows SET status='committed', variant_id=$2, updated_at=now() WHERE id=$1`,
          [row.id, variantId]
        );

        committedRowResults.push({
          id: String(row.id || ""),
          rowNo: row.row_no || null,
          variantId: String(variantId || ""),
          qty: Math.floor(qty),
          supplierProductCode: normalized.supplierProductCode || row.supplier_product_code || null,
          supplierColorCode: normalized.supplierColorCode || normalized.colorCode || row.supplier_color_code || null,
          supplierSize: normalized.supplierSize || normalized.size || row.supplier_size || null,
          titleRo: normalized.titleRo || null,
          colorName: normalized.colorName || null,
          size: normalized.size || null,
        });

        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
        committed++;
      } catch (rowError) {
        try { await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`); } catch {}
        try { await client.query(`RELEASE SAVEPOINT ${savepointName}`); } catch {}

        const rowMessage = `A(z) ${row.row_no || "?"}. terméksor készletre vétele nem sikerült: ${rowError?.message || rowError}`;
        const rowFailure = {
          id: String(row.id || ""),
          rowNo: row.row_no || null,
          error: rowMessage,
          code: rowError?.code || null,
          detail: rowError?.detail || null,
          constraint: rowError?.constraint || null,
        };
        failedRows.push(rowFailure);
        console.error("AIF commit import row failed", rowFailure);

        await client.query(
          `UPDATE aif_import_rows
           SET status='error', error_messages=$2::text[], updated_at=now()
           WHERE id=$1`,
          [row.id, [rowMessage]]
        );
      }
    }

    const state = await client.query(
      `SELECT
         count(*) FILTER (WHERE status <> 'ignored')::int AS total_rows,
         count(*) FILTER (WHERE status = 'committed')::int AS committed_rows,
         count(*) FILTER (WHERE status = 'error')::int AS error_rows,
         count(*) FILTER (WHERE status NOT IN ('ignored','committed'))::int AS remaining_rows
       FROM aif_import_rows
       WHERE batch_id=$1`,
      [batchId]
    );
    const st = state.rows[0] || { total_rows: 0, committed_rows: 0, error_rows: 0, remaining_rows: 0 };

    if (Number(st.remaining_rows || 0) <= 0 && Number(st.total_rows || 0) > 0) {
      await client.query(
        `UPDATE aif_import_batches
         SET status='committed', committed_at=COALESCE(committed_at, now()), error_count=0, updated_at=now()
         WHERE id=$1`,
        [batchId]
      );
    } else {
      await client.query(
        `UPDATE aif_import_batches
         SET status=CASE WHEN $2::int > 0 THEN 'needs_review' ELSE 'parsed' END,
             error_count=$2,
             updated_at=now()
         WHERE id=$1`,
        [batchId, Number(st.error_rows || 0)]
      );
    }

    if (batch.reception_id) {
      const recState = await client.query(
        `SELECT
           count(rw.id) FILTER (WHERE rw.status <> 'ignored')::int AS total_rows,
           count(rw.id) FILTER (WHERE rw.status = 'committed')::int AS committed_rows,
           count(rw.id) FILTER (WHERE rw.status NOT IN ('ignored','committed'))::int AS remaining_rows,
           count(rw.id) FILTER (WHERE rw.status = 'error')::int AS error_rows
         FROM aif_import_batches b
         LEFT JOIN aif_import_rows rw ON rw.batch_id=b.id
         WHERE b.reception_id=$1`,
        [batch.reception_id]
      );
      const rs = recState.rows[0] || {};
      if (Number(rs.total_rows || 0) > 0 && Number(rs.remaining_rows || 0) <= 0) {
        await client.query(`UPDATE aif_receptions SET status='committed', updated_at=now() WHERE id=$1`, [batch.reception_id]);
      } else {
        await client.query(`UPDATE aif_receptions SET status='draft', updated_at=now() WHERE id=$1 AND status <> 'cancelled'`, [batch.reception_id]);
      }
    }

    if (batch.purchase_order_id) {
      await refreshAifPurchaseOrderReceiptState(client, batch.purchase_order_id, actor);
    }

    return {
      committed,
      totalRows: Number(st.total_rows || 0),
      committedRows: Number(st.committed_rows || 0),
      remainingRows: Number(st.remaining_rows || 0),
      errorRows: Number(st.error_rows || 0),
      failedRows,
      failedCount: failedRows.length,
      committedRowResults,
      variantIds: Array.from(new Set(committedRowResults.map((row) => row.variantId).filter(Boolean))),
      committedVariantIds: Array.from(new Set(committedRowResults.map((row) => row.variantId).filter(Boolean))),
      committedTotalQty: committedRowResults.reduce((sum, row) => sum + Number(row.qty || 0), 0),
      warning: failedRows.length ? `${failedRows.length} terméksor nem került készletre. A hibás sorok ellenőrzendő státuszba kerültek.` : null,
    };
  }

  router.post("/import-batches/:id/commit", requireAuthed, async (req, res) => {
    const batchId = text(req.params.id);
    if (!batchId) return res.status(400).json({ error: "Import azonosító kötelező." });
    if (!isUuidText(batchId)) return invalidImportBatchId(res);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await commitBatchRows(client, {
        batchId,
        rowIds: null,
        actor: actorFrom(req),
      });
      await client.query("COMMIT");
      if (result.failedRows?.length && Number(result.committed || 0) <= 0) {
        return res.status(400).json({
          ok: false,
          committed: 0,
          ...result,
          error: result.failedRows[0]?.error || "A készletre vétel nem sikerült. A sorok ellenőrzendő státuszba kerültek.",
        });
      }
      res.json({ ok: true, committed: result.committed, ...result });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF commit import batch failed", e);
      const status = Number(e?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: e?.message || "A készletre vétel nem sikerült.",
        code: e?.code || null,
        detail: e?.detail || null,
        constraint: e?.constraint || null,
        rowNo: e?.rowNo || null,
      });
    } finally {
      client.release();
    }
  });

  router.post("/receptions/:id/commit-selected", requireAuthed, async (req, res) => {
    const receptionId = text(req.params.id);
    const rowIds = Array.isArray(req.body?.rowIds) ? req.body.rowIds.map(String).filter(Boolean) : null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const rec = await client.query(`SELECT id FROM aif_receptions WHERE id::text=$1 FOR UPDATE`, [receptionId]);
      if (!rec.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Receptió nem található." });
      }

      let batches;
      if (rowIds && rowIds.length) {
        batches = await client.query(
          `SELECT DISTINCT b.id
           FROM aif_import_batches b
           JOIN aif_import_rows rw ON rw.batch_id=b.id
           WHERE b.reception_id=$1 AND rw.id::text = ANY($2::text[])
           ORDER BY b.id`,
          [rec.rows[0].id, rowIds]
        );
      } else {
        batches = await client.query(
          `SELECT id
           FROM aif_import_batches
           WHERE reception_id=$1
           ORDER BY created_at ASC`,
          [rec.rows[0].id]
        );
      }

      if (!batches.rowCount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Nincs készletre vehető mentett terméksor ebben a receptióban." });
      }

      let committed = 0;
      const details = [];
      for (const b of batches.rows) {
        const batchRowIds = rowIds && rowIds.length
          ? rowIds
          : null;
        const result = await commitBatchRows(client, {
          batchId: b.id,
          rowIds: batchRowIds,
          actor: actorFrom(req),
        });
        committed += Number(result.committed || 0);
        details.push({ batchId: b.id, ...result });
      }

      await client.query("COMMIT");
      res.json({ ok: true, committed, batches: details });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF reception selected commit failed", e);
      const status = Number(e?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: e?.message || "A kijelölt sorok készletre vétele nem sikerült." });
    } finally {
      client.release();
    }
  });

  router.patch("/import-rows/:id", requireAuthed, async (req, res) => {
    const rowId = text(req.params.id);
    const body = req.body || {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSnCodSchema(client);
      const current = await client.query(
        `SELECT rw.*, b.exchange_rate_to_ron, b.currency_code, b.status AS batch_status,
                r.raw_meta AS reception_raw_meta
         FROM aif_import_rows rw
         JOIN aif_import_batches b ON b.id=rw.batch_id
         LEFT JOIN aif_receptions r ON r.id=b.reception_id
         WHERE rw.id::text=$1
         FOR UPDATE OF rw`,
        [rowId]
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Terméksor nem található." });
      }
      const row = current.rows[0];
      const isCommitted = row.status === "committed";

      if (body.status === "ignored") {
        if (isCommitted) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Készletre vett terméksor nem hagyható ki. Ehhez külön korrekció szükséges." });
        }
        await client.query(
          `UPDATE aif_import_rows SET status='ignored', error_messages='{}'::text[], updated_at=now() WHERE id=$1`,
          [row.id]
        );
        await client.query("COMMIT");
        return res.json({ ok: true, mode: "ignored" });
      }

      const nextNormalized = {
        ...(row.normalized || {}),
        ...(body.normalized && typeof body.normalized === "object" ? body.normalized : {}),
      };
      const existingSnCod = emptyToNull(row.sn_cod);
      if (existingSnCod && !emptyToNull(nextNormalized.snCod ?? nextNormalized.sn_cod)) {
        nextNormalized.snCod = existingSnCod;
        nextNormalized.sn_cod = existingSnCod;
      }
      if (isCommitted) {
        nextNormalized.qty = row.qty ?? nextNormalized.qty;
      }

      const nr = normalizeRowInput({ normalized: nextNormalized, raw: row.raw, rowNo: row.row_no }, row.row_no || 1);
      await enrichNormalizedRow(client, nr);
      applyReceptionSellPricePolicyToNormalized(nr.normalized, {
        currencyCode: row.currency_code,
        exchangeRateToRon: row.exchange_rate_to_ron,
        rawMeta: row.reception_raw_meta || {},
      });
      const salesTvaSettings = await readSalesTvaSettings(client);
      applySalesTvaSettingsToNormalized(nr.normalized, salesTvaSettings);
      if (isCommitted) {
        nr.status = "committed";
        nr.errors = [];
        nr.normalized.qty = row.qty;
      }

      const exchangeRate = Number(row.exchange_rate_to_ron || 1);
      const buyPriceRon = nr.normalized.buyPrice == null || !Number.isFinite(exchangeRate)
        ? null
        : Number(nr.normalized.buyPrice) * exchangeRate;
      const sellPriceRon = calcSellPriceRon(nr.normalized, exchangeRate);
      const normalizedForDb = {
        ...nr.normalized,
        currencyCode: row.currency_code,
        exchangeRateToRon: exchangeRate,
        buyPriceRon,
        sellPriceRon,
      };

      await client.query(
        `UPDATE aif_import_rows SET
           normalized=$2::jsonb,
           status=$3,
           error_messages=$4::text[],
           supplier_product_code=$5,
           supplier_variant_code=$6,
           supplier_color_code=$7,
           supplier_size=$8,
           sn_cod=$14,
           qty=$9,
           buy_price=$10,
           buy_price_ron=$11,
           sell_price=$12,
           sell_price_ron=$13,
           updated_at=now()
         WHERE id=$1`,
        [
          row.id,
          JSON.stringify(normalizedForDb),
          nr.status,
          nr.errors,
          nr.normalized.supplierProductCode,
          nr.normalized.supplierVariantCode,
          nr.normalized.supplierColorCode,
          nr.normalized.supplierSize,
          isCommitted ? row.qty : nr.normalized.qty,
          nr.normalized.buyPrice,
          buyPriceRon,
          nr.normalized.sellPrice,
          sellPriceRon,
          nr.normalized.snCod || nr.normalized.sn_cod,
        ]
      );

      if (isCommitted && row.variant_id) {
        await client.query(
          `UPDATE aif_product_variants SET
             barcode=COALESCE($2, barcode),
             sn_cod=COALESCE($9, sn_cod),
             color_code=COALESCE($3, color_code),
             color_name=COALESCE($4, color_name),
             size=COALESCE($5, size),
             buy_price=COALESCE($6, buy_price),
             sell_price=COALESCE($7, sell_price),
             compare_at_price=COALESCE($8, compare_at_price),
             attributes=COALESCE(attributes,'{}'::jsonb) || $10::jsonb,
             updated_at=now()
           WHERE id=$1`,
          [
            row.variant_id,
            nr.normalized.barcode,
            nr.normalized.colorCode,
            nr.normalized.colorName,
            nr.normalized.size,
            buyPriceRon,
            sellPriceRon,
            nr.normalized.compareAtPrice,
            nr.normalized.snCod || nr.normalized.sn_cod,
            variantAttributesJsonFromNormalized(nr.normalized),
          ]
        );
        if (nr.normalized.titleRo) {
          await client.query(
            `UPDATE aif_product_models m
             SET title_ro=$2, updated_at=now()
             FROM aif_product_variants v
             WHERE v.model_id=m.id AND v.id=$1`,
            [row.variant_id, nr.normalized.titleRo]
          );
        }
        await client.query(
          `UPDATE aif_variant_supplier_codes
           SET supplier_product_code=COALESCE($2, supplier_product_code),
               supplier_variant_code=$3,
               supplier_color_code=$4,
               supplier_color_name=COALESCE($5, supplier_color_name),
               supplier_size=COALESCE($6, supplier_size),
               raw=$7::jsonb,
               updated_at=now()
           WHERE variant_id=$1`,
          [
            row.variant_id,
            nr.normalized.supplierProductCode,
            nr.normalized.supplierVariantCode,
            nr.normalized.supplierColorCode,
            nr.normalized.colorName,
            nr.normalized.supplierSize,
            JSON.stringify(normalizedForDb),
          ]
        );
      }

      await client.query("COMMIT");
      res.json({ ok: true, status: nr.status, errors: nr.errors, committedEdit: isCommitted });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF update import row failed", e);
      res.status(500).json({ error: e?.message || "A terméksor mentése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });


  router.delete("/import-rows/:id", requireAuthed, async (req, res) => {
    const rowId = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(`SELECT id, status FROM aif_import_rows WHERE id::text=$1 FOR UPDATE`, [rowId]);
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Terméksor nem található." });
      }
      if (current.rows[0].status === "committed") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Készletre vett terméksor nem törölhető itt." });
      }
      await client.query(`UPDATE aif_import_rows SET status='ignored', error_messages='{}'::text[], updated_at=now() WHERE id=$1`, [current.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "ignored" });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF ignore import row failed", e);
      res.status(500).json({ error: e?.message || "A terméksor kihagyása nem sikerült." });
    } finally {
      client.release();
    }
  });


  router.post("/import-rows/:id/move-reception", requireAuthed, async (req, res) => {
    const rowId = text(req.params.id);
    const targetReceptionId = text(req.body?.targetReceptionId || req.body?.target_reception_id || req.body?.receptionId || req.body?.reception_id);
    if (!targetReceptionId) return res.status(400).json({ error: "Cél receptió kiválasztása kötelező." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const rowRes = await client.query(
        `SELECT rw.*, b.id AS source_batch_id, b.reception_id AS source_reception_id
         FROM aif_import_rows rw
         JOIN aif_import_batches b ON b.id=rw.batch_id
         WHERE rw.id::text=$1
         FOR UPDATE OF rw`,
        [rowId]
      );
      if (!rowRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Terméksor nem található." });
      }
      const row = rowRes.rows[0];
      if (row.status === "committed") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Készletre vett sort nem lehet másik receptióba áthelyezni." });
      }
      if (String(row.source_reception_id || "") === targetReceptionId) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Ez a sor már ebben a receptióban van." });
      }
      const target = await client.query(
        `SELECT r.*, s.code AS supplier_code
         FROM aif_receptions r
         LEFT JOIN aif_suppliers s ON s.id=r.supplier_id
         WHERE r.id::text=$1
         FOR UPDATE`,
        [targetReceptionId]
      );
      if (!target.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Cél receptió nem található." });
      }
      if (["committed", "cancelled"].includes(String(target.rows[0].status || ""))) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Lezárt vagy törölt receptióba nem lehet sort áthelyezni." });
      }
      let targetBatchId = null;
      const tb = await client.query(
        `SELECT id FROM aif_import_batches WHERE reception_id=$1 AND status <> 'committed' ORDER BY created_at DESC LIMIT 1`,
        [target.rows[0].id]
      );
      if (tb.rowCount) targetBatchId = tb.rows[0].id;
      else {
        let profileId = null;
        if (target.rows[0].supplier_id) {
          const pr = await client.query(
            `SELECT id FROM aif_supplier_import_profiles WHERE supplier_id=$1 AND is_active=true ORDER BY version DESC LIMIT 1`,
            [target.rows[0].supplier_id]
          );
          profileId = pr.rows[0]?.id || null;
        }
        const created = await client.query(
          `INSERT INTO aif_import_batches (
             supplier_id, profile_id, target_location_id, reception_id, source_format, status,
             created_by, actor, note, raw_meta, currency_code, exchange_rate_to_ron, invoice_number
           )
           VALUES ($1,$2,$3,$4,'manual','parsed','system','system','Receptió folytatás','{}'::jsonb,$5,$6,$7)
           RETURNING id`,
          [target.rows[0].supplier_id, profileId, target.rows[0].target_location_id, target.rows[0].id, target.rows[0].currency_code, target.rows[0].exchange_rate_to_ron, target.rows[0].invoice_number]
        );
        targetBatchId = created.rows[0].id;
      }
      const rate = Number(target.rows[0].exchange_rate_to_ron || 1);
      const nextNormalized = { ...(row.normalized || {}), currencyCode: target.rows[0].currency_code, exchangeRateToRon: rate };
      await client.query(
        `UPDATE aif_import_rows
         SET batch_id=$2,
             buy_price_ron=CASE WHEN buy_price IS NULL THEN NULL ELSE round(buy_price * $3::numeric, 2) END,
             sell_price_ron=${sellPriceRonSql('sell_price', 'normalized', '$3')},
             normalized=$4::jsonb,
             updated_at=now()
         WHERE id=$1`,
        [row.id, targetBatchId, rate, JSON.stringify(nextNormalized)]
      );
      const refreshBatch = async (batchId) => {
        const st = await client.query(
          `SELECT count(*)::int AS rows, count(*) FILTER (WHERE status='error')::int AS errors FROM aif_import_rows WHERE batch_id=$1`,
          [batchId]
        );
        const rows = Number(st.rows[0]?.rows || 0);
        const errors = Number(st.rows[0]?.errors || 0);
        await client.query(
          `UPDATE aif_import_batches SET row_count=$2, error_count=$3, status=CASE WHEN $2=0 THEN 'draft' WHEN $3>0 THEN 'needs_review' ELSE 'parsed' END, updated_at=now() WHERE id=$1 AND status <> 'committed'`,
          [batchId, rows, errors]
        );
      };
      await refreshBatch(row.source_batch_id);
      await refreshBatch(targetBatchId);
      await client.query("COMMIT");
      res.json({ ok: true, targetBatchId });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF move import row failed", e);
      res.status(500).json({ error: e?.message || "A terméksor áthelyezése nem sikerült." });
    } finally {
      client.release();
    }
  });


  async function readVariantStockRows(client, variantId) {
    const stock = await client.query(
      `SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name,
              l.location_type, s.qty, s.reserved_qty, (s.qty - s.reserved_qty) AS available_qty, s.updated_at
       FROM aif_stock s
       JOIN aif_locations l ON l.id=s.location_id
       WHERE s.variant_id=$1
       ORDER BY l.name ASC`,
      [variantId]
    );
    return stock.rows;
  }

  function stockMovementSourceId(prefix, variantId, locationId) {
    // Keep this intentionally short. Some existing databases have source_id as varchar(40/64),
    // and a huge UUID-packed id makes stock edits fail. Fantastic little trap, obviously.
    const cleanPrefix = normCode(prefix || "stock").slice(0, 12) || "stock";
    const timePart = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${cleanPrefix}:${timePart}:${rand}`;
  }

  async function insertStockMovementSafe(client, {
    movementType = "manual_adjustment",
    sourceType = "manual_stock_edit",
    sourcePrefix = "stock",
    locationId,
    variantId,
    qtyDelta,
    qtyBefore,
    qtyAfter,
    actor = "system",
    raw = {},
    fallbackSourceType = "manual_stock_edit",
    sourceId = null,
  }) {
    const insertOnce = async (safeSourceType, safeSourcePrefix, explicitSourceId = sourceId) => {
      await client.query(
        `INSERT INTO aif_stock_movements (
           movement_type, source_type, source_id, location_id, variant_id,
           qty_delta, qty_before, qty_after, actor, raw
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [
          movementType,
          safeSourceType,
          explicitSourceId || stockMovementSourceId(safeSourcePrefix || safeSourceType || "stock", variantId, locationId),
          locationId,
          variantId,
          qtyDelta,
          qtyBefore,
          qtyAfter,
          actor,
          JSON.stringify(raw || {}),
        ]
      );
    };

    try {
      await client.query("SAVEPOINT aif_stock_movement_log");
      await insertOnce(sourceType, sourcePrefix || sourceType);
      await client.query("RELEASE SAVEPOINT aif_stock_movement_log");
      return true;
    } catch (firstError) {
      try { await client.query("ROLLBACK TO SAVEPOINT aif_stock_movement_log"); } catch {}
      try { await client.query("RELEASE SAVEPOINT aif_stock_movement_log"); } catch {}

      try {
        await client.query("SAVEPOINT aif_stock_movement_log_short_id");
        await insertOnce(sourceType, sourcePrefix || sourceType, null);
        await client.query("RELEASE SAVEPOINT aif_stock_movement_log_short_id");
        console.error("AIF stock movement logged with generated short source_id", { sourceType, error: firstError?.message || firstError });
        return true;
      } catch (shortIdError) {
        try { await client.query("ROLLBACK TO SAVEPOINT aif_stock_movement_log_short_id"); } catch {}
        try { await client.query("RELEASE SAVEPOINT aif_stock_movement_log_short_id"); } catch {}
      }

      if (fallbackSourceType && fallbackSourceType !== sourceType) {
        try {
          await client.query("SAVEPOINT aif_stock_movement_log_fallback");
          await insertOnce(fallbackSourceType, fallbackSourceType, null);
          await client.query("RELEASE SAVEPOINT aif_stock_movement_log_fallback");
          console.error("AIF stock movement logged with fallback source_type", { sourceType, fallbackSourceType, error: firstError?.message || firstError });
          return true;
        } catch (fallbackError) {
          try { await client.query("ROLLBACK TO SAVEPOINT aif_stock_movement_log_fallback"); } catch {}
          try { await client.query("RELEASE SAVEPOINT aif_stock_movement_log_fallback"); } catch {}
          console.error("AIF stock movement log warning", fallbackError);
          return false;
        }
      }

      console.error("AIF stock movement log warning", firstError);
      return false;
    }
  }

  router.patch("/variants/:id/stock", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const rowsInput = Array.isArray(req.body?.rows)
      ? req.body.rows
      : Array.isArray(req.body?.items)
        ? req.body.items
        : [];
    const modeRaw = normCode(req.body?.mode || req.body?.stockMode || req.body?.stock_mode || req.body?.adjustmentMode || req.body?.adjustment_mode || req.query?.mode || "redistribute");
    const correctionMode = ["correction", "manual_correction", "stock_correction", "adjustment", "manual_adjustment"].includes(modeRaw)
      || boolFrom(req.body?.allowTotalChange ?? req.body?.allow_total_change, false);
    const correctionReasonCode = normCode(
      req.body?.reasonCode ?? req.body?.reason_code ?? req.body?.correctionReasonCode ?? req.body?.correction_reason_code
    );
    const correctionReasonText = emptyToNull(
      req.body?.reasonText ?? req.body?.reason_text ?? req.body?.correctionReasonText ?? req.body?.correction_reason_text
    );
    const correctionNote = emptyToNull(req.body?.note ?? req.body?.correctionNote ?? req.body?.correction_note);

    if (!id) return res.status(400).json({ error: "variant id required" });
    if (!rowsInput.length) return res.status(400).json({ error: "Nincs menthető készletsor." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const variant = await client.query(
        `SELECT id FROM aif_product_variants
         WHERE id::text=$1 OR internal_sku=$1 OR barcode=$1
         FOR UPDATE`,
        [id]
      );
      if (!variant.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "variant not found" });
      }
      const variantId = variant.rows[0].id;
      const actor = actorFrom(req);

      const preparedRows = [];
      const seenLocations = new Set();
      for (const input of rowsInput) {
        const locationInput = input.locationId || input.location_id || input.locationCode || input.location_code || input.location || input.code;
        const location = await findByIdOrCode(client, "aif_locations", locationInput);
        if (!location || location.is_active === false) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `Érvénytelen vagy inaktív célhely: ${locationInput || "-"}` });
        }
        const locationKey = String(location.id);
        if (seenLocations.has(locationKey)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `${location.name}: ugyanaz a célhely többször szerepel a mentésben.` });
        }
        seenLocations.add(locationKey);

        const qty = toInt(input.qty);
        if (qty === null || qty < 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `Érvénytelen készlet mennyiség: ${input.qty ?? ""}` });
        }
        preparedRows.push({ input, location, qty });
      }

      const currentRows = await client.query(
        `SELECT location_id, qty, reserved_qty
         FROM aif_stock
         WHERE variant_id=$1
         FOR UPDATE`,
        [variantId]
      );
      const currentByLocation = new Map(currentRows.rows.map((row) => [String(row.location_id), row]));
      const beforeTotal = currentRows.rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
      let afterTotal = beforeTotal;

      const normalizedRows = [];
      for (const row of preparedRows) {
        const current = currentByLocation.get(String(row.location.id));
        const beforeQty = current ? Number(current.qty || 0) : 0;
        const beforeReserved = current ? Number(current.reserved_qty || 0) : 0;
        const reservedInput = row.input.reservedQty ?? row.input.reserved_qty;
        const reservedQty = reservedInput === undefined || reservedInput === null || reservedInput === ""
          ? beforeReserved
          : toInt(reservedInput);

        if (reservedQty === null || reservedQty < 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `Érvénytelen foglalt mennyiség: ${reservedInput ?? ""}` });
        }
        if (reservedQty > row.qty) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `${row.location.name}: a foglalt mennyiség nem lehet nagyobb, mint a készlet.` });
        }

        afterTotal += row.qty - beforeQty;
        normalizedRows.push({ ...row, beforeQty, beforeReserved, reservedQty });
      }

      if (!correctionMode && afterTotal !== beforeTotal) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Mozgatás módban a teljes készlet nem változhat. Előtte: ${beforeTotal}, utána: ${afterTotal}. Új darab beviteléhez kapcsold be a készletkorrekciót.`,
          code: "stock_total_change_requires_correction_mode",
          beforeTotal,
          afterTotal,
        });
      }

      if (correctionMode && afterTotal !== beforeTotal && !correctionReasonCode) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "A készletkorrekció okának kiválasztása kötelező.",
          code: "stock_correction_reason_required",
          beforeTotal,
          afterTotal,
        });
      }
      if (correctionMode && afterTotal !== beforeTotal && correctionReasonCode === "other" && !correctionReasonText) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Az Egyéb készletkorrekció okát szövegesen is meg kell adni.",
          code: "stock_correction_reason_text_required",
          beforeTotal,
          afterTotal,
        });
      }

      const sourceType = correctionMode ? "manual_stock_correction" : "manual_stock_redistribution";
      const reason = correctionMode ? "manual_location_stock_correction" : "manual_location_stock_redistribution";
      let changed = 0;

      for (const row of normalizedRows) {
        await client.query(
          `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
           VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (location_id, variant_id)
           DO UPDATE SET qty=$3, reserved_qty=$4, updated_at=now()`,
          [row.location.id, variantId, row.qty, row.reservedQty]
        );

        const diff = row.qty - row.beforeQty;
        if (diff !== 0 || row.reservedQty !== row.beforeReserved) {
          changed++;
          await insertStockMovementSafe(client, {
            movementType: "manual_adjustment",
            sourceType,
            sourcePrefix: correctionMode ? "stock_corr" : "stock_move",
            fallbackSourceType: "manual_stock_edit",
            locationId: row.location.id,
            variantId,
            qtyDelta: diff,
            qtyBefore: row.beforeQty,
            qtyAfter: row.qty,
            actor,
            raw: {
              reason,
              documentType: correctionMode ? "stock_correction" : null,
              reasonCode: correctionMode ? correctionReasonCode || null : null,
              reasonText: correctionMode ? correctionReasonText : null,
              note: correctionMode ? correctionNote : null,
              mode: correctionMode ? "correction" : "redistribute",
              direction: diff > 0 ? "in" : diff < 0 ? "out" : "adjust",
              locationCode: row.location.code,
              locationName: row.location.name,
              totalBefore: beforeTotal,
              totalAfter: afterTotal,
              qtyBefore: row.beforeQty,
              qtyAfter: row.qty,
              reservedBefore: row.beforeReserved,
              reservedAfter: row.reservedQty,
            },
          });
        }
      }

      const freshStock = await readVariantStockRows(client, variantId);
      await client.query("COMMIT");
      res.json({ ok: true, changed, mode: correctionMode ? "correction" : "redistribute", beforeTotal, afterTotal, totalDelta: afterTotal - beforeTotal, stock: freshStock });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF update variant stock failed", e);
      const status = Number(e?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: e?.message || "A készlet módosítása nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });



  async function addManualProductStock(client, { locationId, variantId, qty, actor, raw }) {
    const current = await client.query(
      `SELECT qty, reserved_qty FROM aif_stock WHERE location_id=$1 AND variant_id=$2 FOR UPDATE`,
      [locationId, variantId]
    );
    const before = current.rowCount ? Number(current.rows[0].qty || 0) : 0;
    const after = before + qty;
    if (after < 0) throw new Error("stock cannot go negative");

    await client.query(
      `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
       VALUES ($1,$2,$3,0,now())
       ON CONFLICT (location_id, variant_id)
       DO UPDATE SET qty=$3, updated_at=now()`,
      [locationId, variantId, after]
    );

    await insertStockMovementSafe(client, {
      movementType: "incoming",
      sourceType: "manual_product_add",
      sourcePrefix: "manual_prod",
      fallbackSourceType: "manual_stock_edit",
      locationId,
      variantId,
      qtyDelta: qty,
      qtyBefore: before,
      qtyAfter: after,
      actor,
      raw: { reason: "manual_product_add", ...raw },
    });
  }

  router.post(["/variants", "/variants/manual", "/manual-products"], requireAuthed, async (req, res) => {
    const body = req.body || {};
    const src = body.normalized && typeof body.normalized === "object" ? body.normalized : body;
    const raw = body.raw && typeof body.raw === "object" ? body.raw : body;
    const rawBrand = rawValueByHeaders(raw, ["BRAND", "MARCA", "MARCĂ", "MÁRKA", "MARKA", "BRAND NAME"]);
    const rawCategory = rawValueByHeaders(raw, ["CATEGORIE", "CATEGORY", "CATEGORIA", "CATEGORIE PRODUS", "PRODUCT CATEGORY"]);
    const rawProductType = rawValueByHeaders(raw, ["RODESCR", "RO DESCR", "RO_DESCR", "TIP PRODUS", "PRODUCT TYPE", "TYPE"]);
    const rawSubcategory = rawValueByHeaders(raw, ["SUBCATEGORIE", "SUB CATEGORY", "SUBCATEGORY", "ALKATEGORIA", "ALKATEGÓRIA", "ALCATEGORIE"]);
    const rawDescription = rawValueByHeaders(raw, ["DESCRIERE", "DESCRIERE PRODUS", "DESCRIERE LUNGA", "DESCRIERE LUNGĂ", "DESCRIERE RO", "DESCR_RO", "DESCRIPTION", "LONG DESCRIPTION", "PRODUCT DESCRIPTION", "DETALII", "LEIRAS", "LEÍRÁS"]);
    const rawTitle = rawValueByHeaders(raw, ["ARTICOL", "ARTICLE", "DENUMIRE", "DENUMIRE PRODUS", "DENUMIRE_PRODUS", "NUME PRODUS", "PRODUCT NAME", "PRODUCT", "ITEM", "ITEM NAME", "NÉV", "NEV"]);
    const rawMaterial = rawValueByHeaders(raw, ["COMPOZITIE", "COMPOZIȚIE", "COMPOSITION", "MATERIAL", "MATERIAL COMPOSITION", "FABRIC"]);
    const rawSeason = rawValueByHeaders(raw, ["COLECTIE", "COLECȚIE", "COLLECTION", "SEZON", "SEASON"]);
    const rawBuyPrice = rawValueByHeaders(raw, ["PRET DE ACHIZITIE", "PREȚ DE ACHIZIȚIE", "PRET ACHIZITIE", "PRET ACHIZIȚIE", "PURCHASE PRICE", "BUY PRICE", "VETELAR", "VÉTELÁR"]);
    const rawSellPrice = rawValueByHeaders(raw, ["PRET DE VINZARE", "PRET DE VANZARE", "PREȚ DE VÂNZARE", "PRET VANZARE", "PRET VINZARE", "SELL PRICE", "SALE PRICE", "ELADASI AR", "ELADÁSI ÁR"]);
    const rawImageUrl = rawValueByHeaders(raw, ["IMAGE", "IMAGE URL", "KÉP", "KEP", "KÉP URL", "KEP URL", "IMG", "PHOTO", "PHOTO URL", "FOTO", "FOTO URL", "POZA", "POZĂ", "POZA URL", "URL FOTO", "URL POZA", "LINK FOTO", "LINK POZA", "IMAGINE", "IMAGINE URL", "PICTURE", "PICTURE URL"]);
    const rawBarcode = rawValueByHeaders(raw, ["BARCODE", "BAR CODE", "BARKOD", "BÁRKÓD", "VONALKOD", "VONALKÓD", "EAN", "EAN13", "UPC", "COD BARE", "COD DE BARE", "CODBAR", "SKU"]);
    const stockRowsInput = Array.isArray(body.stockRows)
      ? body.stockRows
      : Array.isArray(body.stock_rows)
        ? body.stock_rows
        : Array.isArray(body.locations)
          ? body.locations
          : Array.isArray(body.stock)
            ? body.stock
            : [];
    const directQty = toInt(src.qty ?? body.qty ?? body.quantity ?? body.stockQty ?? body.stock_qty) || 0;
    const locationInput = body.targetLocationId || body.target_location_id || body.locationId || body.location_id || body.locationCode || body.location || src.targetLocationId || src.locationId;
    const supplierInput = body.supplierId || body.supplier_id || body.supplierCode || body.supplier || src.supplierId || src.supplierCode;
    const stockSourceRows = stockRowsInput.length
      ? stockRowsInput
      : directQty > 0
        ? [{ qty: directQty, locationId: locationInput }]
        : [];
    const requestedQty = stockSourceRows.reduce((sum, row) => {
      const qty = toInt(row?.qty ?? row?.quantity ?? row?.count) || 0;
      return sum + Math.max(0, Math.floor(qty));
    }, 0);
    if (requestedQty <= 0) return res.status(400).json({ error: "Legalább egy célhelyhez pozitív készletmennyiséget kell megadni." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSnCodSchema(client);
      await ensureAifSubcategorySchema(client);
      await ensureAifSizeTables(client);

      let fallbackLocation = null;
      if (locationInput) fallbackLocation = await findByIdOrCode(client, "aif_locations", locationInput);
      if (fallbackLocation && fallbackLocation.is_active === false) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "A kiválasztott célhely inaktív." });
      }
      if (!fallbackLocation) {
        const defaultLocationId = await getDefaultLocationId(client);
        if (defaultLocationId) fallbackLocation = await findByIdOrCode(client, "aif_locations", defaultLocationId);
      }
      if (!fallbackLocation) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Cél hely kiválasztása kötelező." });
      }

      const preparedStockByLocation = new Map();
      for (const stockRow of stockSourceRows) {
        const rowQty = Math.max(0, Math.floor(toInt(stockRow?.qty ?? stockRow?.quantity ?? stockRow?.count) || 0));
        if (rowQty <= 0) continue;
        const rowLocationInput = stockRow?.locationId || stockRow?.location_id || stockRow?.locationCode || stockRow?.location_code || stockRow?.location || stockRow?.code || locationInput;
        let rowLocation = rowLocationInput ? await findByIdOrCode(client, "aif_locations", rowLocationInput) : fallbackLocation;
        if (!rowLocation) rowLocation = fallbackLocation;
        if (!rowLocation || rowLocation.is_active === false) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `Érvénytelen vagy inaktív célhely: ${rowLocationInput || "-"}` });
        }
        const key = String(rowLocation.id);
        const current = preparedStockByLocation.get(key) || { location: rowLocation, qty: 0 };
        current.qty += rowQty;
        preparedStockByLocation.set(key, current);
      }

      if (!preparedStockByLocation.size) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Nincs pozitív készletmennyiség egyik célhelyhez sem." });
      }

      let supplier = null;
      if (supplierInput) {
        supplier = await findByIdOrCode(client, "aif_suppliers", supplierInput);
        if (!supplier || supplier.is_active === false) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "A kiválasztott beszállító inaktív vagy nem létezik." });
        }
      }

      const manualRaw = body.raw && typeof body.raw === "object" ? body.raw : body;
      const rawProductCode = rawValueByHeaders(manualRaw, ["CODPRODUS", "COD PRODUS", "COD_PRODUS", "Cod produs", "PRODUCT CODE", "TERMÉKKÓD", "TERMEKKOD"]);
      const rawTitle = rawValueByHeaders(manualRaw, ["ARTICOL", "ARTICLE", "DENUMIRE", "DENUMIRE PRODUS", "DENUMIRE_PRODUS", "NUME PRODUS", "PRODUCT NAME", "PRODUCT", "ITEM", "ITEM NAME", "NÉV", "NEV", "TERMÉKNÉV", "TERMEKNEV"]);
      const rawBrand = rawValueByHeaders(manualRaw, ["BRAND", "MARCA", "MARCĂ", "MÁRKA", "MARKA", "BRAND NAME"]);
      const rawProductType = rawValueByHeaders(manualRaw, ["RODESCR", "RO DESCR", "RO_DESCR", "TIP PRODUS", "PRODUCT TYPE", "TIP", "TYPE"]);
      const rawCategory = rawValueByHeaders(manualRaw, ["CATEGORIE", "CATEGORY", "CATEGORIA", "CATEGORIE PRODUS", "PRODUCT CATEGORY"]);
      const rawSubcategory = rawValueByHeaders(manualRaw, ["SUBCATEGORIE", "SUB CATEGORY", "SUBCATEGORY", "ALKATEGORIA", "ALKATEGÓRIA", "ALCATEGORIE", "ALCATEGORIA"]);
      const rawDescription = rawValueByHeaders(manualRaw, ["DESCRIERE", "DESCRIERE PRODUS", "DESCRIERE LUNGA", "DESCRIERE LUNGĂ", "LONG DESCRIPTION", "DESCRIPTION", "PRODUCT DESCRIPTION", "LEIRAS", "LEÍRÁS", "TERMÉK LEÍRÁS", "TERMEK LEIRAS"]);
      const rawMaterial = rawValueByHeaders(manualRaw, ["COMPOZITIE", "COMPOZIȚIE", "COMPOSITION", "MATERIAL", "MATERIAL COMPOSITION", "FABRIC", "TERMÉK ÖSSZETÉTELE", "TERMEK OSSZETETELE"]);
      const rawSeason = rawValueByHeaders(manualRaw, ["COLECTIE", "COLECȚIE", "COLLECTION", "SEZON", "SEASON"]);
      const rawImageUrl = rawValueByHeaders(manualRaw, ["IMAGE", "IMAGE URL", "KÉP", "KEP", "KÉP URL", "KEP URL", "IMG", "PHOTO", "PHOTO URL", "FOTO", "FOTÓ", "FOTO URL", "POZA", "POZĂ", "POZA URL", "URL FOTO", "LINK FOTO", "IMAGINE", "IMAGINE URL", "PICTURE", "PICTURE URL"]);
      const rawBarcode = rawValueByHeaders(manualRaw, ["BARCODE", "BAR CODE", "BARKOD", "BÁRKÓD", "COD BARE", "COD DE BARE", "EAN", "EAN13", "GTIN", "UPC", "VONALKOD", "VONALKÓD", "SKU"]);
      const rawBuyPrice = rawValueByHeaders(manualRaw, ["PRET DE ACHIZITIE", "PREȚ DE ACHIZIȚIE", "PRET ACHIZITIE", "PRET ACHIZIȚIE", "PURCHASE PRICE", "BUY PRICE", "VETELAR", "VÉTELÁR"]);
      const rawSellPrice = rawValueByHeaders(manualRaw, ["PRET DE VINZARE", "PRET DE VANZARE", "PREȚ DE VÂNZARE", "PRET VANZARE", "PRET VINZARE", "SELL PRICE", "SALE PRICE", "ELADASI AR", "ELADÁSI ÁR"]);

      const normalized = {
        brandId: emptyToNull(src.brandId || src.brand_id),
        brandCode: emptyToNull(src.brandCode || src.brand_code || src.brand),
        brandName: emptyToNull(src.brandName || src.brand_name || src.brand || rawBrand),
        categoryId: emptyToNull(src.categoryId || src.category_id),
        categoryCode: emptyToNull(src.categoryCode || src.category_code || src.category || src.parentCategoryCode || src.parent_category_code || rawCategory),
        categoryName: emptyToNull(src.categoryName || src.category_name || src.category || src.parentCategoryName || src.parent_category_name || rawCategory),
        parentCategoryCode: emptyToNull(src.parentCategoryCode || src.parent_category_code || src.categoryCode || src.category_code || rawCategory),
        parentCategoryName: emptyToNull(src.parentCategoryName || src.parent_category_name || src.categoryName || src.category_name || rawCategory),
        subcategoryId: emptyToNull(src.subcategoryId || src.subcategory_id || src.subCategoryId || src.sub_category_id),
        subcategoryCode: rawSubcategory || src.subcategoryCode || src.subcategory_code || src.subCategoryCode || src.sub_category_code ? normCode(src.subcategoryCode || src.subcategory_code || src.subCategoryCode || src.sub_category_code || rawSubcategory) : null,
        subcategoryName: emptyToNull(src.subcategoryName || src.subcategory_name || src.subCategoryName || src.sub_category_name || rawSubcategory),
        modelCode: emptyToNull(src.modelCode || src.model_code || src.supplierProductCode || src.supplier_product_code || src.productCode || src.product_code || rawProductCode || src.barcode || src.titleRo || src.title_ro || src.name),
        titleRo: emptyToNull(src.titleRo || src.title_ro || src.nameRo || src.name_ro || src.productName || src.product_name || src.name || src.title || rawTitle),
        titleHu: emptyToNull(src.titleHu || src.title_hu),
        descriptionRo: emptyToNull(src.descriptionRo || src.description_ro || src.description || rawDescription || rawProductType),
        genderRaw: emptyToNull(src.gender || src.genderCode || src.gender_code),
        gender: canonicalGender(src.gender || src.genderCode || src.gender_code || "unisex"),
        productType: emptyToNull(src.productType || src.product_type || src.subCategoryName || src.sub_category_name || rawProductType),
        season: emptyToNull(src.season || src.collection || src.colectie || rawSeason),
        material: emptyToNull(src.material || src.composition || src.compositionRo || src.composition_ro || src.materialComposition || src.material_composition || rawMaterial),
        shopifyTitle: emptyToNull(src.shopifyTitle || src.shopify_title || src.titleRo || src.title_ro),
        colorCode: emptyToNull(src.colorCode || src.color_code || src.supplierColorCode || src.supplier_color_code),
        colorName: emptyToNull(src.colorName || src.color_name),
        colorHex: emptyToNull(src.colorHex || src.color_hex),
        size: emptyToNull(src.size || src.standardSize || src.standard_size || src.supplierSize || src.supplier_size),
        barcode: emptyToNull(src.barcode || src.ean || src.ean13 || src.supplierBarcode || src.supplier_barcode || rawBarcode),
        snCod: snCodFromSource(src, body.raw || body),
        sn_cod: snCodFromSource(src, body.raw || body),
        customsTariffCode: customsTariffCodeFromSource(src, body.raw || body),
        customs_tariff_code: customsTariffCodeFromSource(src, body.raw || body),
        buyPrice: toMoney(src.buyPrice ?? src.buy_price ?? rawBuyPrice),
        sellPrice: toMoney(src.sellPrice ?? src.sell_price ?? rawSellPrice),
        compareAtPrice: toMoney(src.compareAtPrice ?? src.compare_at_price),
        weightGrams: toInt(src.weightGrams ?? src.weight_grams),
        imageUrl: emptyToNull(src.imageUrl || src.image_url || src.photoUrl || src.photo_url || rawImageUrl),
        supplierProductCode: emptyToNull(src.supplierProductCode || src.supplier_product_code || src.productCode || src.product_code || src.modelCode || src.model_code || rawProductCode),
        supplierVariantCode: emptyToNull(src.supplierVariantCode || src.supplier_variant_code || src.variantCode || src.variant_code),
        supplierColorCode: emptyToNull(src.supplierColorCode || src.supplier_color_code || src.colorCode || src.color_code),
        supplierSize: emptyToNull(src.supplierSize || src.supplier_size || src.size),
        modelStatus: emptyToNull(src.modelStatus || src.model_status),
        variantStatus: emptyToNull(src.variantStatus || src.status),
        qty: requestedQty,
      };

      applyProductCodeSplit(normalized);
      const row = { rowNo: 1, raw: body.raw || body, normalized, status: "parsed", errors: [] };
      await enrichNormalizedRow(client, row);

      if (!row.normalized.titleRo) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Terméknév románul kötelező." });
      }
      if (!row.normalized.size) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Méret megadása kötelező." });
      }

      const salesTvaSettings = await readSalesTvaSettings(client);
      applySalesTvaSettingsToNormalized(row.normalized, salesTvaSettings);

      const modelId = await upsertModel(client, { supplierCode: supplier?.code || row.normalized.brandCode || "manual", normalized: row.normalized });
      const variantId = await upsertVariant(client, { modelId, normalized: row.normalized });

      const modelStatus = text(row.normalized.modelStatus || "active");
      if (["draft", "active", "archived"].includes(modelStatus)) {
        await client.query(`UPDATE aif_product_models SET status=$2, updated_at=now() WHERE id=$1`, [modelId, modelStatus]);
      }
      const variantStatus = text(row.normalized.variantStatus || "active");
      if (["active", "inactive", "archived"].includes(variantStatus)) {
        await client.query(`UPDATE aif_product_variants SET status=$2, updated_at=now() WHERE id=$1`, [variantId, variantStatus]);
      }

      if (supplier?.id) await upsertSupplierCode(client, { variantId, supplierId: supplier.id, normalized: row.normalized });

      let savedQty = 0;
      const savedStockRows = [];
      for (const stockRow of preparedStockByLocation.values()) {
        await addManualProductStock(client, {
          locationId: stockRow.location.id,
          variantId,
          qty: stockRow.qty,
          actor: actorFrom(req),
          raw: {
            manual: true,
            supplierId: supplier?.id || null,
            supplierName: supplier?.name || null,
            source: "warehouse_manual_product",
            locationCode: stockRow.location.code,
            locationName: stockRow.location.name,
            normalized: row.normalized,
          },
        });
        savedQty += stockRow.qty;
        savedStockRows.push({ locationId: stockRow.location.id, locationCode: stockRow.location.code, locationName: stockRow.location.name, qty: stockRow.qty });
      }

      await client.query("COMMIT");
      res.json({ ok: true, variantId, modelId, qty: savedQty, stockRows: savedStockRows });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF manual product add failed", e);
      if (e?.code === "23505") return res.status(400).json({ error: "A termék mentése ütközött meglévő vonalkóddal vagy kóddal." });
      res.status(500).json({ error: e?.message || "Az új termék mentése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });


  router.get("/variants/:id/history", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit || 500)));
    if (!id) return res.status(400).json({ error: "variant id required" });

    try {
      await ensureSnCodSchema(pool);
      const variant = await pool.query(
        `SELECT
           v.id, v.model_id, v.internal_sku, v.barcode, v.sn_cod, v.color_code, v.color_name, v.color_hex,
           v.size, v.buy_price, v.sell_price, v.compare_at_price, v.weight_grams, v.image_url,
           v.images, v.attributes,
           ${customsTariffSql('v')} AS customs_tariff_code,
           ${customsTariffSql('v')} AS "customsTariffCode",
           v.status, v.created_at, v.updated_at,
           m.model_code, m.title_ro, m.title_hu, m.description_ro, m.gender, m.product_type,
           m.season, m.material, m.shopify_title, m.shopify_handle, m.status AS model_status,
           b.id AS brand_id, b.name AS brand_name, b.code AS brand_code,
           c.id AS category_id, c.name_ro AS category_name_ro, c.name_hu AS category_name_hu, c.code AS category_code,
           subc.id AS subcategory_id, subc.name_ro AS subcategory_name_ro, subc.name_hu AS subcategory_name_hu, subc.code AS subcategory_code,
           sc.supplier_id AS supplier_id,
           sc.supplier_product_code AS supplier_product_code,
           sc.supplier_product_code AS "supplierProductCode",
           sc.supplier_variant_code AS supplier_variant_code,
           sc.supplier_variant_code AS "supplierVariantCode",
           sc.supplier_color_code AS supplier_color_code,
           sc.supplier_color_code AS "supplierColorCode",
           sc.supplier_size AS supplier_size,
           sc.supplier_size AS "supplierSize",
           sc.supplier_barcode AS supplier_barcode,
           sc.supplier_sku AS supplier_sku,
           sup.name AS supplier_name
         FROM aif_product_variants v
         JOIN aif_product_models m ON m.id = v.model_id
         LEFT JOIN aif_brands b ON b.id = m.brand_id
         LEFT JOIN aif_categories c ON c.id = m.category_id
         LEFT JOIN aif_categories subc ON subc.id = m.subcategory_id
         LEFT JOIN LATERAL (
           SELECT sc.supplier_id, sc.supplier_product_code, sc.supplier_variant_code,
                  sc.supplier_color_code, sc.supplier_size, sc.supplier_barcode, sc.supplier_sku
           FROM aif_variant_supplier_codes sc
           WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
           ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
           LIMIT 1
         ) sc ON true
         LEFT JOIN aif_suppliers sup ON sup.id=sc.supplier_id
         WHERE v.id::text=$1 OR v.internal_sku=$1 OR v.barcode=$1 OR sc.supplier_barcode=$1 OR sc.supplier_sku=$1 OR sc.supplier_product_code=$1
         LIMIT 1`,
        [id]
      );

      if (!variant.rowCount) return res.status(404).json({ error: "variant not found" });

      const variantId = variant.rows[0].id;
      const stock = await pool.query(
        `SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name,
                l.location_type, s.qty, s.reserved_qty, (s.qty - s.reserved_qty) AS available_qty, s.updated_at
         FROM aif_stock s
         JOIN aif_locations l ON l.id=s.location_id
         WHERE s.variant_id=$1
         ORDER BY l.name ASC`,
        [variantId]
      );

      const movementTotals = await pool.query(
        `SELECT
           COALESCE(sum(CASE WHEN sm.qty_delta > 0 AND NOT (sm.source_type='stock_transfer' OR sm.raw->>'reason'='stock_transfer') THEN sm.qty_delta ELSE 0 END),0)::numeric AS total_incoming_qty,
           COALESCE(sum(CASE WHEN sm.qty_delta < 0 AND NOT (sm.source_type='stock_transfer' OR sm.raw->>'reason'='stock_transfer') THEN abs(sm.qty_delta) ELSE 0 END),0)::numeric AS total_outgoing_qty,
           COALESCE(sum(CASE WHEN (sm.source_type='stock_transfer' OR sm.raw->>'reason'='stock_transfer') AND sm.qty_delta < 0 THEN abs(sm.qty_delta) ELSE 0 END),0)::numeric AS total_transferred_qty,
           COALESCE(sum(sm.qty_delta),0)::numeric AS net_movement_qty,
           count(*)::int AS movement_count
         FROM aif_stock_movements sm
         WHERE sm.variant_id=$1`,
        [variantId]
      );

      const importStats = await pool.query(
        `WITH committed_rows AS (
           SELECT rw.*, COALESCE(b.committed_at, b.updated_at, b.created_at, rw.updated_at) AS event_at
           FROM aif_import_rows rw
           JOIN aif_import_batches b ON b.id=rw.batch_id
           WHERE rw.variant_id=$1
             AND rw.status='committed'
         )
         SELECT
           COALESCE(sum(COALESCE(qty,0)),0)::numeric AS total_purchased_qty,
           CASE WHEN COALESCE(sum(COALESCE(qty,0)),0) > 0
             THEN round(sum(COALESCE(buy_price_ron, buy_price, 0) * COALESCE(qty,0)) / NULLIF(sum(COALESCE(qty,0)),0), 2)
             ELSE NULL
           END AS avg_buy_price,
           (array_agg(COALESCE(buy_price_ron, buy_price) ORDER BY event_at DESC NULLS LAST, row_no DESC NULLS LAST) FILTER (WHERE COALESCE(buy_price_ron, buy_price) IS NOT NULL))[1] AS last_buy_price,
           (array_agg(COALESCE(sell_price_ron, sell_price) ORDER BY event_at DESC NULLS LAST, row_no DESC NULLS LAST) FILTER (WHERE COALESCE(sell_price_ron, sell_price) IS NOT NULL))[1] AS last_sell_price,
           max(event_at) AS last_incoming_at
         FROM committed_rows`,
        [variantId]
      );

      const priceStats = await pool.query(
        `SELECT
           (array_agg(NULLIF(sm.raw->>'buyPriceAfter','')::numeric ORDER BY sm.created_at DESC, sm.id DESC)
             FILTER (WHERE NULLIF(sm.raw->>'buyPriceAfter','') IS NOT NULL))[1] AS last_buy_price,
           (array_agg(NULLIF(sm.raw->>'sellPriceAfter','')::numeric ORDER BY sm.created_at DESC, sm.id DESC)
             FILTER (WHERE NULLIF(sm.raw->>'sellPriceAfter','') IS NOT NULL))[1] AS last_sell_price,
           max(sm.created_at) AS last_price_change_at
         FROM aif_stock_movements sm
         WHERE sm.variant_id=$1
           AND (sm.source_type='price_change' OR sm.raw->>'reason'='price_change')`,
        [variantId]
      );

      const events = await pool.query(
        `SELECT sm.id, sm.created_at, sm.movement_type, sm.source_type, sm.source_id,
                sm.qty_delta, sm.qty_before, sm.qty_after, sm.actor, sm.raw,
                CASE
                  WHEN sm.source_type='price_change' OR sm.raw->>'reason'='price_change' THEN 'price_change'
                  WHEN sm.source_type='stock_transfer' OR sm.raw->>'reason'='stock_transfer' THEN 'transfer'
                  WHEN sm.source_type='inventory_count' OR sm.raw->>'reason'='inventory_count_commit' THEN 'inventory'
                  WHEN sm.source_type='import_batch' OR sm.raw->>'reason'='import_batch_commit' THEN 'incoming'
                  WHEN sm.source_type ILIKE '%manual%' OR sm.movement_type IN ('manual_adjustment','adjustment') THEN 'adjustment'
                  WHEN sm.qty_delta > 0 THEN 'incoming'
                  WHEN sm.qty_delta < 0 THEN 'outgoing'
                  ELSE 'adjustment'
                END AS event_type,
                CASE WHEN sm.qty_delta > 0 THEN 'in' WHEN sm.qty_delta < 0 THEN 'out' ELSE 'adjust' END AS direction,
                l.id AS location_id, l.code AS location_code, l.name AS location_name,
                sm.raw->>'fromLocationId' AS from_location_id,
                sm.raw->>'fromLocationCode' AS from_location_code,
                sm.raw->>'fromLocationName' AS from_location_name,
                sm.raw->>'toLocationId' AS to_location_id,
                sm.raw->>'toLocationCode' AS to_location_code,
                sm.raw->>'toLocationName' AS to_location_name,
                im.import_row_id, im.import_row_no, im.import_qty, im.buy_price, im.buy_price_ron,
                im.sell_price, im.sell_price_ron, im.import_batch_id, im.source_file_name,
                im.invoice_number, im.invoice_date, im.reception_date, im.currency_code,
                im.supplier_id, im.supplier_name, im.reception_id,
                im.sales_tva_rate, im.sell_price_includes_tva,
                CASE WHEN sm.source_type='price_change' OR sm.raw->>'reason'='price_change' THEN NULLIF(sm.raw->>'buyPriceBefore','')::numeric ELSE NULL END AS old_buy_price,
                CASE WHEN sm.source_type='price_change' OR sm.raw->>'reason'='price_change' THEN NULLIF(sm.raw->>'buyPriceAfter','')::numeric ELSE NULL END AS new_buy_price,
                CASE WHEN sm.source_type='price_change' OR sm.raw->>'reason'='price_change' THEN NULLIF(sm.raw->>'sellPriceBefore','')::numeric ELSE NULL END AS old_sell_price,
                CASE WHEN sm.source_type='price_change' OR sm.raw->>'reason'='price_change' THEN NULLIF(sm.raw->>'sellPriceAfter','')::numeric ELSE NULL END AS new_sell_price,
                CASE WHEN sm.source_type='price_change' OR sm.raw->>'reason'='price_change' THEN NULLIF(sm.raw->>'compareAtPriceBefore','')::numeric ELSE NULL END AS old_compare_at_price,
                CASE WHEN sm.source_type='price_change' OR sm.raw->>'reason'='price_change' THEN NULLIF(sm.raw->>'compareAtPriceAfter','')::numeric ELSE NULL END AS new_compare_at_price,
                CASE WHEN sm.source_type='price_change' OR sm.raw->>'reason'='price_change' THEN sm.raw->'changedFields' ELSE NULL END AS price_change_fields,
                CASE WHEN sm.source_type='price_change' OR sm.raw->>'reason'='price_change'
                  THEN COALESCE(NULLIF(sm.raw->>'buyPriceAfter','')::numeric, v.buy_price)
                  ELSE COALESCE(im.buy_price_ron, im.buy_price, v.buy_price)
                END AS effective_buy_price,
                CASE WHEN sm.source_type='price_change' OR sm.raw->>'reason'='price_change'
                  THEN COALESCE(NULLIF(sm.raw->>'sellPriceAfter','')::numeric, v.sell_price)
                  ELSE COALESCE(im.sell_price_ron, im.sell_price, v.sell_price)
                END AS effective_sell_price
         FROM aif_stock_movements sm
         JOIN aif_locations l ON l.id=sm.location_id
         JOIN aif_product_variants v ON v.id=sm.variant_id
         LEFT JOIN LATERAL (
           SELECT rw.id AS import_row_id, rw.row_no AS import_row_no,
                  rw.qty AS import_qty, rw.buy_price, rw.buy_price_ron, rw.sell_price, rw.sell_price_ron,
                  b.id AS import_batch_id, b.source_file_name,
                  COALESCE(r.invoice_number, b.invoice_number) AS invoice_number,
                  r.invoice_date, r.reception_date,
                  COALESCE(r.currency_code, b.currency_code) AS currency_code,
                  sup.id AS supplier_id, sup.name AS supplier_name,
                  r.id AS reception_id,
                  COALESCE(NULLIF(rw.normalized->>'salesTvaRate','')::numeric, NULLIF(rw.normalized->>'saleTvaRate','')::numeric, NULLIF(r.raw_meta->>'salesTvaRate','')::numeric, r.tva_rate) AS sales_tva_rate,
                  COALESCE(NULLIF(rw.normalized->>'sellPriceIncludesTva','')::boolean, NULLIF(rw.normalized->>'salesPriceIncludesTva','')::boolean, true) AS sell_price_includes_tva
           FROM aif_import_rows rw
           JOIN aif_import_batches b ON b.id=rw.batch_id
           LEFT JOIN aif_receptions r ON r.id=b.reception_id
           LEFT JOIN aif_suppliers sup ON sup.id=COALESCE(r.supplier_id, b.supplier_id)
           WHERE rw.variant_id=sm.variant_id
             AND (
               rw.id::text = COALESCE(sm.raw->>'rowId','')
               OR b.id::text = sm.source_id
               OR b.id::text = COALESCE(sm.raw->>'importBatchId','')
             )
           ORDER BY
             CASE WHEN rw.id::text = COALESCE(sm.raw->>'rowId','') THEN 0 ELSE 1 END,
             COALESCE(b.committed_at, b.updated_at, b.created_at, rw.updated_at) DESC NULLS LAST,
             rw.row_no DESC NULLS LAST
           LIMIT 1
         ) im ON true
         WHERE sm.variant_id=$1
         ORDER BY sm.created_at DESC, sm.id DESC
         LIMIT $2`,
        [variantId, limit]
      );

      const stockRows = stock.rows || [];
      const movement = movementTotals.rows[0] || {};
      const imports = importStats.rows[0] || {};
      const priceHistory = priceStats.rows[0] || {};
      const currentQty = stockRows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
      const reservedQty = stockRows.reduce((sum, row) => sum + Number(row.reserved_qty || 0), 0);
      const availableQty = stockRows.reduce((sum, row) => sum + Number(row.available_qty || 0), 0);
      const lastBuyPrice = priceHistory.last_buy_price ?? variant.rows[0].buy_price ?? imports.last_buy_price ?? null;
      const lastSellPrice = priceHistory.last_sell_price ?? variant.rows[0].sell_price ?? imports.last_sell_price ?? null;
      const sellNet = lastSellPrice === null || lastSellPrice === undefined ? null : Number(lastSellPrice) / 1.21;
      const marginWithoutTva = lastBuyPrice && Number(lastBuyPrice) > 0 && sellNet !== null
        ? ((sellNet - Number(lastBuyPrice)) / Number(lastBuyPrice)) * 100
        : null;

      const priceKeyValue = (value) => {
        if (value === null || value === undefined || String(value).trim() === "") return "";
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed.toFixed(2) : text(value);
      };
      const historyEvents = [];
      const seenHistoryEvents = new Set();
      for (const row of events.rows || []) {
        const raw = row.raw && typeof row.raw === "object" ? row.raw : {};
        const isPrice = row.event_type === "price_change" || row.source_type === "price_change" || raw.reason === "price_change";
        const key = isPrice
          ? [
              "price",
              row.created_at ? Math.floor(new Date(row.created_at).getTime() / 60000) : "",
              JSON.stringify(row.price_change_fields || raw.changedFields || []),
              priceKeyValue(row.old_buy_price ?? raw.buyPriceBefore),
              priceKeyValue(row.new_buy_price ?? raw.buyPriceAfter),
              priceKeyValue(row.old_sell_price ?? raw.sellPriceBefore),
              priceKeyValue(row.new_sell_price ?? raw.sellPriceAfter),
              priceKeyValue(row.old_compare_at_price ?? raw.compareAtPriceBefore),
              priceKeyValue(row.new_compare_at_price ?? raw.compareAtPriceAfter),
            ].join("|")
          : `event:${row.id}`;
        if (seenHistoryEvents.has(key)) continue;
        seenHistoryEvents.add(key);
        historyEvents.push(row);
      }

      res.json({
        item: variant.rows[0],
        stock: stockRows,
        summary: {
          currentQty,
          reservedQty,
          availableQty,
          stockLocationCount: stockRows.filter((row) => Number(row.qty || 0) > 0).length,
          totalIncomingQty: Number(movement.total_incoming_qty || 0),
          totalOutgoingQty: Number(movement.total_outgoing_qty || 0),
          totalTransferredQty: Number(movement.total_transferred_qty || 0),
          netMovementQty: Number(movement.net_movement_qty || 0),
          movementCount: Number(movement.movement_count || 0),
          totalPurchasedQty: Number(imports.total_purchased_qty || 0),
          avgBuyPrice: imports.avg_buy_price ?? null,
          lastBuyPrice,
          lastSellPrice,
          lastIncomingAt: imports.last_incoming_at || null,
          marginWithoutTva,
        },
        events: historyEvents,
      });
    } catch (e) {
      console.error("AIF variant history failed", e);
      res.status(500).json({ error: e?.message || "A terméktörténet betöltése nem sikerült.", code: e?.code || null });
    }
  });


  function assignedBarcodeValue(value) {
    return text(value)
      .replace(/[\r\n\t]+/g, "")
      .slice(0, 64);
  }

  async function findVariantBarcodeConflict(client, barcode, excludeVariantId = null) {
    const candidate = assignedBarcodeValue(barcode);
    if (!candidate) return null;
    const r = await client.query(
      `SELECT
         v.id, v.barcode, v.internal_sku, v.size, v.color_code, v.color_name,
         m.title_ro, m.shopify_title, m.model_code,
         b.name AS brand_name, b.code AS brand_code
       FROM aif_product_variants v
       JOIN aif_product_models m ON m.id=v.model_id
       LEFT JOIN aif_brands b ON b.id=m.brand_id
       WHERE lower(btrim(COALESCE(v.barcode,'')))=lower(btrim($1))
         AND ($2::text='' OR v.id::text<>$2)
       LIMIT 1`,
      [candidate, excludeVariantId ? String(excludeVariantId) : ""]
    );
    return r.rows[0] || null;
  }

  function barcodeConflictResponse(res, barcode, conflict = null) {
    const itemName = text(conflict?.title_ro || conflict?.shopify_title || conflict?.model_code || conflict?.internal_sku);
    const variantText = [
      itemName,
      text(conflict?.brand_name),
      text(conflict?.color_name || conflict?.color_code),
      text(conflict?.size),
    ].filter(Boolean).join(" • ");
    return res.status(409).json({
      error: `Bárkód ütközés: a(z) ${assignedBarcodeValue(barcode)} kód már egy másik termékhez tartozik${variantText ? ` (${variantText})` : ""}. Minden variánsnak egyedi bárkód kell.`,
      code: "barcode_conflict",
      barcode: assignedBarcodeValue(barcode),
      conflict: conflict ? {
        variantId: conflict.id,
        barcode: conflict.barcode,
        internalSku: conflict.internal_sku,
        title: conflict.title_ro || conflict.shopify_title || null,
        modelCode: conflict.model_code || null,
        brand: conflict.brand_name || conflict.brand_code || null,
        color: conflict.color_name || conflict.color_code || null,
        size: conflict.size || null,
      } : null,
    });
  }

  async function handleVariantBarcodeAssignment(req, res) {
    const id = text(req.params.id);
    const requestedBarcode = assignedBarcodeValue(req.body?.barcode ?? req.body?.code ?? req.body?.value);
    if (!id) return res.status(400).json({ error: "variant id required", code: "variant_id_required" });
    if (!requestedBarcode) return res.status(400).json({ error: "A mentéshez adj meg bárkódot.", code: "barcode_required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT v.id, v.barcode, v.internal_sku, v.attributes,
                m.title_ro, m.shopify_title, m.model_code,
                b.name AS brand_name, b.code AS brand_code,
                v.color_name, v.color_code, v.size
         FROM aif_product_variants v
         JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN aif_brands b ON b.id=m.brand_id
         WHERE v.id::text=$1 OR v.internal_sku=$1 OR v.barcode=$1
         FOR UPDATE OF v`,
        [id]
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "A termékvariáns nem található.", code: "variant_not_found" });
      }

      const item = current.rows[0];
      const previousBarcode = assignedBarcodeValue(item.barcode);
      if (previousBarcode && previousBarcode.toLowerCase() === requestedBarcode.toLowerCase()) {
        await client.query("COMMIT");
        return res.json({
          ok: true,
          unchanged: true,
          variantId: item.id,
          barcode: previousBarcode,
          previousBarcode,
          item: {
            id: item.id,
            title: item.title_ro || item.shopify_title || null,
            brand: item.brand_name || item.brand_code || null,
            color: item.color_name || item.color_code || null,
            size: item.size || null,
          },
        });
      }

      const conflict = await findVariantBarcodeConflict(client, requestedBarcode, item.id);
      if (conflict) {
        await client.query("ROLLBACK");
        return barcodeConflictResponse(res, requestedBarcode, conflict);
      }

      const actor = actorFrom(req);
      const source = text(req.body?.source || "barcode_center") || "barcode_center";
      const updated = await client.query(
        `UPDATE aif_product_variants
         SET barcode=$2,
             attributes=COALESCE(attributes,'{}'::jsonb) || jsonb_build_object(
               'barcodeAssignedAt', now()::text,
               'barcodeAssignedBy', $3::text,
               'barcodeSource', $4::text
             ),
             updated_at=now()
         WHERE id=$1
         RETURNING id, barcode, internal_sku, updated_at`,
        [item.id, requestedBarcode, actor, source]
      );

      await client.query("COMMIT");
      return res.json({
        ok: true,
        unchanged: false,
        variantId: item.id,
        barcode: updated.rows[0]?.barcode || requestedBarcode,
        previousBarcode: previousBarcode || null,
        updatedAt: updated.rows[0]?.updated_at || null,
        item: {
          id: item.id,
          title: item.title_ro || item.shopify_title || null,
          brand: item.brand_name || item.brand_code || null,
          color: item.color_name || item.color_code || null,
          size: item.size || null,
        },
      });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      if (e?.code === "23505") {
        const conflict = await findVariantBarcodeConflict(pool, requestedBarcode, null).catch(() => null);
        return barcodeConflictResponse(res, requestedBarcode, conflict);
      }
      console.error("AIF assign variant barcode failed", e);
      return res.status(500).json({ error: "A bárkód mentése nem sikerült.", code: e?.code || "barcode_save_failed" });
    } finally {
      client.release();
    }
  }

  router.put("/variants/:id/barcode", requireAdminOrSecret, handleVariantBarcodeAssignment);
  router.patch("/variants/:id/barcode", requireAdminOrSecret, handleVariantBarcodeAssignment);

  router.get("/variants/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: "variant id required" });

    try {
      await ensureSnCodSchema(pool);
      const variant = await pool.query(
        `SELECT
           v.id, v.model_id, v.internal_sku, v.barcode, v.sn_cod, v.color_code, v.color_name, v.color_hex,
           v.size, v.buy_price, v.sell_price, v.compare_at_price, v.weight_grams, v.image_url,
           v.images, v.attributes,
           ${customsTariffSql('v')} AS customs_tariff_code,
           ${customsTariffSql('v')} AS "customsTariffCode",
           v.status, v.created_at, v.updated_at,
           m.model_code, m.title_ro, m.title_hu, m.description_ro, m.gender, m.product_type,
           m.season, m.material, m.shopify_title, m.shopify_handle, m.status AS model_status,
           b.id AS brand_id, b.name AS brand_name, b.code AS brand_code,
           c.id AS category_id, c.name_ro AS category_name_ro, c.name_hu AS category_name_hu, c.code AS category_code,
           subc.id AS subcategory_id, subc.name_ro AS subcategory_name_ro, subc.name_hu AS subcategory_name_hu, subc.code AS subcategory_code,
           sc.supplier_id AS supplier_id,
           sc.supplier_product_code AS supplier_product_code,
           sc.supplier_product_code AS "supplierProductCode",
           sc.supplier_variant_code AS supplier_variant_code,
           sc.supplier_variant_code AS "supplierVariantCode",
           sc.supplier_color_code AS supplier_color_code,
           sc.supplier_color_code AS "supplierColorCode",
           sc.supplier_size AS supplier_size,
           sc.supplier_size AS "supplierSize",
           sc.supplier_barcode AS supplier_barcode,
           sc.supplier_sku AS supplier_sku
         FROM aif_product_variants v
         JOIN aif_product_models m ON m.id = v.model_id
         LEFT JOIN aif_brands b ON b.id = m.brand_id
         LEFT JOIN aif_categories c ON c.id = m.category_id
         LEFT JOIN aif_categories subc ON subc.id = m.subcategory_id
         LEFT JOIN LATERAL (
           SELECT sc.supplier_id, sc.supplier_product_code, sc.supplier_variant_code,
                  sc.supplier_color_code, sc.supplier_size, sc.supplier_barcode, sc.supplier_sku
           FROM aif_variant_supplier_codes sc
           WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
           ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
           LIMIT 1
         ) sc ON true
         WHERE v.id::text=$1 OR v.internal_sku=$1 OR v.barcode=$1
         LIMIT 1`,
        [id]
      );

      if (!variant.rowCount) return res.status(404).json({ error: "variant not found" });

      const variantId = variant.rows[0].id;
      const stock = await pool.query(
        `SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name,
                l.location_type, s.qty, s.reserved_qty, (s.qty - s.reserved_qty) AS available_qty, s.updated_at
         FROM aif_stock s
         JOIN aif_locations l ON l.id=s.location_id
         WHERE s.variant_id=$1
         ORDER BY l.name ASC`,
        [variantId]
      );

      const supplierCodes = await pool.query(
        `SELECT sc.id, sc.supplier_product_code, sc.supplier_variant_code,
                sc.supplier_color_code, sc.supplier_color_name, sc.supplier_size,
                sc.supplier_barcode, sc.supplier_sku, sc.is_active,
                s.name AS supplier_name
         FROM aif_variant_supplier_codes sc
         JOIN aif_suppliers s ON s.id=sc.supplier_id
         WHERE sc.variant_id=$1
         ORDER BY sc.is_active DESC, s.name ASC`,
        [variantId]
      );

      const movements = await pool.query(
        `SELECT sm.id, sm.created_at, sm.movement_type, sm.source_type, sm.source_id,
                sm.qty_delta, sm.qty_before, sm.qty_after, sm.actor,
                l.name AS location_name
         FROM aif_stock_movements sm
         LEFT JOIN aif_locations l ON l.id=sm.location_id
         WHERE sm.variant_id=$1
         ORDER BY sm.created_at DESC
         LIMIT 25`,
        [variantId]
      );

      const primarySupplierCode = supplierCodes.rows.find((row) => row.is_active !== false) || supplierCodes.rows[0] || null;
      const item = {
        ...variant.rows[0],
        supplier_product_code: primarySupplierCode?.supplier_product_code || null,
        supplierProductCode: primarySupplierCode?.supplier_product_code || null,
        product_code: primarySupplierCode?.supplier_product_code || null,
        productCode: primarySupplierCode?.supplier_product_code || null,
        supplier_variant_code: primarySupplierCode?.supplier_variant_code || null,
        supplierVariantCode: primarySupplierCode?.supplier_variant_code || null,
        supplier_color_code: primarySupplierCode?.supplier_color_code || null,
        supplierColorCode: primarySupplierCode?.supplier_color_code || null,
        supplier_size: primarySupplierCode?.supplier_size || null,
        supplierSize: primarySupplierCode?.supplier_size || null,
        supplier_barcode: primarySupplierCode?.supplier_barcode || null,
        supplierBarcode: primarySupplierCode?.supplier_barcode || null,
      };

      res.json({
        item,
        stock: stock.rows,
        supplierCodes: supplierCodes.rows,
        movements: movements.rows,
      });
    } catch (e) {
      console.error("AIF variant detail failed", e);
      res.status(500).json({ error: "failed to load variant" });
    }
  });

  router.patch("/variants/:id", requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    const body = req.body || {};
    if (!id) return res.status(400).json({ error: "variant id required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSnCodSchema(client);
      const current = await client.query(
        `SELECT v.id, v.model_id, v.barcode, v.buy_price, v.sell_price, v.compare_at_price
         FROM aif_product_variants v
         WHERE v.id::text=$1 OR v.internal_sku=$1 OR v.barcode=$1
         FOR UPDATE`,
        [id]
      );

      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "variant not found" });
      }

      const variantId = current.rows[0].id;
      const modelId = current.rows[0].model_id;
      const previousBuyPrice = current.rows[0].buy_price;
      const previousSellPrice = current.rows[0].sell_price;
      const previousCompareAtPrice = current.rows[0].compare_at_price;
      const buyPriceProvided = body.buyPrice !== undefined || body.buy_price !== undefined;
      const sellPriceProvided = body.sellPrice !== undefined || body.sell_price !== undefined;
      const compareAtPriceProvided = body.compareAtPrice !== undefined || body.compare_at_price !== undefined;
      const nextBuyPrice = buyPriceProvided ? toMoney(body.buyPrice ?? body.buy_price) : previousBuyPrice;
      const nextSellPrice = sellPriceProvided ? toMoney(body.sellPrice ?? body.sell_price) : previousSellPrice;
      const nextCompareAtPrice = compareAtPriceProvided ? toMoney(body.compareAtPrice ?? body.compare_at_price) : previousCompareAtPrice;
      const moneyChanged = (before, after) => {
        const b = before === null || before === undefined || String(before).trim() === "" ? null : Number(before);
        const a = after === null || after === undefined || String(after).trim() === "" ? null : Number(after);
        if (b === null && a === null) return false;
        if (b === null || a === null) return true;
        if (!Number.isFinite(b) || !Number.isFinite(a)) return String(before ?? "") !== String(after ?? "");
        return Math.round(b * 100) !== Math.round(a * 100);
      };
      const changedPriceFields = [];
      if (buyPriceProvided && moneyChanged(previousBuyPrice, nextBuyPrice)) changedPriceFields.push("buy_price");
      if (sellPriceProvided && moneyChanged(previousSellPrice, nextSellPrice)) changedPriceFields.push("sell_price");
      if (compareAtPriceProvided && moneyChanged(previousCompareAtPrice, nextCompareAtPrice)) changedPriceFields.push("compare_at_price");

      const variantSets = [];
      const variantArgs = [];
      let vi = 1;
      const addVariant = (column, value) => {
        if (value === undefined) return;
        variantSets.push(`${column}=$${vi++}`);
        variantArgs.push(value);
      };
      const variantAttributePatch = body.attributes && typeof body.attributes === "object" && !Array.isArray(body.attributes)
        ? { ...body.attributes }
        : {};
      const tariffProvided = body.customsTariffCode !== undefined || body.customs_tariff_code !== undefined || body.tariffCode !== undefined || body.tariff_code !== undefined || body.hsCode !== undefined || body.hs_code !== undefined || body.taricCode !== undefined || body.taric_code !== undefined;
      if (tariffProvided) {
        const tariff = emptyToNull(body.customsTariffCode ?? body.customs_tariff_code ?? body.tariffCode ?? body.tariff_code ?? body.hsCode ?? body.hs_code ?? body.taricCode ?? body.taric_code);
        variantAttributePatch.customsTariffCode = tariff;
        variantAttributePatch.customs_tariff_code = tariff;
        variantAttributePatch.tariffCode = tariff;
        variantAttributePatch.tariff_code = tariff;
        variantAttributePatch.hsCode = tariff;
        variantAttributePatch.hs_code = tariff;
      }

      if (body.barcode !== undefined) {
        const nextBarcode = assignedBarcodeValue(body.barcode);
        if (nextBarcode) {
          const conflict = await findVariantBarcodeConflict(client, nextBarcode, variantId);
          if (conflict) {
            await client.query("ROLLBACK");
            return barcodeConflictResponse(res, nextBarcode, conflict);
          }
        }
        addVariant("barcode", nextBarcode || null);
      }
      if (body.snCod !== undefined || body.sn_cod !== undefined) addVariant("sn_cod", emptyToNull(body.snCod ?? body.sn_cod));
      if (body.colorCode !== undefined || body.color_code !== undefined) addVariant("color_code", emptyToNull(body.colorCode ?? body.color_code));
      if (body.colorName !== undefined || body.color_name !== undefined) {
        const normalizedColor = await normalizeColorName(client, body.colorName ?? body.color_name);
        addVariant("color_name", emptyToNull(normalizedColor));
      }
      if (body.colorHex !== undefined || body.color_hex !== undefined) addVariant("color_hex", emptyToNull(body.colorHex ?? body.color_hex));
      if (body.size !== undefined) {
        const size = text(body.size);
        if (!size) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "size required" });
        }
        addVariant("size", await normalizeSizeValue(client, size));
      }
      if (buyPriceProvided) addVariant("buy_price", nextBuyPrice);
      if (sellPriceProvided) addVariant("sell_price", nextSellPrice);
      if (compareAtPriceProvided) addVariant("compare_at_price", nextCompareAtPrice);
      if (body.weightGrams !== undefined || body.weight_grams !== undefined) addVariant("weight_grams", toInt(body.weightGrams ?? body.weight_grams));
      if (body.imageUrl !== undefined || body.image_url !== undefined) addVariant("image_url", emptyToNull(body.imageUrl ?? body.image_url));
      if (body.status !== undefined) {
        const status = text(body.status);
        if (!["active", "inactive", "archived"].includes(status)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "invalid variant status" });
        }
        addVariant("status", status);
      }

      if (variantSets.length) {
        variantArgs.push(variantId);
        await client.query(
          `UPDATE aif_product_variants
           SET ${variantSets.join(", ")}, updated_at=now()
           WHERE id=$${vi}`,
          variantArgs
        );
      }

      if (Object.keys(variantAttributePatch).length) {
        await client.query(
          `UPDATE aif_product_variants
           SET attributes=COALESCE(attributes,'{}'::jsonb) || $2::jsonb,
               updated_at=now()
           WHERE id=$1`,
          [variantId, JSON.stringify(variantAttributePatch)]
        );
      }

      const modelSets = [];
      const modelArgs = [];
      let mi = 1;
      const addModel = (column, value) => {
        if (value === undefined) return;
        modelSets.push(`${column}=$${mi++}`);
        modelArgs.push(value);
      };

      if (body.titleRo !== undefined || body.title_ro !== undefined) {
        const title = text(body.titleRo ?? body.title_ro);
        if (!title) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "product name required" });
        }
        addModel("title_ro", title);
      }
      if (body.titleHu !== undefined || body.title_hu !== undefined) addModel("title_hu", emptyToNull(body.titleHu ?? body.title_hu));
      if (body.descriptionRo !== undefined || body.description_ro !== undefined) addModel("description_ro", emptyToNull(body.descriptionRo ?? body.description_ro));
      if (body.gender !== undefined) {
        const gender = normCode(body.gender || "unisex") || "unisex";
        if (!(await activeGenderTypeExists(client, gender))) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "invalid gender" });
        }
        addModel("gender", gender);
      }
      if (body.productType !== undefined || body.product_type !== undefined) addModel("product_type", emptyToNull(body.productType ?? body.product_type));
      if (body.season !== undefined) addModel("season", emptyToNull(body.season));
      if (body.material !== undefined) addModel("material", emptyToNull(body.material));
      if (body.shopifyTitle !== undefined || body.shopify_title !== undefined) addModel("shopify_title", emptyToNull(body.shopifyTitle ?? body.shopify_title));
      if (body.modelStatus !== undefined || body.model_status !== undefined) {
        const status = text(body.modelStatus ?? body.model_status);
        if (!["draft", "active", "archived"].includes(status)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "invalid model status" });
        }
        addModel("status", status);
      }

      const categoryInput = body.categoryId ?? body.category_id ?? body.categoryCode ?? body.category_code;
      if (categoryInput !== undefined) {
        const category = emptyToNull(categoryInput);
        if (!category) {
          addModel("category_id", null);
        } else {
          const cat = await client.query(`SELECT id FROM aif_categories WHERE id::text=$1 OR code=$1 LIMIT 1`, [category]);
          if (!cat.rowCount) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "category not found" });
          }
          addModel("category_id", cat.rows[0].id);
        }
      }

      const subcategoryInput = body.subcategoryId ?? body.subcategory_id ?? body.subCategoryId ?? body.sub_category_id ?? body.subcategoryCode ?? body.subcategory_code ?? body.subCategoryCode ?? body.sub_category_code;
      if (subcategoryInput !== undefined) {
        const subcategory = emptyToNull(subcategoryInput);
        if (!subcategory) {
          addModel("subcategory_id", null);
        } else {
          const subcat = await client.query(`SELECT id FROM aif_categories WHERE id::text=$1 OR code=$1 LIMIT 1`, [subcategory]);
          if (!subcat.rowCount) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "subcategory not found" });
          }
          addModel("subcategory_id", subcat.rows[0].id);
        }
      }

      const brandInput = body.brandId ?? body.brand_id ?? body.brandCode ?? body.brand_code;
      if (brandInput !== undefined) {
        const brand = emptyToNull(brandInput);
        if (!brand) {
          addModel("brand_id", null);
        } else {
          const br = await client.query(`SELECT id FROM aif_brands WHERE id::text=$1 OR code=$1 LIMIT 1`, [brand]);
          if (!br.rowCount) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "brand not found" });
          }
          addModel("brand_id", br.rows[0].id);
        }
      }

      if (modelSets.length) {
        modelArgs.push(modelId);
        await client.query(
          `UPDATE aif_product_models
           SET ${modelSets.join(", ")}, updated_at=now()
           WHERE id=$${mi}`,
          modelArgs
        );
      }

      const supplierProductCodeProvided =
        body.supplierProductCode !== undefined || body.supplier_product_code !== undefined ||
        body.productCode !== undefined || body.product_code !== undefined;
      const supplierVariantCodeProvided = body.supplierVariantCode !== undefined || body.supplier_variant_code !== undefined;
      const supplierColorCodeProvided = body.supplierColorCode !== undefined || body.supplier_color_code !== undefined;
      const supplierSizeProvided = body.supplierSize !== undefined || body.supplier_size !== undefined;
      const supplierLinkProvided = supplierProductCodeProvided || supplierVariantCodeProvided || supplierColorCodeProvided || supplierSizeProvided;
      if (supplierLinkProvided) {
        const supplierProductCode = supplierProductCodeProvided
          ? emptyToNull(body.supplierProductCode ?? body.supplier_product_code ?? body.productCode ?? body.product_code)
          : undefined;
        const supplierVariantCode = supplierVariantCodeProvided
          ? emptyToNull(body.supplierVariantCode ?? body.supplier_variant_code)
          : undefined;
        const supplierColorCode = supplierColorCodeProvided
          ? emptyToNull(body.supplierColorCode ?? body.supplier_color_code)
          : undefined;
        const supplierSize = supplierSizeProvided
          ? emptyToNull(body.supplierSize ?? body.supplier_size)
          : undefined;

        const existingSupplierCode = await client.query(
          `SELECT id
           FROM aif_variant_supplier_codes
           WHERE variant_id=$1
           ORDER BY COALESCE(is_active,true) DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
           LIMIT 1`,
          [variantId]
        );

        if (existingSupplierCode.rowCount) {
          const sets = [`is_active=true`, `updated_at=now()`];
          const args = [existingSupplierCode.rows[0].id];
          let nextArg = 2;
          if (supplierProductCodeProvided) { sets.push(`supplier_product_code=$${nextArg++}`); args.push(supplierProductCode); }
          if (supplierVariantCodeProvided) { sets.push(`supplier_sku=$${nextArg++}`); args.push(supplierVariantCode || null); }
          if (supplierVariantCode !== undefined) { sets.push(`supplier_variant_code=$${nextArg++}`); args.push(supplierVariantCode); }
          if (supplierColorCode !== undefined) { sets.push(`supplier_color_code=$${nextArg++}`); args.push(supplierColorCode); }
          if (supplierSize !== undefined) { sets.push(`supplier_size=$${nextArg++}`); args.push(supplierSize); }
          await client.query(
            `UPDATE aif_variant_supplier_codes SET ${sets.join(', ')} WHERE id=$1`,
            args
          );
        } else if (supplierProductCode || supplierVariantCode || supplierColorCode || supplierSize) {
          const preferredSupplierId = emptyToNull(body.supplierId || body.supplier_id);
          let supplierId = preferredSupplierId;
          if (supplierId) {
            const okSupplier = await client.query(`SELECT id FROM aif_suppliers WHERE id::text=$1 OR code=$1 LIMIT 1`, [supplierId]);
            supplierId = okSupplier.rows[0]?.id || null;
          }
          if (!supplierId) {
            const fallbackSupplier = await client.query(`SELECT id FROM aif_suppliers WHERE is_active=true ORDER BY name ASC LIMIT 1`);
            supplierId = fallbackSupplier.rows[0]?.id || null;
          }
          if (supplierId) {
            await client.query(
              `INSERT INTO aif_variant_supplier_codes (
                 variant_id, supplier_id, supplier_product_code, supplier_variant_code,
                 supplier_color_code, supplier_color_name, supplier_size, supplier_barcode, supplier_sku, raw, is_active
               )
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,true)`,
              [
                variantId,
                supplierId,
                supplierProductCode,
                supplierVariantCode === undefined ? null : supplierVariantCode,
                supplierColorCode === undefined ? null : supplierColorCode,
                body.colorName ?? body.color_name ?? null,
                supplierSize === undefined ? null : supplierSize,
                body.barcode ? emptyToNull(body.barcode) : null,
                supplierVariantCode === undefined ? null : supplierVariantCode,
                JSON.stringify({ supplierProductCode, supplierVariantCode, supplierColorCode, supplierSize, source: 'variant_detail_edit' }),
              ]
            );
          }
        }
      }

      if (changedPriceFields.length) {
        const stockLocation = await client.query(
          `SELECT location_id, qty
           FROM aif_stock
           WHERE variant_id=$1
           ORDER BY COALESCE(qty,0) DESC, updated_at DESC NULLS LAST
           LIMIT 1`,
          [variantId]
        );
        const priceChangeLocationId = stockLocation.rows[0]?.location_id || await getDefaultLocationId(client);
        const currentQtyForLocation = Number(stockLocation.rows[0]?.qty || 0);
        if (priceChangeLocationId) {
          const duplicatePriceChange = await client.query(
            `SELECT id
             FROM aif_stock_movements
             WHERE variant_id=$1
               AND (source_type='price_change' OR raw->>'reason'='price_change')
               AND created_at > now() - interval '30 seconds'
               AND NULLIF(raw->>'buyPriceBefore','')::numeric IS NOT DISTINCT FROM $2::numeric
               AND NULLIF(raw->>'buyPriceAfter','')::numeric IS NOT DISTINCT FROM $3::numeric
               AND NULLIF(raw->>'sellPriceBefore','')::numeric IS NOT DISTINCT FROM $4::numeric
               AND NULLIF(raw->>'sellPriceAfter','')::numeric IS NOT DISTINCT FROM $5::numeric
               AND NULLIF(raw->>'compareAtPriceBefore','')::numeric IS NOT DISTINCT FROM $6::numeric
               AND NULLIF(raw->>'compareAtPriceAfter','')::numeric IS NOT DISTINCT FROM $7::numeric
             LIMIT 1`,
            [variantId, previousBuyPrice, nextBuyPrice, previousSellPrice, nextSellPrice, previousCompareAtPrice, nextCompareAtPrice]
          );
          if (!duplicatePriceChange.rowCount) {
            await insertStockMovementSafe(client, {
              movementType: "manual_adjustment",
              sourceType: "price_change",
              sourcePrefix: "price",
              fallbackSourceType: "manual_stock_edit",
              locationId: priceChangeLocationId,
              variantId,
              qtyDelta: 0,
              qtyBefore: currentQtyForLocation,
              qtyAfter: currentQtyForLocation,
              actor: actorFrom(req),
              raw: {
                reason: "price_change",
                title: "Árváltozás",
                changedFields: changedPriceFields,
                priceChanges: [
                  ...(changedPriceFields.includes("buy_price") ? [{ key: "buyPrice", label: "Vételár", oldValue: previousBuyPrice, newValue: nextBuyPrice }] : []),
                  ...(changedPriceFields.includes("sell_price") ? [{ key: "sellPrice", label: "Eladási ár", oldValue: previousSellPrice, newValue: nextSellPrice }] : []),
                  ...(changedPriceFields.includes("compare_at_price") ? [{ key: "compareAtPrice", label: "Akció előtti ár", oldValue: previousCompareAtPrice, newValue: nextCompareAtPrice }] : []),
                ],
                buyPriceBefore: previousBuyPrice,
                buyPriceAfter: nextBuyPrice,
                sellPriceBefore: previousSellPrice,
                sellPriceAfter: nextSellPrice,
                compareAtPriceBefore: previousCompareAtPrice,
                compareAtPriceAfter: nextCompareAtPrice,
                source: "variant_detail_edit",
              },
            });
          }
        }
      }

      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      if (e && e.code === "23505") {
        const requestedBarcode = assignedBarcodeValue(req.body?.barcode);
        if (requestedBarcode) {
          const conflict = await findVariantBarcodeConflict(pool, requestedBarcode, null).catch(() => null);
          return barcodeConflictResponse(res, requestedBarcode, conflict);
        }
        return res.status(409).json({
          error: "A termék mentése egy már létező egyedi kóddal ütközött.",
          code: "unique_conflict",
        });
      }
      console.error("AIF update variant failed", e);
      res.status(500).json({ error: "failed to update variant" });
    } finally {
      client.release();
    }
  });


  router.delete("/variants/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: "variant id required" });

    const deleteMode = normCode(req.query.mode || req.query.deleteMode || req.query.delete_mode || req.query.permanent || req.query.force || "");
    const permanentDelete = ["permanent", "hard", "force", "true", "1", "yes", "vegleges", "végleges"].includes(deleteMode);
    const quoteIdent = (value) => `"${String(value).replace(/"/g, '""')}"`;
    const optionalQuery = async (client, sql, args = []) => {
      try {
        return await client.query(sql, args);
      } catch (e) {
        if (["42P01", "42703", "42883"].includes(e?.code)) return { rowCount: 0, rows: [] };
        throw e;
      }
    };

    const client = await pool.connect();
    let permanentDeleteWarning = null;
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT v.id, v.model_id, v.status, m.title_ro
         FROM aif_product_variants v
         JOIN aif_product_models m ON m.id=v.model_id
         WHERE v.id::text=$1 OR v.internal_sku=$1 OR v.barcode=$1
         FOR UPDATE OF v`,
        [id]
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "variant not found" });
      }

      const variantId = current.rows[0].id;
      const modelId = current.rows[0].model_id;
      const variantIdText = String(variantId);

      const stockUsage = await client.query(
        `SELECT count(*)::int AS stock_rows,
                COALESCE(sum(qty),0)::numeric AS qty,
                COALESCE(sum(reserved_qty),0)::numeric AS reserved_qty
         FROM aif_stock
         WHERE variant_id=$1`,
        [variantId]
      );
      const movementUsage = await client.query(
        `SELECT count(*)::int AS movements
         FROM aif_stock_movements
         WHERE variant_id=$1`,
        [variantId]
      );
      const importUsage = await client.query(
        `SELECT count(*)::int AS import_rows
         FROM aif_import_rows
         WHERE variant_id=$1`,
        [variantId]
      );

      const baseUsage = () => ({
        stock_rows: Number(stockUsage.rows[0]?.stock_rows || 0),
        qty: Number(stockUsage.rows[0]?.qty || 0),
        reserved_qty: Number(stockUsage.rows[0]?.reserved_qty || 0),
        movements: Number(movementUsage.rows[0]?.movements || 0),
        import_rows: Number(importUsage.rows[0]?.import_rows || 0),
      });

      if (permanentDelete) {
        await client.query("SAVEPOINT aif_variant_permanent_delete");
        try {
          const usage = { ...baseUsage(), deleted_rows: {} };
          const addDeletedCount = (key, result) => {
            usage.deleted_rows[key] = (usage.deleted_rows[key] || 0) + Number(result?.rowCount || 0);
          };

          addDeletedCount("selection", await optionalQuery(client, `DELETE FROM aif_user_selected_variants WHERE variant_id=$1`, [variantIdText]));
          addDeletedCount("inventory_count_lines", await optionalQuery(client, `DELETE FROM aif_inventory_count_lines WHERE variant_id=$1`, [variantId]));
          addDeletedCount("stock_movements", await optionalQuery(client, `DELETE FROM aif_stock_movements WHERE variant_id=$1`, [variantId]));
          addDeletedCount("stock", await optionalQuery(client, `DELETE FROM aif_stock WHERE variant_id=$1`, [variantId]));
          addDeletedCount("supplier_codes", await optionalQuery(client, `DELETE FROM aif_variant_supplier_codes WHERE variant_id=$1`, [variantId]));
          addDeletedCount("import_rows_detached", await optionalQuery(client,
            `UPDATE aif_import_rows
             SET variant_id=NULL,
                 status=CASE WHEN status='committed' THEN 'ignored' ELSE status END,
                 normalized=COALESCE(normalized, '{}'::jsonb) || jsonb_build_object(
                   'deletedVariantId', $1::text,
                   'deletedAt', now()::text,
                   'deleteMode', 'permanent_from_warehouse'
                 ),
                 updated_at=now()
             WHERE variant_id=$1`,
            [variantId]
          ));

          const handledRefs = new Set([
            "aif_user_selected_variants.variant_id",
            "aif_inventory_count_lines.variant_id",
            "aif_stock_movements.variant_id",
            "aif_stock.variant_id",
            "aif_variant_supplier_codes.variant_id",
            "aif_import_rows.variant_id",
          ]);
          const fkRefs = await optionalQuery(client, `
            SELECT ns.nspname AS table_schema, cl.relname AS table_name, att.attname AS column_name, att.attnotnull
            FROM pg_constraint con
            JOIN pg_class cl ON cl.oid=con.conrelid
            JOIN pg_namespace ns ON ns.oid=cl.relnamespace
            JOIN unnest(con.conkey) WITH ORDINALITY cols(attnum, ord) ON true
            JOIN pg_attribute att ON att.attrelid=con.conrelid AND att.attnum=cols.attnum
            WHERE con.contype='f'
              AND con.confrelid='aif_product_variants'::regclass
              AND array_length(con.conkey, 1)=1
          `);
          for (const ref of fkRefs.rows || []) {
            const tableName = text(ref.table_name);
            const columnName = text(ref.column_name);
            const tableKey = `${tableName}.${columnName}`;
            if (!tableName || !columnName || handledRefs.has(tableKey)) continue;
            const qualifiedTable = `${quoteIdent(ref.table_schema)}.${quoteIdent(tableName)}`;
            const quotedColumn = quoteIdent(columnName);
            if (ref.attnotnull) {
              addDeletedCount(tableKey, await optionalQuery(client, `DELETE FROM ${qualifiedTable} WHERE ${quotedColumn}=$1`, [variantId]));
            } else {
              addDeletedCount(tableKey, await optionalQuery(client, `UPDATE ${qualifiedTable} SET ${quotedColumn}=NULL WHERE ${quotedColumn}=$1`, [variantId]));
            }
          }

          const deletedVariant = await client.query(`DELETE FROM aif_product_variants WHERE id=$1 RETURNING id`, [variantId]);
          if (!deletedVariant.rowCount) {
            await client.query("ROLLBACK TO SAVEPOINT aif_variant_permanent_delete");
            await client.query("RELEASE SAVEPOINT aif_variant_permanent_delete");
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "variant not found" });
          }
          usage.deleted_rows.variants = deletedVariant.rowCount;

          const remainingSiblings = await client.query(
            `SELECT count(*)::int AS c
             FROM aif_product_variants
             WHERE model_id=$1`,
            [modelId]
          );
          if (Number(remainingSiblings.rows[0]?.c || 0) <= 0) {
            try {
              const deletedModel = await client.query(`DELETE FROM aif_product_models WHERE id=$1 RETURNING id`, [modelId]);
              usage.deleted_rows.models = deletedModel.rowCount;
            } catch (modelDeleteError) {
              if (modelDeleteError?.code !== "23503") throw modelDeleteError;
              const archivedModel = await client.query(
                `UPDATE aif_product_models SET status='archived', updated_at=now() WHERE id=$1`,
                [modelId]
              );
              usage.deleted_rows.models_archived = archivedModel.rowCount;
            }
          }

          await client.query("RELEASE SAVEPOINT aif_variant_permanent_delete");
          await client.query("COMMIT");
          return res.json({ ok: true, mode: "permanently_deleted", variantId: variantIdText, modelId: String(modelId), usage });
        } catch (hardDeleteError) {
          permanentDeleteWarning = hardDeleteError?.message || "A végleges törlés nem sikerült, ezért archiválásra váltott a rendszer.";
          console.error("AIF hard delete variant failed, falling back to archive", hardDeleteError);
          try { await client.query("ROLLBACK TO SAVEPOINT aif_variant_permanent_delete"); } catch {}
          try { await client.query("RELEASE SAVEPOINT aif_variant_permanent_delete"); } catch {}
        }
      }

      const stockRowsForRemoval = await client.query(
        `SELECT s.location_id, l.code AS location_code, l.name AS location_name,
                COALESCE(s.qty,0)::numeric AS qty,
                COALESCE(s.reserved_qty,0)::numeric AS reserved_qty
         FROM aif_stock s
         JOIN aif_locations l ON l.id=s.location_id
         WHERE s.variant_id=$1
         FOR UPDATE OF s`,
        [variantId]
      );

      let stockMovementsCreated = 0;
      for (const stockRow of stockRowsForRemoval.rows) {
        const beforeQty = Number(stockRow.qty || 0);
        const beforeReserved = Number(stockRow.reserved_qty || 0);
        if (beforeQty === 0 && beforeReserved === 0) continue;
        const logged = await insertStockMovementSafe(client, {
          movementType: "manual_adjustment",
          sourceType: "variant_archive_stock_clear",
          sourcePrefix: "archive_clear",
          fallbackSourceType: "manual_stock_edit",
          locationId: stockRow.location_id,
          variantId,
          qtyDelta: -beforeQty,
          qtyBefore: beforeQty,
          qtyAfter: 0,
          actor: actorFrom(req),
          raw: {
            reason: "variant_archive_stock_clear",
            direction: beforeQty > 0 ? "out" : "adjust",
            locationCode: stockRow.location_code,
            locationName: stockRow.location_name,
            qtyBefore: beforeQty,
            qtyAfter: 0,
            reservedBefore: beforeReserved,
            reservedAfter: 0,
            hardDeleteFallback: Boolean(permanentDeleteWarning),
          },
        });
        if (logged) stockMovementsCreated++;
      }

      await client.query(
        `UPDATE aif_product_variants
         SET status='archived', updated_at=now()
         WHERE id=$1`,
        [variantId]
      );
      await client.query(
        `UPDATE aif_stock
         SET qty=0, reserved_qty=0, updated_at=now()
         WHERE variant_id=$1`,
        [variantId]
      );
      await client.query(
        `UPDATE aif_variant_supplier_codes
         SET is_active=false, updated_at=now()
         WHERE variant_id=$1`,
        [variantId]
      );
      try {
        await ensureSelectedVariantsTable(client);
        await client.query(`DELETE FROM aif_user_selected_variants WHERE variant_id=$1`, [variantIdText]);
      } catch (selectionCleanupError) {
        console.error("AIF archive variant selection cleanup warning", selectionCleanupError);
      }

      const activeSiblings = await client.query(
        `SELECT count(*)::int AS c
         FROM aif_product_variants
         WHERE model_id=$1 AND id <> $2 AND COALESCE(status,'active') <> 'archived'`,
        [modelId, variantId]
      );
      if (Number(activeSiblings.rows[0]?.c || 0) <= 0) {
        await client.query(
          `UPDATE aif_product_models
           SET status='archived', updated_at=now()
           WHERE id=$1`,
          [modelId]
        );
      }

      await client.query("COMMIT");
      res.json({
        ok: true,
        mode: permanentDeleteWarning ? "archived_after_delete_fallback" : "archived",
        variantId: variantIdText,
        modelId: String(modelId),
        warning: permanentDeleteWarning,
        usage: {
          ...baseUsage(),
          stock_movements_created: stockMovementsCreated,
        },
      });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete variant failed", e);
      res.status(500).json({ error: e?.message || "failed to delete variant", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  async function loadSelectedVariants(req, res) {
    const ownerKey = selectionOwnerKey(req);
    try {
      await ensureSelectedVariantsTable(pool);
      const r = await loadSelectedVariantRows(pool, ownerKey);
      res.json(selectedVariantResponseFromRows(r.rows));
    } catch (e) {
      console.error("AIF selected variants load failed", e);
      res.status(500).json({ error: "A kijelölt termékek betöltése nem sikerült." });
    }
  }

  router.get("/selection", requireAuthed, loadSelectedVariants);
  router.get("/selected-variants", requireAuthed, loadSelectedVariants);

  async function saveSelectedVariants(req, res) {
    const ownerKey = selectionOwnerKey(req);
    const rows = selectedRowsFromBody(req.body || {});
    const replaceRequested = [true, 1, "1", "true", "yes"].includes(req.body?.replace);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSelectedVariantsTable(client);

      const ids = rows.map((row) => row.variantId);
      let validIds = new Set();
      if (ids.length) {
        const valid = await client.query(
          `SELECT id::text AS id
           FROM aif_product_variants
           WHERE id::text = ANY($1::text[]) AND COALESCE(status, 'active') <> 'archived'`,
          [ids]
        );
        validIds = new Set(valid.rows.map((x) => String(x.id)));
      }

      // A régi kliensek teljes pillanatképet küldtek. Két gépnél ez kitörölhette
      // a másik gép friss kijelöléseit. Teljes cserét már csak kifejezett replace=true
      // kérés végezhet; a régi, jelöletlen kérés biztonságosan csak hozzáad/frissít.
      await lockSelectedVariantsOwner(client, ownerKey);
      if (replaceRequested) {
        await client.query(`DELETE FROM aif_user_selected_variants WHERE owner_key=$1`, [ownerKey]);
      }
      let saved = 0;
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (!validIds.has(row.variantId)) continue;
        await client.query(
          `INSERT INTO aif_user_selected_variants (owner_key, variant_id, action, sort_order, raw, updated_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,now())
           ON CONFLICT (owner_key, variant_id) DO UPDATE SET
             action=EXCLUDED.action,
             sort_order=EXCLUDED.sort_order,
             raw=EXCLUDED.raw,
             updated_at=now()`,
          [ownerKey, row.variantId, row.action, index, JSON.stringify({ source: "warehouse_ui" })]
        );
        saved++;
      }

      await client.query("COMMIT");
      const fresh = await loadSelectedVariantRows(client, ownerKey);
      res.json({ ...selectedVariantResponseFromRows(fresh.rows), saved, replaced: replaceRequested });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF selected variants save failed", e);
      res.status(500).json({ error: "A kijelölt termékek mentése nem sikerült." });
    } finally {
      client.release();
    }
  }

  router.post("/selection", requireAuthed, saveSelectedVariants);
  router.put("/selection", requireAuthed, saveSelectedVariants);
  router.post("/selected-variants", requireAuthed, saveSelectedVariants);
  router.put("/selected-variants", requireAuthed, saveSelectedVariants);


  async function addSelectedVariantItems(req, res) {
    const ownerKey = selectionOwnerKey(req);
    const rows = selectedRowsFromBody(req.body || {});
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSelectedVariantsTable(client);
      await lockSelectedVariantsOwner(client, ownerKey);

      const ids = rows.map((row) => row.variantId);
      let validIds = new Set();
      if (ids.length) {
        const valid = await client.query(
          `SELECT id::text AS id
           FROM aif_product_variants
           WHERE id::text = ANY($1::text[])
             AND COALESCE(status, 'active') <> 'archived'`,
          [ids]
        );
        validIds = new Set(valid.rows.map((row) => String(row.id)));
      }

      const maxSort = await client.query(
        `SELECT COALESCE(max(sort_order), -1)::int AS max_sort
         FROM aif_user_selected_variants
         WHERE owner_key=$1`,
        [ownerKey]
      );
      let nextSort = Number(maxSort.rows[0]?.max_sort ?? -1) + 1;
      let added = 0;

      for (const row of rows) {
        if (!validIds.has(row.variantId)) continue;
        const result = await client.query(
          `INSERT INTO aif_user_selected_variants (
             owner_key, variant_id, action, sort_order, raw, created_at, updated_at
           )
           VALUES ($1,$2,$3,$4,$5::jsonb,now(),now())
           ON CONFLICT (owner_key, variant_id) DO UPDATE SET
             action=COALESCE(EXCLUDED.action, aif_user_selected_variants.action),
             raw=COALESCE(aif_user_selected_variants.raw, '{}'::jsonb) || EXCLUDED.raw,
             updated_at=now()
           RETURNING (xmax = 0) AS inserted`,
          [ownerKey, row.variantId, row.action, nextSort++, JSON.stringify({ source: "warehouse_ui_atomic_add" })]
        );
        if (result.rows[0]?.inserted) added++;
      }

      await client.query("COMMIT");
      const fresh = await loadSelectedVariantRows(client, ownerKey);
      res.json({ ...selectedVariantResponseFromRows(fresh.rows), owner: ownerKey, added });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF selected variants atomic add failed", e);
      res.status(500).json({ error: "A kijelölt termékek hozzáadása nem sikerült." });
    } finally {
      client.release();
    }
  }

  async function updateSelectedVariantActions(req, res) {
    const ownerKey = selectionOwnerKey(req);
    const rows = selectedRowsFromBody(req.body || {});
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSelectedVariantsTable(client);
      await lockSelectedVariantsOwner(client, ownerKey);

      let updated = 0;
      for (const row of rows) {
        const result = await client.query(
          `UPDATE aif_user_selected_variants
           SET action=$3,
               raw=COALESCE(raw, '{}'::jsonb) || $4::jsonb,
               updated_at=now()
           WHERE owner_key=$1 AND variant_id=$2`,
          [ownerKey, row.variantId, row.action, JSON.stringify({ source: "warehouse_ui_atomic_action" })]
        );
        updated += result.rowCount;
      }

      await client.query("COMMIT");
      const fresh = await loadSelectedVariantRows(client, ownerKey);
      res.json({ ...selectedVariantResponseFromRows(fresh.rows), owner: ownerKey, updated });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF selected variants action update failed", e);
      res.status(500).json({ error: "A kijelölt termékek műveletének mentése nem sikerült." });
    } finally {
      client.release();
    }
  }

  async function removeSelectedVariantItems(req, res) {
    const ownerKey = selectionOwnerKey(req);
    const ids = selectedVariantIdsFromBody(req.body || {});
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureSelectedVariantsTable(client);
      await lockSelectedVariantsOwner(client, ownerKey);

      let removed = 0;
      if (ids.length) {
        const result = await client.query(
          `DELETE FROM aif_user_selected_variants
           WHERE owner_key=$1 AND variant_id = ANY($2::text[])`,
          [ownerKey, ids]
        );
        removed = result.rowCount;
      }

      await client.query("COMMIT");
      const fresh = await loadSelectedVariantRows(client, ownerKey);
      res.json({ ...selectedVariantResponseFromRows(fresh.rows), owner: ownerKey, removed });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF selected variants atomic remove failed", e);
      res.status(500).json({ error: "A kijelölt termékek eltávolítása nem sikerült." });
    } finally {
      client.release();
    }
  }

  router.post("/selection/items", requireAuthed, addSelectedVariantItems);
  router.patch("/selection/items", requireAuthed, updateSelectedVariantActions);
  router.delete("/selection/items", requireAuthed, removeSelectedVariantItems);
  router.post("/selected-variants/items", requireAuthed, addSelectedVariantItems);
  router.patch("/selected-variants/items", requireAuthed, updateSelectedVariantActions);
  router.delete("/selected-variants/items", requireAuthed, removeSelectedVariantItems);

  async function clearSelectedVariants(req, res) {
    const ownerKey = selectionOwnerKey(req);
    try {
      await ensureSelectedVariantsTable(pool);
      await pool.query(`DELETE FROM aif_user_selected_variants WHERE owner_key=$1`, [ownerKey]);
      res.json({ ok: true, items: [], selectedVariantIds: [], actions: {}, updatedAt: new Date().toISOString(), count: 0 });
    } catch (e) {
      console.error("AIF selected variants clear failed", e);
      res.status(500).json({ error: "A kijelölések törlése nem sikerült." });
    }
  }

  router.delete("/selection", requireAuthed, clearSelectedVariants);
  router.delete("/selected-variants", requireAuthed, clearSelectedVariants);

  router.get("/inventory", requireAuthed, async (req, res) => {
    await ensureAifShopifyInventorySchema();
    const search = text(req.query.search || req.query.q);
    const snCod = text(req.query.snCod || req.query.sn_cod || req.query.sn || req.query.sncod);
    const includeZero = ["1", "true", "yes"].includes(text(req.query.includeZero || req.query.include_zero).toLowerCase());
    const limit = Math.min(5000, Math.max(1, Number(req.query.limit || 200)));
    const args = [];
    const where = [
      `COALESCE(v.status,'active') <> 'archived'`,
      `COALESCE(m.status,'active') <> 'archived'`,
    ];
    const tariffExpr = customsTariffSql('v');

    if (!includeZero) {
      where.push(`(COALESCE(st.total_qty,0) <> 0 OR COALESCE(st.total_reserved_qty,0) <> 0 OR ci.variant_id IS NOT NULL)`);
    }

    if (search) {
      args.push(`%${search}%`);
      const p = `$${args.length}`;
      where.push(`(
        COALESCE(m.title_ro,'') ILIKE ${p}
        OR COALESCE(lid.normalized->>'titleRo', lid.normalized->>'productName', lid.raw->>'ARTICOL', '') ILIKE ${p}
        OR COALESCE(m.title_hu,'') ILIKE ${p}
        OR COALESCE(m.shopify_title,'') ILIKE ${p}
        OR COALESCE(v.internal_sku,'') ILIKE ${p}
        OR COALESCE(v.barcode,'') ILIKE ${p}
        OR COALESCE(v.sn_cod,'') ILIKE ${p}
        OR ${tariffExpr} ILIKE ${p}
        OR COALESCE(m.model_code,'') ILIKE ${p}
        OR COALESCE(lid.normalized->>'modelCode', lid.supplier_product_code, '') ILIKE ${p}
        OR COALESCE(b.name,'') ILIKE ${p}
        OR COALESCE(b.code,'') ILIKE ${p}
        OR COALESCE(lid.normalized->>'brandName', lid.raw->>'BRAND', '') ILIKE ${p}
        OR COALESCE(c.name_ro,'') ILIKE ${p}
        OR COALESCE(c.name_hu,'') ILIKE ${p}
        OR COALESCE(c.code,'') ILIKE ${p}
        OR COALESCE(lid.normalized->>'categoryName', lid.raw->>'RODESCR', lid.raw->>'CATEGORIE', '') ILIKE ${p}
        OR COALESCE(v.color_name,'') ILIKE ${p}
        OR COALESCE(v.color_code,'') ILIKE ${p}
        OR COALESCE(lid.normalized->>'colorName', lid.supplier_color_code, '') ILIKE ${p}
        OR COALESCE(v.size,'') ILIKE ${p}
        OR COALESCE(lid.normalized->>'size', lid.supplier_size, '') ILIKE ${p}
        OR COALESCE(si.supplier_names,'') ILIKE ${p}
        OR COALESCE(si.supplier_codes,'') ILIKE ${p}
      )`);
    }

    if (snCod) {
      args.push(`%${snCod}%`);
      where.push(`COALESCE(v.sn_cod,'') ILIKE $${args.length}`);
    }

    args.push(limit);
    const limitParam = `$${args.length}`;

    const r = await pool.query(
      `WITH stock_totals AS (
         SELECT
           s.variant_id,
           COALESCE(sum(COALESCE(s.qty,0)),0)::numeric AS total_qty,
           COALESCE(sum(COALESCE(s.reserved_qty,0)),0)::numeric AS total_reserved_qty,
           COALESCE(sum(COALESCE(s.qty,0) - COALESCE(s.reserved_qty,0)),0)::numeric AS available_qty,
           max(s.updated_at) AS last_stock_movement_at
         FROM aif_stock s
         GROUP BY s.variant_id
       ),
       supplier_info AS (
         SELECT
           sc.variant_id,
           string_agg(DISTINCT s.id::text, ', ' ORDER BY s.id::text) FILTER (WHERE s.id IS NOT NULL) AS supplier_ids,
           string_agg(DISTINCT s.code, ', ' ORDER BY s.code) FILTER (WHERE s.code IS NOT NULL AND s.code <> '') AS supplier_source_codes,
           string_agg(DISTINCT s.name, ', ' ORDER BY s.name) FILTER (WHERE s.name IS NOT NULL AND s.name <> '') AS supplier_names,
           string_agg(DISTINCT NULLIF(concat_ws(' / ', sc.supplier_product_code, sc.supplier_variant_code, sc.supplier_color_code, sc.supplier_size), ''), ', ') AS supplier_codes,
           (array_agg(sc.supplier_product_code ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST) FILTER (WHERE sc.supplier_product_code IS NOT NULL AND sc.supplier_product_code <> ''))[1] AS supplier_product_code,
           (array_agg(sc.supplier_variant_code ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST) FILTER (WHERE sc.supplier_variant_code IS NOT NULL AND sc.supplier_variant_code <> ''))[1] AS supplier_variant_code,
           (array_agg(sc.supplier_color_code ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST) FILTER (WHERE sc.supplier_color_code IS NOT NULL AND sc.supplier_color_code <> ''))[1] AS supplier_color_code,
           (array_agg(sc.supplier_size ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST) FILTER (WHERE sc.supplier_size IS NOT NULL AND sc.supplier_size <> ''))[1] AS supplier_size,
           (array_agg(sc.supplier_barcode ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST) FILTER (WHERE sc.supplier_barcode IS NOT NULL AND sc.supplier_barcode <> ''))[1] AS supplier_barcode,
           (array_agg(sc.supplier_sku ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST) FILTER (WHERE sc.supplier_sku IS NOT NULL AND sc.supplier_sku <> ''))[1] AS supplier_sku
         FROM aif_variant_supplier_codes sc
         LEFT JOIN aif_suppliers s ON s.id=sc.supplier_id
         WHERE COALESCE(sc.is_active,true)=true
         GROUP BY sc.variant_id
       ),
       incoming_info AS (
         SELECT
           sm.variant_id,
           min(sm.created_at) AS first_incoming_at,
           max(sm.created_at) AS last_incoming_at
         FROM aif_stock_movements sm
         WHERE sm.movement_type='incoming' OR sm.source_type='import_batch' OR sm.raw->>'reason'='import_batch_commit'
         GROUP BY sm.variant_id
       ),
       committed_import AS (
         SELECT
           rw.variant_id,
           COALESCE(sum(COALESCE(rw.qty,0)),0)::numeric AS committed_qty,
           max(COALESCE(b.committed_at, b.updated_at, b.created_at, rw.updated_at)) AS last_import_at
         FROM aif_import_rows rw
         JOIN aif_import_batches b ON b.id=rw.batch_id
         WHERE rw.status='committed'
           AND rw.variant_id IS NOT NULL
           AND COALESCE(b.committed_at, b.updated_at, b.created_at, rw.updated_at) >= now() - interval '30 days'
         GROUP BY rw.variant_id
       ),
       latest_import_detail AS (
         SELECT DISTINCT ON (rw.variant_id)
           rw.variant_id,
           rw.raw,
           rw.normalized,
           rw.sn_cod,
           rw.supplier_product_code,
           rw.supplier_color_code,
           rw.supplier_size,
           rw.buy_price,
           rw.buy_price_ron,
           rw.sell_price,
           rw.sell_price_ron,
           rw.qty,
           b.id AS last_import_batch_id,
           b.reception_id AS last_reception_id,
           COALESCE(NULLIF(r.invoice_number,''), NULLIF(b.invoice_number,'')) AS last_invoice_number,
           r.invoice_date AS last_invoice_date,
           r.reception_date AS last_reception_date,
           b.source_file_name AS last_source_file_name,
           COALESCE(b.committed_at, b.updated_at, b.created_at, rw.updated_at) AS last_import_at
         FROM aif_import_rows rw
         JOIN aif_import_batches b ON b.id=rw.batch_id
         LEFT JOIN aif_receptions r ON r.id=b.reception_id
         WHERE rw.status='committed'
           AND rw.variant_id IS NOT NULL
         ORDER BY rw.variant_id, COALESCE(b.committed_at, b.updated_at, b.created_at, rw.updated_at) DESC, rw.updated_at DESC NULLS LAST, rw.row_no DESC
       ),
       invoice_info AS (
         SELECT
           rw.variant_id,
           array_agg(DISTINCT COALESCE(NULLIF(r.invoice_number,''), NULLIF(b.invoice_number,'')))
             FILTER (WHERE COALESCE(NULLIF(r.invoice_number,''), NULLIF(b.invoice_number,'')) IS NOT NULL) AS invoice_numbers,
           jsonb_agg(DISTINCT jsonb_build_object(
             'invoiceNumber', COALESCE(NULLIF(r.invoice_number,''), NULLIF(b.invoice_number,'')),
             'invoiceDate', r.invoice_date,
             'receptionDate', r.reception_date,
             'importedAt', COALESCE(b.committed_at, b.updated_at, b.created_at, rw.updated_at),
             'batchId', b.id,
             'receptionId', b.reception_id,
             'sourceFileName', b.source_file_name,
             'supplierId', COALESCE(r.supplier_id, b.supplier_id),
             'supplierCode', invs.code,
             'supplierName', invs.name,
             'locationId', COALESCE(r.target_location_id, b.target_location_id),
             'locationName', invl.name,
             'currencyCode', COALESCE(r.currency_code, b.currency_code),
             'invoiceGross', r.invoice_gross,
             'receptionStatus', r.status
           )) FILTER (WHERE COALESCE(NULLIF(r.invoice_number,''), NULLIF(b.invoice_number,'')) IS NOT NULL) AS invoice_history,
           min(COALESCE(b.committed_at, b.updated_at, b.created_at, rw.updated_at)) AS first_import_at,
           max(COALESCE(b.committed_at, b.updated_at, b.created_at, rw.updated_at)) AS last_import_at
         FROM aif_import_rows rw
         JOIN aif_import_batches b ON b.id=rw.batch_id
         LEFT JOIN aif_receptions r ON r.id=b.reception_id
         LEFT JOIN aif_suppliers invs ON invs.id=COALESCE(r.supplier_id, b.supplier_id)
         LEFT JOIN aif_locations invl ON invl.id=COALESCE(r.target_location_id, b.target_location_id)
         WHERE rw.status='committed'
           AND rw.variant_id IS NOT NULL
         GROUP BY rw.variant_id
       )
       SELECT
         v.id AS variant_id,
         v.internal_sku,
         (svm.variant_id IS NOT NULL) AS shopify_mapped,
         sxp.export_id::text AS shopify_export_id,
         sxp.item_status AS shopify_export_item_status,
         sxp.export_status AS shopify_export_status,
         sxp.exported_at AS shopify_exported_at,
         sxp.reconciled_at AS shopify_export_reconciled_at,
         sxp.validation_errors AS shopify_export_errors,
         sxp.validation_warnings AS shopify_export_warnings,
         (sxp.item_status='exported_pending' AND svm.variant_id IS NULL) AS shopify_export_pending,
         COALESCE(sso.status, svm.sync_status) AS shopify_sync_status,
         sso.status AS shopify_outbox_status,
         svm.shopify_product_id,
         svm.shopify_variant_id,
         svm.shopify_inventory_item_id,
         svm.shopify_product_title,
         svm.shopify_variant_title,
         svm.shopify_product_status,
         svm.created_at AS shopify_mapped_at,
         svm.updated_at AS shopify_mapping_updated_at,
         NULLIF(
           GREATEST(
             COALESCE(sxp.reconciled_at, 'epoch'::timestamptz),
             COALESCE(svm.created_at, 'epoch'::timestamptz)
           ),
           'epoch'::timestamptz
         ) AS shopify_connected_at,
         svm.last_synced_at AS shopify_last_synced_at,
         svm.last_error AS shopify_last_error,
         sso.last_error AS shopify_outbox_error,
         COALESCE(NULLIF(v.barcode,''), NULLIF(si.supplier_barcode,''), NULLIF(lid.normalized->>'barcode',''), NULLIF(lid.normalized->>'supplierBarcode','')) AS barcode,
         COALESCE(NULLIF(v.barcode,''), NULLIF(si.supplier_barcode,''), NULLIF(lid.normalized->>'barcode',''), NULLIF(lid.normalized->>'supplierBarcode','')) AS display_barcode,
         v.barcode AS variant_barcode,
         COALESCE(v.sn_cod, lid.sn_cod, NULLIF(lid.normalized->>'snCod',''), NULLIF(lid.normalized->>'sn_cod','')) AS sn_cod,
         COALESCE(v.sn_cod, lid.sn_cod, NULLIF(lid.normalized->>'snCod',''), NULLIF(lid.normalized->>'sn_cod','')) AS "snCod",
         v.attributes,
         v.attributes AS variant_attributes,
         COALESCE(${tariffExpr}, NULLIF(lid.normalized->>'customsTariffCode',''), NULLIF(lid.normalized->>'customs_tariff_code',''), NULLIF(lid.raw->>'INTRASTAT','')) AS customs_tariff_code,
         COALESCE(${tariffExpr}, NULLIF(lid.normalized->>'customsTariffCode',''), NULLIF(lid.normalized->>'customs_tariff_code',''), NULLIF(lid.raw->>'INTRASTAT','')) AS "customsTariffCode",
         v.status AS variant_status,
         v.status AS status,
         m.id AS model_id,
         COALESCE(NULLIF(m.model_code,''), NULLIF(lid.normalized->>'modelCode',''), lid.supplier_product_code) AS model_code,
         COALESCE(NULLIF(si.supplier_product_code,''), lid.supplier_product_code, NULLIF(lid.normalized->>'supplierProductCode',''), NULLIF(lid.normalized->>'productCode','')) AS supplier_product_code,
         COALESCE(NULLIF(si.supplier_product_code,''), lid.supplier_product_code, NULLIF(lid.normalized->>'supplierProductCode',''), NULLIF(lid.normalized->>'productCode','')) AS "supplierProductCode",
         COALESCE(NULLIF(si.supplier_variant_code,''), NULLIF(lid.normalized->>'supplierVariantCode',''), NULLIF(lid.normalized->>'variantCode','')) AS supplier_variant_code,
         COALESCE(NULLIF(si.supplier_color_code,''), lid.supplier_color_code, NULLIF(lid.normalized->>'supplierColorCode',''), NULLIF(lid.normalized->>'colorCode','')) AS supplier_color_code,
         COALESCE(NULLIF(si.supplier_size,''), lid.supplier_size, NULLIF(lid.normalized->>'supplierSize',''), NULLIF(lid.normalized->>'size','')) AS supplier_size,
         COALESCE(NULLIF(m.title_ro,''), NULLIF(lid.normalized->>'titleRo',''), NULLIF(lid.normalized->>'productName',''), NULLIF(lid.raw->>'ARTICOL',''), lid.supplier_product_code) AS title_ro,
         COALESCE(NULLIF(m.title_hu,''), NULLIF(lid.normalized->>'titleHu','')) AS title_hu,
         COALESCE(NULLIF(m.description_ro,''), NULLIF(lid.normalized->>'descriptionRo',''), NULLIF(lid.raw->>'DESCRIERE',''), NULLIF(lid.raw->>'DESCRIERE PRODUS',''), NULLIF(lid.raw->>'DESCRIPTION','')) AS description_ro,
         COALESCE(NULLIF(m.shopify_title,''), NULLIF(lid.normalized->>'shopifyTitle',''), NULLIF(lid.normalized->>'titleRo',''), NULLIF(lid.raw->>'ARTICOL','')) AS shopify_title,
         COALESCE(NULLIF(m.gender,''), NULLIF(lid.normalized->>'gender',''), NULLIF(lid.raw->>'GEN','')) AS gender,
         COALESCE(NULLIF(m.product_type,''), NULLIF(lid.normalized->>'productType',''), NULLIF(lid.raw->>'RODESCR','')) AS product_type,
         COALESCE(NULLIF(m.season,''), NULLIF(lid.normalized->>'season',''), NULLIF(lid.normalized->>'collection',''), NULLIF(lid.raw->>'COLECTIE','')) AS season,
         COALESCE(NULLIF(m.material,''), NULLIF(lid.normalized->>'material',''), NULLIF(lid.normalized->>'composition',''), NULLIF(lid.raw->>'COMPOZITIE','')) AS material,
         m.status AS model_status,
         COALESCE(b.name, NULLIF(lid.normalized->>'brandName',''), NULLIF(lid.raw->>'BRAND','')) AS brand_name,
         COALESCE(b.code, NULLIF(lid.normalized->>'brandCode','')) AS brand_code,
         COALESCE(c.name_ro, NULLIF(lid.normalized->>'categoryName',''), NULLIF(lid.raw->>'CATEGORIE','')) AS category_name_ro,
         c.name_hu AS category_name_hu,
         COALESCE(c.code, NULLIF(lid.normalized->>'categoryCode',''), NULLIF(lid.raw->>'CATEGORIE','')) AS category_code,
         COALESCE(subc.name_ro, NULLIF(lid.normalized->>'subcategoryName',''), NULLIF(lid.normalized->>'subCategoryName',''), NULLIF(lid.raw->>'SUBCATEGORIE','')) AS subcategory_name_ro,
         subc.name_hu AS subcategory_name_hu,
         COALESCE(subc.code, NULLIF(lid.normalized->>'subcategoryCode',''), NULLIF(lid.normalized->>'subCategoryCode',''), NULLIF(lid.raw->>'SUBCATEGORIE','')) AS subcategory_code,
         COALESCE(v.color_code, lid.supplier_color_code, NULLIF(lid.normalized->>'colorCode',''), NULLIF(lid.normalized->>'supplierColorCode','')) AS color_code,
         COALESCE(v.color_name, NULLIF(lid.normalized->>'colorName','')) AS color_name,
         COALESCE(v.color_hex, NULLIF(lid.normalized->>'colorHex','')) AS color_hex,
         COALESCE(NULLIF(v.size,''), lid.supplier_size, NULLIF(lid.normalized->>'size',''), NULLIF(lid.raw->>'MARIME','')) AS size,
         COALESCE(v.buy_price, lid.buy_price_ron, lid.buy_price) AS buy_price,
         COALESCE(v.sell_price, lid.sell_price_ron, lid.sell_price) AS sell_price,
         v.compare_at_price,
         COALESCE(v.image_url, NULLIF(lid.normalized->>'imageUrl',''), NULLIF(lid.normalized->>'image_url','')) AS image_url,
         v.images,
         COALESCE(st.total_qty, ci.committed_qty, lid.qty, 0) AS total_qty,
         COALESCE(st.total_reserved_qty,0) AS total_reserved_qty,
         COALESCE(st.available_qty, ci.committed_qty, lid.qty, 0) AS available_qty,
         COALESCE(st.last_stock_movement_at, ci.last_import_at, lid.last_import_at) AS last_stock_movement_at,
         COALESCE(ii.first_incoming_at, inf.first_import_at, lid.last_import_at, st.last_stock_movement_at) AS first_incoming_at,
         COALESCE(ii.last_incoming_at, ci.last_import_at, lid.last_import_at, st.last_stock_movement_at) AS last_incoming_at,
         lid.last_import_batch_id,
         lid.last_reception_id,
         lid.last_invoice_number,
         lid.last_invoice_date,
         lid.last_reception_date,
         lid.last_source_file_name,
         inf.invoice_numbers,
         inf.invoice_history,
         si.supplier_ids,
         si.supplier_source_codes,
         si.supplier_names,
         si.supplier_codes,
         COALESCE(si.supplier_product_code, lid.supplier_product_code) AS supplier_product_code,
         COALESCE(si.supplier_product_code, lid.supplier_product_code) AS "supplierProductCode",
         si.supplier_variant_code AS supplier_variant_code,
         si.supplier_variant_code AS "supplierVariantCode"
       FROM aif_product_variants v
       JOIN aif_product_models m ON m.id=v.model_id
       LEFT JOIN aif_brands b ON b.id=m.brand_id
       LEFT JOIN aif_categories c ON c.id=m.category_id
       LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
       LEFT JOIN stock_totals st ON st.variant_id=v.id
       LEFT JOIN committed_import ci ON ci.variant_id=v.id
       LEFT JOIN latest_import_detail lid ON lid.variant_id=v.id
       LEFT JOIN invoice_info inf ON inf.variant_id=v.id
       LEFT JOIN supplier_info si ON si.variant_id=v.id
       LEFT JOIN incoming_info ii ON ii.variant_id=v.id
       LEFT JOIN LATERAL (
         SELECT ei.export_id, ei.item_status, ei.validation_errors, ei.validation_warnings,
                e.status AS export_status, e.created_at AS exported_at, e.reconciled_at
         FROM aif_shopify_product_export_items ei
         JOIN aif_shopify_product_exports e ON e.id=ei.export_id
         WHERE ei.variant_id=v.id
         ORDER BY e.created_at DESC
         LIMIT 1
       ) sxp ON true
       LEFT JOIN aif_shopify_variant_map svm ON svm.variant_id=v.id
       LEFT JOIN aif_shopify_sync_outbox sso ON sso.variant_id=v.id
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(b.name,'') ASC NULLS LAST, m.title_ro ASC, v.color_name ASC NULLS LAST, v.size ASC
       LIMIT ${limitParam}`,
      args
    );

    res.json({ items: r.rows });
  });

  function aifStockProductJoinSql(baseAlias = "sm") {
    return `
       JOIN aif_locations l ON l.id=${baseAlias}.location_id
       JOIN aif_product_variants v ON v.id=${baseAlias}.variant_id
       JOIN aif_product_models m ON m.id=v.model_id
       LEFT JOIN aif_brands b ON b.id=m.brand_id
       LEFT JOIN aif_categories c ON c.id=m.category_id
       LEFT JOIN LATERAL (
         SELECT supplier_barcode, supplier_sku, supplier_product_code, supplier_variant_code
         FROM aif_variant_supplier_codes sc
         WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
         ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
         LIMIT 1
       ) sc ON true`;
  }

  function aifStockProductSearchWhere(search, args) {
    const q = text(search);
    if (!q) return null;
    args.push(`%${q}%`);
    const p = `$${args.length}`;
    return `(
      m.title_ro ILIKE ${p}
      OR COALESCE(m.shopify_title,'') ILIKE ${p}
      OR COALESCE(b.name,'') ILIKE ${p}
      OR COALESCE(c.name_ro,'') ILIKE ${p}
      OR COALESCE(v.color_name,'') ILIKE ${p}
      OR COALESCE(v.size,'') ILIKE ${p}
      OR COALESCE(v.barcode, sc.supplier_barcode, '') ILIKE ${p}
      OR COALESCE(v.sn_cod,'') ILIKE ${p}
      OR ${customsTariffSql('v')} ILIKE ${p}
      OR COALESCE(v.internal_sku,'') ILIKE ${p}
    )`;
  }

  router.get("/stock", requireAuthed, async (req, res) => {
    const location = text(req.query.location || req.query.locationCode || req.query.location_id);
    const variant = text(req.query.variant || req.query.variantId || req.query.variant_id);
    const search = text(req.query.search || req.query.q);
    const snCod = text(req.query.snCod || req.query.sn_cod || req.query.sn || req.query.sncod);
    const args = [];
    const where = [
      `COALESCE(v.status,'active') <> 'archived'`,
      `COALESCE(m.status,'active') <> 'archived'`,
    ];
    if (location) {
      args.push(location);
      where.push(`(l.code=$${args.length} OR l.id::text=$${args.length})`);
    }
    if (variant) {
      args.push(variant);
      where.push(`(v.id::text=$${args.length} OR v.internal_sku=$${args.length} OR v.barcode=$${args.length} OR sc.supplier_barcode=$${args.length} OR sc.supplier_sku=$${args.length})`);
    }
    const searchWhere = aifStockProductSearchWhere(search, args);
    if (searchWhere) where.push(searchWhere);
    if (snCod) {
      args.push(`%${snCod}%`);
      where.push(`COALESCE(v.sn_cod,'') ILIKE $${args.length}`);
    }
    const r = await pool.query(
      `SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name,
              v.id AS variant_id, v.internal_sku, v.barcode, v.sn_cod,
              v.attributes AS variant_attributes,
              ${customsTariffSql('v')} AS customs_tariff_code,
              ${customsTariffSql('v')} AS "customsTariffCode",
              v.status AS variant_status, v.status AS status,
              COALESCE(NULLIF(v.barcode,''), NULLIF(sc.supplier_barcode,'')) AS display_barcode,
              v.size, v.color_code, v.color_name, v.color_hex, v.image_url, v.images,
              v.buy_price, v.sell_price,
              m.id AS model_id, m.model_code, m.title_ro, m.shopify_title, m.status AS model_status,
              b.name AS brand_name, b.code AS brand_code,
              c.name_ro AS category_name_ro, c.code AS category_code,
              s.qty, s.reserved_qty, (s.qty - s.reserved_qty) AS available_qty, s.updated_at
       FROM aif_stock s
       ${aifStockProductJoinSql("s")}
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY l.name ASC, m.title_ro ASC, v.color_name ASC NULLS LAST, v.size ASC`,
      args
    );
    res.json({ items: r.rows });
  });


  router.get('/stock-documents/settings', requireAuthed, async (_req, res) => {
    try {
      const settings = await readAifStockDocumentSettings(pool, null, false);
      res.json({
        ok: true,
        items: settings,
        settings: Object.fromEntries(settings.map((row) => [row.documentType, row])),
      });
    } catch (error) {
      console.error('AIF stock document settings load failed', error);
      res.status(500).json({ error: 'A készletbizonylatok számozási beállításainak betöltése nem sikerült.' });
    }
  });

  async function saveAifStockDocumentSettings(req, res) {
    try {
      await ensureAifStockTransferDocumentsSchema();
      const documentType = cleanAifStockDocumentType(req.params.type || req.body?.documentType || req.body?.document_type, null);
      if (!documentType) return res.status(400).json({ error: 'Érvénytelen készletbizonylat-típus.' });
      const current = await readAifStockDocumentSettings(pool, documentType, false);
      const body = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : (req.body || {});
      const defaults = AIF_STOCK_DOCUMENT_TYPES[documentType];
      const series = cleanAifTransferDocumentSeries(body.series || current.series || defaults.series);
      const nextNumber = Math.max(1, Number.parseInt(String(body.nextNumber ?? body.next_number ?? current.nextNumber ?? 1), 10) || 1);
      const digits = Math.min(10, Math.max(3, Number.parseInt(String(body.digits ?? current.digits ?? 6), 10) || 6));
      const includeYear = body.includeYear === undefined && body.include_year === undefined ? current.includeYear !== false : Boolean(body.includeYear ?? body.include_year);
      const yearlyReset = body.yearlyReset === undefined && body.yearly_reset === undefined ? current.yearlyReset !== false : Boolean(body.yearlyReset ?? body.yearly_reset);
      const sequenceYear = Math.max(2000, Math.min(2100, Number.parseInt(String(body.sequenceYear ?? body.sequence_year ?? current.sequenceYear ?? new Date().getFullYear()), 10) || new Date().getFullYear()));
      const documentTitle = text(body.documentTitle || body.document_title || current.documentTitle || defaults.title).slice(0, 220);
      const documentSubtitle = text(body.documentSubtitle || body.document_subtitle || current.documentSubtitle || defaults.subtitle).slice(0, 220);
      const preview = aifTransferDocumentNumber({ series, digits, include_year: includeYear }, nextNumber, sequenceYear);
      const collision = await pool.query(`SELECT 1 FROM aif_stock_transfer_documents WHERE document_number=$1 LIMIT 1`, [preview]);
      if (collision.rowCount) return res.status(409).json({ error: `Ez a következő bizonylatszám már foglalt: ${preview}. Állíts magasabb következő sorszámot.` });
      const result = await pool.query(
        `UPDATE aif_stock_document_settings
         SET series=$2, next_number=$3, digits=$4, include_year=$5, yearly_reset=$6,
             sequence_year=$7, document_title=$8, document_subtitle=$9,
             updated_by=$10, updated_at=now()
         WHERE document_type=$1
         RETURNING *`,
        [documentType, series, nextNumber, digits, includeYear, yearlyReset, sequenceYear, documentTitle, documentSubtitle, actorFrom(req)]
      );
      if (documentType === 'internal_transfer') {
        await pool.query(
          `UPDATE aif_stock_transfer_document_settings
           SET series=$1, next_number=$2, digits=$3, include_year=$4, yearly_reset=$5,
               sequence_year=$6, document_title=$7, document_subtitle=$8,
               updated_by=$9, updated_at=now()
           WHERE id=1`,
          [series, nextNumber, digits, includeYear, yearlyReset, sequenceYear, documentTitle, documentSubtitle, actorFrom(req)]
        );
      }
      const settings = aifStockDocumentSettingsResponse(result.rows[0] || { document_type: documentType });
      res.json({ ok: true, settings, item: settings });
    } catch (error) {
      console.error('AIF stock document settings save failed', error);
      res.status(500).json({ error: error?.message || 'A készletbizonylat számozási beállításainak mentése nem sikerült.' });
    }
  }

  router.put('/stock-documents/settings/:type', requireAdminOrSecret, saveAifStockDocumentSettings);
  router.patch('/stock-documents/settings/:type', requireAdminOrSecret, saveAifStockDocumentSettings);

  router.get('/stock-transfer-documents/settings', requireAuthed, async (_req, res) => {
    try {
      const settings = await readAifTransferDocumentSettings(pool);
      res.json({ ok: true, settings });
    } catch (error) {
      console.error('AIF stock transfer document settings load failed', error);
      res.status(500).json({ error: 'A proces-verbal számozási beállításainak betöltése nem sikerült.' });
    }
  });

  router.put('/stock-transfer-documents/settings', requireAdminOrSecret, async (req, res) => {
    try {
      await ensureAifStockTransferDocumentsSchema();
      const body = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : req.body || {};
      const series = cleanAifTransferDocumentSeries(body.series || 'PV');
      const nextNumber = Math.max(1, Number.parseInt(String(body.nextNumber ?? body.next_number ?? 1), 10) || 1);
      const digits = Math.min(10, Math.max(3, Number.parseInt(String(body.digits ?? 6), 10) || 6));
      const includeYear = body.includeYear === undefined && body.include_year === undefined ? true : Boolean(body.includeYear ?? body.include_year);
      const yearlyReset = body.yearlyReset === undefined && body.yearly_reset === undefined ? true : Boolean(body.yearlyReset ?? body.yearly_reset);
      const documentTitle = text(body.documentTitle || body.document_title || 'PROCES-VERBAL DE PREDARE-PRIMIRE').slice(0, 180);
      const documentSubtitle = text(body.documentSubtitle || body.document_subtitle || 'Transfer intern de stoc').slice(0, 180);
      const yearResult = await pool.query(`SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer AS year`);
      const sequenceYear = Number(yearResult.rows[0]?.year || new Date().getFullYear());
      const preview = aifTransferDocumentNumber({ series, digits, include_year: includeYear }, nextNumber, sequenceYear);
      const collision = await pool.query(`SELECT 1 FROM aif_stock_transfer_documents WHERE document_number=$1 LIMIT 1`, [preview]);
      if (collision.rowCount) {
        return res.status(409).json({ error: `Ez a következő bizonylatszám már foglalt: ${preview}. Állíts magasabb következő sorszámot.` });
      }
      const result = await pool.query(
        `UPDATE aif_stock_transfer_document_settings
         SET series=$1, next_number=$2, digits=$3, include_year=$4, yearly_reset=$5,
             sequence_year=$6, document_title=$7, document_subtitle=$8,
             updated_at=now(), updated_by=$9
         WHERE id=1
         RETURNING *`,
        [series, nextNumber, digits, includeYear, yearlyReset, sequenceYear, documentTitle, documentSubtitle, actorFrom(req)]
      );
      await pool.query(
        `UPDATE aif_stock_document_settings
         SET series=$1, next_number=$2, digits=$3, include_year=$4, yearly_reset=$5,
             sequence_year=$6, document_title=$7, document_subtitle=$8,
             updated_at=now(), updated_by=$9
         WHERE document_type='internal_transfer'`,
        [series, nextNumber, digits, includeYear, yearlyReset, sequenceYear, documentTitle, documentSubtitle, actorFrom(req)]
      );
      res.json({ ok: true, settings: aifTransferSettingsResponse(result.rows[0] || {}) });
    } catch (error) {
      console.error('AIF stock transfer document settings save failed', error);
      res.status(500).json({ error: error?.message || 'A proces-verbal számozási beállításainak mentése nem sikerült.' });
    }
  });

  router.get('/stock-transfer-documents', requireAuthed, async (req, res) => {
    try {
      await ensureAifStockTransferDocumentsSchema();
      const search = text(req.query.q || req.query.search).toLowerCase();
      const from = emptyToNull(req.query.from);
      const to = emptyToNull(req.query.to);
      const fromLocation = text(req.query.fromLocation || req.query.from_location);
      const toLocation = text(req.query.toLocation || req.query.to_location);
      const type = normCode(req.query.type || 'all');
      const page = Math.max(1, Number.parseInt(String(req.query.page || 1), 10) || 1);
      const limit = Math.min(100, Math.max(10, Number.parseInt(String(req.query.limit || 30), 10) || 30));

      const official = await pool.query(
        `SELECT id::text, transfer_id, document_number, series, sequence_number, sequence_year,
                title, subtitle, note, status, actor, owner_key, line_count, total_qty,
                from_location_summary, to_location_summary, raw, created_at, updated_at,
                document_type, source_location_id, target_location_id,
                supplier_id, supplier_name, reception_id, external_reference,
                reason_code, reason_text, operation_direction, price_basis,
                total_value, currency_code,
                COALESCE((
                  SELECT string_agg(concat_ws(' ',
                    dl.product_title, dl.brand_name, dl.category_name, dl.product_code,
                    dl.barcode, dl.color_name, dl.size, dl.from_location_name, dl.to_location_name
                  ), ' ')
                  FROM aif_stock_transfer_document_lines dl
                  WHERE dl.document_id=d.id
                ), '') AS line_search
         FROM aif_stock_transfer_documents d
         WHERE NOT EXISTS (
           SELECT 1 FROM aif_stock_transfer_document_deletions del WHERE del.transfer_id=d.transfer_id
         )
         ORDER BY created_at DESC
         LIMIT 4000`
      );

      const legacy = await pool.query(
        `SELECT
           sm.raw->>'transferId' AS transfer_id,
           min(sm.created_at) AS created_at,
           max(sm.actor) AS actor,
           max(NULLIF(sm.raw->>'title','')) AS title,
           max(NULLIF(sm.raw->>'note','')) AS note,
           count(DISTINCT COALESCE(NULLIF(sm.raw->>'lineNo',''),'1'))::int AS line_count,
           COALESCE(sum(CASE WHEN COALESCE(sm.raw->>'side','')='source' OR sm.qty_delta < 0 THEN abs(sm.qty_delta) ELSE 0 END),0)::int AS total_qty,
           round(COALESCE(sum(CASE WHEN COALESCE(sm.raw->>'side','')='source' OR sm.qty_delta < 0 THEN abs(sm.qty_delta)::numeric * COALESCE(v.sell_price,0)::numeric ELSE 0 END),0)::numeric,2) AS total_value,
           string_agg(DISTINCT NULLIF(sm.raw->>'fromLocationName',''), ' • ') AS from_location_summary,
           string_agg(DISTINCT NULLIF(sm.raw->>'toLocationName',''), ' • ') AS to_location_summary,
           string_agg(DISTINCT COALESCE(NULLIF(sm.raw->>'productTitle',''), m.title_ro, ''), ' ') AS product_search,
           string_agg(DISTINCT COALESCE(NULLIF(sm.raw->>'barcode',''), v.barcode, ''), ' ') AS barcode_search,
           string_agg(DISTINCT COALESCE(NULLIF(sm.raw->>'fromLocationId',''), ''), ',') AS from_location_ids,
           string_agg(DISTINCT COALESCE(NULLIF(sm.raw->>'toLocationId',''), ''), ',') AS to_location_ids
         FROM aif_stock_movements sm
         LEFT JOIN aif_product_variants v ON v.id=sm.variant_id
         LEFT JOIN aif_product_models m ON m.id=v.model_id
         WHERE sm.source_type='stock_transfer'
           AND COALESCE(sm.raw->>'transferId','') <> ''
           AND NOT EXISTS (
             SELECT 1 FROM aif_stock_transfer_documents d WHERE d.transfer_id=sm.raw->>'transferId'
           )
           AND NOT EXISTS (
             SELECT 1 FROM aif_stock_transfer_document_deletions del WHERE del.transfer_id=sm.raw->>'transferId'
           )
         GROUP BY sm.raw->>'transferId'
         ORDER BY min(sm.created_at) DESC
         LIMIT 4000`
      );

      const officialItems = official.rows.map((row) => ({
        ...row,
        source: 'official',
        isLegacy: false,
      }));
      const legacyItems = legacy.rows.map((row) => ({
        id: `legacy:${row.transfer_id}`,
        transfer_id: row.transfer_id,
        document_number: legacyAifTransferDocumentNumber(row.transfer_id, row.created_at),
        series: 'ARH',
        sequence_number: null,
        sequence_year: row.created_at ? new Date(row.created_at).getFullYear() : null,
        title: 'PROCES-VERBAL DE PREDARE-PRIMIRE',
        subtitle: row.title || 'Transfer intern de stoc',
        note: row.note || null,
        status: 'legacy',
        actor: row.actor || null,
        owner_key: null,
        line_count: Number(row.line_count || 0),
        total_qty: Number(row.total_qty || 0),
        from_location_summary: row.from_location_summary || null,
        to_location_summary: row.to_location_summary || null,
        raw: {
          productSearch: row.product_search || '',
          barcodeSearch: row.barcode_search || '',
          fromLocationIds: String(row.from_location_ids || '').split(',').filter(Boolean),
          toLocationIds: String(row.to_location_ids || '').split(',').filter(Boolean),
        },
        created_at: row.created_at,
        updated_at: row.created_at,
        document_type: 'internal_transfer',
        source_location_id: null,
        target_location_id: null,
        supplier_id: null,
        supplier_name: null,
        reception_id: null,
        external_reference: null,
        reason_code: null,
        reason_text: null,
        operation_direction: 'transfer',
        price_basis: 'selling_price',
        total_value: Number(row.total_value || 0),
        currency_code: 'RON',
        source: 'legacy',
        isLegacy: true,
      }));

      let items = [...officialItems, ...legacyItems];
      if (from) items = items.filter((item) => new Date(item.created_at).getTime() >= new Date(`${from}T00:00:00`).getTime());
      if (to) items = items.filter((item) => new Date(item.created_at).getTime() < new Date(`${to}T00:00:00`).getTime() + 86400000);
      const matchesDocumentParty = (item, rawValue, side) => {
        const value = text(rawValue);
        if (!value) return true;
        const supplierMode = value.startsWith('supplier:');
        const locationMode = value.startsWith('location:');
        const key = (supplierMode || locationMode ? value.slice(value.indexOf(':') + 1) : value).toLowerCase();
        if (!key) return true;
        if (supplierMode) {
          return String(item.supplier_id || '').toLowerCase() === key
            || String(item.supplier_name || '').toLowerCase().includes(key);
        }
        const directId = side === 'from' ? item.source_location_id : item.target_location_id;
        const summary = side === 'from' ? item.from_location_summary : item.to_location_summary;
        if (String(directId || '').toLowerCase() === key) return true;
        if (String(summary || '').toLowerCase().includes(key)) return true;
        const raw = item.raw && typeof item.raw === 'object' ? item.raw : {};
        const candidates = side === 'from'
          ? [raw.sourceLocationId, raw.source_location_id, raw.fromLocationId, raw.from_location_id, raw.sourceLocationName, raw.fromLocationName, raw.fromLocationIds]
          : [raw.targetLocationId, raw.target_location_id, raw.toLocationId, raw.to_location_id, raw.targetLocationName, raw.toLocationName, raw.toLocationIds];
        return JSON.stringify(candidates).toLowerCase().includes(key);
      };
      if (fromLocation) items = items.filter((item) => matchesDocumentParty(item, fromLocation, 'from'));
      if (toLocation) items = items.filter((item) => matchesDocumentParty(item, toLocation, 'to'));
      if (search) {
        items = items.filter((item) => [
          item.document_number, item.transfer_id, item.title, item.subtitle, item.note,
          item.actor, item.from_location_summary, item.to_location_summary,
          item.document_type, item.supplier_name, item.external_reference,
          item.reason_code, item.reason_text, item.line_search, JSON.stringify(item.raw || {}),
        ].join(' ').toLowerCase().includes(search));
      }
      const facetItems = items.slice();
      if (type === 'official') items = items.filter((item) => !item.isLegacy && item.status !== 'draft' && item.status !== 'preparation' && item.status !== 'cancelled');
      else if (type === 'legacy') items = items.filter((item) => item.isLegacy);
      else if (type === 'draft') items = items.filter((item) => item.status === 'draft');
      else if (type === 'preparation') items = items.filter((item) => item.status === 'preparation' || item.status === 'draft');
      else if (type === 'cancelled') items = items.filter((item) => item.status === 'cancelled');
      else {
        const requestedDocumentType = cleanAifStockDocumentType(type, null);
        if (requestedDocumentType) items = items.filter((item) => cleanAifStockDocumentType(item.document_type, 'internal_transfer') === requestedDocumentType);
      }
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const total = items.length;
      const pages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, pages);
      const pageItems = items.slice((safePage - 1) * limit, safePage * limit);
      const totals = {
        total,
        all: facetItems.length,
        official: facetItems.filter((item) => !item.isLegacy && item.status !== 'draft' && item.status !== 'preparation' && item.status !== 'cancelled').length,
        preparation: facetItems.filter((item) => item.status === 'preparation' || item.status === 'draft').length,
        draft: facetItems.filter((item) => item.status === 'draft').length,
        legacy: facetItems.filter((item) => item.isLegacy).length,
        cancelled: facetItems.filter((item) => item.status === 'cancelled').length,
        totalQty: items.reduce((sum, item) => sum + Number(item.total_qty || 0), 0),
        totalValue: Math.round((items.reduce((sum, item) => sum + Number(item.total_value || 0), 0) + Number.EPSILON) * 100) / 100,
        internalTransfer: facetItems.filter((item) => cleanAifStockDocumentType(item.document_type, 'internal_transfer') === 'internal_transfer').length,
        supplierReturn: facetItems.filter((item) => cleanAifStockDocumentType(item.document_type, null) === 'supplier_return').length,
        damagedWriteoff: facetItems.filter((item) => cleanAifStockDocumentType(item.document_type, null) === 'damaged_writeoff').length,
        stockCorrection: facetItems.filter((item) => cleanAifStockDocumentType(item.document_type, null) === 'stock_correction').length,
        currencyCode: 'RON',
      };
      const locations = await pool.query(`SELECT id::text, code, name FROM aif_locations WHERE COALESCE(is_active,true)=true ORDER BY name ASC`);
      res.json({ items: pageItems, totals, page: safePage, pages, limit, total, locations: locations.rows });
    } catch (error) {
      console.error('AIF stock transfer documents list failed', error);
      res.status(500).json({ error: 'A készletátadási bizonylatok betöltése nem sikerült.' });
    }
  });

  router.get('/stock-transfer-documents/:id', requireAuthed, async (req, res) => {
    try {
      await ensureAifStockTransferDocumentsSchema();
      const id = text(req.params.id);
      if (!id) return res.status(400).json({ error: 'document id required' });
      if (id.startsWith('legacy:')) {
        const transferId = id.slice('legacy:'.length);
        const deleted = await pool.query(
          `SELECT 1 FROM aif_stock_transfer_document_deletions WHERE transfer_id=$1 LIMIT 1`,
          [transferId]
        );
        if (deleted.rowCount) return res.status(404).json({ error: 'A készletátadási bizonylat már törölve lett.' });
        const rows = await pool.query(
          `SELECT sm.id::text, sm.created_at, sm.qty_delta, sm.qty_before, sm.qty_after, sm.actor, sm.raw,
                  v.id::text AS variant_id, v.internal_sku, v.barcode, v.size, v.color_name, v.image_url,
                  v.sell_price,
                  m.title_ro, m.model_code, b.name AS brand_name, c.name_ro AS category_name,
                  sc.supplier_product_code, sc.supplier_barcode
           FROM aif_stock_movements sm
           LEFT JOIN aif_product_variants v ON v.id=sm.variant_id
           LEFT JOIN aif_product_models m ON m.id=v.model_id
           LEFT JOIN aif_brands b ON b.id=m.brand_id
           LEFT JOIN aif_categories c ON c.id=m.category_id
           LEFT JOIN LATERAL (
             SELECT supplier_product_code, supplier_barcode
             FROM aif_variant_supplier_codes x
             WHERE x.variant_id=v.id AND COALESCE(x.is_active,true)=true
             LIMIT 1
           ) sc ON true
           WHERE sm.source_type='stock_transfer' AND sm.raw->>'transferId'=$1
           ORDER BY sm.created_at ASC, COALESCE((sm.raw->>'lineNo')::integer,1) ASC, sm.id ASC`,
          [transferId]
        );
        if (!rows.rowCount) return res.status(404).json({ error: 'A régi készletátadás nem található.' });
        const groups = new Map();
        for (const row of rows.rows) {
          const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
          const lineNo = Number(raw.lineNo || raw.line_no || 1);
          const group = groups.get(lineNo) || [];
          group.push(row);
          groups.set(lineNo, group);
        }
        const lines = Array.from(groups.entries()).sort((a,b) => a[0]-b[0]).map(([lineNo, group]) => {
          const source = group.find((row) => String(row.raw?.side || '').toLowerCase() === 'source') || group.find((row) => Number(row.qty_delta || 0) < 0) || group[0];
          const target = group.find((row) => String(row.raw?.side || '').toLowerCase() === 'target') || group.find((row) => Number(row.qty_delta || 0) > 0) || group[group.length - 1];
          const raw = { ...(target?.raw || {}), ...(source?.raw || {}) };
          return {
            id: `legacy-line:${transferId}:${lineNo}`,
            line_no: lineNo,
            variant_id: source?.variant_id || target?.variant_id || null,
            product_title: raw.productTitle || source?.title_ro || target?.title_ro || 'Produs',
            brand_name: source?.brand_name || target?.brand_name || null,
            category_name: source?.category_name || target?.category_name || null,
            product_code: source?.supplier_product_code || target?.supplier_product_code || String(source?.model_code || target?.model_code || '').split(':').pop() || source?.internal_sku || null,
            barcode: raw.barcode || source?.barcode || source?.supplier_barcode || target?.barcode || target?.supplier_barcode || null,
            color_name: source?.color_name || target?.color_name || null,
            size: source?.size || target?.size || null,
            image_url: source?.image_url || target?.image_url || null,
            from_location_id: raw.fromLocationId || null,
            from_location_name: raw.fromLocationName || source?.raw?.fromLocationName || null,
            to_location_id: raw.toLocationId || null,
            to_location_name: raw.toLocationName || target?.raw?.toLocationName || null,
            qty: Math.max(...group.map((row) => Math.abs(Number(row.qty_delta || 0))), 0),
            unit_price: toMoney(source?.sell_price ?? target?.sell_price),
            line_total: (() => {
              const q = Math.max(...group.map((row) => Math.abs(Number(row.qty_delta || 0))), 0);
              const p = toMoney(source?.sell_price ?? target?.sell_price);
              return p === null ? null : Math.round((q * p + Number.EPSILON) * 100) / 100;
            })(),
            currency_code: 'RON',
            price_basis: 'selling_price',
            qty_delta: 0,
            source_before: source?.qty_before ?? null,
            source_after: source?.qty_after ?? null,
            target_before: target?.qty_before ?? null,
            target_after: target?.qty_after ?? null,
            raw,
          };
        });
        const first = rows.rows[0];
        const firstRaw = first.raw && typeof first.raw === 'object' ? first.raw : {};
        const document = {
          id,
          transfer_id: transferId,
          document_number: legacyAifTransferDocumentNumber(transferId, first.created_at),
          title: 'PROCES-VERBAL DE PREDARE-PRIMIRE',
          subtitle: firstRaw.title || 'Transfer intern de stoc',
          note: firstRaw.note || null,
          status: 'legacy',
          actor: first.actor || null,
          line_count: lines.length,
          total_qty: lines.reduce((sum, line) => sum + Number(line.qty || 0), 0),
          from_location_summary: Array.from(new Set(lines.map((line) => line.from_location_name).filter(Boolean))).join(' • '),
          to_location_summary: Array.from(new Set(lines.map((line) => line.to_location_name).filter(Boolean))).join(' • '),
          created_at: first.created_at,
          updated_at: first.created_at,
          document_type: 'internal_transfer',
          price_basis: 'selling_price',
          currency_code: 'RON',
          total_value: Math.round((lines.reduce((sum, line) => sum + Number(line.line_total || 0), 0) + Number.EPSILON) * 100) / 100,
          operation_direction: 'transfer',
          isLegacy: true,
          source: 'legacy',
        };
        return res.json({ document, lines });
      }

      const document = await pool.query(`SELECT * FROM aif_stock_transfer_documents WHERE id::text=$1 OR transfer_id=$1 OR document_number=$1 LIMIT 1`, [id]);
      if (!document.rowCount) return res.status(404).json({ error: 'A készletátadási bizonylat nem található.' });
      const lines = await pool.query(`SELECT * FROM aif_stock_transfer_document_lines WHERE document_id=$1 ORDER BY line_no ASC`, [document.rows[0].id]);
      res.json({ document: { ...document.rows[0], isLegacy: false, source: 'official' }, lines: lines.rows });
    } catch (error) {
      console.error('AIF stock transfer document detail failed', error);
      res.status(500).json({ error: 'A készletátadási bizonylat részleteinek betöltése nem sikerült.' });
    }
  });


  router.delete('/stock-transfer-documents/:id', requireAdminOrSecret, async (req, res) => {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: 'document id required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureAifStockTransferDocumentsSchema();
      const deletedBy = actorFrom(req);

      if (id.startsWith('legacy:')) {
        const transferId = id.slice('legacy:'.length);
        const movement = await client.query(
          `SELECT min(created_at) AS created_at
           FROM aif_stock_movements
           WHERE source_type='stock_transfer' AND raw->>'transferId'=$1`,
          [transferId]
        );
        if (!movement.rows[0]?.created_at) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'A régi készletátadás nem található.' });
        }
        const documentNumber = legacyAifTransferDocumentNumber(transferId, movement.rows[0].created_at);
        await client.query(
          `INSERT INTO aif_stock_transfer_document_deletions (
             transfer_id, document_number, source, deleted_by, raw, deleted_at
           )
           VALUES ($1,$2,'legacy',$3,$4::jsonb,now())
           ON CONFLICT (transfer_id) DO UPDATE SET
             document_number=EXCLUDED.document_number,
             source='legacy',
             deleted_by=EXCLUDED.deleted_by,
             raw=EXCLUDED.raw,
             deleted_at=now()`,
          [transferId, documentNumber, deletedBy, JSON.stringify({ deletedFrom: 'product_moves_archive' })]
        );
        await client.query('COMMIT');
        return res.json({ ok: true, mode: 'permanently_deleted', source: 'legacy', transferId, documentNumber });
      }

      const document = await client.query(
        `SELECT id, transfer_id, document_number, status
         FROM aif_stock_transfer_documents
         WHERE id::text=$1 OR transfer_id=$1 OR document_number=$1
         FOR UPDATE`,
        [id]
      );
      if (!document.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'A készletátadási bizonylat nem található.' });
      }
      const item = document.rows[0];
      if (item.status === 'preparation') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Az előkészítést a készlet-visszaállító törlés gombbal kell törölni.', code: 'preparation_restore_delete_required' });
      }
      await client.query(
        `INSERT INTO aif_stock_transfer_document_deletions (
           transfer_id, document_number, source, deleted_by, raw, deleted_at
         )
         VALUES ($1,$2,'official',$3,$4::jsonb,now())
         ON CONFLICT (transfer_id) DO UPDATE SET
           document_number=EXCLUDED.document_number,
           source='official',
           deleted_by=EXCLUDED.deleted_by,
           raw=EXCLUDED.raw,
           deleted_at=now()`,
        [item.transfer_id, item.document_number, deletedBy, JSON.stringify({ documentId: item.id, deletedFrom: 'product_moves_archive' })]
      );
      await client.query(`DELETE FROM aif_stock_transfer_documents WHERE id=$1`, [item.id]);
      await client.query('COMMIT');
      return res.json({
        ok: true,
        mode: 'permanently_deleted',
        source: 'official',
        transferId: item.transfer_id,
        documentNumber: item.document_number,
      });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('AIF stock transfer document permanent delete failed', error);
      return res.status(500).json({ error: error?.message || 'A készletátadási bizonylat végleges törlése nem sikerült.' });
    } finally {
      client.release();
    }
  });

  function stockDocumentRequestHash(payload = {}) {
    const lines = (payload.lines || []).map((input = {}) => ({
      variantId: text(input.variantId || input.variant_id || input.variant || input.id),
      qty: toInt(input.qty ?? input.quantity ?? input.count),
    }));
    return createHash("sha256")
      .update(JSON.stringify({
        documentType: payload.documentType,
        sourceLocationId: payload.sourceLocationId,
        targetLocationId: payload.targetLocationId || null,
        supplierId: payload.supplierId || null,
        receptionId: payload.receptionId || null,
        reasonCode: payload.reasonCode || null,
        reasonText: payload.reasonText || null,
        operationDirection: payload.operationDirection || null,
        externalReference: payload.externalReference || null,
        note: payload.note || null,
        lines,
      }))
      .digest("hex");
  }

  async function aifStockDocumentPurchasePrice(client, variantId, receptionId, fallbackPrice) {
    if (receptionId) {
      const linked = await client.query(
        `SELECT COALESCE(rw.buy_price_ron, rw.buy_price) AS unit_price
         FROM aif_import_rows rw
         JOIN aif_import_batches b ON b.id=rw.batch_id
         WHERE rw.variant_id::text=$1
           AND b.reception_id::text=$2
           AND rw.status='committed'
           AND COALESCE(rw.buy_price_ron, rw.buy_price) IS NOT NULL
         ORDER BY COALESCE(b.committed_at,b.created_at) DESC, rw.row_no DESC, rw.id DESC
         LIMIT 1`,
        [String(variantId), String(receptionId)]
      );
      const linkedPrice = toMoney(linked.rows[0]?.unit_price);
      if (linkedPrice !== null) return linkedPrice;
    }
    return toMoney(fallbackPrice);
  }

  function stockDocumentCounterpartySummary({ documentType, supplierName, reasonText, operationDirection, targetLocationName }) {
    if (documentType === 'internal_transfer') return targetLocationName || null;
    if (documentType === 'supplier_return') return supplierName || 'Furnizor';
    if (documentType === 'damaged_writeoff') return reasonText || 'Scoatere din gestiune';
    if (documentType === 'stock_correction') return operationDirection === 'increase' ? 'Corecție pozitivă' : 'Corecție negativă';
    return null;
  }

  function aifStockDocumentDraftReference(seed = '') {
    const token = createHash('sha1')
      .update(`${seed}:${Date.now()}:${Math.random()}`)
      .digest('hex')
      .slice(0, 10)
      .toUpperCase();
    return {
      transferId: `draft:${token.toLowerCase()}`,
      documentNumber: `ELOKESZITES/${token}`,
    };
  }

  async function readAifStockDocumentVariantSnapshot(client, input, documentType, receptionId = null) {
    const variantInput = text(input?.variantId || input?.variant_id || input?.variant || input?.id || input?.barcode);
    const qty = toInt(input?.qty ?? input?.quantity ?? input?.count);
    if (!variantInput) throw Object.assign(new Error('Az előkészítés egyik sorában hiányzik a termék.'), { statusCode: 400 });
    if (qty === null || qty <= 0) throw Object.assign(new Error('Az előkészítés egyik sorában érvénytelen a mennyiség.'), { statusCode: 400 });
    const result = await client.query(
      `SELECT v.id, v.internal_sku, v.barcode, v.size, v.color_name, v.status, v.image_url,
              v.buy_price, v.sell_price,
              m.title_ro, m.model_code, b.name AS brand_name, c.name_ro AS category_name,
              sc.supplier_product_code, sc.supplier_barcode
       FROM aif_product_variants v
       JOIN aif_product_models m ON m.id=v.model_id
       LEFT JOIN aif_brands b ON b.id=m.brand_id
       LEFT JOIN aif_categories c ON c.id=m.category_id
       LEFT JOIN LATERAL (
         SELECT supplier_product_code, supplier_barcode
         FROM aif_variant_supplier_codes x
         WHERE x.variant_id=v.id AND COALESCE(x.is_active,true)=true
         ORDER BY x.updated_at DESC NULLS LAST
         LIMIT 1
       ) sc ON true
       WHERE v.id::text=$1 OR v.internal_sku=$1 OR v.barcode=$1 OR sc.supplier_barcode=$1
       LIMIT 1`,
      [variantInput]
    );
    if (!result.rowCount) throw Object.assign(new Error('Az előkészítés egyik terméke nem található.'), { statusCode: 404 });
    const variant = result.rows[0];
    if (String(variant.status || '') === 'archived') throw Object.assign(new Error(`${variant.title_ro || 'Termék'}: archivált termék nem tehető bizonylatra.`), { statusCode: 400 });
    const priceBasis = AIF_STOCK_DOCUMENT_TYPES[documentType]?.priceBasis || 'purchase_price';
    const unitPrice = priceBasis === 'selling_price'
      ? toMoney(variant.sell_price)
      : await aifStockDocumentPurchasePrice(client, variant.id, receptionId, variant.buy_price);
    const lineTotal = unitPrice === null ? null : Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100;
    return {
      variant,
      qty,
      unitPrice,
      lineTotal,
      priceBasis,
      productCode: variant.supplier_product_code || String(variant.model_code || '').split(':').pop() || variant.internal_sku || null,
      barcode: variant.barcode || variant.supplier_barcode || null,
    };
  }

  async function handleSaveStockDocumentDraft(req, res) {
    const body = req.body || {};
    const documentType = cleanAifStockDocumentType(body.documentType || body.document_type || body.type, 'internal_transfer');
    const linesInput = Array.isArray(body.lines) ? body.lines : Array.isArray(body.items) ? body.items : Array.isArray(body.rows) ? body.rows : [];
    const draftId = text(req.params.id || body.draftId || body.draft_id || body.documentId || body.document_id);
    const sourceLocationInput = text(body.sourceLocationId || body.source_location_id || body.locationId || body.location_id || body.fromLocationId || body.from_location_id);
    const targetLocationInput = text(body.targetLocationId || body.target_location_id || body.toLocationId || body.to_location_id);
    const supplierInput = text(body.supplierId || body.supplier_id || body.supplier);
    const receptionInput = text(body.receptionId || body.reception_id);
    const reasonCode = normCode(body.reasonCode || body.reason_code || body.reason);
    const reasonText = emptyToNull(body.reasonText || body.reason_text || body.reasonLabel || body.reason_label);
    const externalReference = emptyToNull(body.externalReference || body.external_reference || body.reference);
    const note = emptyToNull(body.note);
    const operationDirection = documentType === 'stock_correction'
      ? (normCode(body.operationDirection || body.operation_direction || body.correctionDirection || body.correction_direction) === 'increase' ? 'increase' : 'decrease')
      : documentType === 'internal_transfer' ? 'transfer' : 'decrease';

    try {
      await ensureAifStockTransferDocumentsSchema();
    } catch (schemaError) {
      return res.status(500).json({ error: 'Az előkészítések adatbázisának betöltése nem sikerült.', code: schemaError?.code || null });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const actor = actorFrom(req);
      const ownerKey = selectionOwnerKey(req);
      const settings = await readAifStockDocumentSettings(client, documentType, false);

      const sourceLocation = sourceLocationInput ? await findByIdOrCode(client, 'aif_locations', sourceLocationInput) : null;
      if (sourceLocationInput && (!sourceLocation || sourceLocation.is_active === false)) throw Object.assign(new Error('A forráshely érvénytelen vagy inaktív.'), { statusCode: 400 });
      const targetLocation = targetLocationInput ? await findByIdOrCode(client, 'aif_locations', targetLocationInput) : null;
      if (targetLocationInput && (!targetLocation || targetLocation.is_active === false)) throw Object.assign(new Error('A célhely érvénytelen vagy inaktív.'), { statusCode: 400 });
      const supplier = supplierInput ? await findByIdOrCode(client, 'aif_suppliers', supplierInput) : null;
      if (supplierInput && (!supplier || supplier.is_active === false)) throw Object.assign(new Error('A beszállító érvénytelen vagy inaktív.'), { statusCode: 400 });
      let reception = null;
      if (receptionInput) {
        const rec = await client.query(`SELECT id,invoice_number,supplier_id FROM aif_receptions WHERE id::text=$1 LIMIT 1`, [receptionInput]);
        reception = rec.rows[0] || null;
        if (!reception) throw Object.assign(new Error('A kapcsolt receptió nem található.'), { statusCode: 404 });
      }

      const sourceSummary = sourceLocation?.name || sourceLocation?.code || null;
      const counterpartySummary = stockDocumentCounterpartySummary({
        documentType,
        supplierName: supplier?.name,
        reasonText,
        operationDirection,
        targetLocationName: targetLocation?.name || targetLocation?.code,
      });

      let document;
      if (draftId) {
        const current = await client.query(
          `SELECT * FROM aif_stock_transfer_documents
           WHERE (id::text=$1 OR transfer_id=$1 OR document_number=$1)
           FOR UPDATE`,
          [draftId]
        );
        if (!current.rowCount) throw Object.assign(new Error('Az előkészítés nem található.'), { statusCode: 404 });
        if (current.rows[0].status !== 'draft') throw Object.assign(new Error('Csak nyitott előkészítés szerkeszthető.'), { statusCode: 400 });
        const updated = await client.query(
          `UPDATE aif_stock_transfer_documents SET
             title=$2,subtitle=$3,note=$4,actor=$5,owner_key=$6,
             from_location_summary=$7,to_location_summary=$8,
             document_type=$9,source_location_id=$10,target_location_id=$11,
             supplier_id=$12,supplier_name=$13,reception_id=$14,external_reference=$15,
             reason_code=$16,reason_text=$17,operation_direction=$18,price_basis=$19,
             raw=COALESCE(raw,'{}'::jsonb) || $20::jsonb,updated_at=now()
           WHERE id=$1 RETURNING *`,
          [
            current.rows[0].id,
            settings.documentTitle,
            settings.documentSubtitle,
            note,
            actor,
            ownerKey,
            sourceSummary,
            counterpartySummary,
            documentType,
            sourceLocation ? String(sourceLocation.id) : null,
            targetLocation ? String(targetLocation.id) : null,
            supplier ? String(supplier.id) : null,
            supplier?.name || null,
            reception ? String(reception.id) : null,
            externalReference || reception?.invoice_number || null,
            reasonCode || null,
            reasonText,
            operationDirection,
            AIF_STOCK_DOCUMENT_TYPES[documentType].priceBasis,
            JSON.stringify({ draft: true, documentType, sourceLocationId: sourceLocation?.id || null, targetLocationId: targetLocation?.id || null, supplierId: supplier?.id || null, receptionId: reception?.id || null, reasonCode, reasonText, operationDirection, externalReference }),
          ]
        );
        document = updated.rows[0];
        await client.query(`DELETE FROM aif_stock_transfer_document_lines WHERE document_id=$1`, [document.id]);
      } else {
        const ref = aifStockDocumentDraftReference(`${ownerKey}:${documentType}`);
        const inserted = await client.query(
          `INSERT INTO aif_stock_transfer_documents (
             transfer_id,document_number,series,sequence_number,sequence_year,
             title,subtitle,note,status,actor,owner_key,line_count,total_qty,
             from_location_summary,to_location_summary,raw,
             document_type,source_location_id,target_location_id,
             supplier_id,supplier_name,reception_id,external_reference,
             reason_code,reason_text,operation_direction,price_basis,
             total_value,currency_code,created_at,updated_at
           ) VALUES (
             $1,$2,'DRAFT',0,$3,$4,$5,$6,'draft',$7,$8,0,0,$9,$10,$11::jsonb,
             $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,0,'RON',now(),now()
           ) RETURNING *`,
          [
            ref.transferId,
            ref.documentNumber,
            settings.sequenceYear || new Date().getFullYear(),
            settings.documentTitle,
            settings.documentSubtitle,
            note,
            actor,
            ownerKey,
            sourceSummary,
            counterpartySummary,
            JSON.stringify({ draft: true, documentType, sourceLocationId: sourceLocation?.id || null, targetLocationId: targetLocation?.id || null, supplierId: supplier?.id || null, receptionId: reception?.id || null, reasonCode, reasonText, operationDirection, externalReference }),
            documentType,
            sourceLocation ? String(sourceLocation.id) : null,
            targetLocation ? String(targetLocation.id) : null,
            supplier ? String(supplier.id) : null,
            supplier?.name || null,
            reception ? String(reception.id) : null,
            externalReference || reception?.invoice_number || null,
            reasonCode || null,
            reasonText,
            operationDirection,
            AIF_STOCK_DOCUMENT_TYPES[documentType].priceBasis,
          ]
        );
        document = inserted.rows[0];
      }

      let totalQty = 0;
      let totalValue = 0;
      for (let index = 0; index < linesInput.length; index += 1) {
        const snapshot = await readAifStockDocumentVariantSnapshot(client, linesInput[index], documentType, reception?.id || null);
        const lineTargetName = documentType === 'internal_transfer' ? (targetLocation?.name || targetLocation?.code || null) : counterpartySummary;
        const raw = {
          draft: true,
          documentType,
          lineNo: index + 1,
          productTitle: snapshot.variant.title_ro,
          productCode: snapshot.productCode,
          barcode: snapshot.barcode,
          sourceLocationId: sourceLocation ? String(sourceLocation.id) : null,
          sourceLocationName: sourceSummary,
          targetLocationId: targetLocation ? String(targetLocation.id) : null,
          targetLocationName: lineTargetName,
          supplierId: supplier ? String(supplier.id) : null,
          supplierName: supplier?.name || null,
          receptionId: reception ? String(reception.id) : null,
          reasonCode,
          reasonText,
          operationDirection,
          qty: snapshot.qty,
          unitPrice: snapshot.unitPrice,
          lineTotal: snapshot.lineTotal,
          priceBasis: snapshot.priceBasis,
          currencyCode: 'RON',
        };
        await client.query(
          `INSERT INTO aif_stock_transfer_document_lines (
             document_id,line_no,variant_id,product_title,brand_name,category_name,
             product_code,barcode,color_name,size,image_url,
             from_location_id,from_location_name,to_location_id,to_location_name,
             qty,unit_price,line_total,currency_code,price_basis,qty_delta,
             source_before,source_after,target_before,target_after,raw
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
             $16,$17,$18,'RON',$19,0,NULL,NULL,NULL,NULL,$20::jsonb
           )`,
          [
            document.id,
            index + 1,
            String(snapshot.variant.id),
            snapshot.variant.title_ro,
            snapshot.variant.brand_name,
            snapshot.variant.category_name,
            snapshot.productCode,
            snapshot.barcode,
            snapshot.variant.color_name,
            snapshot.variant.size,
            snapshot.variant.image_url,
            sourceLocation ? String(sourceLocation.id) : null,
            sourceSummary,
            targetLocation ? String(targetLocation.id) : null,
            lineTargetName,
            snapshot.qty,
            snapshot.unitPrice,
            snapshot.lineTotal,
            snapshot.priceBasis,
            JSON.stringify(raw),
          ]
        );
        totalQty += snapshot.qty;
        totalValue += snapshot.lineTotal || 0;
      }
      totalValue = Math.round((totalValue + Number.EPSILON) * 100) / 100;
      const updated = await client.query(
        `UPDATE aif_stock_transfer_documents
         SET line_count=$2,total_qty=$3,total_value=$4,currency_code='RON',updated_at=now()
         WHERE id=$1 RETURNING *`,
        [document.id, linesInput.length, totalQty, totalValue]
      );
      document = updated.rows[0] || document;
      await client.query('COMMIT');
      return res.json({
        ok: true,
        mode: draftId ? 'draft_updated' : 'draft_created',
        documentId: String(document.id),
        documentNumber: document.document_number,
        documentType,
        status: 'draft',
        lineCount: linesInput.length,
        totalQty,
        totalValue,
        currencyCode: 'RON',
        document,
      });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('AIF save stock document draft failed', error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || 'Az előkészítés mentése nem sikerült.', code: error?.code || null });
    } finally {
      client.release();
    }
  }

  router.post('/stock-documents/draft', requireAuthed, handleSaveStockDocumentDraft);
  router.put('/stock-documents/:id/draft', requireAuthed, handleSaveStockDocumentDraft);
  router.patch('/stock-documents/:id/draft', requireAuthed, handleSaveStockDocumentDraft);

  router.delete('/stock-documents/:id/draft', requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: 'Előkészítés azonosító szükséges.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT id,document_number,status
         FROM aif_stock_transfer_documents
         WHERE id::text=$1 OR transfer_id=$1 OR document_number=$1
         FOR UPDATE`,
        [id]
      );
      if (!current.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Az előkészítés nem található.' });
      }
      if (current.rows[0].status !== 'draft') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Ezen a végponton csak készletet még nem módosító előkészítés törölhető.' });
      }
      await client.query(`DELETE FROM aif_stock_transfer_documents WHERE id=$1`, [current.rows[0].id]);
      await client.query('COMMIT');
      return res.json({ ok: true, mode: 'draft_deleted', item: current.rows[0] });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('AIF delete stock document draft failed', error);
      return res.status(500).json({ error: error?.message || 'Az előkészítés törlése nem sikerült.' });
    } finally {
      client.release();
    }
  });

  async function handleCreateStockDocument(req, res) {
    const body = req.body || {};
    const documentType = cleanAifStockDocumentType(body.documentType || body.document_type || body.type, null);
    if (!documentType) return res.status(400).json({ error: 'Válassz érvényes készletbizonylat-típust.' });

    const linesInput = Array.isArray(body.lines)
      ? body.lines
      : Array.isArray(body.items)
        ? body.items
        : Array.isArray(body.rows)
          ? body.rows
          : [];
    if (!linesInput.length) return res.status(400).json({ error: 'Nincs terméksor a bizonylaton.' });

    const sourceLocationInput = text(body.sourceLocationId || body.source_location_id || body.locationId || body.location_id || body.fromLocationId || body.from_location_id);
    const targetLocationInput = text(body.targetLocationId || body.target_location_id || body.toLocationId || body.to_location_id);
    const supplierInput = text(body.supplierId || body.supplier_id || body.supplier);
    const receptionInput = text(body.receptionId || body.reception_id);
    const reasonCode = normCode(body.reasonCode || body.reason_code || body.reason);
    const reasonText = emptyToNull(body.reasonText || body.reason_text || body.reasonLabel || body.reason_label);
    const note = emptyToNull(body.note);
    const externalReference = emptyToNull(body.externalReference || body.external_reference || body.reference);
    const operationDirection = documentType === 'stock_correction'
      ? (normCode(body.operationDirection || body.operation_direction || body.correctionDirection || body.correction_direction) === 'increase' ? 'increase' : 'decrease')
      : documentType === 'internal_transfer'
        ? 'transfer'
        : 'decrease';
    const idempotencyKey = text(req.get('Idempotency-Key') || body.idempotencyKey || body.idempotency_key).slice(0, 200);

    if (!sourceLocationInput) return res.status(400).json({ error: 'A forráshely / érintett készlethely kötelező.' });
    if (documentType === 'internal_transfer' && !targetLocationInput) return res.status(400).json({ error: 'A célhely kötelező.' });
    if (documentType === 'supplier_return' && !supplierInput) return res.status(400).json({ error: 'A beszállító kiválasztása kötelező.' });
    if (documentType !== 'internal_transfer' && !reasonCode) return res.status(400).json({ error: 'A művelet oka kötelező.' });
    if (reasonCode === 'other' && !reasonText) return res.status(400).json({ error: 'Az Egyéb ok rövid leírása kötelező.' });

    try {
      await ensureAifStockTransferDocumentsSchema();
      if (idempotencyKey) await ensureAifStockTransferIdempotencySchema();
    } catch (schemaError) {
      console.error('AIF stock document schema failed', schemaError);
      return res.status(500).json({ error: 'A készletbizonylatok előkészítése nem sikerült.', code: schemaError?.code || null });
    }

    const actor = actorFrom(req);
    const ownerKey = selectionOwnerKey(req);
    const requestPayload = {
      documentType,
      sourceLocationId: sourceLocationInput,
      targetLocationId: targetLocationInput,
      supplierId: supplierInput,
      receptionId: receptionInput,
      reasonCode,
      reasonText,
      operationDirection,
      externalReference,
      note,
      lines: linesInput,
    };
    const requestHash = idempotencyKey ? stockDocumentRequestHash(requestPayload) : null;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      try { await client.query("SELECT set_config('aif.actor', $1, true)", [actor]); } catch {}

      if (idempotencyKey) {
        const claim = await client.query(
          `INSERT INTO aif_stock_transfer_requests (
             owner_key, idempotency_key, request_hash, status, created_at, updated_at
           ) VALUES ($1,$2,$3,'processing',now(),now())
           ON CONFLICT (owner_key,idempotency_key) DO NOTHING
           RETURNING owner_key`,
          [ownerKey, idempotencyKey, requestHash]
        );
        if (!claim.rowCount) {
          const existing = await client.query(
            `SELECT request_hash,status,transfer_id,response
             FROM aif_stock_transfer_requests
             WHERE owner_key=$1 AND idempotency_key=$2
             FOR UPDATE`,
            [ownerKey, idempotencyKey]
          );
          const saved = existing.rows[0];
          if (!saved) throw Object.assign(new Error('Az ismétlésvédelmi rekord nem található.'), { statusCode: 409 });
          if (text(saved.request_hash) !== text(requestHash)) throw Object.assign(new Error('Ezt az ismétlésvédelmi kulcsot már másik művelethez használták.'), { statusCode: 409 });
          if (saved.status === 'completed' && saved.response) {
            await client.query('COMMIT');
            return res.json({ ...(saved.response || {}), ok: true, duplicate: true, idempotencyKey });
          }
          throw Object.assign(new Error('Ez a bizonylat már feldolgozás alatt van.'), { statusCode: 409 });
        }
      }

      const sourceLocation = await findByIdOrCode(client, 'aif_locations', sourceLocationInput);
      if (!sourceLocation || sourceLocation.is_active === false) throw Object.assign(new Error('A forráshely érvénytelen vagy inaktív.'), { statusCode: 400 });

      let targetLocation = null;
      if (documentType === 'internal_transfer') {
        targetLocation = await findByIdOrCode(client, 'aif_locations', targetLocationInput);
        if (!targetLocation || targetLocation.is_active === false) throw Object.assign(new Error('A célhely érvénytelen vagy inaktív.'), { statusCode: 400 });
        if (String(targetLocation.id) === String(sourceLocation.id)) throw Object.assign(new Error('A forrás és a cél nem lehet ugyanaz.'), { statusCode: 400 });
      }

      let supplier = null;
      if (documentType === 'supplier_return') {
        supplier = await findByIdOrCode(client, 'aif_suppliers', supplierInput);
        if (!supplier || supplier.is_active === false) throw Object.assign(new Error('A beszállító érvénytelen vagy inaktív.'), { statusCode: 400 });
      }

      let reception = null;
      if (receptionInput) {
        const receptionResult = await client.query(
          `SELECT r.id, r.invoice_number, r.supplier_id, s.name AS supplier_name
           FROM aif_receptions r
           LEFT JOIN aif_suppliers s ON s.id=r.supplier_id
           WHERE r.id::text=$1
           LIMIT 1`,
          [receptionInput]
        );
        reception = receptionResult.rows[0] || null;
        if (!reception) throw Object.assign(new Error('A kapcsolt receptió nem található.'), { statusCode: 404 });
        if (supplier && reception.supplier_id && String(reception.supplier_id) !== String(supplier.id)) {
          throw Object.assign(new Error('A kiválasztott receptió másik beszállítóhoz tartozik.'), { statusCode: 400 });
        }
      }

      const sequence = await allocateAifStockDocumentNumber(client, documentType);
      const operationId = stockMovementSourceId(`doc_${documentType}`, 'document', sourceLocation.id);
      const sourceSummary = sourceLocation.name || sourceLocation.code;
      const counterpartySummary = stockDocumentCounterpartySummary({
        documentType,
        supplierName: supplier?.name,
        reasonText,
        operationDirection,
        targetLocationName: targetLocation?.name || targetLocation?.code,
      });
      const insertedDocument = await client.query(
        `INSERT INTO aif_stock_transfer_documents (
           transfer_id, document_number, series, sequence_number, sequence_year,
           title, subtitle, note, status, actor, owner_key, line_count, total_qty,
           from_location_summary, to_location_summary, raw,
           document_type, source_location_id, target_location_id,
           supplier_id, supplier_name, reception_id, external_reference,
           reason_code, reason_text, operation_direction, price_basis,
           total_value, currency_code, created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,'issued',$9,$10,0,0,$11,$12,$13::jsonb,
           $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,0,'RON',now(),now()
         )
         RETURNING *`,
        [
          operationId,
          sequence.documentNumber,
          sequence.series,
          sequence.sequenceNumber,
          sequence.sequenceYear,
          sequence.title,
          sequence.subtitle,
          note,
          actor,
          ownerKey,
          sourceSummary,
          counterpartySummary,
          JSON.stringify({
            source: 'stock_document',
            documentType,
            idempotencyKey: idempotencyKey || null,
            supplierId: supplier?.id || null,
            supplierName: supplier?.name || null,
            receptionId: reception?.id || null,
            receptionInvoiceNumber: reception?.invoice_number || null,
            reasonCode,
            reasonText,
            operationDirection,
            externalReference,
          }),
          documentType,
          String(sourceLocation.id),
          targetLocation ? String(targetLocation.id) : null,
          supplier ? String(supplier.id) : null,
          supplier?.name || null,
          reception ? String(reception.id) : null,
          externalReference || reception?.invoice_number || null,
          reasonCode || null,
          reasonText,
          operationDirection,
          sequence.priceBasis,
        ]
      );
      let document = insertedDocument.rows[0];
      const completedLines = [];
      let totalQty = 0;
      let totalValue = 0;
      let movementCount = 0;

      for (let index = 0; index < linesInput.length; index += 1) {
        const input = linesInput[index] || {};
        const variantInput = text(input.variantId || input.variant_id || input.variant || input.id || input.barcode);
        const quantity = toInt(input.qty ?? input.quantity ?? input.count);
        if (!variantInput) throw Object.assign(new Error(`A(z) ${index + 1}. sorban hiányzik a termék.`), { statusCode: 400 });
        if (quantity === null || quantity <= 0) throw Object.assign(new Error(`A(z) ${index + 1}. sor mennyisége érvénytelen.`), { statusCode: 400 });

        const variantResult = await client.query(
          `SELECT v.id, v.internal_sku, v.barcode, v.size, v.color_name, v.status, v.image_url,
                  v.buy_price, v.sell_price,
                  m.title_ro, m.model_code, b.name AS brand_name, c.name_ro AS category_name,
                  sc.supplier_product_code, sc.supplier_barcode
           FROM aif_product_variants v
           JOIN aif_product_models m ON m.id=v.model_id
           LEFT JOIN aif_brands b ON b.id=m.brand_id
           LEFT JOIN aif_categories c ON c.id=m.category_id
           LEFT JOIN LATERAL (
             SELECT supplier_product_code, supplier_barcode
             FROM aif_variant_supplier_codes x
             WHERE x.variant_id=v.id AND COALESCE(x.is_active,true)=true
             ORDER BY x.updated_at DESC NULLS LAST
             LIMIT 1
           ) sc ON true
           WHERE v.id::text=$1 OR v.internal_sku=$1 OR v.barcode=$1 OR sc.supplier_barcode=$1
           FOR UPDATE OF v`,
          [variantInput]
        );
        if (!variantResult.rowCount) throw Object.assign(new Error(`A(z) ${index + 1}. sor terméke nem található.`), { statusCode: 404 });
        const variant = variantResult.rows[0];
        if (String(variant.status || '') === 'archived') throw Object.assign(new Error(`${variant.title_ro || 'Termék'}: archivált termék nem módosítható.`), { statusCode: 400 });

        const currentSource = await client.query(
          `SELECT qty,reserved_qty FROM aif_stock WHERE location_id=$1 AND variant_id=$2 FOR UPDATE`,
          [sourceLocation.id, variant.id]
        );
        const sourceBefore = currentSource.rowCount ? Number(currentSource.rows[0].qty || 0) : 0;
        const sourceReserved = currentSource.rowCount ? Number(currentSource.rows[0].reserved_qty || 0) : 0;
        const outgoing = documentType !== 'stock_correction' || operationDirection === 'decrease';
        if (outgoing && !currentSource.rowCount) throw Object.assign(new Error(`${variant.title_ro || 'Termék'}: nincs készlet a kiválasztott helyen.`), { statusCode: 400 });
        const sourceAvailable = Math.max(0, sourceBefore - sourceReserved);
        if (outgoing && quantity > sourceAvailable) throw Object.assign(new Error(`${variant.title_ro || 'Termék'}: csak ${sourceAvailable} db szabad készlet áll rendelkezésre.`), { statusCode: 400 });

        let sourceAfter = sourceBefore;
        let targetBefore = null;
        let targetAfter = null;
        let quantityDelta = 0;
        if (documentType === 'internal_transfer') {
          sourceAfter = sourceBefore - quantity;
          const currentTarget = await client.query(
            `SELECT qty,reserved_qty FROM aif_stock WHERE location_id=$1 AND variant_id=$2 FOR UPDATE`,
            [targetLocation.id, variant.id]
          );
          targetBefore = currentTarget.rowCount ? Number(currentTarget.rows[0].qty || 0) : 0;
          const targetReserved = currentTarget.rowCount ? Number(currentTarget.rows[0].reserved_qty || 0) : 0;
          targetAfter = targetBefore + quantity;
          await client.query(
            `UPDATE aif_stock SET qty=$3,reserved_qty=$4,updated_at=now() WHERE location_id=$1 AND variant_id=$2`,
            [sourceLocation.id, variant.id, sourceAfter, sourceReserved]
          );
          await client.query(
            `INSERT INTO aif_stock (location_id,variant_id,qty,reserved_qty,updated_at)
             VALUES ($1,$2,$3,$4,now())
             ON CONFLICT (location_id,variant_id) DO UPDATE SET qty=$3,reserved_qty=$4,updated_at=now()`,
            [targetLocation.id, variant.id, targetAfter, targetReserved]
          );
        } else {
          quantityDelta = operationDirection === 'increase' ? quantity : -quantity;
          sourceAfter = sourceBefore + quantityDelta;
          if (sourceAfter < sourceReserved) throw Object.assign(new Error(`${variant.title_ro || 'Termék'}: a korrekció a foglalt készlet alá vinné az állományt.`), { statusCode: 400 });
          await client.query(
            `INSERT INTO aif_stock (location_id,variant_id,qty,reserved_qty,updated_at)
             VALUES ($1,$2,$3,$4,now())
             ON CONFLICT (location_id,variant_id) DO UPDATE SET qty=$3,reserved_qty=$4,updated_at=now()`,
            [sourceLocation.id, variant.id, sourceAfter, sourceReserved]
          );
        }

        const priceBasis = sequence.priceBasis;
        const unitPrice = priceBasis === 'selling_price'
          ? toMoney(variant.sell_price)
          : await aifStockDocumentPurchasePrice(client, variant.id, reception?.id || null, variant.buy_price);
        const lineTotal = unitPrice === null ? null : Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100;
        const productCode = variant.supplier_product_code || String(variant.model_code || '').split(':').pop() || variant.internal_sku || null;
        const displayBarcode = variant.barcode || variant.supplier_barcode || null;
        const lineTargetName = documentType === 'internal_transfer'
          ? (targetLocation.name || targetLocation.code)
          : counterpartySummary;
        const rawBase = {
          reason: documentType,
          reasonCode,
          reasonText,
          documentType,
          documentId: document.id,
          documentNumber: document.document_number,
          documentTitle: document.title,
          documentOperationId: operationId,
          transferId: documentType === 'internal_transfer' ? operationId : null,
          idempotencyKey: idempotencyKey || null,
          lineNo: index + 1,
          note,
          productTitle: variant.title_ro,
          productCode,
          barcode: displayBarcode,
          sourceLocationId: String(sourceLocation.id),
          sourceLocationName: sourceSummary,
          fromLocationId: String(sourceLocation.id),
          fromLocationName: sourceSummary,
          targetLocationId: targetLocation ? String(targetLocation.id) : null,
          targetLocationName: lineTargetName,
          toLocationId: targetLocation ? String(targetLocation.id) : null,
          toLocationName: lineTargetName,
          supplierId: supplier ? String(supplier.id) : null,
          supplierName: supplier?.name || null,
          receptionId: reception ? String(reception.id) : null,
          externalReference: externalReference || reception?.invoice_number || null,
          operationDirection,
          qty: quantity,
          qtyDelta: documentType === 'internal_transfer' ? 0 : quantityDelta,
          unitPrice,
          lineTotal,
          priceBasis,
          currencyCode: 'RON',
        };

        if (documentType === 'internal_transfer') {
          if (await insertStockMovementSafe(client, {
            movementType: 'manual_adjustment',
            sourceType: 'stock_transfer',
            sourcePrefix: 'transfer_out',
            locationId: sourceLocation.id,
            variantId: variant.id,
            qtyDelta: -quantity,
            qtyBefore: sourceBefore,
            qtyAfter: sourceAfter,
            actor,
            raw: { ...rawBase, direction: 'out', side: 'source' },
          })) movementCount += 1;
          if (await insertStockMovementSafe(client, {
            movementType: 'incoming',
            sourceType: 'stock_transfer',
            sourcePrefix: 'transfer_in',
            locationId: targetLocation.id,
            variantId: variant.id,
            qtyDelta: quantity,
            qtyBefore: targetBefore,
            qtyAfter: targetAfter,
            actor,
            raw: { ...rawBase, direction: 'in', side: 'target' },
          })) movementCount += 1;
        } else {
          const sourceType = documentType;
          if (await insertStockMovementSafe(client, {
            movementType: quantityDelta > 0 ? 'incoming' : 'manual_adjustment',
            sourceType,
            sourcePrefix: sourceType,
            locationId: sourceLocation.id,
            variantId: variant.id,
            qtyDelta: quantityDelta,
            qtyBefore: sourceBefore,
            qtyAfter: sourceAfter,
            actor,
            raw: { ...rawBase, direction: quantityDelta > 0 ? 'in' : 'out', side: 'source' },
          })) movementCount += 1;
        }

        await client.query(
          `INSERT INTO aif_stock_transfer_document_lines (
             document_id,line_no,variant_id,product_title,brand_name,category_name,
             product_code,barcode,color_name,size,image_url,
             from_location_id,from_location_name,to_location_id,to_location_name,
             qty,unit_price,line_total,currency_code,price_basis,qty_delta,
             source_before,source_after,target_before,target_after,raw
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
             $16,$17,$18,'RON',$19,$20,$21,$22,$23,$24,$25::jsonb
           )`,
          [
            document.id,
            index + 1,
            String(variant.id),
            variant.title_ro,
            variant.brand_name,
            variant.category_name,
            productCode,
            displayBarcode,
            variant.color_name,
            variant.size,
            variant.image_url,
            String(sourceLocation.id),
            sourceSummary,
            targetLocation ? String(targetLocation.id) : null,
            lineTargetName,
            quantity,
            unitPrice,
            lineTotal,
            priceBasis,
            documentType === 'internal_transfer' ? 0 : quantityDelta,
            sourceBefore,
            sourceAfter,
            targetBefore,
            targetAfter,
            JSON.stringify(rawBase),
          ]
        );

        totalQty += quantity;
        totalValue += lineTotal || 0;
        completedLines.push({
          variantId: String(variant.id),
          title: variant.title_ro,
          brandName: variant.brand_name,
          categoryName: variant.category_name,
          productCode,
          barcode: displayBarcode,
          colorName: variant.color_name,
          size: variant.size,
          imageUrl: variant.image_url,
          qty: quantity,
          qtyDelta: documentType === 'internal_transfer' ? 0 : quantityDelta,
          unitPrice,
          lineTotal,
          currencyCode: 'RON',
          priceBasis,
          sourceBefore,
          sourceAfter,
          targetBefore,
          targetAfter,
        });
      }

      totalValue = Math.round((totalValue + Number.EPSILON) * 100) / 100;
      const updated = await client.query(
        `UPDATE aif_stock_transfer_documents
         SET line_count=$2,total_qty=$3,total_value=$4,currency_code='RON',
             raw=COALESCE(raw,'{}'::jsonb) || $5::jsonb,updated_at=now()
         WHERE id=$1
         RETURNING *`,
        [
          document.id,
          completedLines.length,
          totalQty,
          totalValue,
          JSON.stringify({
            documentType,
            sourceLocationId: String(sourceLocation.id),
            targetLocationId: targetLocation ? String(targetLocation.id) : null,
            supplierId: supplier ? String(supplier.id) : null,
            supplierName: supplier?.name || null,
            receptionId: reception ? String(reception.id) : null,
            receptionInvoiceNumber: reception?.invoice_number || null,
            reasonCode,
            reasonText,
            operationDirection,
            externalReference,
            priceBasis: sequence.priceBasis,
            totalValue,
            currencyCode: 'RON',
            items: completedLines,
          }),
        ]
      );
      document = updated.rows[0] || document;

      const responsePayload = {
        ok: true,
        duplicate: false,
        idempotencyKey: idempotencyKey || null,
        documentId: String(document.id),
        documentNumber: document.document_number,
        documentType,
        operationId,
        lineCount: completedLines.length,
        totalQty,
        totalValue,
        currencyCode: 'RON',
        movementCount,
        document,
        items: completedLines,
      };
      if (idempotencyKey) {
        await client.query(
          `UPDATE aif_stock_transfer_requests
           SET status='completed',transfer_id=$3,response=$4::jsonb,updated_at=now()
           WHERE owner_key=$1 AND idempotency_key=$2`,
          [ownerKey, idempotencyKey, operationId, JSON.stringify(responsePayload)]
        );
      }
      await client.query('COMMIT');
      res.json(responsePayload);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('AIF create stock document failed', error);
      const status = Number(error?.statusCode || 500);
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || 'A készletbizonylat mentése nem sikerült.', code: error?.code || null });
    } finally {
      client.release();
    }
  }

  router.post('/stock-documents', requireAuthed, handleCreateStockDocument);
  router.post('/stock/documents', requireAuthed, handleCreateStockDocument);

  function stockTransferRequestHash(rowsInput, title, note) {
    const lines = (rowsInput || []).map((input = {}) => ({
      variantId: text(input.variantId || input.variant_id || input.variant || input.id),
      fromLocationId: text(input.fromLocationId || input.from_location_id || input.fromLocationCode || input.from_location_code || input.from || input.sourceLocationId || input.source_location_id),
      toLocationId: text(input.toLocationId || input.to_location_id || input.toLocationCode || input.to_location_code || input.to || input.targetLocationId || input.target_location_id),
      qty: toInt(input.qty ?? input.quantity ?? input.count),
    }));
    return createHash("sha256")
      .update(JSON.stringify({ title: title || null, note: note || null, lines }))
      .digest("hex");
  }

  function aifPreparationLineKey(variantId, fromLocationId, toLocationId) {
    return [variantId, fromLocationId, toLocationId].map((value) => text(value)).join('|');
  }

  function aifPreparationMovementGroupId(documentId, lineNo) {
    return `prep:${text(documentId).slice(0, 8)}:${Number(lineNo || 0)}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  }

  async function readAifTransferVariantSnapshot(client, variantInput) {
    const key = text(variantInput);
    if (!key) throw Object.assign(new Error('Hiányzik a termék azonosítója.'), { statusCode: 400 });
    const variant = await client.query(
      `SELECT v.id, v.internal_sku, v.barcode, v.size, v.color_name, v.status, v.image_url,
              v.buy_price, v.sell_price,
              m.title_ro, m.model_code, b.name AS brand_name, c.name_ro AS category_name,
              sc.supplier_product_code, sc.supplier_barcode
       FROM aif_product_variants v
       JOIN aif_product_models m ON m.id=v.model_id
       LEFT JOIN aif_brands b ON b.id=m.brand_id
       LEFT JOIN aif_categories c ON c.id=m.category_id
       LEFT JOIN LATERAL (
         SELECT supplier_product_code, supplier_barcode
         FROM aif_variant_supplier_codes x
         WHERE x.variant_id=v.id AND COALESCE(x.is_active,true)=true
         ORDER BY x.updated_at DESC NULLS LAST, x.created_at DESC NULLS LAST
         LIMIT 1
       ) sc ON true
       WHERE v.id::text=$1 OR v.internal_sku=$1 OR v.barcode=$1 OR sc.supplier_barcode=$1
       FOR UPDATE OF v`,
      [key]
    );
    if (!variant.rowCount) throw Object.assign(new Error('A termék nem található.'), { statusCode: 404 });
    const row = variant.rows[0];
    if (String(row.status || '') === 'archived') {
      throw Object.assign(new Error(`${row.title_ro || 'Termék'}: archivált termék nem mozgatható.`), { statusCode: 400 });
    }
    return row;
  }

  async function readAifPreparationLocation(client, value, roleLabel) {
    const location = await findByIdOrCode(client, 'aif_locations', value);
    if (!location || location.is_active === false) {
      throw Object.assign(new Error(`Érvénytelen vagy inaktív ${roleLabel}: ${text(value) || '-'}`), { statusCode: 400 });
    }
    return location;
  }

  async function readAifPreparationStockPair(client, variantId, firstLocationId, secondLocationId) {
    const ids = Array.from(new Set([String(firstLocationId), String(secondLocationId)]));
    const rows = await client.query(
      `SELECT location_id::text AS location_id, qty, reserved_qty
       FROM aif_stock
       WHERE variant_id=$1 AND location_id = ANY($2::uuid[])
       FOR UPDATE`,
      [variantId, ids]
    );
    return new Map(rows.rows.map((row) => [String(row.location_id), row]));
  }

  async function applyAifPreparationStockDelta(client, {
    document,
    lineNo,
    variant,
    routeFrom,
    routeTo,
    qtyDelta,
    actor,
    note = null,
    title = null,
    reason = 'preparation_adjustment',
  }) {
    const delta = Number(qtyDelta || 0);
    if (!Number.isFinite(delta) || delta === 0) {
      const current = await readAifPreparationStockPair(client, variant.id, routeFrom.id, routeTo.id);
      return {
        movementRows: 0,
        routeFromAfter: Number(current.get(String(routeFrom.id))?.qty || 0),
        routeToAfter: Number(current.get(String(routeTo.id))?.qty || 0),
      };
    }

    const quantity = Math.abs(Math.trunc(delta));
    if (quantity <= 0) throw Object.assign(new Error('Érvénytelen előkészítési mennyiség.'), { statusCode: 400 });
    const forward = delta > 0;
    const actualFrom = forward ? routeFrom : routeTo;
    const actualTo = forward ? routeTo : routeFrom;
    const stockMap = await readAifPreparationStockPair(client, variant.id, actualFrom.id, actualTo.id);
    const sourceRow = stockMap.get(String(actualFrom.id));
    const targetRow = stockMap.get(String(actualTo.id));
    const sourceBefore = Number(sourceRow?.qty || 0);
    const sourceReserved = Number(sourceRow?.reserved_qty || 0);
    const sourceAvailable = sourceBefore - sourceReserved;
    if (quantity > sourceAvailable) {
      const action = forward ? 'további mozgatáshoz' : 'visszaállításhoz';
      throw Object.assign(new Error(`${variant.title_ro || 'Termék'}: ${actualFrom.name || actualFrom.code} helyen csak ${Math.max(0, sourceAvailable)} db szabad készlet van a(z) ${action}.`), {
        statusCode: 400,
        code: forward ? 'preparation_source_stock_insufficient' : 'preparation_restore_stock_insufficient',
      });
    }
    const sourceAfter = sourceBefore - quantity;
    const targetBefore = Number(targetRow?.qty || 0);
    const targetReserved = Number(targetRow?.reserved_qty || 0);
    const targetAfter = targetBefore + quantity;

    await client.query(
      `UPDATE aif_stock
       SET qty=$3, reserved_qty=$4, updated_at=now()
       WHERE location_id=$1 AND variant_id=$2`,
      [actualFrom.id, variant.id, sourceAfter, sourceReserved]
    );
    await client.query(
      `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (location_id, variant_id)
       DO UPDATE SET qty=$3, reserved_qty=$4, updated_at=now()`,
      [actualTo.id, variant.id, targetAfter, targetReserved]
    );

    const movementGroupId = aifPreparationMovementGroupId(document.id, lineNo);
    const rawBase = {
      reason: 'stock_transfer',
      preparationReason: reason,
      preparation: true,
      preparationAdjustment: true,
      preparationDirection: forward ? 'forward' : 'reverse',
      documentType: 'internal_transfer',
      priceBasis: 'selling_price',
      transferId: document.transfer_id,
      documentId: String(document.id),
      documentNumber: document.document_number,
      documentStatus: 'preparation',
      movementGroupId,
      lineNo,
      note,
      title,
      productTitle: variant.title_ro,
      barcode: variant.barcode || variant.supplier_barcode || null,
      originalFromLocationId: String(routeFrom.id),
      originalFromLocationName: routeFrom.name || routeFrom.code,
      originalToLocationId: String(routeTo.id),
      originalToLocationName: routeTo.name || routeTo.code,
      fromLocationId: String(actualFrom.id),
      fromLocationCode: actualFrom.code,
      fromLocationName: actualFrom.name,
      toLocationId: String(actualTo.id),
      toLocationCode: actualTo.code,
      toLocationName: actualTo.name,
      qty: quantity,
    };

    let movementRows = 0;
    if (await insertStockMovementSafe(client, {
      movementType: 'manual_adjustment',
      sourceType: 'stock_transfer',
      sourcePrefix: forward ? 'prep_out' : 'prep_back',
      fallbackSourceType: 'manual_stock_edit',
      locationId: actualFrom.id,
      variantId: variant.id,
      qtyDelta: -quantity,
      qtyBefore: sourceBefore,
      qtyAfter: sourceAfter,
      actor,
      raw: { ...rawBase, direction: 'out', side: 'source' },
    })) movementRows += 1;

    if (await insertStockMovementSafe(client, {
      movementType: 'incoming',
      sourceType: 'stock_transfer',
      sourcePrefix: forward ? 'prep_in' : 'prep_restore',
      fallbackSourceType: 'manual_stock_edit',
      locationId: actualTo.id,
      variantId: variant.id,
      qtyDelta: quantity,
      qtyBefore: targetBefore,
      qtyAfter: targetAfter,
      actor,
      raw: { ...rawBase, direction: 'in', side: 'target' },
    })) movementRows += 1;

    const currentRoute = await readAifPreparationStockPair(client, variant.id, routeFrom.id, routeTo.id);
    return {
      movementRows,
      sourceBefore,
      sourceAfter,
      targetBefore,
      targetAfter,
      routeFromAfter: Number(currentRoute.get(String(routeFrom.id))?.qty || 0),
      routeToAfter: Number(currentRoute.get(String(routeTo.id))?.qty || 0),
    };
  }


  async function applyAifDamagedPreparationStockDelta(client, {
    document,
    lineNo,
    variant,
    sourceLocation,
    qtyDelta,
    actor,
    note = null,
    title = null,
    reason = 'damaged_preparation_adjustment',
  }) {
    const delta = Number(qtyDelta || 0);
    const current = await client.query(
      `SELECT qty,reserved_qty
       FROM aif_stock
       WHERE location_id=$1 AND variant_id=$2
       FOR UPDATE`,
      [sourceLocation.id, variant.id]
    );
    const before = Number(current.rows[0]?.qty || 0);
    const reserved = Number(current.rows[0]?.reserved_qty || 0);
    if (!Number.isFinite(delta) || delta === 0) {
      return { movementRows: 0, sourceBefore: before, sourceAfter: before };
    }

    const quantity = Math.abs(Math.trunc(delta));
    if (quantity <= 0) throw Object.assign(new Error('Érvénytelen előkészítési mennyiség.'), { statusCode: 400 });
    const writeOff = delta > 0;
    if (writeOff && quantity > before - reserved) {
      throw Object.assign(new Error(`${variant.title_ro || 'Termék'}: ${sourceLocation.name || sourceLocation.code} helyen csak ${Math.max(0, before - reserved)} db szabad készlet van.`), {
        statusCode: 400,
        code: 'damaged_preparation_stock_insufficient',
      });
    }
    const after = writeOff ? before - quantity : before + quantity;

    await client.query(
      `INSERT INTO aif_stock (location_id,variant_id,qty,reserved_qty,updated_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (location_id,variant_id)
       DO UPDATE SET qty=$3,reserved_qty=$4,updated_at=now()`,
      [sourceLocation.id, variant.id, after, reserved]
    );

    const movementGroupId = aifPreparationMovementGroupId(document.id, lineNo);
    const movementDelta = writeOff ? -quantity : quantity;
    const raw = {
      reason: 'damaged_writeoff',
      preparationReason: reason,
      preparation: true,
      preparationAdjustment: true,
      preparationDirection: writeOff ? 'forward' : 'reverse',
      documentType: 'damaged_writeoff',
      priceBasis: 'purchase_price',
      documentId: String(document.id),
      documentNumber: document.document_number,
      documentStatus: 'preparation',
      operationId: document.transfer_id,
      movementGroupId,
      lineNo,
      note,
      title,
      productTitle: variant.title_ro,
      barcode: variant.barcode || variant.supplier_barcode || null,
      sourceLocationId: String(sourceLocation.id),
      sourceLocationCode: sourceLocation.code,
      sourceLocationName: sourceLocation.name,
      fromLocationId: String(sourceLocation.id),
      fromLocationCode: sourceLocation.code,
      fromLocationName: sourceLocation.name,
      qty: quantity,
      direction: writeOff ? 'out' : 'in',
      side: 'source',
    };

    let movementRows = 0;
    if (await insertStockMovementSafe(client, {
      movementType: writeOff ? 'manual_adjustment' : 'incoming',
      sourceType: 'damaged_writeoff',
      sourcePrefix: writeOff ? 'damage_out' : 'damage_back',
      fallbackSourceType: 'manual_stock_edit',
      locationId: sourceLocation.id,
      variantId: variant.id,
      qtyDelta: movementDelta,
      qtyBefore: before,
      qtyAfter: after,
      actor,
      raw,
    })) movementRows += 1;

    return { movementRows, sourceBefore: before, sourceAfter: after };
  }

  async function refreshAifPreparationDocument(client, documentId, rawPatch = {}) {
    const lines = await client.query(
      `SELECT * FROM aif_stock_transfer_document_lines
       WHERE document_id=$1
       ORDER BY line_no ASC, created_at ASC`,
      [documentId]
    );
    const rows = lines.rows || [];
    const fromNames = Array.from(new Set(rows.map((row) => text(row.from_location_name)).filter(Boolean)));
    const toNames = Array.from(new Set(rows.map((row) => text(row.to_location_name)).filter(Boolean)));
    const fromIds = Array.from(new Set(rows.map((row) => text(row.from_location_id)).filter(Boolean)));
    const toIds = Array.from(new Set(rows.map((row) => text(row.to_location_id)).filter(Boolean)));
    const totalQty = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const totalValue = Math.round((rows.reduce((sum, row) => sum + Number(row.line_total || 0), 0) + Number.EPSILON) * 100) / 100;
    const updated = await client.query(
      `UPDATE aif_stock_transfer_documents
       SET line_count=$2, total_qty=$3, total_value=$4, currency_code='RON',
           from_location_summary=$5, to_location_summary=$6,
           source_location_id=$7, target_location_id=$8,
           document_type='internal_transfer', operation_direction='transfer', price_basis='selling_price',
           raw=COALESCE(raw,'{}'::jsonb) || $9::jsonb,
           updated_at=now()
       WHERE id=$1
       RETURNING *`,
      [
        documentId,
        rows.length,
        totalQty,
        totalValue,
        fromNames.length === 1 ? fromNames[0] : fromNames.length ? 'Conform tabelului' : null,
        toNames.length === 1 ? toNames[0] : toNames.length ? 'Conform tabelului' : null,
        fromIds.length === 1 ? fromIds[0] : null,
        toIds.length === 1 ? toIds[0] : null,
        JSON.stringify({ preparation: true, documentType: 'internal_transfer', totalValue, currencyCode: 'RON', ...rawPatch }),
      ]
    );
    return { document: updated.rows[0] || null, lines: rows };
  }


  async function refreshAifDamagedPreparationDocument(client, documentId, rawPatch = {}) {
    const lines = await client.query(
      `SELECT * FROM aif_stock_transfer_document_lines
       WHERE document_id=$1
       ORDER BY line_no ASC,created_at ASC`,
      [documentId]
    );
    const rows = lines.rows || [];
    const sourceNames = Array.from(new Set(rows.map((row) => text(row.from_location_name)).filter(Boolean)));
    const sourceIds = Array.from(new Set(rows.map((row) => text(row.from_location_id)).filter(Boolean)));
    const totalQty = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const totalValue = Math.round((rows.reduce((sum, row) => sum + Number(row.line_total || 0), 0) + Number.EPSILON) * 100) / 100;
    const updated = await client.query(
      `UPDATE aif_stock_transfer_documents
       SET line_count=$2,total_qty=$3,total_value=$4,currency_code='RON',
           from_location_summary=$5,
           to_location_summary=COALESCE(NULLIF(reason_text,''),'Sérült termék'),
           source_location_id=$6,target_location_id=NULL,
           document_type='damaged_writeoff',operation_direction='decrease',price_basis='purchase_price',
           raw=COALESCE(raw,'{}'::jsonb) || $7::jsonb,
           updated_at=now()
       WHERE id=$1
       RETURNING *`,
      [
        documentId,
        rows.length,
        totalQty,
        totalValue,
        sourceNames.length === 1 ? sourceNames[0] : sourceNames.length ? 'Conform tabelului' : null,
        sourceIds.length === 1 ? sourceIds[0] : null,
        JSON.stringify({ preparation: true, documentType: 'damaged_writeoff', totalValue, currencyCode: 'RON', ...rawPatch }),
      ]
    );
    return { document: updated.rows[0] || null, lines: rows };
  }

  async function getOrCreateAifOpenPreparation(client, { ownerKey, actor, title, note, idempotencyKey }) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif:stock-preparation:${ownerKey}`]);
    const current = await client.query(
      `SELECT * FROM aif_stock_transfer_documents
       WHERE owner_key=$1 AND document_type='internal_transfer' AND status='preparation'
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [ownerKey]
    );
    if (current.rowCount) {
      const updated = await client.query(
        `UPDATE aif_stock_transfer_documents
         SET subtitle=COALESCE(NULLIF($2,''),subtitle),
             note=COALESCE($3,note), actor=$4,
             raw=COALESCE(raw,'{}'::jsonb) || $5::jsonb,
             updated_at=now()
         WHERE id=$1
         RETURNING *`,
        [
          current.rows[0].id,
          title,
          note,
          actor,
          JSON.stringify({ preparation: true, lastIdempotencyKey: idempotencyKey || null, lastAppendAt: new Date().toISOString() }),
        ]
      );
      return { document: updated.rows[0], created: false };
    }

    const sequence = await allocateAifStockDocumentNumber(client, 'internal_transfer');
    const transferId = stockMovementSourceId('transfer', 'preparation', 'stock');
    const inserted = await client.query(
      `INSERT INTO aif_stock_transfer_documents (
         transfer_id, document_number, series, sequence_number, sequence_year,
         title, subtitle, note, status, actor, owner_key, raw,
         document_type, operation_direction, price_basis, total_value, currency_code,
         created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,'preparation',$9,$10,$11::jsonb,
         'internal_transfer','transfer','selling_price',0,'RON',now(),now()
       )
       RETURNING *`,
      [
        transferId,
        sequence.documentNumber,
        sequence.series,
        sequence.sequenceNumber,
        sequence.sequenceYear,
        sequence.title,
        title || sequence.subtitle,
        note,
        actor,
        ownerKey,
        JSON.stringify({ preparation: true, documentType: 'internal_transfer', idempotencyKey: idempotencyKey || null, openedAt: new Date().toISOString() }),
      ]
    );
    return { document: inserted.rows[0], created: true };
  }


  async function getOrCreateAifOpenDamagedPreparation(client, {
    ownerKey,
    actor,
    reasonCode,
    reasonText,
    note,
    externalReference,
  }) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif:stock-preparation:${ownerKey}:damaged_writeoff`]);
    const current = await client.query(
      `SELECT * FROM aif_stock_transfer_documents
       WHERE owner_key=$1 AND document_type='damaged_writeoff' AND status='preparation'
       ORDER BY updated_at DESC,created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [ownerKey]
    );
    if (current.rowCount) {
      const updated = await client.query(
        `UPDATE aif_stock_transfer_documents
         SET note=COALESCE($2,note),actor=$3,
             reason_code=COALESCE(NULLIF($4,''),reason_code),
             reason_text=COALESCE($5,reason_text),
             external_reference=COALESCE($6,external_reference),
             to_location_summary=COALESCE($5,to_location_summary),
             raw=COALESCE(raw,'{}'::jsonb) || $7::jsonb,
             updated_at=now()
         WHERE id=$1
         RETURNING *`,
        [
          current.rows[0].id,
          note,
          actor,
          reasonCode || null,
          reasonText,
          externalReference,
          JSON.stringify({ preparation: true, documentType: 'damaged_writeoff', lastAppendAt: new Date().toISOString() }),
        ]
      );
      return { document: updated.rows[0], created: false };
    }

    const sequence = await allocateAifStockDocumentNumber(client, 'damaged_writeoff');
    const operationId = stockMovementSourceId('damage', 'preparation', 'stock');
    const inserted = await client.query(
      `INSERT INTO aif_stock_transfer_documents (
         transfer_id,document_number,series,sequence_number,sequence_year,
         title,subtitle,note,status,actor,owner_key,raw,
         document_type,external_reference,reason_code,reason_text,
         operation_direction,price_basis,total_value,currency_code,
         created_at,updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,'preparation',$9,$10,$11::jsonb,
         'damaged_writeoff',$12,$13,$14,'decrease','purchase_price',0,'RON',now(),now()
       ) RETURNING *`,
      [
        operationId,
        sequence.documentNumber,
        sequence.series,
        sequence.sequenceNumber,
        sequence.sequenceYear,
        sequence.title,
        sequence.subtitle,
        note,
        actor,
        ownerKey,
        JSON.stringify({ preparation: true, documentType: 'damaged_writeoff', openedAt: new Date().toISOString() }),
        externalReference,
        reasonCode || null,
        reasonText,
      ]
    );
    return { document: inserted.rows[0], created: true };
  }

  async function appendAifPreparationLine(client, { document, input, actor, note, title }) {
    const variantInput = text(input.variantId || input.variant_id || input.variant || input.id);
    const fromInput = text(input.fromLocationId || input.from_location_id || input.fromLocationCode || input.from_location_code || input.from || input.sourceLocationId || input.source_location_id);
    const toInput = text(input.toLocationId || input.to_location_id || input.toLocationCode || input.to_location_code || input.to || input.targetLocationId || input.target_location_id);
    const qty = toInt(input.qty ?? input.quantity ?? input.count);
    if (!variantInput) throw Object.assign(new Error('Hiányzik a termék.'), { statusCode: 400 });
    if (!fromInput) throw Object.assign(new Error('Hiányzik a forráshely.'), { statusCode: 400 });
    if (!toInput) throw Object.assign(new Error('Hiányzik a célhely.'), { statusCode: 400 });
    if (qty === null || qty <= 0) throw Object.assign(new Error('Érvénytelen mennyiség.'), { statusCode: 400 });

    const variant = await readAifTransferVariantSnapshot(client, variantInput);
    const routeFrom = await readAifPreparationLocation(client, fromInput, 'forráshely');
    const routeTo = await readAifPreparationLocation(client, toInput, 'célhely');
    if (String(routeFrom.id) === String(routeTo.id)) throw Object.assign(new Error(`${variant.title_ro || 'Termék'}: a forrás és a cél nem lehet ugyanaz.`), { statusCode: 400 });

    const existing = await client.query(
      `SELECT * FROM aif_stock_transfer_document_lines
       WHERE document_id=$1
         AND variant_id::text=$2
         AND COALESCE(from_location_id::text,'')=$3
         AND COALESCE(to_location_id::text,'')=$4
       ORDER BY line_no ASC
       LIMIT 1
       FOR UPDATE`,
      [document.id, String(variant.id), String(routeFrom.id), String(routeTo.id)]
    );
    let lineNo = Number(existing.rows[0]?.line_no || 0);
    if (!lineNo) {
      const next = await client.query(`SELECT COALESCE(max(line_no),0)::int + 1 AS line_no FROM aif_stock_transfer_document_lines WHERE document_id=$1`, [document.id]);
      lineNo = Number(next.rows[0]?.line_no || 1);
    }

    const movement = await applyAifPreparationStockDelta(client, {
      document,
      lineNo,
      variant,
      routeFrom,
      routeTo,
      qtyDelta: qty,
      actor,
      note,
      title,
      reason: existing.rowCount ? 'preparation_append_existing_line' : 'preparation_append_new_line',
    });

    const productCode = variant.supplier_product_code || String(variant.model_code || '').split(':').pop() || variant.internal_sku || null;
    const displayBarcode = variant.barcode || variant.supplier_barcode || null;
    const unitPrice = toMoney(variant.sell_price);
    const previousQty = Number(existing.rows[0]?.qty || 0);
    const nextQty = previousQty + qty;
    const lineTotal = unitPrice === null ? null : Math.round((nextQty * unitPrice + Number.EPSILON) * 100) / 100;
    const lineRaw = {
      ...(existing.rows[0]?.raw && typeof existing.rows[0].raw === 'object' ? existing.rows[0].raw : {}),
      preparation: true,
      documentType: 'internal_transfer',
      transferId: document.transfer_id,
      documentId: String(document.id),
      documentNumber: document.document_number,
      lineNo,
      productTitle: variant.title_ro,
      productCode,
      barcode: displayBarcode,
      fromLocationId: String(routeFrom.id),
      fromLocationName: routeFrom.name || routeFrom.code,
      toLocationId: String(routeTo.id),
      toLocationName: routeTo.name || routeTo.code,
      qty: nextQty,
      unitPrice,
      lineTotal,
      priceBasis: 'selling_price',
      currencyCode: 'RON',
      updatedAt: new Date().toISOString(),
    };

    if (existing.rowCount) {
      await client.query(
        `UPDATE aif_stock_transfer_document_lines
         SET qty=$2, unit_price=$3, line_total=$4, currency_code='RON', price_basis='selling_price', qty_delta=0,
             source_after=$5, target_after=$6, raw=$7::jsonb
         WHERE id=$1`,
        [existing.rows[0].id, nextQty, unitPrice, lineTotal, movement.routeFromAfter, movement.routeToAfter, JSON.stringify(lineRaw)]
      );
    } else {
      await client.query(
        `INSERT INTO aif_stock_transfer_document_lines (
           document_id,line_no,variant_id,product_title,brand_name,category_name,
           product_code,barcode,color_name,size,image_url,
           from_location_id,from_location_name,to_location_id,to_location_name,
           qty,unit_price,line_total,currency_code,price_basis,qty_delta,
           source_before,source_after,target_before,target_after,raw
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
           $16,$17,$18,'RON','selling_price',0,$19,$20,$21,$22,$23::jsonb
         )`,
        [
          document.id,
          lineNo,
          String(variant.id),
          variant.title_ro,
          variant.brand_name,
          variant.category_name,
          productCode,
          displayBarcode,
          variant.color_name,
          variant.size,
          variant.image_url,
          String(routeFrom.id),
          routeFrom.name || routeFrom.code,
          String(routeTo.id),
          routeTo.name || routeTo.code,
          nextQty,
          unitPrice,
          lineTotal,
          movement.sourceBefore,
          movement.routeFromAfter,
          movement.targetBefore,
          movement.routeToAfter,
          JSON.stringify(lineRaw),
        ]
      );
    }

    return {
      movementRows: movement.movementRows,
      item: {
        variantId: String(variant.id),
        title: variant.title_ro,
        brandName: variant.brand_name,
        categoryName: variant.category_name,
        productCode,
        barcode: displayBarcode,
        colorName: variant.color_name,
        size: variant.size,
        imageUrl: variant.image_url,
        qty,
        accumulatedQty: nextQty,
        unitPrice,
        lineTotal: unitPrice === null ? null : Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100,
        currencyCode: 'RON',
        priceBasis: 'selling_price',
        fromLocationId: String(routeFrom.id),
        fromLocation: routeFrom.name || routeFrom.code,
        toLocationId: String(routeTo.id),
        toLocation: routeTo.name || routeTo.code,
      },
    };
  }


  async function appendAifDamagedPreparationLine(client, {
    document,
    input,
    actor,
    note,
    title,
  }) {
    const variantInput = text(input.variantId || input.variant_id || input.variant || input.id);
    const sourceInput = text(input.fromLocationId || input.from_location_id || input.sourceLocationId || input.source_location_id || input.locationId || input.location_id);
    const qty = toInt(input.qty ?? input.quantity ?? input.count);
    if (!variantInput) throw Object.assign(new Error('Hiányzik a termék.'), { statusCode: 400 });
    if (!sourceInput) throw Object.assign(new Error('Hiányzik az érintett készlethely.'), { statusCode: 400 });
    if (qty === null || qty <= 0) throw Object.assign(new Error('Érvénytelen mennyiség.'), { statusCode: 400 });

    const variant = await readAifTransferVariantSnapshot(client, variantInput);
    const sourceLocation = await readAifPreparationLocation(client, sourceInput, 'készlethely');
    const existing = await client.query(
      `SELECT * FROM aif_stock_transfer_document_lines
       WHERE document_id=$1
         AND variant_id::text=$2
         AND COALESCE(from_location_id::text,'')=$3
         AND to_location_id IS NULL
       ORDER BY line_no ASC
       LIMIT 1
       FOR UPDATE`,
      [document.id, String(variant.id), String(sourceLocation.id)]
    );
    let lineNo = Number(existing.rows[0]?.line_no || 0);
    if (!lineNo) {
      const next = await client.query(`SELECT COALESCE(max(line_no),0)::int + 1 AS line_no FROM aif_stock_transfer_document_lines WHERE document_id=$1`, [document.id]);
      lineNo = Number(next.rows[0]?.line_no || 1);
    }

    const movement = await applyAifDamagedPreparationStockDelta(client, {
      document,
      lineNo,
      variant,
      sourceLocation,
      qtyDelta: qty,
      actor,
      note,
      title,
      reason: existing.rowCount ? 'damaged_preparation_append_existing_line' : 'damaged_preparation_append_new_line',
    });

    const productCode = variant.supplier_product_code || String(variant.model_code || '').split(':').pop() || variant.internal_sku || null;
    const displayBarcode = variant.barcode || variant.supplier_barcode || null;
    const unitPrice = toMoney(variant.buy_price);
    const previousQty = Number(existing.rows[0]?.qty || 0);
    const nextQty = previousQty + qty;
    const lineTotal = unitPrice === null ? null : Math.round((nextQty * unitPrice + Number.EPSILON) * 100) / 100;
    const lineRaw = {
      ...(existing.rows[0]?.raw && typeof existing.rows[0].raw === 'object' ? existing.rows[0].raw : {}),
      preparation: true,
      documentType: 'damaged_writeoff',
      documentId: String(document.id),
      documentNumber: document.document_number,
      operationId: document.transfer_id,
      lineNo,
      productTitle: variant.title_ro,
      productCode,
      barcode: displayBarcode,
      sourceLocationId: String(sourceLocation.id),
      sourceLocationName: sourceLocation.name || sourceLocation.code,
      fromLocationId: String(sourceLocation.id),
      fromLocationName: sourceLocation.name || sourceLocation.code,
      qty: nextQty,
      qtyDelta: -nextQty,
      unitPrice,
      lineTotal,
      priceBasis: 'purchase_price',
      currencyCode: 'RON',
      updatedAt: new Date().toISOString(),
    };

    if (existing.rowCount) {
      await client.query(
        `UPDATE aif_stock_transfer_document_lines
         SET qty=$2,unit_price=$3,line_total=$4,currency_code='RON',price_basis='purchase_price',qty_delta=$5,
             source_after=$6,raw=$7::jsonb
         WHERE id=$1`,
        [existing.rows[0].id, nextQty, unitPrice, lineTotal, -nextQty, movement.sourceAfter, JSON.stringify(lineRaw)]
      );
    } else {
      await client.query(
        `INSERT INTO aif_stock_transfer_document_lines (
           document_id,line_no,variant_id,product_title,brand_name,category_name,
           product_code,barcode,color_name,size,image_url,
           from_location_id,from_location_name,to_location_id,to_location_name,
           qty,unit_price,line_total,currency_code,price_basis,qty_delta,
           source_before,source_after,target_before,target_after,raw
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,$14,
           $15,$16,$17,'RON','purchase_price',$18,$19,$20,NULL,NULL,$21::jsonb
         )`,
        [
          document.id,
          lineNo,
          String(variant.id),
          variant.title_ro,
          variant.brand_name,
          variant.category_name,
          productCode,
          displayBarcode,
          variant.color_name,
          variant.size,
          variant.image_url,
          String(sourceLocation.id),
          sourceLocation.name || sourceLocation.code,
          document.reason_text || 'Sérült termék',
          nextQty,
          unitPrice,
          lineTotal,
          -nextQty,
          movement.sourceBefore,
          movement.sourceAfter,
          JSON.stringify(lineRaw),
        ]
      );
    }

    return {
      movementRows: movement.movementRows,
      item: {
        variantId: String(variant.id),
        title: variant.title_ro,
        qty,
        accumulatedQty: nextQty,
        sourceLocationId: String(sourceLocation.id),
        sourceLocation: sourceLocation.name || sourceLocation.code,
        unitPrice,
        lineTotal: unitPrice === null ? null : Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100,
      },
    };
  }

  async function updateAifDamagedPreparationDocument(client, {
    document,
    body,
    linesInput,
    actor,
    ownerKey,
  }) {
    const existingResult = await client.query(
      `SELECT * FROM aif_stock_transfer_document_lines
       WHERE document_id=$1
       ORDER BY line_no ASC
       FOR UPDATE`,
      [document.id]
    );
    const existingByKey = new Map();
    for (const line of existingResult.rows) {
      const key = aifPreparationLineKey(line.variant_id, line.from_location_id, '');
      const currentLine = existingByKey.get(key);
      if (!currentLine) existingByKey.set(key, { ...line, qty: Number(line.qty || 0), duplicate_ids: [] });
      else {
        currentLine.qty = Number(currentLine.qty || 0) + Number(line.qty || 0);
        currentLine.duplicate_ids.push(line.id);
      }
    }

    const desiredByKey = new Map();
    for (let index = 0; index < linesInput.length; index += 1) {
      const input = linesInput[index] || {};
      const variant = await readAifTransferVariantSnapshot(client, input.variantId || input.variant_id || input.variant || input.id);
      const sourceValue = input.fromLocationId || input.from_location_id || input.sourceLocationId || input.source_location_id || body.sourceLocationId || body.source_location_id || document.source_location_id;
      const sourceLocation = await readAifPreparationLocation(client, sourceValue, 'készlethely');
      const qty = Math.max(0, Number(toInt(input.qty ?? input.quantity ?? input.count) || 0));
      if (qty <= 0) continue;
      const key = aifPreparationLineKey(variant.id, sourceLocation.id, '');
      const currentDesired = desiredByKey.get(key);
      desiredByKey.set(key, {
        key,
        variant,
        sourceLocation,
        qty: qty + Number(currentDesired?.qty || 0),
        firstIndex: currentDesired?.firstIndex ?? index,
      });
    }

    let nextLineNo = existingResult.rows.reduce((max, line) => Math.max(max, Number(line.line_no || 0)), 0) + 1;
    let movementRows = 0;
    let restoredQty = 0;
    let addedQty = 0;
    const allKeys = new Set([...existingByKey.keys(), ...desiredByKey.keys()]);
    for (const key of allKeys) {
      const existing = existingByKey.get(key) || null;
      let desired = desiredByKey.get(key) || null;
      if (!desired && existing) {
        desired = {
          key,
          variant: await readAifTransferVariantSnapshot(client, existing.variant_id),
          sourceLocation: await readAifPreparationLocation(client, existing.from_location_id, 'készlethely'),
          qty: 0,
          firstIndex: Number(existing.line_no || 0),
        };
      }
      if (!desired) continue;
      const previousQty = Number(existing?.qty || 0);
      const delta = desired.qty - previousQty;
      const lineNo = Number(existing?.line_no || nextLineNo++);
      const movement = await applyAifDamagedPreparationStockDelta(client, {
        document,
        lineNo,
        variant: desired.variant,
        sourceLocation: desired.sourceLocation,
        qtyDelta: delta,
        actor,
        note: body.note === undefined ? document.note : emptyToNull(body.note),
        title: document.subtitle,
        reason: delta < 0 ? 'damaged_preparation_quantity_restore' : existing ? 'damaged_preparation_quantity_increase' : 'damaged_preparation_line_add',
      });
      movementRows += movement.movementRows;
      if (delta < 0) restoredQty += Math.abs(delta);
      if (delta > 0) addedQty += delta;

      if (desired.qty <= 0) {
        if (existing) {
          const ids = [existing.id, ...(existing.duplicate_ids || [])].filter(Boolean);
          await client.query(`DELETE FROM aif_stock_transfer_document_lines WHERE id = ANY($1::uuid[])`, [ids]);
        }
        continue;
      }

      const productCode = desired.variant.supplier_product_code || String(desired.variant.model_code || '').split(':').pop() || desired.variant.internal_sku || null;
      const displayBarcode = desired.variant.barcode || desired.variant.supplier_barcode || null;
      const unitPrice = toMoney(desired.variant.buy_price);
      const lineTotal = unitPrice === null ? null : Math.round((desired.qty * unitPrice + Number.EPSILON) * 100) / 100;
      const raw = {
        ...(existing?.raw && typeof existing.raw === 'object' ? existing.raw : {}),
        preparation: true,
        documentType: 'damaged_writeoff',
        documentId: String(document.id),
        documentNumber: document.document_number,
        operationId: document.transfer_id,
        lineNo,
        productTitle: desired.variant.title_ro,
        productCode,
        barcode: displayBarcode,
        sourceLocationId: String(desired.sourceLocation.id),
        sourceLocationName: desired.sourceLocation.name || desired.sourceLocation.code,
        fromLocationId: String(desired.sourceLocation.id),
        fromLocationName: desired.sourceLocation.name || desired.sourceLocation.code,
        qty: desired.qty,
        qtyDelta: -desired.qty,
        unitPrice,
        lineTotal,
        priceBasis: 'purchase_price',
        currencyCode: 'RON',
        updatedAt: new Date().toISOString(),
      };
      if (existing) {
        await client.query(
          `UPDATE aif_stock_transfer_document_lines
           SET qty=$2,unit_price=$3,line_total=$4,currency_code='RON',price_basis='purchase_price',qty_delta=$5,
               source_after=$6,raw=$7::jsonb
           WHERE id=$1`,
          [existing.id, desired.qty, unitPrice, lineTotal, -desired.qty, movement.sourceAfter, JSON.stringify(raw)]
        );
        if (existing.duplicate_ids?.length) {
          await client.query(`DELETE FROM aif_stock_transfer_document_lines WHERE id = ANY($1::uuid[])`, [existing.duplicate_ids]);
        }
      } else {
        await client.query(
          `INSERT INTO aif_stock_transfer_document_lines (
             document_id,line_no,variant_id,product_title,brand_name,category_name,
             product_code,barcode,color_name,size,image_url,
             from_location_id,from_location_name,to_location_id,to_location_name,
             qty,unit_price,line_total,currency_code,price_basis,qty_delta,
             source_before,source_after,target_before,target_after,raw
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,$14,
             $15,$16,$17,'RON','purchase_price',$18,$19,$20,NULL,NULL,$21::jsonb
           )`,
          [
            document.id,
            lineNo,
            String(desired.variant.id),
            desired.variant.title_ro,
            desired.variant.brand_name,
            desired.variant.category_name,
            productCode,
            displayBarcode,
            desired.variant.color_name,
            desired.variant.size,
            desired.variant.image_url,
            String(desired.sourceLocation.id),
            desired.sourceLocation.name || desired.sourceLocation.code,
            document.reason_text || 'Sérült termék',
            desired.qty,
            unitPrice,
            lineTotal,
            -desired.qty,
            movement.sourceBefore,
            movement.sourceAfter,
            JSON.stringify(raw),
          ]
        );
      }
    }

    const reasonCode = normCode(body.reasonCode || body.reason_code || document.reason_code || 'damaged') || 'damaged';
    const reasonText = emptyToNull(body.reasonText || body.reason_text) ?? document.reason_text ?? 'Sérült termék';
    const note = body.note === undefined ? document.note : emptyToNull(body.note);
    const externalReference = body.externalReference === undefined && body.external_reference === undefined
      ? document.external_reference
      : emptyToNull(body.externalReference || body.external_reference);
    const header = await client.query(
      `UPDATE aif_stock_transfer_documents
       SET note=$2,actor=$3,owner_key=COALESCE(owner_key,$4),
           reason_code=$5,reason_text=$6,external_reference=$7,
           to_location_summary=$6,updated_at=now()
       WHERE id=$1
       RETURNING *`,
      [document.id, note, actor, ownerKey, reasonCode, reasonText, externalReference]
    );
    document = header.rows[0] || document;
    const refreshed = await refreshAifDamagedPreparationDocument(client, document.id, {
      lastEditedAt: new Date().toISOString(),
      lastEditedBy: actor,
      restoredQty,
      addedQty,
    });
    return {
      document: refreshed.document || document,
      lines: refreshed.lines,
      restoredQty,
      addedQty,
      movementRows,
    };
  }

  async function handleSaveDamagedPreparation(req, res) {
    const body = req.body || {};
    const linesInput = Array.isArray(body.lines) ? body.lines : Array.isArray(body.items) ? body.items : Array.isArray(body.rows) ? body.rows : [];
    if (!linesInput.length) return res.status(400).json({ error: 'Legalább egy sérült terméket adj az előkészítéshez.' });
    const sourceLocationInput = text(body.sourceLocationId || body.source_location_id || body.locationId || body.location_id || body.fromLocationId || body.from_location_id);
    const reasonCode = normCode(body.reasonCode || body.reason_code || body.reason || 'damaged') || 'damaged';
    const reasonText = emptyToNull(body.reasonText || body.reason_text || body.reasonLabel || body.reason_label) || 'Sérült termék';
    const note = emptyToNull(body.note);
    const externalReference = emptyToNull(body.externalReference || body.external_reference || body.reference);
    const legacyDraftId = text(body.draftId || body.draft_id || body.documentId || body.document_id);
    if (!sourceLocationInput && !linesInput.every((line) => text(line.fromLocationId || line.from_location_id || line.sourceLocationId || line.source_location_id))) {
      return res.status(400).json({ error: 'Az érintett készlethely kötelező.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureAifStockTransferDocumentsSchema();
      const actor = actorFrom(req);
      const ownerKey = selectionOwnerKey(req);
      const preparation = await getOrCreateAifOpenDamagedPreparation(client, {
        ownerKey,
        actor,
        reasonCode,
        reasonText,
        note,
        externalReference,
      });
      let document = preparation.document;
      let movementRows = 0;
      const addedItems = [];
      for (const input of linesInput) {
        const appended = await appendAifDamagedPreparationLine(client, {
          document,
          input: {
            ...input,
            fromLocationId: input.fromLocationId || input.from_location_id || input.sourceLocationId || input.source_location_id || sourceLocationInput,
          },
          actor,
          note,
          title: document.subtitle,
        });
        movementRows += appended.movementRows;
        addedItems.push(appended.item);
      }
      const refreshed = await refreshAifDamagedPreparationDocument(client, document.id, {
        lastAppendAt: new Date().toISOString(),
        lastAppendBy: actor,
      });
      document = refreshed.document || document;

      if (legacyDraftId && legacyDraftId !== String(document.id)) {
        const draft = await client.query(
          `SELECT id,document_type,status
           FROM aif_stock_transfer_documents
           WHERE id::text=$1 OR transfer_id=$1 OR document_number=$1
           FOR UPDATE`,
          [legacyDraftId]
        );
        if (draft.rowCount && draft.rows[0].status === 'draft' && cleanAifStockDocumentType(draft.rows[0].document_type, null) === 'damaged_writeoff') {
          await client.query(`DELETE FROM aif_stock_transfer_documents WHERE id=$1`, [draft.rows[0].id]);
        }
      }

      await client.query('COMMIT');
      return res.json({
        ok: true,
        status: 'preparation',
        preparationCreated: preparation.created,
        documentId: String(document.id),
        documentNumber: document.document_number,
        document,
        lines: refreshed.lines,
        lineCount: Number(document.line_count || 0),
        totalQty: Number(document.total_qty || 0),
        totalValue: Number(document.total_value || 0),
        movementRows,
        items: addedItems,
      });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('AIF damaged preparation save failed', error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || 'A sérült termék előkészítésének mentése nem sikerült.', code: error?.code || null });
    } finally {
      client.release();
    }
  }

  async function handleStockTransfer(req, res) {
    const body = req.body || {};
    const rowsInput = Array.isArray(body.rows)
      ? body.rows
      : Array.isArray(body.lines)
        ? body.lines
        : Array.isArray(body.items)
          ? body.items
          : [];
    const note = emptyToNull(body.note);
    const title = emptyToNull(body.title || body.documentTitle || body.document_title);
    const idempotencyKey = text(req.get('Idempotency-Key') || body.idempotencyKey || body.idempotency_key).slice(0, 200);
    if (!rowsInput.length) return res.status(400).json({ error: 'Nincs menthető készletmozgatási sor.' });

    try {
      await ensureAifStockTransferDocumentsSchema();
      if (idempotencyKey) await ensureAifStockTransferIdempotencySchema();
    } catch (schemaError) {
      console.error('AIF stock transfer preparation schema failed', schemaError);
      return res.status(500).json({ error: 'A készletátadási előkészítés nem indítható.', code: schemaError?.code || 'stock_transfer_preparation_schema_failed' });
    }

    const client = await pool.connect();
    const actor = actorFrom(req);
    const ownerKey = selectionOwnerKey(req);
    const requestHash = idempotencyKey ? stockTransferRequestHash(rowsInput, title, note) : null;
    try {
      await client.query('BEGIN');
      try { await client.query("SELECT set_config('aif.actor', $1, true)", [actor]); } catch {}

      if (idempotencyKey) {
        const claim = await client.query(
          `INSERT INTO aif_stock_transfer_requests (owner_key,idempotency_key,request_hash,status,created_at,updated_at)
           VALUES ($1,$2,$3,'processing',now(),now())
           ON CONFLICT (owner_key,idempotency_key) DO NOTHING
           RETURNING owner_key`,
          [ownerKey, idempotencyKey, requestHash]
        );
        if (!claim.rowCount) {
          const existing = await client.query(
            `SELECT request_hash,status,transfer_id,response
             FROM aif_stock_transfer_requests
             WHERE owner_key=$1 AND idempotency_key=$2
             FOR UPDATE`,
            [ownerKey, idempotencyKey]
          );
          const row = existing.rows[0] || null;
          if (!row) throw Object.assign(new Error('Az ismétlésvédelmi rekord nem található.'), { statusCode: 409, code: 'stock_transfer_idempotency_record_missing' });
          if (text(row.request_hash) !== text(requestHash)) throw Object.assign(new Error('Ezt az ismétlésvédelmi kulcsot már másik készletmozgatáshoz használták.'), { statusCode: 409, code: 'stock_transfer_idempotency_key_reused' });
          if (row.status === 'completed' && row.response) {
            const previousResponse = typeof row.response === 'object' ? row.response : {};
            await client.query('COMMIT');
            return res.json({ ...previousResponse, ok: true, duplicate: true, idempotencyKey, transferId: previousResponse.transferId || row.transfer_id });
          }
          throw Object.assign(new Error('Ez a készletmozgatás már feldolgozás alatt van. Várj néhány másodpercet, majd frissíts.'), { statusCode: 409, code: 'stock_transfer_already_processing' });
        }
      }

      const preparation = await getOrCreateAifOpenPreparation(client, { ownerKey, actor, title, note, idempotencyKey });
      let document = preparation.document;
      const movedItems = [];
      let movementRows = 0;
      let movedQty = 0;
      for (let index = 0; index < rowsInput.length; index += 1) {
        try {
          const result = await appendAifPreparationLine(client, { document, input: rowsInput[index] || {}, actor, note, title });
          movedItems.push(result.item);
          movementRows += result.movementRows;
          movedQty += Number(result.item.qty || 0);
        } catch (lineError) {
          if (!lineError.statusCode) lineError.statusCode = 400;
          lineError.message = `A(z) ${index + 1}. sor: ${lineError.message || lineError}`;
          throw lineError;
        }
      }

      const refreshed = await refreshAifPreparationDocument(client, document.id, {
        lastIdempotencyKey: idempotencyKey || null,
        lastAppendAt: new Date().toISOString(),
        lastAppendedItems: movedItems,
      });
      document = refreshed.document || document;
      const responsePayload = {
        ok: true,
        duplicate: false,
        preparationCreated: preparation.created,
        status: 'preparation',
        idempotencyKey: idempotencyKey || null,
        transferId: document.transfer_id,
        documentId: String(document.id),
        documentNumber: document.document_number,
        documentCreatedAt: document.created_at || null,
        documentTitle: document.title || null,
        documentSubtitle: document.subtitle || null,
        document,
        title,
        lineCount: movedItems.length,
        movedRows: movedItems.length,
        movedLines: movedItems.length,
        movedQty,
        totalQty: movedQty,
        documentLineCount: Number(document.line_count || refreshed.lines.length || 0),
        documentTotalQty: Number(document.total_qty || 0),
        documentTotalValue: Number(document.total_value || 0),
        movements: movementRows,
        items: movedItems,
      };

      if (idempotencyKey) {
        await client.query(
          `UPDATE aif_stock_transfer_requests
           SET status='completed',transfer_id=$3,response=$4::jsonb,updated_at=now()
           WHERE owner_key=$1 AND idempotency_key=$2`,
          [ownerKey, idempotencyKey, document.transfer_id, JSON.stringify(responsePayload)]
        );
      }
      await client.query('COMMIT');
      return res.json(responsePayload);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('AIF stock transfer preparation failed', error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || 'A készletmozgatás mentése nem sikerült.', code: error?.code || null });
    } finally {
      client.release();
    }
  }

  async function handleUpdateStockTransferPreparation(req, res) {
    const id = text(req.params.id);
    const body = req.body || {};
    const linesInput = Array.isArray(body.lines) ? body.lines : Array.isArray(body.items) ? body.items : Array.isArray(body.rows) ? body.rows : [];
    if (!id) return res.status(400).json({ error: 'Előkészítés azonosító szükséges.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureAifStockTransferDocumentsSchema();
      const current = await client.query(
        `SELECT * FROM aif_stock_transfer_documents
         WHERE (id::text=$1 OR transfer_id=$1 OR document_number=$1)
         FOR UPDATE`,
        [id]
      );
      if (!current.rowCount) throw Object.assign(new Error('Az előkészítés nem található.'), { statusCode: 404 });
      let document = current.rows[0];
      const documentType = cleanAifStockDocumentType(document.document_type, null);
      if (document.status !== 'preparation' || !['internal_transfer','damaged_writeoff'].includes(documentType)) {
        throw Object.assign(new Error('Ez a dokumentum nem szerkeszthető előkészítésként.'), { statusCode: 400 });
      }
      const actor = actorFrom(req);
      const ownerKey = selectionOwnerKey(req);
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif:stock-preparation:${document.owner_key || ownerKey}:${documentType}`]);

      if (documentType === 'damaged_writeoff') {
        const updated = await updateAifDamagedPreparationDocument(client, { document, body, linesInput, actor, ownerKey });
        document = updated.document;
        await client.query('COMMIT');
        return res.json({
          ok: true,
          status: 'preparation',
          documentId: String(document.id),
          documentNumber: document.document_number,
          document,
          lines: updated.lines,
          lineCount: Number(document.line_count || 0),
          totalQty: Number(document.total_qty || 0),
          totalValue: Number(document.total_value || 0),
          restoredQty: updated.restoredQty,
          addedQty: updated.addedQty,
          movementRows: updated.movementRows,
        });
      }

      const existingResult = await client.query(
        `SELECT * FROM aif_stock_transfer_document_lines
         WHERE document_id=$1
         ORDER BY line_no ASC
         FOR UPDATE`,
        [document.id]
      );
      const existingByKey = new Map();
      for (const line of existingResult.rows) {
        const key = aifPreparationLineKey(line.variant_id, line.from_location_id, line.to_location_id);
        const currentLine = existingByKey.get(key);
        if (!currentLine) {
          existingByKey.set(key, { ...line, qty: Number(line.qty || 0), duplicate_ids: [] });
        } else {
          currentLine.qty = Number(currentLine.qty || 0) + Number(line.qty || 0);
          currentLine.duplicate_ids.push(line.id);
        }
      }

      const desiredByKey = new Map();
      for (let index = 0; index < linesInput.length; index += 1) {
        const input = linesInput[index] || {};
        const variant = await readAifTransferVariantSnapshot(client, input.variantId || input.variant_id || input.variant || input.id);
        const fromValue = input.fromLocationId || input.from_location_id || input.sourceLocationId || input.source_location_id || document.source_location_id;
        const toValue = input.toLocationId || input.to_location_id || input.targetLocationId || input.target_location_id || document.target_location_id;
        const routeFrom = await readAifPreparationLocation(client, fromValue, 'forráshely');
        const routeTo = await readAifPreparationLocation(client, toValue, 'célhely');
        if (String(routeFrom.id) === String(routeTo.id)) throw Object.assign(new Error(`${variant.title_ro || 'Termék'}: a forrás és a cél nem lehet ugyanaz.`), { statusCode: 400 });
        const qty = Math.max(0, Number(toInt(input.qty ?? input.quantity ?? input.count) || 0));
        if (qty <= 0) continue;
        const key = aifPreparationLineKey(variant.id, routeFrom.id, routeTo.id);
        const currentDesired = desiredByKey.get(key);
        desiredByKey.set(key, {
          key,
          variant,
          routeFrom,
          routeTo,
          qty: qty + Number(currentDesired?.qty || 0),
          firstIndex: currentDesired?.firstIndex ?? index,
        });
      }

      let nextLineNo = existingResult.rows.reduce((max, line) => Math.max(max, Number(line.line_no || 0)), 0) + 1;
      let movementRows = 0;
      let restoredQty = 0;
      let addedQty = 0;
      const allKeys = new Set([...existingByKey.keys(), ...desiredByKey.keys()]);
      for (const key of allKeys) {
        const existing = existingByKey.get(key) || null;
        let desired = desiredByKey.get(key) || null;
        if (!desired && existing) {
          const variant = await readAifTransferVariantSnapshot(client, existing.variant_id);
          const routeFrom = await readAifPreparationLocation(client, existing.from_location_id, 'forráshely');
          const routeTo = await readAifPreparationLocation(client, existing.to_location_id, 'célhely');
          desired = { key, variant, routeFrom, routeTo, qty: 0, firstIndex: Number(existing.line_no || 0) };
        }
        if (!desired) continue;
        const previousQty = Number(existing?.qty || 0);
        const delta = desired.qty - previousQty;
        const lineNo = Number(existing?.line_no || nextLineNo++);
        const movement = await applyAifPreparationStockDelta(client, {
          document,
          lineNo,
          variant: desired.variant,
          routeFrom: desired.routeFrom,
          routeTo: desired.routeTo,
          qtyDelta: delta,
          actor,
          note: emptyToNull(body.note) ?? document.note,
          title: emptyToNull(body.title || body.documentTitle || body.document_title) ?? document.subtitle,
          reason: delta < 0 ? 'preparation_quantity_restore' : existing ? 'preparation_quantity_increase' : 'preparation_line_add',
        });
        movementRows += movement.movementRows;
        if (delta < 0) restoredQty += Math.abs(delta);
        if (delta > 0) addedQty += delta;

        if (desired.qty <= 0) {
          if (existing) {
            const ids = [existing.id, ...(existing.duplicate_ids || [])].filter(Boolean);
            await client.query(`DELETE FROM aif_stock_transfer_document_lines WHERE id = ANY($1::uuid[])`, [ids]);
          }
          continue;
        }

        const productCode = desired.variant.supplier_product_code || String(desired.variant.model_code || '').split(':').pop() || desired.variant.internal_sku || null;
        const displayBarcode = desired.variant.barcode || desired.variant.supplier_barcode || null;
        const unitPrice = toMoney(desired.variant.sell_price);
        const lineTotal = unitPrice === null ? null : Math.round((desired.qty * unitPrice + Number.EPSILON) * 100) / 100;
        const raw = {
          ...(existing?.raw && typeof existing.raw === 'object' ? existing.raw : {}),
          preparation: true,
          documentType: 'internal_transfer',
          transferId: document.transfer_id,
          documentId: String(document.id),
          documentNumber: document.document_number,
          lineNo,
          productTitle: desired.variant.title_ro,
          productCode,
          barcode: displayBarcode,
          fromLocationId: String(desired.routeFrom.id),
          fromLocationName: desired.routeFrom.name || desired.routeFrom.code,
          toLocationId: String(desired.routeTo.id),
          toLocationName: desired.routeTo.name || desired.routeTo.code,
          qty: desired.qty,
          unitPrice,
          lineTotal,
          priceBasis: 'selling_price',
          currencyCode: 'RON',
          updatedAt: new Date().toISOString(),
        };

        if (existing) {
          await client.query(
            `UPDATE aif_stock_transfer_document_lines
             SET qty=$2,unit_price=$3,line_total=$4,currency_code='RON',price_basis='selling_price',qty_delta=0,
                 source_after=$5,target_after=$6,raw=$7::jsonb
             WHERE id=$1`,
            [existing.id, desired.qty, unitPrice, lineTotal, movement.routeFromAfter, movement.routeToAfter, JSON.stringify(raw)]
          );
          if (existing.duplicate_ids?.length) {
            await client.query(`DELETE FROM aif_stock_transfer_document_lines WHERE id = ANY($1::uuid[])`, [existing.duplicate_ids]);
          }
        } else {
          await client.query(
            `INSERT INTO aif_stock_transfer_document_lines (
               document_id,line_no,variant_id,product_title,brand_name,category_name,
               product_code,barcode,color_name,size,image_url,
               from_location_id,from_location_name,to_location_id,to_location_name,
               qty,unit_price,line_total,currency_code,price_basis,qty_delta,
               source_before,source_after,target_before,target_after,raw
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
               $16,$17,$18,'RON','selling_price',0,$19,$20,$21,$22,$23::jsonb
             )`,
            [
              document.id,
              lineNo,
              String(desired.variant.id),
              desired.variant.title_ro,
              desired.variant.brand_name,
              desired.variant.category_name,
              productCode,
              displayBarcode,
              desired.variant.color_name,
              desired.variant.size,
              desired.variant.image_url,
              String(desired.routeFrom.id),
              desired.routeFrom.name || desired.routeFrom.code,
              String(desired.routeTo.id),
              desired.routeTo.name || desired.routeTo.code,
              desired.qty,
              unitPrice,
              lineTotal,
              movement.sourceBefore,
              movement.routeFromAfter,
              movement.targetBefore,
              movement.routeToAfter,
              JSON.stringify(raw),
            ]
          );
        }
      }

      const subtitle = emptyToNull(body.title || body.documentTitle || body.document_title);
      const note = body.note === undefined ? document.note : emptyToNull(body.note);
      const header = await client.query(
        `UPDATE aif_stock_transfer_documents
         SET subtitle=COALESCE($2,subtitle),note=$3,actor=$4,owner_key=COALESCE(owner_key,$5),updated_at=now()
         WHERE id=$1
         RETURNING *`,
        [document.id, subtitle, note, actor, ownerKey]
      );
      document = header.rows[0] || document;
      const refreshed = await refreshAifPreparationDocument(client, document.id, {
        lastEditedAt: new Date().toISOString(),
        lastEditedBy: actor,
        restoredQty,
        addedQty,
      });
      document = refreshed.document || document;
      await client.query('COMMIT');
      return res.json({
        ok: true,
        status: 'preparation',
        documentId: String(document.id),
        documentNumber: document.document_number,
        document,
        lines: refreshed.lines,
        lineCount: Number(document.line_count || 0),
        totalQty: Number(document.total_qty || 0),
        totalValue: Number(document.total_value || 0),
        restoredQty,
        addedQty,
        movementRows,
      });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('AIF update stock transfer preparation failed', error);
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || 'Az előkészítés mentése nem sikerült.', code: error?.code || null });
    } finally {
      client.release();
    }
  }

  async function closeAifStockTransferPreparation(req, res) {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: 'Előkészítés azonosító szükséges.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT * FROM aif_stock_transfer_documents
         WHERE (id::text=$1 OR transfer_id=$1 OR document_number=$1)
         FOR UPDATE`,
        [id]
      );
      if (!current.rowCount) throw Object.assign(new Error('Az előkészítés nem található.'), { statusCode: 404 });
      const document = current.rows[0];
      if (document.status === 'issued') {
        await client.query('COMMIT');
        return res.json({ ok: true, unchanged: true, status: 'issued', document });
      }
      if (document.status !== 'preparation') throw Object.assign(new Error('Csak előkészítés zárható le.'), { statusCode: 400 });
      if (Number(document.line_count || 0) <= 0 || Number(document.total_qty || 0) <= 0) throw Object.assign(new Error('Üres előkészítés nem zárható le.'), { statusCode: 400 });
      const actor = actorFrom(req);
      const updated = await client.query(
        `UPDATE aif_stock_transfer_documents
         SET status='issued',actor=$2,
             raw=COALESCE(raw,'{}'::jsonb) || $3::jsonb,
             updated_at=now()
         WHERE id=$1
         RETURNING *`,
        [document.id, actor, JSON.stringify({ preparation: false, closedAt: new Date().toISOString(), closedBy: actor })]
      );
      await client.query('COMMIT');
      return res.json({ ok: true, status: 'issued', document: updated.rows[0] });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || 'Az előkészítés lezárása nem sikerült.', code: error?.code || null });
    } finally {
      client.release();
    }
  }

  async function reopenAifStockTransferPreparation(req, res) {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: 'Bizonylat azonosító szükséges.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const actor = actorFrom(req);
      const ownerKey = selectionOwnerKey(req);
      const current = await client.query(
        `SELECT * FROM aif_stock_transfer_documents
         WHERE (id::text=$1 OR transfer_id=$1 OR document_number=$1)
         FOR UPDATE`,
        [id]
      );
      if (!current.rowCount) throw Object.assign(new Error('A bizonylat nem található.'), { statusCode: 404 });
      const document = current.rows[0];
      const documentType = cleanAifStockDocumentType(document.document_type, null);
      if (!['internal_transfer','damaged_writeoff'].includes(documentType)) throw Object.assign(new Error('Ez a bizonylattípus nem állítható vissza előkészítésre.'), { statusCode: 400 });
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`aif:stock-preparation:${ownerKey}:${documentType}`]);
      if (document.status === 'preparation') {
        await client.query('COMMIT');
        return res.json({ ok: true, unchanged: true, status: 'preparation', document });
      }
      if (document.status !== 'issued') throw Object.assign(new Error('Csak lezárt bizonylat állítható vissza előkészítésre.'), { statusCode: 400 });
      const other = await client.query(
        `SELECT document_number FROM aif_stock_transfer_documents
         WHERE owner_key=$1 AND document_type=$2 AND status='preparation' AND id<>$3
         LIMIT 1`,
        [ownerKey, documentType, document.id]
      );
      if (other.rowCount) throw Object.assign(new Error(`Már van nyitott előkészítés: ${other.rows[0].document_number}. Előbb zárd le vagy töröld azt.`), { statusCode: 409, code: 'another_preparation_is_open' });
      const updated = await client.query(
        `UPDATE aif_stock_transfer_documents
         SET status='preparation',owner_key=$2,actor=$3,
             raw=COALESCE(raw,'{}'::jsonb) || $4::jsonb,
             updated_at=now()
         WHERE id=$1
         RETURNING *`,
        [document.id, ownerKey, actor, JSON.stringify({ preparation: true, reopenedAt: new Date().toISOString(), reopenedBy: actor })]
      );
      await client.query('COMMIT');
      return res.json({ ok: true, status: 'preparation', document: updated.rows[0] });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || 'A bizonylat nem állítható vissza előkészítésre.', code: error?.code || null });
    } finally {
      client.release();
    }
  }

  async function deleteAifStockTransferPreparation(req, res) {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: 'Előkészítés azonosító szükséges.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT * FROM aif_stock_transfer_documents
         WHERE (id::text=$1 OR transfer_id=$1 OR document_number=$1)
         FOR UPDATE`,
        [id]
      );
      if (!current.rowCount) throw Object.assign(new Error('Az előkészítés nem található.'), { statusCode: 404 });
      const document = current.rows[0];
      if (document.status !== 'preparation') throw Object.assign(new Error('Csak előkészítés törölhető készlet-visszaállítással.'), { statusCode: 400 });
      const lines = await client.query(`SELECT * FROM aif_stock_transfer_document_lines WHERE document_id=$1 ORDER BY line_no DESC FOR UPDATE`, [document.id]);
      const actor = actorFrom(req);
      const documentType = cleanAifStockDocumentType(document.document_type, null);
      let restoredQty = 0;
      let movementRows = 0;
      for (const line of lines.rows) {
        const variant = await readAifTransferVariantSnapshot(client, line.variant_id);
        const quantity = Number(line.qty || 0);
        if (quantity <= 0) continue;
        if (documentType === 'damaged_writeoff') {
          const sourceLocation = await readAifPreparationLocation(client, line.from_location_id, 'készlethely');
          const movement = await applyAifDamagedPreparationStockDelta(client, {
            document,
            lineNo: line.line_no,
            variant,
            sourceLocation,
            qtyDelta: -quantity,
            actor,
            note: document.note,
            title: document.subtitle,
            reason: 'damaged_preparation_deleted_restore',
          });
          movementRows += movement.movementRows;
        } else if (documentType === 'internal_transfer') {
          const routeFrom = await readAifPreparationLocation(client, line.from_location_id, 'forráshely');
          const routeTo = await readAifPreparationLocation(client, line.to_location_id, 'célhely');
          const movement = await applyAifPreparationStockDelta(client, {
            document,
            lineNo: line.line_no,
            variant,
            routeFrom,
            routeTo,
            qtyDelta: -quantity,
            actor,
            note: document.note,
            title: document.subtitle,
            reason: 'preparation_deleted_restore',
          });
          movementRows += movement.movementRows;
        } else {
          throw Object.assign(new Error('Ez az előkészítés nem állítható vissza automatikusan.'), { statusCode: 400 });
        }
        restoredQty += quantity;
      }
      await client.query(
        `INSERT INTO aif_stock_transfer_document_deletions (transfer_id,document_number,source,deleted_by,raw,deleted_at)
         VALUES ($1,$2,'official',$3,$4::jsonb,now())
         ON CONFLICT (transfer_id) DO UPDATE SET document_number=EXCLUDED.document_number,source='official',deleted_by=EXCLUDED.deleted_by,raw=EXCLUDED.raw,deleted_at=now()`,
        [document.transfer_id, document.document_number, actor, JSON.stringify({ preparationDeleted: true, restoredQty, documentId: String(document.id) })]
      );
      await client.query(`DELETE FROM aif_stock_transfer_documents WHERE id=$1`, [document.id]);
      await client.query('COMMIT');
      return res.json({ ok: true, mode: 'preparation_deleted_and_stock_restored', restoredQty, movementRows, documentNumber: document.document_number });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      const status = Number(error?.statusCode || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({ error: error?.message || 'Az előkészítés törlése és a készlet visszaállítása nem sikerült.', code: error?.code || null });
    } finally {
      client.release();
    }
  }

  router.post('/stock-documents/preparation', requireAuthed, handleSaveDamagedPreparation);
  router.post('/stock/documents/preparation', requireAuthed, handleSaveDamagedPreparation);
  router.post('/stock-transfers', requireAuthed, handleStockTransfer);
  router.post('/stock/transfers', requireAuthed, handleStockTransfer);
  router.put('/stock-transfer-documents/:id/preparation', requireAuthed, handleUpdateStockTransferPreparation);
  router.patch('/stock-transfer-documents/:id/preparation', requireAuthed, handleUpdateStockTransferPreparation);
  router.post('/stock-transfer-documents/:id/close', requireAuthed, closeAifStockTransferPreparation);
  router.post('/stock-transfer-documents/:id/reopen', requireAuthed, reopenAifStockTransferPreparation);
  router.delete('/stock-transfer-documents/:id/preparation', requireAuthed, deleteAifStockTransferPreparation);

  async function listStockMovements(req, res) {
    const location = text(req.query.location || req.query.locationCode || req.query.location_id);
    const variant = text(req.query.variant || req.query.variantId || req.query.variant_id);
    const search = text(req.query.search || req.query.q);
    const direction = normCode(req.query.direction || req.query.type || "all");
    const documentTypeFilter = cleanAifStockDocumentType(req.query.documentType || req.query.document_type || req.query.operationType || req.query.operation_type, null);
    const from = emptyToNull(req.query.from || req.query.dateFrom || req.query.date_from);
    const to = emptyToNull(req.query.to || req.query.dateTo || req.query.date_to);
    const limit = Math.min(3000, Math.max(1, Number(req.query.limit || 250)));

    const args = [];
    const where = [];
    if (location) {
      args.push(location);
      where.push(`(l.code=$${args.length} OR l.id::text=$${args.length})`);
    }
    if (variant) {
      args.push(variant);
      where.push(`(v.id::text=$${args.length} OR v.internal_sku=$${args.length} OR v.barcode=$${args.length} OR sc.supplier_barcode=$${args.length} OR sc.supplier_sku=$${args.length})`);
    }
    if (from) {
      args.push(from);
      if (/^\d{4}-\d{2}-\d{2}$/.test(from)) where.push(`sm.created_at >= $${args.length}::date`);
      else where.push(`sm.created_at >= $${args.length}::timestamptz`);
    }
    if (to) {
      args.push(to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) where.push(`sm.created_at < ($${args.length}::date + interval '1 day')`);
      else where.push(`sm.created_at <= $${args.length}::timestamptz`);
    }
    if (["in", "incoming", "be", "bejovo", "bevetelezes"].includes(direction)) {
      where.push(`sm.qty_delta > 0`);
    } else if (["out", "outgoing", "ki", "kimeno", "eladas", "levonas"].includes(direction)) {
      where.push(`sm.qty_delta < 0`);
    } else if (["adjust", "adjustment", "korrekcio", "manual"].includes(direction)) {
      where.push(`(sm.qty_delta = 0 OR sm.movement_type IN ('manual_adjustment','adjustment') OR sm.source_type ILIKE '%manual%' OR sm.source_type='stock_correction')`);
    }
    if (documentTypeFilter) {
      args.push(documentTypeFilter);
      where.push(`(COALESCE(sm.raw->>'documentType','')=$${args.length} OR sm.source_type=$${args.length} OR ($${args.length}='internal_transfer' AND sm.source_type='stock_transfer'))`);
    }
    const searchWhere = aifStockProductSearchWhere(search, args);
    if (searchWhere) where.push(searchWhere);

    // A végleg törölt készletbizonylatok naplósorai ne jelenjenek meg újra a
    // mozgásnaplóban. A készletet nem írjuk vissza, csak az archív nézetből
    // szűrjük ki a dokumentumhoz tartozó technikai mozgásokat.
    where.push(`NOT EXISTS (
      SELECT 1
      FROM aif_stock_transfer_document_deletions del
      WHERE (
        COALESCE(sm.raw->>'transferId', sm.raw->>'transfer_id', '') <> ''
        AND del.transfer_id=COALESCE(sm.raw->>'transferId', sm.raw->>'transfer_id')
      ) OR (
        COALESCE(sm.raw->>'documentNumber', sm.raw->>'document_number', '') <> ''
        AND del.document_number=COALESCE(sm.raw->>'documentNumber', sm.raw->>'document_number')
      ) OR (
        COALESCE(sm.raw->>'documentId', sm.raw->>'document_id', '') <> ''
        AND COALESCE(del.raw->>'documentId', del.raw->>'document_id', '')=COALESCE(sm.raw->>'documentId', sm.raw->>'document_id')
      )
    )`);

    const fromSql = `
       FROM aif_stock_movements sm
       ${aifStockProductJoinSql("sm")}
       ${where.length ? "WHERE " + where.join(" AND ") : ""}`;

    try {
      await ensureAifStockTransferDocumentsSchema();
      const totals = await pool.query(
        `SELECT
           count(*)::int AS movement_count,
           count(DISTINCT sm.variant_id)::int AS distinct_variants,
           COALESCE(sum(CASE WHEN sm.qty_delta > 0 THEN sm.qty_delta ELSE 0 END),0)::numeric AS incoming_qty,
           COALESCE(sum(CASE WHEN sm.qty_delta < 0 THEN abs(sm.qty_delta) ELSE 0 END),0)::numeric AS outgoing_qty,
           COALESCE(sum(sm.qty_delta),0)::numeric AS net_qty
         ${fromSql}`,
        args
      );

      const rowArgs = [...args, limit];
      const rows = await pool.query(
        `SELECT sm.id, sm.created_at, sm.movement_type, sm.source_type, sm.source_id,
                sm.qty_delta, sm.qty_before, sm.qty_after, sm.actor, sm.raw,
                CASE WHEN sm.qty_delta > 0 THEN 'in' WHEN sm.qty_delta < 0 THEN 'out' ELSE 'adjust' END AS direction,
                l.id AS location_id, l.code AS location_code, l.name AS location_name,
                v.id AS variant_id, v.internal_sku, v.barcode, v.sn_cod,
                v.attributes AS variant_attributes,
                ${customsTariffSql('v')} AS customs_tariff_code,
                ${customsTariffSql('v')} AS "customsTariffCode",
                COALESCE(NULLIF(v.barcode,''), NULLIF(sc.supplier_barcode,'')) AS display_barcode,
                v.size, v.color_code, v.color_name, v.color_hex, v.image_url, v.images,
                m.id AS model_id, m.model_code, m.title_ro, m.shopify_title,
                m.status AS model_status, v.status AS variant_status, v.status AS status,
                b.name AS brand_name, b.code AS brand_code,
                c.name_ro AS category_name_ro, c.code AS category_code
         ${fromSql}
         ORDER BY sm.created_at DESC, sm.id DESC
         LIMIT $${rowArgs.length}`,
        rowArgs
      );

      res.json({ items: rows.rows, totals: totals.rows[0] || {} });
    } catch (e) {
      console.error("AIF stock movements failed", e);
      res.status(500).json({ error: e?.message || "A készletmozgások betöltése nem sikerült.", code: e?.code || null });
    }
  }

  router.get("/stock-movements", requireAuthed, listStockMovements);
  router.get("/stock/movements", requireAuthed, listStockMovements);

  async function deleteStockMovement(req, res) {
    const id = text(req.params.id);
    if (!id) return res.status(400).json({ error: "Naplóbejegyzés azonosító kötelező." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT sm.id, sm.created_at, sm.movement_type, sm.source_type, sm.source_id,
                sm.location_id, sm.variant_id, sm.qty_delta, sm.qty_before, sm.qty_after,
                sm.actor, sm.raw,
                m.title_ro, v.sn_cod, COALESCE(NULLIF(v.barcode,''), NULLIF(sc.supplier_barcode,'')) AS display_barcode,
                l.name AS location_name
         FROM aif_stock_movements sm
         JOIN aif_locations l ON l.id=sm.location_id
         JOIN aif_product_variants v ON v.id=sm.variant_id
         JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN LATERAL (
           SELECT supplier_barcode, supplier_sku
           FROM aif_variant_supplier_codes sc
           WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
           ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
           LIMIT 1
         ) sc ON true
         WHERE sm.id::text=$1
         FOR UPDATE OF sm`,
        [id]
      );
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Naplóbejegyzés nem található." });
      }

      await client.query(`DELETE FROM aif_stock_movements WHERE id=$1`, [current.rows[0].id]);
      await client.query("COMMIT");
      res.json({
        ok: true,
        mode: "permanently_deleted",
        item: current.rows[0],
        note: "A törlés csak a mozgásnaplót érinti, a készlet mennyiségét nem módosítja.",
      });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF delete stock movement failed", e);
      res.status(500).json({ error: e?.message || "A naplóbejegyzés törlése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  }

  router.delete("/stock-movements/:id", requireAuthed, deleteStockMovement);
  router.delete("/stock/movements/:id", requireAuthed, deleteStockMovement);

  async function deleteStockMovementsBulk(req, res) {
    const sourceIds = Array.isArray(req.body?.ids)
      ? req.body.ids
      : Array.isArray(req.body?.movementIds)
        ? req.body.movementIds
        : Array.isArray(req.body?.movement_ids)
          ? req.body.movement_ids
          : [];
    const ids = Array.from(new Set(sourceIds.map((value) => text(value)).filter(Boolean))).slice(0, 3000);
    if (!ids.length) return res.status(400).json({ error: "Legalább egy naplóbejegyzést ki kell jelölni." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query(
        `SELECT id::text AS id
         FROM aif_stock_movements
         WHERE id::text = ANY($1::text[])
         FOR UPDATE`,
        [ids]
      );
      const foundIds = locked.rows.map((row) => String(row.id));
      if (!foundIds.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "A kijelölt naplóbejegyzések már nem találhatók." });
      }

      const deleted = await client.query(
        `DELETE FROM aif_stock_movements
         WHERE id::text = ANY($1::text[])
         RETURNING id::text AS id`,
        [foundIds]
      );
      await client.query("COMMIT");
      const deletedIds = deleted.rows.map((row) => String(row.id));
      const deletedSet = new Set(deletedIds);
      return res.json({
        ok: true,
        mode: "bulk_permanently_deleted",
        deletedCount: deletedIds.length,
        deletedIds,
        missingIds: ids.filter((id) => !deletedSet.has(id)),
        note: "A törlés csak a mozgásnaplót érinti, a készlet mennyiségét nem módosítja.",
      });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF bulk delete stock movements failed", e);
      return res.status(500).json({ error: e?.message || "A kijelölt naplóbejegyzések törlése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  }

  router.post("/stock-movements/bulk-delete", requireAuthed, deleteStockMovementsBulk);
  router.post("/stock/movements/bulk-delete", requireAuthed, deleteStockMovementsBulk);


  function inventoryCountStatus(value) {
    const status = normCode(value || "");
    return ["draft", "counting", "review", "committed", "cancelled"].includes(status) ? status : null;
  }

  function inventoryCountCode() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `INV-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  async function ensureInventoryCountTables(client) {
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await client.query(`CREATE TABLE IF NOT EXISTS aif_inventory_counts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code text NOT NULL UNIQUE,
      title text NOT NULL,
      location_id uuid NOT NULL REFERENCES aif_locations(id),
      status text NOT NULL DEFAULT 'draft',
      started_at timestamptz NOT NULL DEFAULT now(),
      counted_at timestamptz NULL,
      committed_at timestamptz NULL,
      actor text NULL,
      note text NULL,
      raw jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (status IN ('draft','counting','review','committed','cancelled'))
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS aif_inventory_count_lines (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      count_id uuid NOT NULL REFERENCES aif_inventory_counts(id) ON DELETE CASCADE,
      variant_id uuid NOT NULL REFERENCES aif_product_variants(id),
      expected_qty numeric NOT NULL DEFAULT 0,
      expected_reserved_qty numeric NOT NULL DEFAULT 0,
      counted_qty numeric NULL,
      buy_price numeric NULL,
      sell_price numeric NULL,
      note text NULL,
      raw jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (count_id, variant_id)
    )`);
    await client.query(`CREATE INDEX IF NOT EXISTS aif_inventory_counts_location_status_idx ON aif_inventory_counts (location_id, status, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS aif_inventory_counts_created_idx ON aif_inventory_counts (created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS aif_inventory_count_lines_count_idx ON aif_inventory_count_lines (count_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS aif_inventory_count_lines_variant_idx ON aif_inventory_count_lines (variant_id)`);
  }

  function inventoryCountSummarySql(whereSql = "") {
    return `SELECT
       ic.id, ic.code, ic.title, ic.location_id, ic.status, ic.started_at, ic.counted_at,
       ic.committed_at, ic.actor, ic.note, ic.raw, ic.created_at, ic.updated_at,
       l.code AS location_code, l.name AS location_name, l.location_type,
       count(icl.id)::int AS line_count,
       count(icl.id) FILTER (WHERE icl.counted_qty IS NOT NULL)::int AS counted_lines,
       COALESCE(sum(icl.expected_qty),0)::numeric AS expected_qty,
       COALESCE(sum(icl.counted_qty) FILTER (WHERE icl.counted_qty IS NOT NULL),0)::numeric AS counted_qty,
       COALESCE(sum((icl.counted_qty - icl.expected_qty)) FILTER (WHERE icl.counted_qty IS NOT NULL),0)::numeric AS diff_qty,
       COALESCE(sum(GREATEST(icl.expected_qty - icl.counted_qty, 0)) FILTER (WHERE icl.counted_qty IS NOT NULL),0)::numeric AS missing_qty,
       COALESCE(sum(GREATEST(icl.counted_qty - icl.expected_qty, 0)) FILTER (WHERE icl.counted_qty IS NOT NULL),0)::numeric AS extra_qty,
       COALESCE(sum(GREATEST(icl.expected_qty - icl.counted_qty, 0) * COALESCE(icl.sell_price,0)) FILTER (WHERE icl.counted_qty IS NOT NULL),0)::numeric(14,2) AS missing_sell_value,
       COALESCE(sum(GREATEST(icl.counted_qty - icl.expected_qty, 0) * COALESCE(icl.sell_price,0)) FILTER (WHERE icl.counted_qty IS NOT NULL),0)::numeric(14,2) AS extra_sell_value,
       COALESCE(sum((icl.counted_qty - icl.expected_qty) * COALESCE(icl.sell_price,0)) FILTER (WHERE icl.counted_qty IS NOT NULL),0)::numeric(14,2) AS diff_sell_value,
       COALESCE(sum(GREATEST(icl.expected_qty - icl.counted_qty, 0) * COALESCE(icl.buy_price,0)) FILTER (WHERE icl.counted_qty IS NOT NULL),0)::numeric(14,2) AS missing_buy_value,
       COALESCE(sum(GREATEST(icl.counted_qty - icl.expected_qty, 0) * COALESCE(icl.buy_price,0)) FILTER (WHERE icl.counted_qty IS NOT NULL),0)::numeric(14,2) AS extra_buy_value,
       COALESCE(sum((icl.counted_qty - icl.expected_qty) * COALESCE(icl.buy_price,0)) FILTER (WHERE icl.counted_qty IS NOT NULL),0)::numeric(14,2) AS diff_buy_value
     FROM aif_inventory_counts ic
     JOIN aif_locations l ON l.id=ic.location_id
     LEFT JOIN aif_inventory_count_lines icl ON icl.count_id=ic.id
     ${whereSql}
     GROUP BY ic.id, l.id`;
  }

  async function loadInventoryCountSummary(client, id) {
    const r = await client.query(`${inventoryCountSummarySql("WHERE ic.id::text=$1")} LIMIT 1`, [text(id)]);
    return r.rows[0] || null;
  }

  async function loadInventoryCountLines(client, countId) {
    const r = await client.query(
      `SELECT
         icl.id, icl.count_id, icl.variant_id, icl.expected_qty, icl.expected_reserved_qty,
         icl.counted_qty, (icl.counted_qty - icl.expected_qty) AS diff_qty,
         GREATEST(icl.expected_qty - icl.counted_qty, 0) AS missing_qty,
         GREATEST(icl.counted_qty - icl.expected_qty, 0) AS extra_qty,
         icl.buy_price, icl.sell_price,
         ((icl.counted_qty - icl.expected_qty) * COALESCE(icl.buy_price,0))::numeric(14,2) AS diff_buy_value,
         ((icl.counted_qty - icl.expected_qty) * COALESCE(icl.sell_price,0))::numeric(14,2) AS diff_sell_value,
         icl.note, icl.raw, icl.created_at, icl.updated_at,
         l.id AS location_id, l.code AS location_code, l.name AS location_name,
         v.internal_sku, v.barcode, v.sn_cod, COALESCE(NULLIF(v.barcode,''), NULLIF(sc.supplier_barcode,'')) AS display_barcode,
         v.size, v.color_code, v.color_name, v.color_hex, v.image_url, v.images,
         m.id AS model_id, m.model_code, m.title_ro, m.shopify_title,
         b.name AS brand_name, b.code AS brand_code,
         cat.name_ro AS category_name_ro, cat.code AS category_code,
         COALESCE(s.qty,0) AS current_qty,
         COALESCE(s.reserved_qty,0) AS current_reserved_qty,
         COALESCE(s.qty,0) - COALESCE(s.reserved_qty,0) AS current_available_qty
       FROM aif_inventory_count_lines icl
       JOIN aif_inventory_counts ic ON ic.id=icl.count_id
       JOIN aif_locations l ON l.id=ic.location_id
       JOIN aif_product_variants v ON v.id=icl.variant_id
       JOIN aif_product_models m ON m.id=v.model_id
       LEFT JOIN aif_brands b ON b.id=m.brand_id
       LEFT JOIN aif_categories cat ON cat.id=m.category_id
       LEFT JOIN aif_stock s ON s.location_id=ic.location_id AND s.variant_id=icl.variant_id
       LEFT JOIN LATERAL (
         SELECT supplier_barcode, supplier_sku
         FROM aif_variant_supplier_codes sc
         WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
         ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
         LIMIT 1
       ) sc ON true
       WHERE icl.count_id=$1
       ORDER BY b.name ASC NULLS LAST, m.title_ro ASC, v.color_name ASC NULLS LAST, v.size ASC`,
      [countId]
    );
    return r.rows;
  }

  async function sendInventoryCountDetail(client, res, id) {
    const item = await loadInventoryCountSummary(client, id);
    if (!item) return res.status(404).json({ error: "Leltár nem található." });
    const lines = await loadInventoryCountLines(client, item.id);
    res.json({ item, lines, totals: item });
  }

  router.get("/inventory-counts", requireAuthed, async (req, res) => {
    const client = await pool.connect();
    try {
      await ensureInventoryCountTables(client);
      const location = text(req.query.location || req.query.locationId || req.query.location_id);
      const status = inventoryCountStatus(req.query.status);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
      const args = [];
      const where = [];
      if (location) {
        args.push(location);
        where.push(`(ic.location_id::text=$${args.length} OR l.code=$${args.length})`);
      }
      if (status) {
        args.push(status);
        where.push(`ic.status=$${args.length}`);
      }
      args.push(limit);
      const r = await client.query(
        `${inventoryCountSummarySql(where.length ? "WHERE " + where.join(" AND ") : "")}
         ORDER BY ic.created_at DESC
         LIMIT $${args.length}`,
        args
      );
      res.json({ items: r.rows });
    } catch (e) {
      console.error("AIF inventory counts list failed", e);
      res.status(500).json({ error: e?.message || "A leltárak betöltése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.post("/inventory-counts", requireAuthed, async (req, res) => {
    const body = req.body || {};
    const locationInput = body.locationId || body.location_id || body.locationCode || body.location_code || body.location;
    const title = text(body.title || `Leltár ${new Date().toLocaleDateString("hu-HU")}`);
    const note = emptyToNull(body.note);
    const search = text(body.search || body.q);
    const includeZero = ["1", "true", "yes"].includes(text(body.includeZero || body.include_zero).toLowerCase());
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureInventoryCountTables(client);
      const location = await findByIdOrCode(client, "aif_locations", locationInput);
      if (!location || location.is_active === false) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Érvénytelen vagy inaktív üzlet / helyszín." });
      }

      const countRes = await client.query(
        `INSERT INTO aif_inventory_counts (code, title, location_id, status, actor, note, raw)
         VALUES ($1,$2,$3,'draft',$4,$5,$6::jsonb)
         RETURNING id`,
        [inventoryCountCode(), title || "Leltár", location.id, actorFrom(req), note, JSON.stringify({ search: search || null, includeZero })]
      );
      const countId = countRes.rows[0].id;

      const args = [location.id];
      const where = [`s.location_id=$1`, `COALESCE(v.status,'active') <> 'archived'`];
      if (!includeZero) where.push(`(COALESCE(s.qty,0) <> 0 OR COALESCE(s.reserved_qty,0) <> 0)`);
      const searchWhere = aifStockProductSearchWhere(search, args);
      if (searchWhere) where.push(searchWhere);

      const stockRows = await client.query(
        `SELECT s.variant_id, COALESCE(s.qty,0) AS qty, COALESCE(s.reserved_qty,0) AS reserved_qty,
                v.buy_price, v.sell_price
         FROM aif_stock s
         ${aifStockProductJoinSql("s")}
         WHERE ${where.join(" AND ")}
         ORDER BY b.name ASC NULLS LAST, m.title_ro ASC, v.color_name ASC NULLS LAST, v.size ASC`,
        args
      );

      if (!stockRows.rowCount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "A kiválasztott helyszínen nincs leltározható készlet a szűrőkkel." });
      }

      for (const row of stockRows.rows) {
        await client.query(
          `INSERT INTO aif_inventory_count_lines (count_id, variant_id, expected_qty, expected_reserved_qty, buy_price, sell_price, raw)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
           ON CONFLICT (count_id, variant_id) DO NOTHING`,
          [countId, row.variant_id, row.qty, row.reserved_qty, row.buy_price, row.sell_price, JSON.stringify({ snapshot: true })]
        );
      }

      await client.query("COMMIT");
      return sendInventoryCountDetail(client, res, countId);
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF inventory count create failed", e);
      res.status(500).json({ error: e?.message || "A leltár indítása nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.get("/inventory-counts/:id", requireAuthed, async (req, res) => {
    const client = await pool.connect();
    try {
      await ensureInventoryCountTables(client);
      return sendInventoryCountDetail(client, res, req.params.id);
    } catch (e) {
      console.error("AIF inventory count detail failed", e);
      res.status(500).json({ error: e?.message || "A leltár betöltése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.patch("/inventory-counts/:id/lines", requireAuthed, async (req, res) => {
    const countId = text(req.params.id);
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    if (!lines.length) return res.status(400).json({ error: "Nincs menthető leltársor." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureInventoryCountTables(client);
      const count = await client.query(`SELECT id, status FROM aif_inventory_counts WHERE id::text=$1 FOR UPDATE`, [countId]);
      if (!count.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Leltár nem található." });
      }
      if (["committed", "cancelled"].includes(count.rows[0].status)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Lezárt vagy törölt leltár nem módosítható." });
      }

      let saved = 0;
      for (const input of lines) {
        const lineId = text(input.lineId || input.line_id || input.id);
        const variantId = text(input.variantId || input.variant_id);
        const rawQty = input.countedQty ?? input.counted_qty;
        const countedQty = rawQty === null || rawQty === undefined || String(rawQty).trim() === "" ? null : toInt(rawQty);
        const note = emptyToNull(input.note);
        if (countedQty !== null && countedQty < 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "A talált darabszám nem lehet negatív." });
        }
        const args = [count.rows[0].id, countedQty, note];
        let where = "count_id=$1";
        if (lineId) {
          args.push(lineId);
          where += ` AND id::text=$${args.length}`;
        } else if (variantId) {
          args.push(variantId);
          where += ` AND variant_id::text=$${args.length}`;
        } else {
          continue;
        }
        const r = await client.query(
          `UPDATE aif_inventory_count_lines
           SET counted_qty=$2, note=$3, updated_at=now()
           WHERE ${where}`,
          args
        );
        saved += r.rowCount || 0;
      }

      await client.query(
        `UPDATE aif_inventory_counts
         SET status=CASE WHEN status='draft' THEN 'counting' ELSE status END,
             counted_at=now(), updated_at=now()
         WHERE id=$1`,
        [count.rows[0].id]
      );
      await client.query("COMMIT");
      const detail = await loadInventoryCountSummary(client, count.rows[0].id);
      const detailLines = await loadInventoryCountLines(client, count.rows[0].id);
      res.json({ ok: true, saved, item: detail, lines: detailLines, totals: detail });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF inventory count lines save failed", e);
      res.status(500).json({ error: e?.message || "A leltársorok mentése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.post("/inventory-counts/:id/commit", requireAuthed, async (req, res) => {
    const countId = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureInventoryCountTables(client);
      const count = await client.query(
        `SELECT ic.*, l.code AS location_code, l.name AS location_name
         FROM aif_inventory_counts ic
         JOIN aif_locations l ON l.id=ic.location_id
         WHERE ic.id::text=$1
         FOR UPDATE OF ic`,
        [countId]
      );
      if (!count.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Leltár nem található." });
      }
      const item = count.rows[0];
      if (["committed", "cancelled"].includes(item.status)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Ez a leltár már lezárt vagy törölt." });
      }

      const missing = await client.query(`SELECT count(*)::int AS c FROM aif_inventory_count_lines WHERE count_id=$1 AND counted_qty IS NULL`, [item.id]);
      if (Number(missing.rows[0]?.c || 0) > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `Még ${missing.rows[0].c} sor nincs megszámolva. Bevezetés előtt minden sorhoz kell talált darabszám.` });
      }

      const lines = await client.query(
        `SELECT icl.*, m.title_ro, v.size, v.color_name, v.sn_cod, COALESCE(NULLIF(v.barcode,''), NULLIF(sc.supplier_barcode,'')) AS display_barcode,
                COALESCE(s.qty,0) AS current_qty, COALESCE(s.reserved_qty,0) AS current_reserved_qty
         FROM aif_inventory_count_lines icl
         JOIN aif_product_variants v ON v.id=icl.variant_id
         JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN aif_stock s ON s.location_id=$2 AND s.variant_id=icl.variant_id
         LEFT JOIN LATERAL (
           SELECT supplier_barcode, supplier_sku
           FROM aif_variant_supplier_codes sc
           WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
           ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
           LIMIT 1
         ) sc ON true
         WHERE icl.count_id=$1
         ORDER BY m.title_ro ASC
         FOR UPDATE OF icl`,
        [item.id, item.location_id]
      );

      let changed = 0;
      let netDiff = 0;
      for (const line of lines.rows) {
        const currentStock = await client.query(
          `SELECT qty, reserved_qty FROM aif_stock WHERE location_id=$1 AND variant_id=$2 FOR UPDATE`,
          [item.location_id, line.variant_id]
        );
        const beforeQty = currentStock.rowCount ? Number(currentStock.rows[0].qty || 0) : 0;
        const beforeReserved = currentStock.rowCount ? Number(currentStock.rows[0].reserved_qty || 0) : 0;
        const afterQty = Number(line.counted_qty || 0);
        const afterReserved = Math.min(beforeReserved, afterQty);
        if (!Number.isFinite(afterQty) || afterQty < 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: `Érvénytelen darabszám: ${line.title_ro}` });
        }

        await client.query(
          `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
           VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (location_id, variant_id)
           DO UPDATE SET qty=$3, reserved_qty=$4, updated_at=now()`,
          [item.location_id, line.variant_id, afterQty, afterReserved]
        );

        const diff = afterQty - beforeQty;
        if (diff !== 0 || afterReserved !== beforeReserved) {
          await insertStockMovementSafe(client, {
            movementType: "manual_adjustment",
            sourceType: "inventory_count",
            sourcePrefix: "inventory",
            sourceId: String(item.id),
            locationId: item.location_id,
            variantId: line.variant_id,
            qtyDelta: diff,
            qtyBefore: beforeQty,
            qtyAfter: afterQty,
            actor: actorFrom(req),
            raw: {
              reason: "inventory_count_commit",
              inventoryCountId: item.id,
              inventoryCountCode: item.code,
              inventoryCountLineId: line.id,
              title: line.title_ro,
              barcode: line.display_barcode,
              snCod: line.sn_cod,
              colorName: line.color_name,
              size: line.size,
              locationCode: item.location_code,
              locationName: item.location_name,
              expectedQty: Number(line.expected_qty || 0),
              countedQty: afterQty,
              qtyBefore: beforeQty,
              qtyAfter: afterQty,
              reservedBefore: beforeReserved,
              reservedAfter: afterReserved,
              note: line.note || null,
            },
          });
          changed++;
          netDiff += diff;
        }
      }

      await client.query(
        `UPDATE aif_inventory_counts
         SET status='committed', committed_at=now(), updated_at=now(),
             raw=COALESCE(raw,'{}'::jsonb) || $2::jsonb
         WHERE id=$1`,
        [item.id, JSON.stringify({ committedBy: actorFrom(req), changed, netDiff })]
      );

      await client.query("COMMIT");
      const detail = await loadInventoryCountSummary(client, item.id);
      const detailLines = await loadInventoryCountLines(client, item.id);
      res.json({ ok: true, changed, netDiff, item: detail, lines: detailLines, totals: detail });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF inventory count commit failed", e);
      res.status(500).json({ error: e?.message || "A leltár bevezetése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.delete("/inventory-counts/:id", requireAuthed, async (req, res) => {
    const id = text(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await ensureInventoryCountTables(client);
      const current = await client.query(`SELECT id, status FROM aif_inventory_counts WHERE id::text=$1 FOR UPDATE`, [id]);
      if (!current.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Leltár nem található." });
      }
      if (current.rows[0].status === "committed") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Bevezetett leltár nem törölhető innen." });
      }
      await client.query(`DELETE FROM aif_inventory_counts WHERE id=$1`, [current.rows[0].id]);
      await client.query("COMMIT");
      res.json({ ok: true, mode: "deleted" });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF inventory count delete failed", e);
      res.status(500).json({ error: e?.message || "A leltár törlése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });


  // Shopify -> AllIn inventory webhook. Public endpoint, Shopify HMAC védi.
  router.post("/shopify/webhooks/inventory-levels-update", async (req, res) => {
    try {
      const result = await receiveAifShopifyInventoryWebhook(pool, {
        rawBody: req.rawBody,
        payload: req.body,
        headers: req.headers,
      });
      if (!result.accepted) {
        return res.status(Number(result.statusCode || 400)).json({ ok: false, error: result.error, topic: result.topic || null });
      }
      return res.status(200).json({ ok: true, duplicate: result.duplicate, webhookId: result.webhookId });
    } catch (e) {
      console.error("AIF Shopify inventory webhook receive failed", e);
      return res.status(500).json({ ok: false, error: e?.message || "A Shopify webhook mentése nem sikerült." });
    }
  });

  // Shopify rendelési webhooks. Ezek csak rendelési adatot mentenek, készletet nem vonnak le.
  // A készletet továbbra is kizárólag az inventory_levels/update webhook tartja szinkronban.
  router.post("/shopify/webhooks/orders", async (req, res) => {
    try {
      const result = await receiveAifShopifyOrderWebhook(pool, {
        rawBody: req.rawBody,
        payload: req.body,
        headers: req.headers,
      });
      if (!result.accepted) {
        return res.status(Number(result.statusCode || 400)).json({ ok: false, error: result.error, topic: result.topic || null });
      }
      return res.status(200).json({ ok: true, duplicate: result.duplicate, webhookId: result.webhookId, topic: result.topic });
    } catch (e) {
      console.error("AIF Shopify order webhook receive failed", e);
      return res.status(500).json({ ok: false, error: e?.message || "A Shopify rendelési webhook mentése nem sikerült." });
    }
  });

  router.post("/shopify/orders/process", requireAdminOrSecret, async (req, res) => {
    try {
      const result = await processAifShopifyOrderBatch(pool, { limit: Number(req.body?.limit || 20) });
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error("AIF Shopify order process failed", e);
      res.status(Number(e?.statusCode || 500)).json({ error: e?.message || "A Shopify rendelések feldolgozása nem sikerült.", code: e?.code || null });
    }
  });

  router.get("/shopify/orders", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      const items = await listAifShopifyOrders(client, {
        limit: Number(req.query.limit || 100),
        search: req.query.search || req.query.q || "",
        status: req.query.status || "",
        financialStatus: req.query.financialStatus || req.query.financial_status || "",
        fulfillmentStatus: req.query.fulfillmentStatus || req.query.fulfillment_status || "",
        from: req.query.from || "",
        to: req.query.to || "",
        onlyProblems: req.query.onlyProblems || req.query.only_problems || false,
        testMode: req.query.testMode || req.query.test_mode || "",
      });
      res.json({ ok: true, items });
    } catch (e) {
      console.error("AIF Shopify orders list failed", e);
      res.status(500).json({ error: e?.message || "A Shopify rendelések betöltése nem sikerült." });
    } finally {
      client.release();
    }
  });

  router.post("/shopify/orders/delete-batch", requireAdminOrSecret, async (req, res) => {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((value) => text(value)).filter(Boolean)
      : [];
    const confirmation = text(req.body?.confirmation || req.body?.confirm).toUpperCase();
    const reason = text(req.body?.reason || "Végleges törlés az AllIn rendelési felületéről");
    if (!ids.length) return res.status(400).json({ error: "Nincs kijelölt törölhető rendelés." });
    if (!["TÖRLÉS", "TORLES", "DELETE"].includes(confirmation)) {
      return res.status(400).json({ error: "A végleges törléshez írd be: TÖRLÉS" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await deleteAifShopifyOrders(client, ids, {
        actor: actorFrom(req),
        reason,
      });
      await client.query("COMMIT");
      res.json(result);
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF Shopify orders permanent delete failed", e);
      res.status(Number(e?.statusCode || 500)).json({
        error: e?.message || "A Shopify rendelések végleges törlése nem sikerült.",
        code: e?.code || null,
      });
    } finally {
      client.release();
    }
  });

  router.delete("/shopify/orders/:id", requireAdminOrSecret, async (req, res) => {
    const confirmation = text(req.body?.confirmation || req.body?.confirm || req.query?.confirmation || req.query?.confirm).toUpperCase();
    const reason = text(req.body?.reason || req.query?.reason || "Végleges törlés az AllIn rendelési felületéről");
    if (!["TÖRLÉS", "TORLES", "DELETE"].includes(confirmation)) {
      return res.status(400).json({ error: "A végleges törléshez írd be: TÖRLÉS" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await deleteAifShopifyOrder(client, req.params.id, {
        actor: actorFrom(req),
        reason,
      });
      if (!result) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "A Shopify rendelés nem található." });
      }
      await client.query("COMMIT");
      res.json(result);
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("AIF Shopify order permanent delete failed", e);
      res.status(Number(e?.statusCode || 500)).json({
        error: e?.message || "A Shopify rendelés végleges törlése nem sikerült.",
        code: e?.code || null,
      });
    } finally {
      client.release();
    }
  });

  router.get("/shopify/orders/:id", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      const order = await getAifShopifyOrder(client, req.params.id);
      if (!order) return res.status(404).json({ error: "A Shopify rendelés nem található." });
      res.json({ ok: true, ...order });
    } catch (e) {
      console.error("AIF Shopify order detail failed", e);
      res.status(500).json({ error: e?.message || "A Shopify rendelés betöltése nem sikerült." });
    } finally {
      client.release();
    }
  });

  router.get("/shopify/order-events", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      const items = await listAifShopifyOrderEvents(client, { limit: Number(req.query.limit || 50) });
      res.json({ ok: true, items });
    } catch (e) {
      console.error("AIF Shopify order events list failed", e);
      res.status(500).json({ error: e?.message || "A Shopify rendelési események betöltése nem sikerült." });
    } finally {
      client.release();
    }
  });

  router.post("/shopify/inbound/process", requireAdminOrSecret, async (req, res) => {
    try {
      const result = await processAifShopifyInboundBatch(pool, { limit: Number(req.body?.limit || 20) });
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error("AIF Shopify inbound process failed", e);
      res.status(Number(e?.statusCode || 500)).json({ error: e?.message || "A Shopify bejövő készlet feldolgozása nem sikerült.", code: e?.code || null });
    }
  });

  router.get("/shopify/inbound/events", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      const items = await listAifShopifyInboundEvents(client, { limit: Number(req.query.limit || 50) });
      res.json({ ok: true, items });
    } catch (e) {
      console.error("AIF Shopify inbound events list failed", e);
      res.status(500).json({ error: e?.message || "A Shopify webhook események betöltése nem sikerült." });
    } finally {
      client.release();
    }
  });

  // Shopify integráció, 1. fázis: kapcsolat, SKU-audit, biztonságos térképezés és kézi outbox teszt.
  // SHOPIFY_SYNC_ENABLED=false mellett ezek az útvonalak nem írnak készletet a Shopifyba.
  router.post("/shopify/schema", requireAdminOrSecret, async (_req, res) => {
    const client = await pool.connect();
    try {
      await ensureAifShopifyTables(client);
      res.json({ ok: true });
    } catch (e) {
      console.error("AIF Shopify schema ensure failed", e);
      res.status(500).json({ error: e?.message || "A Shopify szinkron táblák létrehozása nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.get("/shopify/status", requireAdminOrSecret, async (_req, res) => {
    const client = await pool.connect();
    try {
      const status = await getAifShopifyStatus(client);
      res.json(status);
    } catch (e) {
      console.error("AIF Shopify status failed", e);
      res.status(Number(e?.statusCode || 500)).json({ error: e?.message || "A Shopify kapcsolat ellenőrzése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.get("/shopify/audit", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      const audit = await auditAifShopifySkus(client, { sampleLimit: Number(req.query.sample || req.query.limit || 30) });
      res.json({ ok: true, audit });
    } catch (e) {
      console.error("AIF Shopify SKU audit failed", e);
      res.status(Number(e?.statusCode || 500)).json({ error: e?.message || "A Shopify SKU-audit nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.post("/shopify/map", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      const dryRun = req.body?.dryRun !== false && req.body?.dry_run !== false;
      const result = await mapAifShopifyVariants(client, {
        dryRun,
        sampleLimit: Number(req.body?.sampleLimit || req.body?.sample_limit || 30),
      });
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error("AIF Shopify variant map failed", e);
      res.status(Number(e?.statusCode || 500)).json({ error: e?.message || "A Shopify variánsok összekapcsolása nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.get("/shopify/mappings", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      const items = await listAifShopifyMappings(client, { limit: Number(req.query.limit || 200) });
      res.json({ ok: true, items });
    } catch (e) {
      console.error("AIF Shopify mappings list failed", e);
      res.status(500).json({ error: e?.message || "A Shopify kapcsolatok betöltése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });


  router.post("/shopify/mappings/refresh", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      const result = await refreshAifShopifyMappings(client, {
        variantIds: Array.isArray(req.body?.variantIds) ? req.body.variantIds : Array.isArray(req.body?.variant_ids) ? req.body.variant_ids : [],
        sync: req.body?.sync === true,
        syncRepaired: req.body?.syncRepaired !== false && req.body?.sync_repaired !== false,
        limit: Number(req.body?.limit || 1000),
      });
      let processed = null;
      if (result.queued > 0 && req.body?.process !== false) {
        processed = await processAifShopifyOutboxBatch(pool, {
          limit: Math.min(1000, Math.max(1, Number(req.body?.processLimit || req.body?.process_limit || result.queued))),
        });
      }
      res.json({ ...result, processed });
    } catch (e) {
      console.error("AIF Shopify mapping refresh failed", e);
      res.status(Number(e?.statusCode || 500)).json({ error: e?.message || "A Shopify kapcsolatok ellenőrzése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.post("/shopify/mappings/:variantId/refresh", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      const variantId = text(req.params.variantId);
      if (!variantId) return res.status(400).json({ error: "variantId required" });
      const result = await refreshAifShopifyMappings(client, {
        variantIds: [variantId],
        sync: req.body?.sync !== false,
        syncRepaired: true,
        limit: 1,
      });
      let processed = null;
      if (result.queued > 0 && req.body?.process !== false) {
        processed = await processAifShopifyOutboxBatch(pool, { limit: Math.max(1, Number(req.body?.processLimit || 5)) });
      }
      res.json({ ...result, processed });
    } catch (e) {
      console.error("AIF Shopify single mapping refresh failed", e);
      res.status(Number(e?.statusCode || 500)).json({ error: e?.message || "A Shopify kapcsolat újraellenőrzése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.post("/shopify/enqueue-all", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      const result = await enqueueAllMappedAifShopifyVariants(client, text(req.body?.reason || "manual_full_sync"));
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error("AIF Shopify enqueue all failed", e);
      res.status(500).json({ error: e?.message || "A Shopify szinkronlista előkészítése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.post("/shopify/process", requireAdminOrSecret, async (req, res) => {
    try {
      const result = await processAifShopifyOutboxBatch(pool, { limit: Number(req.body?.limit || 20) });
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error("AIF Shopify outbox process failed", e);
      res.status(Number(e?.statusCode || 500)).json({ error: e?.message || "A Shopify szinkron feldolgozása nem sikerült.", code: e?.code || null });
    }
  });

  // Shopify termékexport: kijelölt AllIn variánsok ellenőrzése, egyetlen termék-CSV és import utáni párosítás.
  router.post("/shopify/product-exports/preview", requireAuthed, async (req, res) => {
    const client = await pool.connect();
    try {
      const preview = await previewAifShopifyProductExport(client, {
        variantIds: Array.isArray(req.body?.variantIds) ? req.body.variantIds : Array.isArray(req.body?.variant_ids) ? req.body.variant_ids : [],
        selectionMode: req.body?.selectionMode || req.body?.selection_mode,
        productStatus: req.body?.productStatus || req.body?.product_status,
        includeMapped: req.body?.includeMapped ?? req.body?.include_mapped,
      });
      res.json(preview);
    } catch (e) {
      console.error("AIF Shopify product export preview failed", e);
      res.status(Number(e?.statusCode || 500)).json({ error: e?.message || "A Shopify export ellenőrzése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.post("/shopify/product-exports", requireAuthed, async (req, res) => {
    const client = await pool.connect();
    try {
      const result = await createAifShopifyProductExport(client, {
        variantIds: Array.isArray(req.body?.variantIds) ? req.body.variantIds : Array.isArray(req.body?.variant_ids) ? req.body.variant_ids : [],
        selectionMode: req.body?.selectionMode || req.body?.selection_mode,
        productStatus: req.body?.productStatus || req.body?.product_status,
        includeMapped: req.body?.includeMapped ?? req.body?.include_mapped,
        actor: actorFrom(req),
      });
      res.json(result);
    } catch (e) {
      console.error("AIF Shopify product export create failed", e);
      const payload = { error: e?.message || "A Shopify export létrehozása nem sikerült.", code: e?.code || null };
      if (e?.preview) payload.preview = e.preview;
      res.status(Number(e?.statusCode || 500)).json(payload);
    } finally {
      client.release();
    }
  });

  router.get("/shopify/product-exports", requireAuthed, async (req, res) => {
    const client = await pool.connect();
    try {
      const items = await listAifShopifyProductExports(client, { limit: Number(req.query.limit || 20) });
      res.json({ ok: true, items });
    } catch (e) {
      console.error("AIF Shopify product exports list failed", e);
      res.status(500).json({ error: e?.message || "A Shopify exportok betöltése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });


  router.post("/shopify/product-exports/delete-batch", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : Array.isArray(req.body?.exportIds) ? req.body.exportIds : [];
      const result = await deleteAifShopifyProductExports(client, ids);
      res.json(result);
    } catch (e) {
      console.error("AIF Shopify product exports batch delete failed", e);
      res.status(500).json({ error: e?.message || "A Shopify exportelőzmények törlése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.delete("/shopify/product-exports/:id", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      const result = await deleteAifShopifyProductExport(client, req.params.id);
      if (!result) return res.status(404).json({ error: "Shopify export nem található." });
      res.json(result);
    } catch (e) {
      console.error("AIF Shopify product export delete failed", e);
      res.status(500).json({ error: e?.message || "A Shopify exportelőzmény törlése nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.get("/shopify/product-exports/:id/download", requireAuthed, async (req, res) => {
    const client = await pool.connect();
    try {
      const result = await getAifShopifyProductExportCsv(client, req.params.id);
      if (!result) return res.status(404).json({ error: "Shopify export nem található." });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
      res.setHeader("Content-Length", String(result.csv.length));
      res.send(result.csv);
    } catch (e) {
      console.error("AIF Shopify product export download failed", e);
      res.status(500).json({ error: e?.message || "A Shopify export CSV nem tölthető le.", code: e?.code || null });
    } finally {
      client.release();
    }
  });

  router.post("/shopify/product-exports/:id/reconcile", requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      const result = await reconcileAifShopifyProductExport(client, req.params.id, {
        enqueueStock: req.body?.enqueueStock !== false && req.body?.enqueue_stock !== false,
      });
      if (!result) return res.status(404).json({ error: "Shopify export nem található." });
      res.json(result);
    } catch (e) {
      console.error("AIF Shopify product export reconcile failed", e);
      res.status(Number(e?.statusCode || 500)).json({ error: e?.message || "A Shopify import utáni párosítás nem sikerült.", code: e?.code || null });
    } finally {
      client.release();
    }
  });


  async function ensureAifPurchaseOrderSchema(client = pool) {
    const run = async () => {
      await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
      await client.query(`CREATE TABLE IF NOT EXISTS aif_purchase_order_settings (
        id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
        series text NOT NULL DEFAULT 'CMD',
        next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
        digits integer NOT NULL DEFAULT 6 CHECK (digits BETWEEN 3 AND 10),
        include_year boolean NOT NULL DEFAULT true,
        yearly_reset boolean NOT NULL DEFAULT true,
        sequence_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,
        document_title text NOT NULL DEFAULT 'COMANDĂ CĂTRE FURNIZOR',
        document_subtitle text NOT NULL DEFAULT 'Comandă de aprovizionare',
        updated_by text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query(`INSERT INTO aif_purchase_order_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
      await client.query(`CREATE TABLE IF NOT EXISTS aif_purchase_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number text NOT NULL UNIQUE,
        series text NOT NULL,
        sequence_number bigint NOT NULL,
        sequence_year integer NOT NULL,
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ordered','partially_received','received','cancelled')),
        supplier_id uuid NOT NULL REFERENCES aif_suppliers(id),
        target_location_id uuid NULL REFERENCES aif_locations(id),
        currency_code text NOT NULL DEFAULT 'RON',
        order_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Bucharest')::date,
        expected_date date NULL,
        external_reference text NULL,
        note text NULL,
        ordered_at timestamptz NULL,
        ordered_by text NULL,
        cancelled_at timestamptz NULL,
        cancelled_by text NULL,
        created_by text NULL,
        raw jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_purchase_orders_status_date_idx ON aif_purchase_orders (status, order_date DESC, created_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_purchase_orders_supplier_idx ON aif_purchase_orders (supplier_id, created_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_purchase_orders_location_idx ON aif_purchase_orders (target_location_id, created_at DESC)`);
      await client.query(`CREATE TABLE IF NOT EXISTS aif_purchase_order_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES aif_purchase_orders(id) ON DELETE CASCADE,
        line_no integer NOT NULL,
        variant_id uuid NULL REFERENCES aif_product_variants(id) ON DELETE SET NULL,
        supplier_product_code text NULL,
        supplier_variant_code text NULL,
        model_code text NULL,
        product_title text NOT NULL,
        brand_name text NULL,
        category_name text NULL,
        barcode text NULL,
        sn_cod text NULL,
        customs_tariff_code text NULL,
        color_name text NULL,
        color_code text NULL,
        size text NULL,
        gender text NULL,
        product_type text NULL,
        material text NULL,
        description_ro text NULL,
        image_url text NULL,
        qty_ordered integer NOT NULL CHECK (qty_ordered > 0),
        qty_received integer NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
        unit_price numeric(14,2) NULL,
        sell_price numeric(14,2) NULL,
        line_total numeric(14,2) NULL,
        currency_code text NOT NULL DEFAULT 'RON',
        note text NULL,
        raw jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (order_id, line_no)
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_purchase_order_lines_order_idx ON aif_purchase_order_lines (order_id, line_no)`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_purchase_order_lines_variant_idx ON aif_purchase_order_lines (variant_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_purchase_order_lines_barcode_idx ON aif_purchase_order_lines (barcode)`);
      await client.query(`CREATE TABLE IF NOT EXISTS aif_purchase_order_status_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES aif_purchase_orders(id) ON DELETE CASCADE,
        from_status text NULL,
        to_status text NOT NULL,
        note text NULL,
        actor text NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_purchase_order_status_history_order_idx ON aif_purchase_order_status_history (order_id, created_at DESC)`);
      await client.query(`CREATE TABLE IF NOT EXISTS aif_purchase_order_worklist_requests (
        owner_key text NOT NULL,
        idempotency_key text NOT NULL,
        request_hash text NOT NULL,
        status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed')),
        response jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (owner_key, idempotency_key)
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_purchase_order_worklist_requests_updated_idx
        ON aif_purchase_order_worklist_requests (updated_at DESC)`);
      await client.query(`CREATE TABLE IF NOT EXISTS aif_purchase_order_receipts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES aif_purchase_orders(id) ON DELETE CASCADE,
        order_line_id uuid NOT NULL REFERENCES aif_purchase_order_lines(id) ON DELETE CASCADE,
        reception_id uuid NULL REFERENCES aif_receptions(id) ON DELETE SET NULL,
        import_batch_id uuid NULL REFERENCES aif_import_batches(id) ON DELETE SET NULL,
        import_row_id uuid NULL REFERENCES aif_import_rows(id) ON DELETE SET NULL,
        qty integer NOT NULL CHECK (qty > 0),
        actor text NULL,
        raw jsonb NOT NULL DEFAULT '{}'::jsonb,
        received_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (import_row_id)
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_purchase_order_receipts_order_idx ON aif_purchase_order_receipts (order_id, received_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_purchase_order_receipts_line_idx ON aif_purchase_order_receipts (order_line_id, received_at DESC)`);
      await client.query(`ALTER TABLE IF EXISTS aif_receptions ADD COLUMN IF NOT EXISTS purchase_order_id uuid NULL REFERENCES aif_purchase_orders(id) ON DELETE SET NULL`);
      await client.query(`ALTER TABLE IF EXISTS aif_import_batches ADD COLUMN IF NOT EXISTS purchase_order_id uuid NULL REFERENCES aif_purchase_orders(id) ON DELETE SET NULL`);
      await client.query(`ALTER TABLE IF EXISTS aif_import_rows ADD COLUMN IF NOT EXISTS purchase_order_id uuid NULL REFERENCES aif_purchase_orders(id) ON DELETE SET NULL`);
      await client.query(`ALTER TABLE IF EXISTS aif_import_rows ADD COLUMN IF NOT EXISTS purchase_order_line_id uuid NULL REFERENCES aif_purchase_order_lines(id) ON DELETE SET NULL`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_receptions_purchase_order_idx ON aif_receptions (purchase_order_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_import_batches_purchase_order_idx ON aif_import_batches (purchase_order_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS aif_import_rows_purchase_order_idx ON aif_import_rows (purchase_order_id, purchase_order_line_id)`);
      return true;
    };
    if (client !== pool) return run();
    if (!aifPurchaseOrderSchemaPromise) {
      aifPurchaseOrderSchemaPromise = run().catch((error) => {
        aifPurchaseOrderSchemaPromise = null;
        throw error;
      });
    }
    return aifPurchaseOrderSchemaPromise;
  }

  function cleanAifPurchaseOrderSeries(value) {
    return text(value || 'CMD')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'CMD';
  }

  function aifPurchaseOrderNumber(settings, sequenceNumber, year) {
    const series = cleanAifPurchaseOrderSeries(settings?.series || 'CMD');
    const digits = Math.min(10, Math.max(3, Number(settings?.digits || 6)));
    const sequence = String(Math.max(1, Number(sequenceNumber || 1))).padStart(digits, '0');
    return settings?.include_year === false ? `${series}/${sequence}` : `${series}/${year}/${sequence}`;
  }

  function aifPurchaseOrderSettingsResponse(row = {}) {
    const year = Number(row.sequence_year || new Date().getFullYear());
    const nextNumber = Math.max(1, Number(row.next_number || 1));
    const series = cleanAifPurchaseOrderSeries(row.series || 'CMD');
    const digits = Math.min(10, Math.max(3, Number(row.digits || 6)));
    const includeYear = row.include_year !== false;
    return {
      series,
      nextNumber,
      digits,
      includeYear,
      yearlyReset: row.yearly_reset !== false,
      sequenceYear: year,
      documentTitle: text(row.document_title || 'COMANDĂ CĂTRE FURNIZOR'),
      documentSubtitle: text(row.document_subtitle || 'Comandă de aprovizionare'),
      previewNumber: aifPurchaseOrderNumber({ series, digits, include_year: includeYear }, nextNumber, year),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      updatedBy: row.updated_by || null,
    };
  }

  async function readAifPurchaseOrderSettings(client = pool, lock = false) {
    await ensureAifPurchaseOrderSchema(client);
    const result = await client.query(`SELECT * FROM aif_purchase_order_settings WHERE id=1 ${lock ? 'FOR UPDATE' : ''}`);
    return result.rows[0] || {};
  }

  async function allocateAifPurchaseOrderNumber(client) {
    const yearResult = await client.query(`SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer AS year`);
    const currentYear = Number(yearResult.rows[0]?.year || new Date().getFullYear());
    const row = await readAifPurchaseOrderSettings(client, true);
    let nextNumber = Math.max(1, Number(row.next_number || 1));
    let sequenceYear = Number(row.sequence_year || currentYear);
    if (row.yearly_reset !== false && sequenceYear !== currentYear) {
      nextNumber = 1;
      sequenceYear = currentYear;
    }
    const orderNumber = aifPurchaseOrderNumber(row, nextNumber, sequenceYear);
    await client.query(
      `UPDATE aif_purchase_order_settings SET next_number=$1, sequence_year=$2, updated_at=now() WHERE id=1`,
      [nextNumber + 1, sequenceYear]
    );
    return {
      orderNumber,
      series: cleanAifPurchaseOrderSeries(row.series || 'CMD'),
      sequenceNumber: nextNumber,
      sequenceYear,
    };
  }

  function cleanAifPurchaseOrderStatus(value, fallback = null) {
    const status = normCode(value);
    const aliases = {
      draft: 'draft', vazlat: 'draft',
      ordered: 'ordered', sent: 'ordered', rendelve: 'ordered',
      partially_received: 'partially_received', partial: 'partially_received', reszben_beerkezett: 'partially_received',
      received: 'received', complete: 'received', beerkezett: 'received',
      cancelled: 'cancelled', canceled: 'cancelled', torolt: 'cancelled',
    };
    return aliases[status] || fallback;
  }

  function purchaseOrderIdFromBody(body = {}) {
    const reception = body?.reception && typeof body.reception === 'object' ? body.reception : {};
    return emptyToNull(
      body.purchaseOrderId || body.purchase_order_id ||
      reception.purchaseOrderId || reception.purchase_order_id ||
      body.rawMeta?.purchaseOrderId || body.raw_meta?.purchase_order_id
    );
  }

  function purchaseOrderLineIdFromNormalized(normalized = {}) {
    return emptyToNull(
      normalized.purchaseOrderLineId || normalized.purchase_order_line_id ||
      normalized.orderLineId || normalized.order_line_id
    );
  }

  async function resolvePurchaseOrderContext(client, body = {}) {
    const orderId = purchaseOrderIdFromBody(body);
    if (!orderId) return null;
    await ensureAifPurchaseOrderSchema(client);
    const result = await client.query(
      `SELECT po.*, s.name AS supplier_name, l.name AS location_name
       FROM aif_purchase_orders po
       JOIN aif_suppliers s ON s.id=po.supplier_id
       LEFT JOIN aif_locations l ON l.id=po.target_location_id
       WHERE po.id::text=$1 OR po.order_number=$1
       LIMIT 1`,
      [orderId]
    );
    if (!result.rowCount) throw Object.assign(new Error('A kapcsolódó beszerzési rendelés nem található.'), { statusCode: 404 });
    const order = result.rows[0];
    if (order.status === 'draft') throw Object.assign(new Error('A beszerzési rendelést előbb jelöld Rendelve állapotúnak.'), { statusCode: 400 });
    if (order.status === 'cancelled') throw Object.assign(new Error('Törölt beszerzési rendelésből nem indítható bevételezés.'), { statusCode: 400 });
    if (order.status === 'received') throw Object.assign(new Error('Ez a beszerzési rendelés már teljesen beérkezett.'), { statusCode: 400 });
    return order;
  }

  async function refreshAifPurchaseOrderReceiptState(client, orderId, actor = 'system') {
    const key = text(orderId);
    if (!key) return null;
    await ensureAifPurchaseOrderSchema(client);
    const orderRes = await client.query(
      `SELECT id, status FROM aif_purchase_orders WHERE id::text=$1 OR order_number=$1 FOR UPDATE`,
      [key]
    );
    if (!orderRes.rowCount) return null;
    const order = orderRes.rows[0];
    await client.query(
      `UPDATE aif_purchase_order_lines l
       SET qty_received=COALESCE((
         SELECT sum(r.qty)::int FROM aif_purchase_order_receipts r WHERE r.order_line_id=l.id
       ),0), updated_at=now()
       WHERE l.order_id=$1`,
      [order.id]
    );
    const totalsRes = await client.query(
      `SELECT COALESCE(sum(qty_ordered),0)::int AS total_qty,
              COALESCE(sum(qty_received),0)::int AS received_qty
       FROM aif_purchase_order_lines WHERE order_id=$1`,
      [order.id]
    );
    const totalQty = Number(totalsRes.rows[0]?.total_qty || 0);
    const receivedQty = Number(totalsRes.rows[0]?.received_qty || 0);
    let nextStatus = order.status;
    if (order.status !== 'cancelled') {
      if (totalQty > 0 && receivedQty >= totalQty) nextStatus = 'received';
      else if (receivedQty > 0) nextStatus = 'partially_received';
      else if (order.status !== 'draft') nextStatus = 'ordered';
      else nextStatus = 'draft';
    }
    if (nextStatus !== order.status) {
      await client.query(`UPDATE aif_purchase_orders SET status=$2, updated_at=now() WHERE id=$1`, [order.id, nextStatus]);
      await client.query(
        `INSERT INTO aif_purchase_order_status_history (order_id,from_status,to_status,note,actor)
         VALUES ($1,$2,$3,$4,$5)`,
        [order.id, order.status, nextStatus, 'Automatikus állapotfrissítés a készletre vett mennyiségek alapján.', actor]
      );
    }
    return { id: order.id, status: nextStatus, totalQty, receivedQty, remainingQty: Math.max(0, totalQty - receivedQty) };
  }

  async function registerAifPurchaseOrderReceipt(client, {
    orderId,
    orderLineId,
    receptionId,
    importBatchId,
    importRowId,
    qty,
    actor,
    raw,
  }) {
    const quantity = Math.max(0, toInt(qty) || 0);
    if (!orderId || !orderLineId || !importRowId || quantity <= 0) return { inserted: false };
    await ensureAifPurchaseOrderSchema(client);
    const line = await client.query(
      `SELECT pol.id, pol.order_id, pol.qty_ordered, pol.qty_received, po.status
       FROM aif_purchase_order_lines pol
       JOIN aif_purchase_orders po ON po.id=pol.order_id
       WHERE pol.id::text=$1 AND pol.order_id::text=$2
       FOR UPDATE OF pol, po`,
      [String(orderLineId), String(orderId)]
    );
    if (!line.rowCount) throw Object.assign(new Error('A bevételezett sor nem tartozik a kiválasztott beszerzési rendeléshez.'), { statusCode: 400 });
    const item = line.rows[0];
    if (item.status === 'cancelled') throw Object.assign(new Error('Törölt rendelésre nem könyvelhető bevételezés.'), { statusCode: 400 });
    const duplicate = await client.query(`SELECT id FROM aif_purchase_order_receipts WHERE import_row_id=$1 LIMIT 1`, [importRowId]);
    if (duplicate.rowCount) return { inserted: false, duplicate: true };
    const currentReceived = Number(item.qty_received || 0);
    const orderedQty = Number(item.qty_ordered || 0);
    if (currentReceived + quantity > orderedQty) {
      throw Object.assign(new Error(`A bevételezett mennyiség meghaladná a rendelt darabszámot. Rendelt: ${orderedQty}, eddig bevételezett: ${currentReceived}, most: ${quantity}.`), { statusCode: 400 });
    }
    await client.query(
      `INSERT INTO aif_purchase_order_receipts (
         order_id,order_line_id,reception_id,import_batch_id,import_row_id,qty,actor,raw
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [item.order_id, item.id, receptionId || null, importBatchId || null, importRowId, quantity, actor, JSON.stringify(raw || {})]
    );
    await client.query(
      `UPDATE aif_purchase_order_lines
       SET qty_received=COALESCE((SELECT sum(qty)::int FROM aif_purchase_order_receipts WHERE order_line_id=$1),0), updated_at=now()
       WHERE id=$1`,
      [item.id]
    );
    return { inserted: true };
  }

  async function purchaseOrderVariantSnapshot(client, input = {}, supplierId = null) {
    const variantId = text(input.variantId || input.variant_id || input.variant || input.id);
    let variant = null;
    if (variantId) {
      const result = await client.query(
        `SELECT v.id, v.internal_sku, v.barcode, v.sn_cod, v.color_name, v.color_code, v.size,
                v.image_url, v.buy_price,
                COALESCE(last_purchase.buy_price, v.buy_price) AS purchase_price,
                last_purchase.purchased_at AS purchase_price_at,
                ${customsTariffSql('v')} AS customs_tariff_code,
                m.model_code, m.title_ro, m.description_ro, m.gender, m.product_type, m.material,
                b.name AS brand_name, c.name_ro AS category_name,
                sc.supplier_product_code, sc.supplier_variant_code, sc.supplier_barcode
         FROM aif_product_variants v
         JOIN aif_product_models m ON m.id=v.model_id
         LEFT JOIN aif_brands b ON b.id=m.brand_id
         LEFT JOIN aif_categories c ON c.id=COALESCE(m.subcategory_id,m.category_id)
         LEFT JOIN LATERAL (
           SELECT supplier_product_code,supplier_variant_code,supplier_barcode
           FROM aif_variant_supplier_codes x
           WHERE x.variant_id=v.id
             AND COALESCE(x.is_active,true)=true
             AND ($2::text='' OR x.supplier_id::text=$2)
           ORDER BY CASE WHEN x.supplier_id::text=$2 THEN 0 ELSE 1 END,
                    x.updated_at DESC NULLS LAST, x.created_at DESC NULLS LAST
           LIMIT 1
         ) sc ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(rw.buy_price_ron, rw.buy_price) AS buy_price,
                  COALESCE(ib.committed_at, ib.updated_at, ib.created_at, rw.updated_at) AS purchased_at
           FROM aif_import_rows rw
           JOIN aif_import_batches ib ON ib.id=rw.batch_id
           WHERE rw.variant_id=v.id
             AND rw.status='committed'
             AND COALESCE(rw.buy_price_ron, rw.buy_price) IS NOT NULL
             AND ($2::text='' OR ib.supplier_id::text=$2)
           ORDER BY COALESCE(ib.committed_at, ib.updated_at, ib.created_at, rw.updated_at) DESC,
                    rw.row_no DESC,
                    rw.id DESC
           LIMIT 1
         ) last_purchase ON true
         WHERE v.id::text=$1
         LIMIT 1`,
        [variantId, supplierId ? String(supplierId) : '']
      );
      variant = result.rows[0] || null;
      if (!variant) throw Object.assign(new Error('A kiválasztott termékvariáns nem található.'), { statusCode: 404 });
    }
    const qtyOrdered = Math.max(0, toInt(input.qtyOrdered ?? input.qty_ordered ?? input.qty ?? input.quantity) || 0);
    if (qtyOrdered <= 0) throw Object.assign(new Error('A rendelendő mennyiség legyen legalább 1.'), { statusCode: 400 });
    // Beszerzési rendelésben kizárólag vételár szerepelhet.
    // Elsőként a kézzel megadott vételárat használjuk, utána a kiválasztott
    // beszállító legutóbbi készletre vett árát, végül a variáns aktuális vételárát.
    // Eladási árat ebbe a folyamatba szándékosan nem veszünk át.
    const unitPrice = toMoney(
      input.unitPrice ?? input.unit_price ?? input.buyPrice ?? input.buy_price ??
      variant?.purchase_price ?? variant?.buy_price
    );
    const sellPrice = null;
    const productTitle = text(input.productTitle || input.product_title || input.title || variant?.title_ro);
    if (!productTitle) throw Object.assign(new Error('A terméknév kötelező.'), { statusCode: 400 });
    return {
      variantId: variant ? String(variant.id) : null,
      supplierProductCode: emptyToNull(input.supplierProductCode || input.supplier_product_code || variant?.supplier_product_code || variant?.model_code || variant?.internal_sku),
      supplierVariantCode: emptyToNull(input.supplierVariantCode || input.supplier_variant_code || variant?.supplier_variant_code),
      modelCode: emptyToNull(input.modelCode || input.model_code || variant?.model_code),
      productTitle,
      brandName: emptyToNull(input.brandName || input.brand_name || variant?.brand_name),
      categoryName: emptyToNull(input.categoryName || input.category_name || variant?.category_name),
      barcode: emptyToNull(input.barcode || variant?.barcode || variant?.supplier_barcode),
      snCod: emptyToNull(input.snCod || input.sn_cod || variant?.sn_cod),
      customsTariffCode: emptyToNull(input.customsTariffCode || input.customs_tariff_code || variant?.customs_tariff_code),
      colorName: emptyToNull(input.colorName || input.color_name || variant?.color_name),
      colorCode: emptyToNull(input.colorCode || input.color_code || variant?.color_code),
      size: emptyToNull(input.size || variant?.size),
      gender: emptyToNull(input.gender || variant?.gender),
      productType: emptyToNull(input.productType || input.product_type || variant?.product_type),
      material: emptyToNull(input.material || variant?.material),
      descriptionRo: emptyToNull(input.descriptionRo || input.description_ro || variant?.description_ro),
      imageUrl: emptyToNull(input.imageUrl || input.image_url || variant?.image_url),
      qtyOrdered,
      unitPrice,
      sellPrice,
      lineTotal: unitPrice === null ? null : Math.round((qtyOrdered * unitPrice + Number.EPSILON) * 100) / 100,
      note: emptyToNull(input.note),
    };
  }

  async function insertAifPurchaseOrderLines(client, orderId, linesInput, currency, supplierId = null) {
    const lines = [];
    let lineNo = 0;
    for (const input of linesInput || []) {
      const line = await purchaseOrderVariantSnapshot(client, input || {}, supplierId);
      lineNo += 1;
      const result = await client.query(
        `INSERT INTO aif_purchase_order_lines (
           order_id,line_no,variant_id,supplier_product_code,supplier_variant_code,model_code,
           product_title,brand_name,category_name,barcode,sn_cod,customs_tariff_code,
           color_name,color_code,size,gender,product_type,material,description_ro,image_url,
           qty_ordered,qty_received,unit_price,sell_price,line_total,currency_code,note,raw
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
           $21,0,$22,$23,$24,$25,$26,$27::jsonb
         ) RETURNING *`,
        [
          orderId, lineNo, line.variantId, line.supplierProductCode, line.supplierVariantCode, line.modelCode,
          line.productTitle, line.brandName, line.categoryName, line.barcode, line.snCod, line.customsTariffCode,
          line.colorName, line.colorCode, line.size, line.gender, line.productType, line.material, line.descriptionRo, line.imageUrl,
          line.qtyOrdered, line.unitPrice, line.sellPrice, line.lineTotal, currency, line.note,
          JSON.stringify({ source: line.variantId ? 'inventory' : 'manual', priceBasis: 'purchase_price', input }),
        ]
      );
      lines.push(result.rows[0]);
    }
    if (!lines.length) throw Object.assign(new Error('A rendeléshez legalább egy terméksor szükséges.'), { statusCode: 400 });
    return lines;
  }

  function normalizeAifOpenPurchaseOrderWorkItems(body = {}) {
    const source = Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.lines)
        ? body.lines
        : [];
    const merged = new Map();

    for (const rawItem of source.slice(0, 1000)) {
      const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
      const supplierId = text(item.supplierId || item.supplier_id || item.supplier);
      const variantId = text(item.variantId || item.variant_id || item.variant || item.id);
      const qty = Math.max(0, toInt(item.qty ?? item.quantity ?? item.qtyOrdered ?? item.qty_ordered) || 0);
      if (!supplierId) throw Object.assign(new Error('Minden rendelendő terméknél válassz beszállítót.'), { statusCode: 400, code: 'supplier_required' });
      if (!variantId) throw Object.assign(new Error('Hiányzik egy rendelendő termék variánsazonosítója.'), { statusCode: 400, code: 'variant_required' });
      if (qty <= 0) throw Object.assign(new Error('A rendelendő mennyiség legyen legalább 1.'), { statusCode: 400, code: 'qty_required' });

      const key = `${supplierId}::${variantId}`;
      const previous = merged.get(key);
      if (previous) {
        previous.qty += qty;
        if (previous.unitPrice === null) previous.unitPrice = toMoney(item.unitPrice ?? item.unit_price ?? item.buyPrice ?? item.buy_price);
        if (!previous.note) previous.note = emptyToNull(item.note);
      } else {
        merged.set(key, {
          supplierId,
          variantId,
          qty,
          unitPrice: toMoney(item.unitPrice ?? item.unit_price ?? item.buyPrice ?? item.buy_price),
          note: emptyToNull(item.note),
        });
      }
    }

    const rows = Array.from(merged.values());
    if (!rows.length) throw Object.assign(new Error('Nincs hozzáadható termék a rendelési listában.'), { statusCode: 400, code: 'items_required' });
    return rows;
  }

  function aifOpenPurchaseOrderWorkRequestHash(rows, body = {}) {
    const stable = {
      targetLocationId: text(body.targetLocationId || body.target_location_id || body.locationId || body.location_id),
      currencyCode: currencyCode(body.currencyCode || body.currency_code || 'RON') || 'RON',
      note: text(body.note),
      items: rows
        .map((row) => ({
          supplierId: row.supplierId,
          variantId: row.variantId,
          qty: row.qty,
          unitPrice: row.unitPrice,
          note: row.note || null,
        }))
        .sort((a, b) => `${a.supplierId}:${a.variantId}`.localeCompare(`${b.supplierId}:${b.variantId}`)),
    };
    return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
  }

  async function upsertAifOpenPurchaseOrderLine(client, order, input, supplierId) {
    const line = await purchaseOrderVariantSnapshot(client, {
      variantId: input.variantId,
      qtyOrdered: input.qty,
      unitPrice: input.unitPrice,
      note: input.note,
    }, supplierId);

    const existing = line.variantId
      ? await client.query(
          `SELECT id, qty_ordered, qty_received, unit_price
           FROM aif_purchase_order_lines
           WHERE order_id=$1 AND variant_id=$2::uuid
           LIMIT 1
           FOR UPDATE`,
          [order.id, line.variantId]
        )
      : { rowCount: 0, rows: [] };

    if (existing.rowCount) {
      const current = existing.rows[0];
      const nextQty = Math.max(Number(current.qty_received || 0), Number(current.qty_ordered || 0) + line.qtyOrdered);
      const unitPrice = current.unit_price === null || current.unit_price === undefined
        ? line.unitPrice
        : Number(current.unit_price);
      const lineTotal = unitPrice === null || unitPrice === undefined
        ? null
        : Math.round((nextQty * Number(unitPrice) + Number.EPSILON) * 100) / 100;
      await client.query(
        `UPDATE aif_purchase_order_lines
         SET qty_ordered=$2,
             unit_price=$3,
             sell_price=NULL,
             line_total=$4,
             note=COALESCE(note,$5),
             raw=COALESCE(raw,'{}'::jsonb) || $6::jsonb,
             updated_at=now()
         WHERE id=$1`,
        [
          current.id,
          nextQty,
          unitPrice,
          lineTotal,
          line.note,
          JSON.stringify({
            source: 'warehouse_order_worklist',
            priceBasis: 'purchase_price',
            addedQty: line.qtyOrdered,
            addedAt: new Date().toISOString(),
          }),
        ]
      );
      return { merged: true, addedQty: line.qtyOrdered };
    }

    const lineNoResult = await client.query(
      `SELECT COALESCE(max(line_no),0)::int + 1 AS next_line_no
       FROM aif_purchase_order_lines
       WHERE order_id=$1`,
      [order.id]
    );
    const lineNo = Math.max(1, Number(lineNoResult.rows[0]?.next_line_no || 1));
    await client.query(
      `INSERT INTO aif_purchase_order_lines (
         order_id,line_no,variant_id,supplier_product_code,supplier_variant_code,model_code,
         product_title,brand_name,category_name,barcode,sn_cod,customs_tariff_code,
         color_name,color_code,size,gender,product_type,material,description_ro,image_url,
         qty_ordered,qty_received,unit_price,sell_price,line_total,currency_code,note,raw
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
         $21,0,$22,$23,$24,$25,$26,$27::jsonb
       )`,
      [
        order.id, lineNo, line.variantId, line.supplierProductCode, line.supplierVariantCode, line.modelCode,
        line.productTitle, line.brandName, line.categoryName, line.barcode, line.snCod, line.customsTariffCode,
        line.colorName, line.colorCode, line.size, line.gender, line.productType, line.material, line.descriptionRo, line.imageUrl,
        line.qtyOrdered, line.unitPrice, line.sellPrice, line.lineTotal, order.currency_code || 'RON', line.note,
        JSON.stringify({
          source: 'warehouse_order_worklist',
          priceBasis: 'purchase_price',
          addedQty: line.qtyOrdered,
          addedAt: new Date().toISOString(),
          input,
        }),
      ]
    );
    return { merged: false, addedQty: line.qtyOrdered };
  }

  function purchaseOrderSummarySql(whereSql = '') {
    return `SELECT po.*, s.name AS supplier_name, l.name AS location_name,
                   count(pol.id)::int AS line_count,
                   COALESCE(sum(pol.qty_ordered),0)::int AS total_qty,
                   COALESCE(sum(pol.qty_received),0)::int AS received_qty,
                   COALESCE(sum(GREATEST(pol.qty_ordered-pol.qty_received,0)),0)::int AS remaining_qty,
                   round(COALESCE(sum(pol.line_total),0)::numeric,2) AS total_value
            FROM aif_purchase_orders po
            JOIN aif_suppliers s ON s.id=po.supplier_id
            LEFT JOIN aif_locations l ON l.id=po.target_location_id
            LEFT JOIN aif_purchase_order_lines pol ON pol.order_id=po.id
            ${whereSql}
            GROUP BY po.id,s.name,l.name`;
  }

  async function readAifPurchaseOrder(client, value) {
    const key = text(value);
    if (!key) return null;
    await ensureAifPurchaseOrderSchema(client);
    const itemRes = await client.query(
      `${purchaseOrderSummarySql('WHERE po.id::text=$1 OR po.order_number=$1')} LIMIT 1`,
      [key]
    );
    if (!itemRes.rowCount) return null;
    const item = itemRes.rows[0];
    const linesRes = await client.query(
      `SELECT pol.*, GREATEST(pol.qty_ordered-pol.qty_received,0)::int AS qty_remaining
       FROM aif_purchase_order_lines pol
       WHERE pol.order_id=$1
       ORDER BY pol.line_no ASC`,
      [item.id]
    );
    const historyRes = await client.query(
      `SELECT id,from_status,to_status,note,actor,created_at
       FROM aif_purchase_order_status_history WHERE order_id=$1 ORDER BY created_at DESC`,
      [item.id]
    );
    return { item, lines: linesRes.rows, history: historyRes.rows };
  }

  router.get('/purchase-orders/settings', requireAuthed, async (_req, res) => {
    try {
      const row = await readAifPurchaseOrderSettings(pool, false);
      const settings = aifPurchaseOrderSettingsResponse(row);
      res.json({ ok: true, settings, item: settings });
    } catch (error) {
      console.error('AIF purchase order settings load failed', error);
      res.status(500).json({ error: 'A beszerzési rendelések számozási beállításainak betöltése nem sikerült.' });
    }
  });

  async function saveAifPurchaseOrderSettings(req, res) {
    try {
      await ensureAifPurchaseOrderSchema(pool);
      const current = await readAifPurchaseOrderSettings(pool, false);
      const body = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : (req.body || {});
      const series = cleanAifPurchaseOrderSeries(body.series || current.series || 'CMD');
      const nextNumber = Math.max(1, toInt(body.nextNumber ?? body.next_number ?? current.next_number) || 1);
      const digits = Math.min(10, Math.max(3, toInt(body.digits ?? current.digits) || 6));
      const includeYear = body.includeYear === undefined && body.include_year === undefined ? current.include_year !== false : Boolean(body.includeYear ?? body.include_year);
      const yearlyReset = body.yearlyReset === undefined && body.yearly_reset === undefined ? current.yearly_reset !== false : Boolean(body.yearlyReset ?? body.yearly_reset);
      const sequenceYear = Math.max(2000, Math.min(2100, toInt(body.sequenceYear ?? body.sequence_year ?? current.sequence_year) || new Date().getFullYear()));
      const documentTitle = text(body.documentTitle || body.document_title || current.document_title || 'COMANDĂ CĂTRE FURNIZOR').slice(0, 220);
      const documentSubtitle = text(body.documentSubtitle || body.document_subtitle || current.document_subtitle || 'Comandă de aprovizionare').slice(0, 220);
      const preview = aifPurchaseOrderNumber({ series, digits, include_year: includeYear }, nextNumber, sequenceYear);
      const collision = await pool.query(`SELECT 1 FROM aif_purchase_orders WHERE order_number=$1 LIMIT 1`, [preview]);
      if (collision.rowCount) return res.status(409).json({ error: `Ez a következő rendelésszám már foglalt: ${preview}.` });
      const updated = await pool.query(
        `UPDATE aif_purchase_order_settings
         SET series=$1,next_number=$2,digits=$3,include_year=$4,yearly_reset=$5,
             sequence_year=$6,document_title=$7,document_subtitle=$8,updated_by=$9,updated_at=now()
         WHERE id=1 RETURNING *`,
        [series,nextNumber,digits,includeYear,yearlyReset,sequenceYear,documentTitle,documentSubtitle,actorFrom(req)]
      );
      const settings = aifPurchaseOrderSettingsResponse(updated.rows[0] || {});
      res.json({ ok: true, settings, item: settings });
    } catch (error) {
      console.error('AIF purchase order settings save failed', error);
      res.status(500).json({ error: error?.message || 'A beszerzési rendelés számozási beállításainak mentése nem sikerült.' });
    }
  }

  router.put('/purchase-orders/settings', requireAdminOrSecret, saveAifPurchaseOrderSettings);
  router.patch('/purchase-orders/settings', requireAdminOrSecret, saveAifPurchaseOrderSettings);

  router.get('/purchase-orders', requireAuthed, async (req, res) => {
    try {
      await ensureAifPurchaseOrderSchema(pool);
      const args = [];
      const where = [];
      const add = (value) => { args.push(value); return `$${args.length}`; };
      const search = text(req.query.q || req.query.search);
      if (search) {
        const p = add(`%${search}%`);
        where.push(`(po.order_number ILIKE ${p} OR COALESCE(po.external_reference,'') ILIKE ${p} OR COALESCE(po.note,'') ILIKE ${p} OR s.name ILIKE ${p} OR COALESCE(l.name,'') ILIKE ${p} OR EXISTS (
          SELECT 1 FROM aif_purchase_order_lines x WHERE x.order_id=po.id AND (
            x.product_title ILIKE ${p} OR COALESCE(x.supplier_product_code,'') ILIKE ${p} OR COALESCE(x.barcode,'') ILIKE ${p}
          )
        ))`);
      }
      const supplier = text(req.query.supplier || req.query.supplierId || req.query.supplier_id);
      if (supplier) { const p = add(supplier); where.push(`(po.supplier_id::text=${p} OR s.code=${p})`); }
      const location = text(req.query.location || req.query.locationId || req.query.location_id);
      if (location) { const p = add(location); where.push(`(po.target_location_id::text=${p} OR l.code=${p})`); }
      const status = cleanAifPurchaseOrderStatus(req.query.status, null);
      if (status) { const p = add(status); where.push(`po.status=${p}`); }
      const from = emptyToNull(req.query.from);
      if (from) { const p = add(from); where.push(`po.order_date >= ${p}::date`); }
      const to = emptyToNull(req.query.to);
      if (to) { const p = add(to); where.push(`po.order_date < (${p}::date + interval '1 day')`); }
      const limit = Math.min(1000, Math.max(1, toInt(req.query.limit) || 500));
      const rows = await pool.query(
        `${purchaseOrderSummarySql(where.length ? `WHERE ${where.join(' AND ')}` : '')}
         ORDER BY po.created_at DESC LIMIT ${limit}`,
        args
      );
      const items = rows.rows;
      const summary = items.reduce((acc, item) => {
        acc.total += 1;
        if (item.status === 'draft') acc.draft += 1;
        else if (item.status === 'ordered') acc.ordered += 1;
        else if (item.status === 'partially_received') acc.partiallyReceived += 1;
        else if (item.status === 'received') acc.received += 1;
        else if (item.status === 'cancelled') acc.cancelled += 1;
        acc.totalQty += Number(item.total_qty || 0);
        acc.receivedQty += Number(item.received_qty || 0);
        acc.remainingQty += Number(item.remaining_qty || 0);
        acc.totalValue += Number(item.total_value || 0);
        return acc;
      }, { total: 0, draft: 0, ordered: 0, partiallyReceived: 0, received: 0, cancelled: 0, totalQty: 0, receivedQty: 0, remainingQty: 0, totalValue: 0 });
      summary.totalValue = Math.round((summary.totalValue + Number.EPSILON) * 100) / 100;
      res.json({ ok: true, items, summary });
    } catch (error) {
      console.error('AIF purchase orders list failed', error);
      res.status(500).json({ error: error?.message || 'A beszerzési rendelések betöltése nem sikerült.' });
    }
  });

  router.get('/purchase-orders/:id', requireAuthed, async (req, res) => {
    try {
      const detail = await readAifPurchaseOrder(pool, req.params.id);
      if (!detail) return res.status(404).json({ error: 'A beszerzési rendelés nem található.' });
      res.json(detail);
    } catch (error) {
      console.error('AIF purchase order detail failed', error);
      res.status(500).json({ error: error?.message || 'A beszerzési rendelés betöltése nem sikerült.' });
    }
  });

  async function resolveAifPurchaseOrderHeader(client, body = {}) {
    const supplier = await findByIdOrCode(client, 'aif_suppliers', body.supplierId || body.supplier_id || body.supplier);
    if (!supplier || supplier.is_active === false) throw Object.assign(new Error('Beszállító kiválasztása kötelező.'), { statusCode: 400 });
    let location = null;
    const locationInput = body.targetLocationId || body.target_location_id || body.locationId || body.location_id || body.location;
    if (locationInput) {
      location = await findByIdOrCode(client, 'aif_locations', locationInput);
      if (!location || location.is_active === false) throw Object.assign(new Error('A kiválasztott célhely nem található vagy inaktív.'), { statusCode: 400 });
    }
    const currency = currencyCode(body.currencyCode || body.currency_code || 'RON') || 'RON';
    const curr = await client.query(`SELECT code FROM aif_currencies WHERE code=$1 AND is_active=true LIMIT 1`, [currency]);
    if (!curr.rowCount) throw Object.assign(new Error('A kiválasztott pénznem nem létezik vagy inaktív.'), { statusCode: 400 });
    return {
      supplier,
      location,
      currency,
      orderDate: emptyToNull(body.orderDate || body.order_date) || new Date().toISOString().slice(0,10),
      expectedDate: emptyToNull(body.expectedDate || body.expected_date),
      externalReference: emptyToNull(body.externalReference || body.external_reference),
      note: emptyToNull(body.note),
    };
  }

  router.post('/purchase-orders', requireAuthed, async (req, res) => {
    const body = req.body || {};
    const linesInput = Array.isArray(body.lines) ? body.lines : Array.isArray(body.items) ? body.items : [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureAifPurchaseOrderSchema(client);
      const header = await resolveAifPurchaseOrderHeader(client, body);
      const sequence = await allocateAifPurchaseOrderNumber(client);
      const inserted = await client.query(
        `INSERT INTO aif_purchase_orders (
           order_number,series,sequence_number,sequence_year,status,supplier_id,target_location_id,
           currency_code,order_date,expected_date,external_reference,note,created_by,raw
         ) VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING *`,
        [sequence.orderNumber,sequence.series,sequence.sequenceNumber,sequence.sequenceYear,header.supplier.id,header.location?.id || null,header.currency,header.orderDate,header.expectedDate,header.externalReference,header.note,actorFrom(req),JSON.stringify({ source: 'allin_purchase_order' })]
      );
      const order = inserted.rows[0];
      await insertAifPurchaseOrderLines(client, order.id, linesInput, header.currency, header.supplier.id);
      await client.query(
        `INSERT INTO aif_purchase_order_status_history (order_id,from_status,to_status,note,actor)
         VALUES ($1,NULL,'draft','Rendelés létrehozva.',$2)`,
        [order.id, actorFrom(req)]
      );
      await client.query('COMMIT');
      const detail = await readAifPurchaseOrder(pool, order.id);
      res.json({ ok: true, ...detail });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('AIF purchase order create failed', error);
      const statusCode = Number(error?.statusCode || 500);
      res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({ error: error?.message || 'A beszerzési rendelés mentése nem sikerült.', code: error?.code || null });
    } finally {
      client.release();
    }
  });

  router.post('/purchase-orders/open/add-items', requireAuthed, async (req, res) => {
    const body = req.body || {};
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureAifPurchaseOrderSchema(client);

      const rows = normalizeAifOpenPurchaseOrderWorkItems(body);
      const ownerKey = selectionOwnerKey(req);
      const idempotencyKey = text(req.get('Idempotency-Key') || body.idempotencyKey || body.idempotency_key);
      const requestHash = aifOpenPurchaseOrderWorkRequestHash(rows, body);

      if (idempotencyKey) {
        const insertedRequest = await client.query(
          `INSERT INTO aif_purchase_order_worklist_requests (
             owner_key,idempotency_key,request_hash,status,created_at,updated_at
           ) VALUES ($1,$2,$3,'processing',now(),now())
           ON CONFLICT (owner_key,idempotency_key) DO NOTHING
           RETURNING owner_key`,
          [ownerKey, idempotencyKey, requestHash]
        );
        if (!insertedRequest.rowCount) {
          const previous = await client.query(
            `SELECT request_hash,status,response
             FROM aif_purchase_order_worklist_requests
             WHERE owner_key=$1 AND idempotency_key=$2
             FOR UPDATE`,
            [ownerKey, idempotencyKey]
          );
          const saved = previous.rows[0] || null;
          if (saved && saved.request_hash !== requestHash) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              error: 'Ez a mentési kulcs már egy másik rendelési csomaghoz tartozik.',
              code: 'idempotency_key_reused',
            });
          }
          if (saved?.status === 'completed' && saved.response) {
            await client.query('COMMIT');
            return res.json({ ...saved.response, duplicate: true });
          }
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'Ez a rendelési csomag már mentés alatt van. Várj egy pillanatot, majd frissíts.',
            code: 'request_in_progress',
          });
        }
      }

      const targetLocationInput = text(
        body.targetLocationId || body.target_location_id || body.locationId || body.location_id || body.location
      );
      const defaultLocationId = targetLocationInput || await getDefaultLocationId(client);
      const currency = currencyCode(body.currencyCode || body.currency_code || 'RON') || 'RON';
      const note = emptyToNull(body.note);

      const grouped = new Map();
      for (const row of rows) {
        const group = grouped.get(row.supplierId) || [];
        group.push(row);
        grouped.set(row.supplierId, group);
      }

      const results = [];
      const groupEntries = Array.from(grouped.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      for (const [supplierInput, supplierRows] of groupEntries) {
        const supplier = await findByIdOrCode(client, 'aif_suppliers', supplierInput);
        if (!supplier || supplier.is_active === false) {
          throw Object.assign(new Error('A kiválasztott beszállító nem található vagy inaktív.'), {
            statusCode: 400,
            code: 'supplier_not_found',
          });
        }

        await client.query(
          `SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,
          [`aif:open-purchase-order:${supplier.id}`]
        );

        const openOrder = await client.query(
          `SELECT po.*, l.name AS location_name
           FROM aif_purchase_orders po
           LEFT JOIN aif_locations l ON l.id=po.target_location_id
           WHERE po.supplier_id=$1 AND po.status='draft'
           ORDER BY po.updated_at DESC, po.created_at DESC
           LIMIT 1
           FOR UPDATE OF po`,
          [supplier.id]
        );

        let order = openOrder.rows[0] || null;
        let created = false;
        if (!order) {
          const header = await resolveAifPurchaseOrderHeader(client, {
            supplierId: supplier.id,
            targetLocationId: defaultLocationId || null,
            currencyCode: currency,
            note,
          });
          const sequence = await allocateAifPurchaseOrderNumber(client);
          const inserted = await client.query(
            `INSERT INTO aif_purchase_orders (
               order_number,series,sequence_number,sequence_year,status,supplier_id,target_location_id,
               currency_code,order_date,expected_date,external_reference,note,created_by,raw
             ) VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
             RETURNING *`,
            [
              sequence.orderNumber,
              sequence.series,
              sequence.sequenceNumber,
              sequence.sequenceYear,
              header.supplier.id,
              header.location?.id || null,
              header.currency,
              header.orderDate,
              header.expectedDate,
              header.externalReference,
              header.note,
              actorFrom(req),
              JSON.stringify({ source: 'warehouse_order_worklist', ownerKey }),
            ]
          );
          order = inserted.rows[0];
          created = true;
          await client.query(
            `INSERT INTO aif_purchase_order_status_history (order_id,from_status,to_status,note,actor)
             VALUES ($1,NULL,'draft','Nyitott rendelés létrehozva a raktári rendelési listából.',$2)`,
            [order.id, actorFrom(req)]
          );
        }

        let addedLines = 0;
        let mergedLines = 0;
        let addedQty = 0;
        for (const row of supplierRows) {
          const savedLine = await upsertAifOpenPurchaseOrderLine(client, order, row, supplier.id);
          if (savedLine.merged) mergedLines += 1;
          else addedLines += 1;
          addedQty += Number(savedLine.addedQty || 0);
        }

        await client.query(
          `UPDATE aif_purchase_orders
           SET updated_at=now(),
               raw=COALESCE(raw,'{}'::jsonb) || $2::jsonb
           WHERE id=$1`,
          [
            order.id,
            JSON.stringify({
              lastWarehouseWorklistUpdateAt: new Date().toISOString(),
              lastWarehouseWorklistOwner: ownerKey,
            }),
          ]
        );
        await client.query(
          `INSERT INTO aif_purchase_order_status_history (order_id,from_status,to_status,note,actor)
           VALUES ($1,'draft','draft',$2,$3)`,
          [
            order.id,
            `Raktári rendelési listából hozzáadva: ${supplierRows.length} terméksor, ${addedQty} db.`,
            actorFrom(req),
          ]
        );

        const summaryResult = await client.query(
          `${purchaseOrderSummarySql('WHERE po.id=$1')} LIMIT 1`,
          [order.id]
        );
        const summary = summaryResult.rows[0] || order;
        results.push({
          supplierId: String(supplier.id),
          supplierName: supplier.name,
          orderId: String(order.id),
          orderNumber: order.order_number,
          status: 'draft',
          created,
          addedLines,
          mergedLines,
          addedQty,
          lineCount: Number(summary.line_count || 0),
          totalQty: Number(summary.total_qty || 0),
          currencyCode: summary.currency_code || order.currency_code || 'RON',
          targetLocationId: summary.target_location_id ? String(summary.target_location_id) : null,
          locationName: summary.location_name || null,
        });
      }

      const response = {
        ok: true,
        orders: results,
        addedItems: rows.length,
        addedQty: rows.reduce((sum, row) => sum + Number(row.qty || 0), 0),
      };

      if (idempotencyKey) {
        await client.query(
          `UPDATE aif_purchase_order_worklist_requests
           SET status='completed',response=$3::jsonb,updated_at=now()
           WHERE owner_key=$1 AND idempotency_key=$2`,
          [ownerKey, idempotencyKey, JSON.stringify(response)]
        );
      }

      await client.query('COMMIT');
      res.json(response);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('AIF open purchase order worklist save failed', error);
      const statusCode = Number(error?.statusCode || 500);
      res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
        error: error?.message || 'A nyitott beszállítói rendelések frissítése nem sikerült.',
        code: error?.code || null,
      });
    } finally {
      client.release();
    }
  });

  router.patch('/purchase-orders/:id', requireAuthed, async (req, res) => {
    const body = req.body || {};
    const linesInput = Array.isArray(body.lines) ? body.lines : Array.isArray(body.items) ? body.items : [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureAifPurchaseOrderSchema(client);
      const current = await client.query(`SELECT * FROM aif_purchase_orders WHERE id::text=$1 OR order_number=$1 FOR UPDATE`, [text(req.params.id)]);
      if (!current.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'A beszerzési rendelés nem található.' }); }
      const order = current.rows[0];
      if (order.status !== 'draft') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Csak nyitott rendelés szerkeszthető.' }); }
      const header = await resolveAifPurchaseOrderHeader(client, body);
      await client.query(
        `UPDATE aif_purchase_orders SET supplier_id=$2,target_location_id=$3,currency_code=$4,
             order_date=$5,expected_date=$6,external_reference=$7,note=$8,updated_at=now()
         WHERE id=$1`,
        [order.id,header.supplier.id,header.location?.id || null,header.currency,header.orderDate,header.expectedDate,header.externalReference,header.note]
      );
      await client.query(`DELETE FROM aif_purchase_order_lines WHERE order_id=$1`, [order.id]);
      await insertAifPurchaseOrderLines(client, order.id, linesInput, header.currency, header.supplier.id);
      await client.query('COMMIT');
      const detail = await readAifPurchaseOrder(pool, order.id);
      res.json({ ok: true, ...detail });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('AIF purchase order update failed', error);
      const statusCode = Number(error?.statusCode || 500);
      res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({ error: error?.message || 'A beszerzési rendelés módosítása nem sikerült.' });
    } finally {
      client.release();
    }
  });

  router.post('/purchase-orders/:id/ordered', requireAuthed, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureAifPurchaseOrderSchema(client);
      const current = await client.query(`SELECT * FROM aif_purchase_orders WHERE id::text=$1 OR order_number=$1 FOR UPDATE`, [text(req.params.id)]);
      if (!current.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'A beszerzési rendelés nem található.' }); }
      const order = current.rows[0];
      if (order.status === 'cancelled') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Törölt rendelés nem jelölhető elküldöttnek.' }); }
      const lineCount = await client.query(`SELECT count(*)::int AS c FROM aif_purchase_order_lines WHERE order_id=$1`, [order.id]);
      if (Number(lineCount.rows[0]?.c || 0) <= 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Üres rendelés nem küldhető el.' }); }
      if (order.status === 'draft') {
        await client.query(`UPDATE aif_purchase_orders SET status='ordered',ordered_at=now(),ordered_by=$2,updated_at=now() WHERE id=$1`, [order.id,actorFrom(req)]);
        await client.query(
          `INSERT INTO aif_purchase_order_status_history (order_id,from_status,to_status,note,actor)
           VALUES ($1,'draft','ordered',$2,$3)`,
          [order.id,emptyToNull(req.body?.note) || 'Rendelés elküldve a beszállítónak.',actorFrom(req)]
        );
      }
      await client.query('COMMIT');
      const detail = await readAifPurchaseOrder(pool, order.id);
      res.json({ ok: true, item: detail?.item || null });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('AIF purchase order mark ordered failed', error);
      res.status(500).json({ error: error?.message || 'A rendelés állapotának módosítása nem sikerült.' });
    } finally {
      client.release();
    }
  });

  router.post('/purchase-orders/:id/cancel', requireAuthed, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureAifPurchaseOrderSchema(client);
      const current = await client.query(`SELECT * FROM aif_purchase_orders WHERE id::text=$1 OR order_number=$1 FOR UPDATE`, [text(req.params.id)]);
      if (!current.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'A beszerzési rendelés nem található.' }); }
      const order = current.rows[0];
      const received = await client.query(`SELECT COALESCE(sum(qty),0)::int AS qty FROM aif_purchase_order_receipts WHERE order_id=$1`, [order.id]);
      if (Number(received.rows[0]?.qty || 0) > 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Már részben vagy teljesen bevételezett rendelés nem törölhető állapotba.' }); }
      if (order.status !== 'cancelled') {
        await client.query(`UPDATE aif_purchase_orders SET status='cancelled',cancelled_at=now(),cancelled_by=$2,updated_at=now() WHERE id=$1`, [order.id,actorFrom(req)]);
        await client.query(
          `INSERT INTO aif_purchase_order_status_history (order_id,from_status,to_status,note,actor)
           VALUES ($1,$2,'cancelled',$3,$4)`,
          [order.id,order.status,emptyToNull(req.body?.note) || 'Rendelés törölve / érvénytelenítve.',actorFrom(req)]
        );
      }
      await client.query('COMMIT');
      const detail = await readAifPurchaseOrder(pool, order.id);
      res.json({ ok: true, item: detail?.item || null });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('AIF purchase order cancel failed', error);
      res.status(500).json({ error: error?.message || 'A rendelés törlése nem sikerült.' });
    } finally {
      client.release();
    }
  });

  router.delete('/purchase-orders/:id', requireAdminOrSecret, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureAifPurchaseOrderSchema(client);
      const current = await client.query(`SELECT * FROM aif_purchase_orders WHERE id::text=$1 OR order_number=$1 FOR UPDATE`, [text(req.params.id)]);
      if (!current.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'A beszerzési rendelés nem található.' }); }
      const order = current.rows[0];
      const received = await client.query(`SELECT COALESCE(sum(qty),0)::int AS qty FROM aif_purchase_order_receipts WHERE order_id=$1`, [order.id]);
      if (Number(received.rows[0]?.qty || 0) > 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Bevételezéshez kapcsolódó rendelés véglegesen nem törölhető.' }); }
      await client.query(`UPDATE aif_receptions SET purchase_order_id=NULL WHERE purchase_order_id=$1`, [order.id]);
      await client.query(`UPDATE aif_import_batches SET purchase_order_id=NULL WHERE purchase_order_id=$1`, [order.id]);
      await client.query(`UPDATE aif_import_rows SET purchase_order_id=NULL,purchase_order_line_id=NULL WHERE purchase_order_id=$1`, [order.id]);
      await client.query(`DELETE FROM aif_purchase_orders WHERE id=$1`, [order.id]);
      await client.query('COMMIT');
      res.json({ ok: true, mode: 'deleted' });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('AIF purchase order delete failed', error);
      res.status(500).json({ error: error?.message || 'A beszerzési rendelés végleges törlése nem sikerült.' });
    } finally {
      client.release();
    }
  });


  // Biztonságos, ideiglenes rendszer-dokumentáció letöltés.
  // A PDF-et továbbra is a Render Shell generálja, majd hitelesített API-kéréssel
  // feltölti a live web service példányára. Így nem a Shell külön fájlrendszerét
  // próbáljuk nyilvános URL-ként használni, mert az két külön világ. Micsoda meglepetés.
  const AIF_SYSTEM_DOCUMENTATION_ROOT = path.join(os.tmpdir(), "allin-system-documentation");
  const AIF_SYSTEM_DOCUMENTATION_FILE = "AllInFashion_teljes_rendszerterkep.pdf";
  const AIF_SYSTEM_DOCUMENTATION_MAX_BYTES = 70 * 1024 * 1024;
  const AIF_SYSTEM_DOCUMENTATION_TTL_MS = 6 * 60 * 60 * 1000;

  function cleanAifSystemDocumentationToken(value) {
    const token = String(value || "").trim().toLowerCase();
    return /^[a-f0-9]{32,96}$/.test(token) ? token : null;
  }

  function aifSystemDocumentationDirectory(token) {
    return path.join(AIF_SYSTEM_DOCUMENTATION_ROOT, token);
  }

  function aifSystemDocumentationFilePath(token) {
    return path.join(aifSystemDocumentationDirectory(token), AIF_SYSTEM_DOCUMENTATION_FILE);
  }

  function aifSystemDocumentationMetadataPath(token) {
    return path.join(aifSystemDocumentationDirectory(token), "metadata.json");
  }

  async function cleanupExpiredAifSystemDocumentation(now = Date.now()) {
    await fs.promises.mkdir(AIF_SYSTEM_DOCUMENTATION_ROOT, { recursive: true, mode: 0o700 });
    let entries = [];
    try {
      entries = await fs.promises.readdir(AIF_SYSTEM_DOCUMENTATION_ROOT, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const token = cleanAifSystemDocumentationToken(entry.name);
      if (!token) return;
      const directory = aifSystemDocumentationDirectory(token);
      let expiresAt = 0;
      try {
        const raw = await fs.promises.readFile(aifSystemDocumentationMetadataPath(token), "utf8");
        const metadata = JSON.parse(raw);
        expiresAt = Number(new Date(metadata?.expiresAt || 0).getTime() || 0);
      } catch {
        try {
          const stat = await fs.promises.stat(directory);
          expiresAt = stat.mtimeMs + AIF_SYSTEM_DOCUMENTATION_TTL_MS;
        } catch {
          expiresAt = 0;
        }
      }
      if (!expiresAt || expiresAt <= now) {
        await fs.promises.rm(directory, { recursive: true, force: true }).catch(() => {});
      }
    }));
  }

  router.post(
    "/system-documentation/publish",
    requireAdminOrSecret,
    express.raw({ type: ["application/pdf", "application/octet-stream"], limit: "75mb" }),
    async (req, res) => {
      const token = cleanAifSystemDocumentationToken(
        req.headers["x-aif-doc-token"] || req.query?.token || req.body?.token
      );
      if (!token) {
        return res.status(400).json({ error: "Érvénytelen dokumentációs token.", code: "invalid_documentation_token" });
      }

      const payload = Buffer.isBuffer(req.body) ? req.body : null;
      if (!payload || payload.length < 5) {
        return res.status(400).json({ error: "A feltöltött PDF üres vagy hiányzik.", code: "missing_pdf_payload" });
      }
      if (payload.length > AIF_SYSTEM_DOCUMENTATION_MAX_BYTES) {
        return res.status(413).json({ error: "A rendszer-dokumentáció PDF túl nagy.", code: "documentation_pdf_too_large" });
      }
      if (payload.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return res.status(400).json({ error: "A feltöltött fájl nem érvényes PDF.", code: "invalid_pdf_payload" });
      }

      try {
        await cleanupExpiredAifSystemDocumentation();
        const directory = aifSystemDocumentationDirectory(token);
        const filePath = aifSystemDocumentationFilePath(token);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + AIF_SYSTEM_DOCUMENTATION_TTL_MS);

        await fs.promises.rm(directory, { recursive: true, force: true });
        await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
        await fs.promises.writeFile(filePath, payload, { mode: 0o600 });
        await fs.promises.writeFile(
          aifSystemDocumentationMetadataPath(token),
          JSON.stringify({
            token,
            filename: AIF_SYSTEM_DOCUMENTATION_FILE,
            bytes: payload.length,
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            uploadedBy: actorFrom(req),
          }, null, 2),
          { encoding: "utf8", mode: 0o600 }
        );

        return res.json({
          ok: true,
          token,
          bytes: payload.length,
          filename: AIF_SYSTEM_DOCUMENTATION_FILE,
          expiresAt: expiresAt.toISOString(),
          downloadUrl: `/api/aif/system-documentation/${token}/download`,
          deleteUrl: `/api/aif/system-documentation/${token}`,
        });
      } catch (error) {
        console.error("AIF system documentation publish failed", error);
        return res.status(500).json({
          error: error?.message || "A rendszer-dokumentáció ideiglenes közzététele nem sikerült.",
          code: error?.code || "documentation_publish_failed",
        });
      }
    }
  );

  router.get("/system-documentation/:token/download", requireAdminOrSecret, async (req, res) => {
    const token = cleanAifSystemDocumentationToken(req.params.token);
    if (!token) return res.status(404).send("A dokumentáció nem található.");

    try {
      await cleanupExpiredAifSystemDocumentation();
      const filePath = aifSystemDocumentationFilePath(token);
      const metadataPath = aifSystemDocumentationMetadataPath(token);
      let metadata = null;
      try {
        metadata = JSON.parse(await fs.promises.readFile(metadataPath, "utf8"));
      } catch {}

      if (metadata?.expiresAt && new Date(metadata.expiresAt).getTime() <= Date.now()) {
        await fs.promises.rm(aifSystemDocumentationDirectory(token), { recursive: true, force: true });
        return res.status(410).send("A dokumentáció letöltési ideje lejárt.");
      }

      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) return res.status(404).send("A dokumentáció nem található.");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${AIF_SYSTEM_DOCUMENTATION_FILE}"`);
      res.setHeader("Content-Length", String(stat.size));
      res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
      res.setHeader("X-Content-Type-Options", "nosniff");

      const stream = fs.createReadStream(filePath);
      stream.on("error", (error) => {
        console.error("AIF system documentation stream failed", error);
        if (!res.headersSent) res.status(500).send("A PDF letöltése nem sikerült.");
        else res.destroy(error);
      });
      stream.pipe(res);
    } catch (error) {
      if (error?.code === "ENOENT") return res.status(404).send("A dokumentáció nem található.");
      console.error("AIF system documentation download failed", error);
      return res.status(500).send("A PDF letöltése nem sikerült.");
    }
  });

  router.delete("/system-documentation/:token", requireAdminOrSecret, async (req, res) => {
    const token = cleanAifSystemDocumentationToken(req.params.token);
    if (!token) return res.status(404).json({ error: "A dokumentáció nem található." });
    try {
      await fs.promises.rm(aifSystemDocumentationDirectory(token), { recursive: true, force: true });
      return res.json({ ok: true, deleted: true, token });
    } catch (error) {
      console.error("AIF system documentation delete failed", error);
      return res.status(500).json({ error: "A dokumentáció törlése nem sikerült.", code: error?.code || null });
    }
  });

  router.get("/health", requireAuthed, async (_req, res) => {
    const r = await pool.query(`SELECT count(*)::int AS suppliers FROM aif_suppliers`);
    res.json({ ok: true, suppliers: r.rows[0].suppliers });
  });

  return router;
}
