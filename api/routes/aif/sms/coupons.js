import { fail, txt, money, couponDiscount } from './domain.js';
import { ensureSmsSchema, audit } from './schema.js';
export function createCouponService(pool) {
  async function validate(db,{code,customerId,locationId,baseTotal,manualExtraDiscount=0,hasPercentDiscount=false,lock=false}) {
    code=txt(code).toUpperCase().replace(/\s+/g,'');
    if(!/^[A-Z0-9-]{10,40}$/.test(code))throw fail('Érvénytelen kuponkód.','coupon_invalid');
    if(!customerId)throw fail('A kuponhoz előbb válaszd ki a klienst.','coupon_customer');
    const {rows}=await db.query(`SELECT cp.*, ((now() AT TIME ZONE 'Europe/Bucharest')::date)::text AS today
      FROM aif_sms_coupons cp WHERE cp.code=$1 ${lock?'FOR UPDATE OF cp':''}`,[code]);
    const row=rows[0];
    if(!row)throw fail('A kupon nem található.','coupon_invalid');
    if(String(row.customer_id)!==String(customerId)||String(row.location_id)!==String(locationId))throw fail('A kupon másik klienshez vagy üzlethez tartozik.','coupon_scope',403);
    if(row.mode!=='live')throw fail('Tesztkampány kuponja nem váltható be.','coupon_test');
    if(row.status==='used')throw fail('Ezt a kupont már felhasználták.','coupon_used',409);
    if(row.status!=='active')throw fail('A kupon nem aktív.','coupon_inactive',409);
    if(row.today<row.rules.validFrom)throw fail('A kupon érvényessége még nem kezdődött el.','coupon_not_started');
    if(row.today>row.rules.validUntil)throw fail('A kupon lejárt.','coupon_expired');
    const amount=couponDiscount(row.rules,baseTotal,manualExtraDiscount,hasPercentDiscount);
    return {id:row.id,code:row.code,amount,rules:row.rules,customerId:String(row.customer_id),locationId:String(row.location_id)};
  }
  return {
    async prepare(db,{body,location,lines,baseTotal,manualExtraDiscount}) {
      if(!txt(body.couponCode))return null;
      // Schema must already be initialized before the enclosing sale transaction.
      const coupon=await validate(db,{code:body.couponCode,customerId:body.customer?.id,locationId:location.id,baseTotal,manualExtraDiscount,
        hasPercentDiscount:lines.some(l=>l.discountPercent>0),lock:true});
      const expected=Number(body.couponExpectedDiscount);
      if(!Number.isFinite(expected)||Math.abs(money(expected)-coupon.amount)>0.005)throw fail('A kosár vagy az ár megváltozott. Ellenőrizd újra a kupont.','coupon_quote_changed',409);
      return coupon;
    },
    async consume(db,coupon,sale,actor) {
      if(!coupon)return;
      if(String(sale.customer_id)!==coupon.customerId||String(sale.location_id)!==coupon.locationId)throw fail('A kupon klienskapcsolata nem egyezik az eladással.','coupon_scope',409);
      const changed=await db.query(`UPDATE aif_sms_coupons SET status='used',used_sale_id=$2,used_at=now(),used_by=$3,discount_amount=$4 WHERE id=$1 AND status='active' AND used_sale_id IS NULL RETURNING id`,[coupon.id,String(sale.id),actor,coupon.amount]);
      if(changed.rowCount!==1)throw fail('A kupont időközben már beváltották.','coupon_used',409);
      await db.query(`UPDATE aif_shop_sales SET raw=raw || $2::jsonb WHERE id=$1`,[sale.id,JSON.stringify({smsCoupon:{code:coupon.code,discount:coupon.amount,customerId:coupon.customerId}})]);
      await audit(db,{customerId:coupon.customerId,locationId:coupon.locationId,actor,event:'coupon_redeemed',payload:{code:coupon.code,saleId:String(sale.id),saleNumber:sale.sale_number,discount:coupon.amount}});
    },
    async quote({code,customerId,locationId,lines,manualExtraDiscount=0}) {
      await ensureSmsSchema(pool);
      if(!Array.isArray(lines)||!lines.length||lines.length>250)throw fail('A kuponhoz nem üres kosár szükséges.');
      const ids=lines.map(l=>txt(l.variantId));
      if(new Set(ids).size!==ids.length)throw fail('Dupla terméksor a kosárban.');
      const prices=(await pool.query(`SELECT id::text,sell_price FROM aif_product_variants WHERE id::text=ANY($1::text[]) AND status='active'`,[ids])).rows;
      let baseTotal=0;
      for(const l of lines){
        const v=prices.find(p=>p.id===l.variantId),qty=Number(l.quantity),d=Number(l.discountPercent||0),price=Number(v?.sell_price);
        if(!v||v.sell_price===null||!Number.isFinite(price)||price<0||!Number.isInteger(qty)||qty<1||qty>9999||!Number.isFinite(d)||d<0||d>100)throw fail('Érvénytelen kosártétel.');
        const unit=d>0?Math.ceil(price*(1-d/100)*100-1e-9)/100:money(price);
        baseTotal=money(baseTotal+unit*qty);
      }
      const coupon=await validate(pool,{code,customerId,locationId,baseTotal,manualExtraDiscount,hasPercentDiscount:lines.some(l=>Number(l.discountPercent)>0)});
      return {code:coupon.code,discount:coupon.amount,payable:money(baseTotal-manualExtraDiscount-coupon.amount),validUntil:coupon.rules.validUntil,stackable:coupon.rules.stackable};
    }
  };
}
