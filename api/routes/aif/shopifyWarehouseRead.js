import express from 'express';
import { getAifShopifyLifecycle, getAifShopifyAviz, receiveAifShopifyReturn, resolveAifShopifyQuarantine } from '../../lib/aifShopifyWarehouse.js';

const txt = value => String(value ?? '').trim();
const denied = (req, res, next) => {
  const role=txt(req.session?.role).toLowerCase();
  if(role==='admin') return next();
  if(role==='shop' && txt(req.session?.shopId || req.session?.shop_id).toLowerCase()==='shopify') return next();
  return res.status(403).json({error:'A Shopify Raktár adatai csak az erre kijelölt üzletből érhetők el.'});
};
const errorResponse=(res,e)=>res.status(/nem található/.test(e?.message || '')?404:500).json({error:e?.message || 'Az adatok nem tölthetők be.'});

/** Megtekintés és külön, jogosultságvédett fizikai visszáru-átvétel. Nincs AWB vagy pénzügyi művelet. */
export default function createAifShopifyWarehouseReadRouter({pool,requireAuthed,aifResolveShopLocation}) {
  const router=express.Router();
  router.use(requireAuthed);
  router.use((req,res,next)=>{
    if(req.method!=='GET'&&!['admin','shop'].includes(txt(req.session?.role).toLowerCase()))return res.status(403).json({error:'Nincs jogosultság a készletművelethez.'});
    if(req.method!=='GET'&&req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({error:'Keresztoldali készletművelet nem engedélyezett.'});
    next();
  });

  // Csak a tényleges készletforrás üzlete láthatja a saját Shopify Avizait.
  // Nem az eladó neve alapján szűrünk: a helyszín teljes készletéért felelnek.
  async function sourceLocation(req) {
    return aifResolveShopLocation(req, pool, req.query.location || null);
  }

  /**
   * KIZÁRÓLAG OLVASÁS. A jogosultságot a már bevált aifResolveShopLocation
   * a munkamenethez rendelt üzletből számolja, nem a kliens által írt locationből.
   * A Shopify Aviz a normál készletbizonylat; nincs külön másodlagos készletnapló.
   * Nem JOIN-olunk kötelezően az online rendelésre: az Aviz visszakereshetősége
   * akkor is kötelező, ha a webshop-rendelés adatai később archiválódnak.
   */
  async function loadSourceDocuments(req) {
    const location = await sourceLocation(req);
    const exists = await pool.query(`SELECT to_regclass('public.aif_shopify_warehouse_orders') AS warehouse,
      to_regclass('public.aif_stock_transfer_documents') AS documents`);
    if (!exists.rows[0]?.warehouse || !exists.rows[0]?.documents) {
      return { location, items: [], summary: { total: 0, pending: 0, fulfilled: 0, cancelled: 0 } };
    }

    // A bizonylat FORRÁSHELYE az irányadó. Egy eltérő régi összerendelés
    // nem rejtheti el a készletfelelős üzlet elől a saját hivatalos Avizát.
    // Hiányzó dokumentumforrásnál a Shopify-kapcsoló sor helyszínét használjuk.
    const result = await pool.query(`
      SELECT w.shopify_order_id, d.document_number, w.order_name, w.customer_name,
        CASE WHEN d.id=w.document_id THEN w.state ELSE 'recorded' END AS state,
        COALESCE(d.raw->>'shopifyOperation','transfer') AS kind,
        COALESCE(w.raw->>'lifecycleState',w.state) AS lifecycle_state,
        CASE WHEN d.id=w.document_id THEN COALESCE((SELECT sum(allocated_qty-shipped_qty-released_qty)
          FROM aif_shopify_warehouse_lines WHERE shopify_order_id=w.shopify_order_id),0) ELSE 0 END AS pending_qty,
        d.created_at,w.fulfilled_at,w.cancelled_at,d.id::text AS document_id,d.document_date,d.total_qty,d.total_value,
        d.from_location_summary,d.to_location_summary,d.raw->>'originalAviz' AS original_aviz
      FROM aif_stock_transfer_documents d JOIN aif_shopify_warehouse_orders w
        ON d.id=w.document_id OR d.raw->>'shopifyOrderId'=w.shopify_order_id
      WHERE d.document_type='shopify_transfer' AND
        (d.source_location_id=$1::text OR d.target_location_id=$1::text OR w.source_location_id::text=$1::text)
      ORDER BY d.created_at DESC,d.document_number DESC LIMIT 1000`,[location.id]);

    const items = result.rows.map((row) => ({ ...row, lines: [] }));
    if (items.length) {
      const ids = items.map((item) => item.document_id);
      const lines = await pool.query(`
        SELECT dl.document_id::text AS document_id, dl.id::text AS id,
          dl.product_title AS title, dl.barcode, dl.size, dl.qty,
          dl.image_url AS "imageUrl", dl.unit_price AS "unitPrice",
          dl.line_total AS total
        FROM aif_stock_transfer_document_lines dl
        WHERE dl.document_id=ANY($1::uuid[])
        ORDER BY dl.document_id, dl.line_no`, [ids]);
      const byDoc = new Map();
      for (const line of lines.rows) {
        const docId = String(line.document_id);
        const batch = byDoc.get(docId) || [];
        batch.push(line);
        byDoc.set(docId, batch);
      }
      for (const item of items) item.lines = byDoc.get(item.document_id) || [];
    }
    return { location, items, summary: {
      total: items.length,
      pending: items.filter(x => Number(x.pending_qty)>0).length,
      fulfilled: items.filter(x => x.state === 'fulfilled').length,
      cancelled: items.filter(x => x.state === 'cancelled').length,
    }};
  }

  router.get('/source/documents', async (req, res) => {
    try {
      const result = await loadSourceDocuments(req);
      res.setHeader('Cache-Control', 'no-store, private');
      return res.json({
        ok: true,
        location: {
          id: String(result.location.id),
          name: result.location.name,
          code: result.location.code,
        },
        items: result.items,
        summary: result.summary,
      });
    } catch (error) {
      console.error('[AIF Shopify shop source documents]', error);
      return res.status(error?.statusCode || 500).json({
        ok: false,
        error: error?.message || 'A Shopify átadási bizonylatok nem tölthetők be.',
      });
    }
  });

  router.get('/source/documents/:id', async (req, res) => {
    try {
      const location = await sourceLocation(req);
      const id = txt(req.params.id);
      if (!id || id.length > 200) return res.status(400).json({ error: 'Érvénytelen bizonylatazonosító.' });
      const result = await pool.query(`SELECT d.*,w.shopify_order_id,w.order_name,w.customer_name,
        CASE WHEN d.id=w.document_id THEN w.state ELSE 'recorded' END AS shopify_state,w.fulfilled_at,w.cancelled_at
        FROM aif_stock_transfer_documents d JOIN aif_shopify_warehouse_orders w
          ON d.id=w.document_id OR d.raw->>'shopifyOrderId'=w.shopify_order_id
        WHERE d.document_type='shopify_transfer' AND
          (d.source_location_id=$1::text OR d.target_location_id=$1::text OR w.source_location_id::text=$1::text)
          AND (d.document_number=$2 OR d.id::text=$2 OR (w.shopify_order_id=$2 AND d.id=w.document_id)) LIMIT 1`,[location.id,id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Ehhez az üzlethez nem található ilyen Shopify Aviz.' });
      const document = result.rows[0];
      const lines = await pool.query(`
        SELECT * FROM aif_stock_transfer_document_lines
        WHERE document_id=$1 ORDER BY line_no`, [document.id]);
      res.setHeader('Cache-Control', 'no-store, private');
      return res.json({ ok: true, document, lines: lines.rows });
    } catch (error) {
      console.error('[AIF Shopify shop source detail]', error);
      return res.status(error?.statusCode || 500).json({
        ok: false,
        error: error?.message || 'A Shopify Aviz nem tölthető be.',
      });
    }
  });

  async function lifecycleForSession(req) {
    const db=await pool.connect();
    try {
      const data=await getAifShopifyLifecycle(db,txt(req.params.id));
      const admin=txt(req.session?.role).toLowerCase()==='admin';
      const location=admin?null:await sourceLocation(req);
      if(!admin && ![String(data.order.source_location_id),String(data.order.target_location_id)].includes(String(location?.id))) {
        throw Object.assign(new Error('Ez a rendelés nem tartozik az üzletedhez.'),{statusCode:403});
      }
      return {data,admin,location};
    } finally {db.release();}
  }
  router.get('/source/lifecycle/:id',async(req,res)=>{
    try {
      const {data,admin,location}=await lifecycleForSession(req);
      res.setHeader('Cache-Control','no-store, private');
      res.json({ok:true,...data,canReceive:admin||String(location?.id)===String(data.order.source_location_id),canResolveQuarantine:admin,
        locations:admin?data.locations:data.locations.filter(l=>String(l.id)===String(location?.id))});
    }catch(e){res.status(e.statusCode||500).json({error:e.message});}
  });
  router.post('/source/lifecycle/:id/receive-return',async(req,res)=>{
    try {
      const {admin,location}=await lifecycleForSession(req);
      const result=await receiveAifShopifyReturn(pool,req.params.id,req.body||{}, {
        actor:txt(req.session?.actor)||'ADMIN',admin,allowedLocationId:location?.id||null});
      res.json({ok:true,...result});
    }catch(e){res.status(e.statusCode||500).json({error:e.message,code:e.code||null});}
  });
  router.post('/source/quarantine/:id/resolve',async(req,res)=>{
    try {
      const result=await resolveAifShopifyQuarantine(pool,req.params.id,req.body||{},
        {actor:txt(req.session?.actor)||'ADMIN',admin:txt(req.session?.role).toLowerCase()==='admin'});
      res.json({ok:true,...result});
    }catch(e){res.status(e.statusCode||500).json({error:e.message,code:e.code||null});}
  });

  // A teljes webshop vásárlói és raktári adatait csak a Shopify Raktár kezelője láthatja.
  router.use(denied);

  router.get('/documents',async(req,res)=>{
    try {
      const q=txt(req.query.search).slice(0,120);
      const args=[];
      let where='';
      if(q) {
        args.push(`%${q}%`);
        where=`WHERE w.document_number ILIKE $1 OR w.order_name ILIKE $1 OR w.customer_name ILIKE $1`;
      }
      const result=await pool.query(`SELECT w.shopify_order_id,w.document_number,w.order_name,
        w.customer_name,w.state,w.created_at,w.fulfilled_at,w.cancelled_at,
        d.total_qty,d.total_value,d.document_date,
        o.financial_status,o.fulfillment_status,o.total_price,o.total_shipping,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('title',dl.product_title,
            'qty',dl.qty,'size',dl.size,'barcode',dl.barcode,'imageUrl',dl.image_url,
            'shipped',wl.shipped_qty,'released',wl.released_qty) ORDER BY dl.line_no)
          FROM aif_shopify_warehouse_lines wl
          JOIN aif_stock_transfer_document_lines dl ON dl.id=wl.document_line_id
          WHERE wl.shopify_order_id=w.shopify_order_id),'[]'::jsonb) AS lines
        FROM aif_shopify_warehouse_orders w
        JOIN aif_stock_transfer_documents d ON d.id=w.document_id
        JOIN aif_shopify_orders o ON o.shopify_order_id=w.shopify_order_id
        ${where}
        ORDER BY w.created_at DESC,w.document_number DESC LIMIT 250`,args);
      res.setHeader('Cache-Control','no-store');
      res.json({ok:true,items:result.rows});
    }catch(e){errorResponse(res,e);}
  });

  router.get('/documents/:id',async(req,res)=>{
    try {
      const id=txt(req.params.id);
      const {document,lines}=await getAifShopifyAviz(pool,id);
      res.setHeader('Cache-Control','no-store');
      res.json({ok:true,document,lines});
    }catch(e){errorResponse(res,e);}
  });

  router.get('/customers',async(req,res)=>{
    try {
      // Csak a helyben tárolt Shopify-rendelések. Nem hoz létre bolti klienst,
      // nem tölti be a vevő pénzét a kasszába.
      const result=await pool.query(`WITH base AS (
        SELECT *,CASE
          WHEN NULLIF(btrim(coalesce(customer_email,'')),'') IS NOT NULL
            THEN 'email:'||lower(btrim(customer_email))
          WHEN NULLIF(btrim(coalesce(customer_phone,'')),'') IS NOT NULL
            THEN 'phone:'||regexp_replace(customer_phone,'[^0-9+]','','g')
          WHEN NULLIF(btrim(coalesce(customer_name,'')),'') IS NOT NULL
            THEN 'name:'||lower(btrim(customer_name))
          ELSE 'order:'||shopify_order_id END AS customer_key
        FROM aif_shopify_orders
        WHERE COALESCE(NULLIF(btrim(customer_name),''),NULLIF(btrim(customer_email),''),NULLIF(btrim(customer_phone),'')) IS NOT NULL
      )
      SELECT customer_key,
        max(customer_name) FILTER (WHERE NULLIF(btrim(customer_name),'') IS NOT NULL) AS customer_name,
        max(customer_email) FILTER (WHERE NULLIF(btrim(customer_email),'') IS NOT NULL) AS customer_email,
        max(customer_phone) FILTER (WHERE NULLIF(btrim(customer_phone),'') IS NOT NULL) AS customer_phone,
        count(*)::int AS order_count,
        COALESCE(sum(CASE WHEN financial_status='paid' AND status<>'cancelled'
          THEN total_price ELSE 0 END),0) AS paid_total,
        max(shopify_created_at) AS last_order_at,
        jsonb_agg(jsonb_build_object('orderNumber',order_name,'total',total_price,
          'shipping',total_shipping,'financialStatus',financial_status,'status',status,
          'createdAt',shopify_created_at) ORDER BY shopify_created_at DESC NULLS LAST) AS orders
      FROM base GROUP BY customer_key
      ORDER BY max(shopify_created_at) DESC NULLS LAST LIMIT 500`);
      res.setHeader('Cache-Control','no-store');
      res.json({ok:true,items:result.rows});
    }catch(e){errorResponse(res,e);}
  });

  return router;
}
