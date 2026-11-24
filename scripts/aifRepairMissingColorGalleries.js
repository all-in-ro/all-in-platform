/**
 * AIF V27 - once-off, safe backfill for product variants with missing color name/gallery.
 * Dry run: node scripts/aifRepairMissingColorGalleries.js
 * Apply:   node scripts/aifRepairMissingColorGalleries.js --apply
 * Narrow:  add --product=4FWAW26TFTRM1424
 * Does NOT alter stocks, SKU, barcode, size, prices, or sale history.
 */
import pg from 'pg';
import { enqueueAifShopifyImagesForVariant } from '../api/lib/aifShopifyImages.js';

const apply = process.argv.includes('--apply');
const productFilter = (process.argv.find(arg => arg.startsWith('--product=')) || '').split('=').slice(1).join('=').trim();
const maxChanges = Number((process.argv.find(arg => arg.startsWith('--limit=')) || '').split('=')[1] || 300);
const norm = v => String(v ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
const hasText = v => Boolean(String(v ?? '').trim());
const needsName = row => hasText(row.color_code) && (!hasText(row.color_name) || norm(row.color_name) === norm(row.color_code));
const key = row => [norm(row.model_id), norm(row.color_code), norm(row.supplier_product_code)].join('|');
const validImage = v => /^https:\/\//i.test(String(v || '').trim()) && String(v).trim().length <= 2048;
function gallery(row) {
  const value = row?.images;
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = [raw]; }
  }
  const list = Array.isArray(raw) ? raw : [];
  const urls = [];
  const add = item => {
    const url = String(item && typeof item === 'object'
      ? item.url ?? item.src ?? item.imageUrl ?? item.image_url ?? '' : item ?? '').trim();
    if (validImage(url) && !urls.includes(url)) urls.push(url);
  };
  list.forEach(add);
  if (validImage(row?.image_url) && !urls.includes(String(row.image_url).trim())) urls.unshift(String(row.image_url).trim());
  return urls.slice(0, 60);
}

function plan(candidate, modelRows) {
  if (!candidate || candidate.status === 'archived' || !needsName(candidate) || !hasText(candidate.supplier_product_code)) return null;
  const siblings = modelRows.filter(row => row.status !== 'archived' && key(row) === key(candidate) && row.id !== candidate.id);
  const named = siblings.filter(row => hasText(row.color_name) && norm(row.color_name) !== norm(row.color_code));
  const names = new Map();
  for (const row of named) names.set(norm(row.color_name), String(row.color_name).trim());
  if (names.size !== 1) return null;
  const pickedName = [...names.values()][0];
  const sources = new Map();
  for (const row of named) {
    const pictures = gallery(row);
    if (pictures.length) sources.set(JSON.stringify(pictures), pictures);
  }
  const before = gallery(candidate);
  const pictureConflict = sources.size > 1;
  const inheritedImages = !before.length && sources.size === 1 ? [...sources.values()][0] : [];
  return { id: candidate.id, modelId: candidate.model_id, code: candidate.model_code,
    size: candidate.size, colorCode: candidate.color_code,
    name: pickedName, nameChanged: norm(candidate.color_name) !== norm(pickedName),
    currentImages: before, images: inheritedImages, pictureConflict,
    peerCount: named.length };
}

