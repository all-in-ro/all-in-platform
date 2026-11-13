import pg from 'pg';
import { archiveRemoteImage, isOwnImageUrl } from '../api/lib/aifRemoteImageArchive.js';
import { aifImageGallery } from '../api/lib/aifImageGallery.js';
const apply=process.argv.includes('--apply');
const all=process.argv.includes('--all');
const limitArg=process.argv.find(x=>x.startsWith('--limit='));
const limit=all?Infinity:Math.max(1,Math.min(10000,Number(limitArg?.split('=')[1])||50));
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const cache=new Map();
let cursor='',scanned=0,candidates=0,saved=0,failed=0,changed=0;
console.log(apply?'SAJÁT KÉPMÁSOLATOK MENTÉSE':'FELMÉRÉS – nincs feltöltés és nincs adatbázis-módosítás');
try {
  if(!process.env.R2_PUBLIC_BASE_URL)throw Error('Hiányzik az R2_PUBLIC_BASE_URL beállítás.');
  while(candidates<limit) {
    const {rows}=await pool.query(`SELECT id::text,images,image_url FROM aif_product_variants
      WHERE id::text>$1 ORDER BY id::text LIMIT 100`,[cursor]);
    if(!rows.length)break;
    for(const row of rows) {
      cursor=row.id;scanned++;
      const photos=aifImageGallery(row.images,row.image_url);
      const external=photos.filter(url=>!isOwnImageUrl(url));
      if(!external.length)continue;
      candidates++;
      if(!apply) {
        if(candidates<=20)console.log(`${row.id}: ${external.length} külső kép`);
      } else {
        try {
          const archived=[];
          for(const photo of photos) {
            if(isOwnImageUrl(photo)){archived.push(photo);continue;}
            let result=cache.get(photo);
            if(!result){result=await archiveRemoteImage(photo);cache.set(photo,result);}
            archived.push(result.url);
          }
          const unique=[...new Set(archived)];
          const result=await pool.query(`UPDATE aif_product_variants
            SET images=$2::jsonb,image_url=$3,updated_at=now()
            WHERE id::text=$1 AND images IS NOT DISTINCT FROM $4::jsonb
              AND image_url IS NOT DISTINCT FROM $5`,[
              row.id,JSON.stringify(unique),unique[0]||null,
              row.images==null?null:JSON.stringify(row.images),row.image_url
            ]);
          if(result.rowCount){saved++;console.log(`${row.id}: ${external.length} kép átvéve`);}
          else{changed++;console.log(`${row.id}: közben módosult, nem írtam felül`);}
        }catch(e){failed++;console.log(`${row.id}: nem mentve, eredeti képek megmaradtak (${e.statusCode?e.message:'letöltési vagy tárhelyhiba'})`);}
      }
      if(candidates>=limit)break;
    }
  }
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',scanned,candidates,saved,failed,concurrentlyChanged:changed,limit:all?'all':limit},null,2));
  if(failed)process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}finally{await pool.end();}
