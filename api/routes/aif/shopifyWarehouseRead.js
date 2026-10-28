import express from 'express';

const txt = value => String(value ?? '').trim();
const denied = (req, res, next) => {
  const role=txt(req.session?.role).toLowerCase();
  if(role==='admin') return next();
  if(role==='shop' && txt(req.session?.shopId || req.session?.shop_id).toLowerCase()==='shopify') return next();
  return res.status(403).json({error:'A Shopify Raktár adatai csak az erre kijelölt üzletből érhetők el.'});
};
const errorResponse=(res,e)=>res.status(/nem található/.test(e?.message || '')?404:500).json({error:e?.message || 'Az adatok nem tölthetők be.'});

/** Csak megtekintés; sem AWB, sem eladás, sem raktári mozgás nem indítható. */
export default function createAifShopifyWarehouseReadRouter({pool,requireAuthed,aifResolveShopLocation}) {
  const router=express.Router();
  router.use(requireAuthed);

  // Csak a tényleges készletforrás üzlete láthatja a saját Shopify Avizait.
  // Nem az eladó neve alapján szűrünk: a helyszín teljes készletéért felelnek.
  async function sourceLocation(req) {
    return aifResolveShopLocation(req, pool, req.query.location || null);
  }

  router.get('/source/documents', async (req, res) => {
    try {
      const location = await sourceLocation(req);
      const exists = await pool.query(`SELECT to_regclass('public.aif_shopify_warehouse_orders') AS t`);
      if (!exists.rows[0]?.t) return res.json({ok:true,items:[],summary:{total:0,pending:0,fulfilled:0,cancelled:0}});
      const result = await pool.query(`
        SELECT w.shopify_order_id, w.document_number, w.order_name, w.customer_name,
          w.state, w.created_at, w.fulfilled_at, w.cancelled_at,
          d.id::text AS document_id, d.document_date, d.total_qty, d.total_value,
          d.from_location_summary, d.to_location_summary, d.raw,
          o.financial_status, o.fulfillment_status,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id',dl.id::text,'title',dl.product_title,'barcode',dl.barcode,
            'size',dl.size,'qty',dl.qty,'imageUrl',dl.image_url,
            'unitPrice',dl.unit_price,'total',dl.line_total
          ) ORDER BY dl.line_no)
          FROM aif_stock_transfer_document_lines dl WHERE dl.document_id=d.id), '[]'::jsonb) AS lines
        FROM aif_shopify_warehouse_orders w
        JOIN aif_stock_transfer_documents d ON d.id=w.document_id
        JOIN aif_shopify_orders o ON o.shopify_order_id=w.shopify_order_id
        WHERE w.source_location_id=$1
        ORDER BY w.created_at DESC,w.document_number DESC LIMIT 500`, [location.id]);
      const items=result.rows;
      res.setHeader('Cache-Control','no-store');
      return res.json({ok:true,location:{id:String(location.id),name:location.name,code:location.code},items,
        summary:{total:items.length,pending:items.filter(x=>x.state==='allocated').length,
          fulfilled:items.filter(x=>x.state==='fulfilled').length,
          cancelled:items.filter(x=>x.state==='cancelled').length}});
    } catch(e) {
      return res.status(e?.statusCode || 500).json({error:e?.message || 'Az üzlet Shopify Avizai nem tölthetők be.'});
    }
  });

  router.get('/source/documents/:id', async (req, res) => {
    try {
      const location = await sourceLocation(req);
      const id=txt(req.params.id);
      const result=await pool.query(`SELECT d.*, w.shopify_order_id, w.order_name,
          w.customer_name, w.state AS shopify_state, w.fulfilled_at, w.cancelled_at
        FROM aif_shopify_warehouse_orders w
        JOIN aif_stock_transfer_documents d ON d.id=w.document_id
        WHERE w.source_location_id=$1
          AND (w.document_number=$2 OR w.shopify_order_id=$2 OR w.document_id::text=$2)
        LIMIT 1`,[location.id,id]);
      if(!result.rowCount)return res.status(404).json({error:'Ehhez az üzlethez nem található ilyen Shopify Aviz.'});
      const document=result.rows[0];
      const lines=await pool.query(`SELECT * FROM aif_stock_transfer_document_lines
        WHERE document_id=$1 ORDER BY line_no`,[document.id]);
      res.setHeader('Cache-Control','no-store');
      return res.json({ok:true,document,lines:lines.rows});
    }catch(e){return res.status(e?.statusCode || 500).json({error:e?.message || 'A Shopify Aviz nem tölthető be.'});}
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
      const header=await pool.query(`SELECT w.*,d.*,
        o.total_price AS order_total,o.total_shipping AS shipping_amount,
        o.financial_status,o.fulfillment_status
        FROM aif_shopify_warehouse_orders w
        JOIN aif_stock_transfer_documents d ON d.id=w.document_id
        JOIN aif_shopify_orders o ON o.shopify_order_id=w.shopify_order_id
        WHERE w.shopify_order_id=$1 OR w.document_number=$1 OR w.document_id::text=$1 LIMIT 1`,[id]);
      if(!header.rowCount)return res.status(404).json({error:'Shopify Aviz nem található.'});
      const document=header.rows[0];
      const lines=await pool.query(`SELECT dl.*,wl.allocated_qty,wl.shipped_qty,wl.released_qty
        FROM aif_stock_transfer_document_lines dl
        JOIN aif_shopify_warehouse_lines wl ON wl.document_line_id=dl.id
        WHERE dl.document_id=$1 ORDER BY dl.line_no`,[document.document_id]);
      res.setHeader('Cache-Control','no-store');
      res.json({ok:true,document,lines:lines.rows});
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