const rowSql = (where, locked = false) => `
  SELECT v.id::text AS id, v.model_id::text AS model_id,
         m.model_code, v.color_name, v.color_code, v.size, v.image_url, v.images,
         COALESCE(v.status,'active') AS status,
         sc.supplier_product_code
  FROM aif_product_variants v
  JOIN aif_product_models m ON m.id=v.model_id
  LEFT JOIN LATERAL (
    SELECT s.supplier_product_code
    FROM aif_variant_supplier_codes s
    WHERE s.variant_id=v.id AND COALESCE(s.is_active,true)=true
      AND NULLIF(btrim(COALESCE(s.supplier_product_code,'')),'') IS NOT NULL
    ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST, s.id::text DESC
    LIMIT 1
  ) sc ON true
  ${where}
  ORDER BY v.model_id,v.id
  ${locked ? 'FOR UPDATE OF v' : ''}
`;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 8000, query_timeout: 30000 });
let db;
try {
  db = await pool.connect();
  const all = await db.query(rowSql(productFilter
    ? `WHERE m.model_code ILIKE $1 OR EXISTS (
       SELECT 1 FROM aif_variant_supplier_codes sx WHERE sx.variant_id=v.id AND sx.supplier_product_code ILIKE $1)`
    : ''), productFilter ? [`%${productFilter}%`] : []);
  const grouped = new Map();
  for (const row of all.rows) {
    const list = grouped.get(row.model_id) || [];
    list.push(row);
    grouped.set(row.model_id, list);
  }
  const previews = all.rows.map(row => plan(row, grouped.get(row.model_id) || [])).filter(Boolean);
  console.log(`\nAIF V27 • ${apply ? 'MODOSITAS' : 'CSAK ELLENORZES'}${productFilter ? ` • ${productFilter}` : ''}`);
  console.log(`Atnezett variansok: ${all.rowCount} • Biztonsagosan egyeztetheto: ${previews.length}`);
  console.table(previews.slice(0, 40).map(p => ({
    id:p.id.slice(0,8),modell:p.code,meret:p.size,szin:p.colorCode,
    szinnev:p.name,kepek:p.images.length,keputkozes:p.pictureConflict?'IGEN':'nem',testver:p.peerCount
  })));
  if (!apply) {
    console.log('ADATMODOSITAS NEM TORTENT. A jovahagyott javitashoz: --apply');
    if (previews.length > 40) console.log(`Tovabbi ${previews.length-40} sor nincs kiirva.`);
  } else {
    if (!Number.isInteger(maxChanges) || maxChanges < 1 || maxChanges > 2000) throw new Error('--limit erteke 1 es 2000 kozott lehet.');
    if (previews.length > maxChanges) throw new Error(`Tul sok javitasi jelolt (${previews.length}). Add meg a --product=KOD parametert vagy a --limit erteket.`);
    let correctedNames = 0, correctedPhotos = 0, skipped = 0, queued = 0;
    for (const preview of previews) {
      try {
        await db.query('BEGIN');
        await db.query("SET LOCAL lock_timeout = '4s'");
        await db.query("SET LOCAL statement_timeout = '25s'");
        // Gallery editing locks the model FIRST, then its variants. Keep the same order.
        await db.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,
          [`aif_shared_gallery_model:${preview.modelId}`]);
        const freshResult = await db.query(rowSql('WHERE v.model_id=$1::uuid',true),[preview.modelId]);
        const target = freshResult.rows.find(row => row.id === preview.id);
        const next = plan(target, freshResult.rows);
        if (!next || (!next.nameChanged && !next.images.length)) {
          skipped++; await db.query('ROLLBACK'); continue;
        }
        const willPhoto = next.images.length > 0;
        const result = await db.query(`
          UPDATE aif_product_variants
          SET color_name=$2,
              image_url=CASE WHEN $3::boolean THEN $4 ELSE image_url END,
              images=CASE WHEN $3::boolean THEN $5::jsonb ELSE images END,
              updated_at=now()
          WHERE id=$1::uuid
            AND (NULLIF(btrim(COALESCE(color_name,'')),'') IS NULL
              OR lower(btrim(color_name))=lower(btrim(COALESCE(color_code,''))))
            AND ($3::boolean=false OR
                 ((images IS NULL OR images='[]'::jsonb) AND
                  NULLIF(btrim(COALESCE(image_url,'')),'') IS NULL))
          RETURNING id`, [next.id,next.name,willPhoto,next.images[0]||null,JSON.stringify(next.images)]);
        if (result.rowCount!==1) throw new Error('Idokozben modosult a variant. Nem irtuk felul.');
        if (willPhoto) {
          const exists = await db.query(`SELECT to_regclass('public.aif_shopify_image_outbox') AS tbl`);
          if (exists.rows[0]?.tbl) {
            await db.query('SAVEPOINT aif_v27_shopify_outbox');
            try {
              const q = await enqueueAifShopifyImagesForVariant(db, next.id, next.currentImages);
              queued += Number(q?.queued || 0);
              await db.query('RELEASE SAVEPOINT aif_v27_shopify_outbox');
            } catch (e) {
              await db.query('ROLLBACK TO SAVEPOINT aif_v27_shopify_outbox');
              await db.query('RELEASE SAVEPOINT aif_v27_shopify_outbox');
              console.error('Shopify kepszinkron varolista figyelmeztetes:', next.id, e.message);
            }
          }
        }
        await db.query('COMMIT');
        correctedNames++; if (willPhoto) correctedPhotos++;
        console.log('JAVITVA',next.id,next.name,willPhoto?`${next.images.length} kep`:'kep valtozatlan');
      } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        skipped++;
        console.error('KIUGROTT',preview.id,e.message);
      }
    }
    console.log(`\nKESZ: szinnev=${correctedNames}, kep=${correctedPhotos}, atnezendo/kimaradt=${skipped}, Shopify varolista=${queued}`);
    console.log('Keszlet, vonalkod, SKU, meret, ar, eladas NEM valtozott.');
  }
} catch (e) {
  console.error('AIF V27 HIBA:',e.message,'PG KOD:',e.code||'');
  process.exitCode = 1;
} finally {
  db?.release();
  await pool.end();
}
