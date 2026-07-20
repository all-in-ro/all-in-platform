BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A korábbi transferbizonylat-táblákból általános készletbizonylat-központ lesz.
ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'internal_transfer';
ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS source_location_id text NULL;
ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS target_location_id text NULL;
ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS supplier_id text NULL;
ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS supplier_name text NULL;
ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS reception_id text NULL;
ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS external_reference text NULL;
ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS reason_code text NULL;
ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS reason_text text NULL;
ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS operation_direction text NULL;
ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS price_basis text NOT NULL DEFAULT 'selling_price';
ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS total_value numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS aif_stock_transfer_documents
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'RON';

-- Piszkozat: még nem módosít készletet és nem fogyaszt hivatalos sorszámot.
UPDATE aif_stock_transfer_documents
SET status='issued'
WHERE status NOT IN ('draft','issued','cancelled');

DO $$
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
END $$;

ALTER TABLE aif_stock_transfer_documents
  ADD CONSTRAINT aif_stock_transfer_documents_status_check
  CHECK (status IN ('draft','issued','cancelled'));

ALTER TABLE IF EXISTS aif_stock_transfer_document_lines
  ADD COLUMN IF NOT EXISTS unit_price numeric(14,2) NULL;
ALTER TABLE IF EXISTS aif_stock_transfer_document_lines
  ADD COLUMN IF NOT EXISTS line_total numeric(14,2) NULL;
ALTER TABLE IF EXISTS aif_stock_transfer_document_lines
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'RON';
ALTER TABLE IF EXISTS aif_stock_transfer_document_lines
  ADD COLUMN IF NOT EXISTS price_basis text NULL;
ALTER TABLE IF EXISTS aif_stock_transfer_document_lines
  ADD COLUMN IF NOT EXISTS qty_delta integer NULL;

CREATE INDEX IF NOT EXISTS aif_stock_transfer_documents_type_created_idx
  ON aif_stock_transfer_documents (document_type, created_at DESC);

CREATE TABLE IF NOT EXISTS aif_stock_document_settings (
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
);

INSERT INTO aif_stock_document_settings (
  document_type, series, next_number, digits, include_year, yearly_reset,
  sequence_year, document_title, document_subtitle
) VALUES
  ('internal_transfer','PV',1,6,true,true,EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,'PROCES-VERBAL DE PREDARE-PRIMIRE','Transfer intern de stoc'),
  ('supplier_return','RET',1,6,true,true,EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,'AVIZ DE RETUR CĂTRE FURNIZOR','Retur de marfă către furnizor'),
  ('damaged_writeoff','DET',1,6,true,true,EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,'PROCES-VERBAL DE CONSTATARE ȘI SCOATERE DIN GESTIUNE','Produse deteriorate / scoatere din gestiune'),
  ('stock_correction','COR',1,6,true,true,EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Bucharest'))::integer,'NOTĂ DE CORECȚIE A STOCULUI','Corecție justificată de stoc')
ON CONFLICT (document_type) DO NOTHING;

-- Az eddigi PV számozás legyen az általános belső átadás kiinduló számozása.
UPDATE aif_stock_document_settings g
SET series=s.series,
    next_number=GREATEST(g.next_number,s.next_number),
    digits=s.digits,
    include_year=s.include_year,
    yearly_reset=s.yearly_reset,
    sequence_year=s.sequence_year,
    document_title=s.document_title,
    document_subtitle=s.document_subtitle,
    updated_at=now()
FROM aif_stock_transfer_document_settings s
WHERE g.document_type='internal_transfer'
  AND s.id=1;

UPDATE aif_stock_transfer_documents
SET document_type='internal_transfer',
    operation_direction=COALESCE(operation_direction,'transfer'),
    price_basis=COALESCE(NULLIF(price_basis,''),'selling_price'),
    currency_code=COALESCE(NULLIF(currency_code,''),'RON')
WHERE COALESCE(document_type,'')='' OR document_type='internal_transfer';

-- Régi hivatalos belső átadások értékpillanatképe kizárólag ELADÁSI árból.
UPDATE aif_stock_transfer_document_lines l
SET unit_price=round(v.sell_price::numeric,2),
    line_total=round(l.qty::numeric * v.sell_price::numeric,2),
    currency_code='RON',
    price_basis=COALESCE(l.price_basis,'selling_price'),
    qty_delta=COALESCE(l.qty_delta,0)
FROM aif_product_variants v
WHERE l.variant_id::text=v.id::text
  AND l.unit_price IS NULL
  AND v.sell_price IS NOT NULL;

UPDATE aif_stock_transfer_document_lines
SET line_total=round(qty::numeric * unit_price::numeric,2)
WHERE line_total IS NULL AND unit_price IS NOT NULL;

UPDATE aif_stock_transfer_documents d
SET total_value=x.total_value,
    currency_code='RON'
FROM (
  SELECT document_id, round(COALESCE(sum(line_total),0)::numeric,2) AS total_value
  FROM aif_stock_transfer_document_lines
  GROUP BY document_id
) x
WHERE x.document_id=d.id
  AND d.total_value IS DISTINCT FROM x.total_value;

COMMIT;
