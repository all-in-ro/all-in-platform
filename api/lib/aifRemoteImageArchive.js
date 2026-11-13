import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const MAX_BYTES = 10 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = message => Object.assign(new Error(message), { statusCode: 400 });
let storage;
function config() {
  for (const key of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','R2_PUBLIC_BASE_URL']) {
    if (!process.env[key]) throw Object.assign(new Error('A képtár beállítása hiányos: '+key), {statusCode:503});
  }
  const base = new URL(process.env.R2_PUBLIC_BASE_URL);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw fail('Érvénytelen nyilvános képtár URL.');
  storage ||= new S3Client({region:'auto',endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
  return {client:storage,bucket:process.env.R2_BUCKET,base:base.href.replace(/\/+$/,'')};
}
export function isOwnImageUrl(value) {
  const base = String(process.env.R2_PUBLIC_BASE_URL||'').replace(/\/+$/,'');
  return Boolean(base && String(value).startsWith(base+'/'));
}
export function isPublicImageIPv4(address) {
  if (isIP(address)!==4) return false;
  const [a,b]=address.split('.').map(Number);
  return !(a===0 || a===10 || a===127 || a>=224 || (a===169&&b===254) ||
    (a===172&&b>=16&&b<=31) || (a===192&&(b===168||b===0||b===2)) ||
    (a===100&&b>=64&&b<=127) || (a===198&&(b===18||b===19||b===51)) ||
    (a===203&&b===0));
}
export function imageFormat(bytes) {
  if(bytes.length>=3 && bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return ['jpg','image/jpeg'];
  if(bytes.length>=8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return ['png','image/png'];
  if(/^GIF8[79]a/.test(bytes.subarray(0,6).toString()))return ['gif','image/gif'];
  if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return ['webp','image/webp'];
  if(bytes.subarray(4,8).toString()==='ftyp' && ['avif','avis'].includes(bytes.subarray(8,12).toString()))return ['avif','image/avif'];
  throw fail('A link nem támogatott képfájlt ad vissza (JPG, PNG, GIF, WebP vagy AVIF szükséges).');
}
export async function fetchPublicImage(value) {
  let url;
  try {url=new URL(String(value).trim());} catch {throw fail('Érvénytelen kép URL.');}
  const deadline=Date.now()+30000;
  for(let hop=0;hop<=5;hop++) {
    if(url.protocol!=='https:' || url.username || url.password || (url.port&&url.port!=='443') || url.href.length>2048)throw fail('Nyilvános HTTPS kép URL szükséges.');
    const remaining=deadline-Date.now();
    if(remaining<=0)throw fail('A kép letöltése túllépte a 30 másodpercet.');
    const host=url.hostname.replace(/^\[|\]$/g,'');
    // Resolve once, verify, then pin the connection to that public address.
    let timer;
    const addresses=await Promise.race([
      lookup(host,{family:4,all:true}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('A kép kiszolgálója nem érhető el időben.')),remaining);})
    ]).finally(()=>clearTimeout(timer));
    if(!addresses.length||addresses.some(row=>!isPublicImageIPv4(row.address)))throw fail('Belső vagy fenntartott hálózati címről nem vehető át kép.');
    const result=await new Promise((resolve,reject)=>{
      const req=https.get(url,{headers:{'User-Agent':'AllInFashion-ImageArchive/1.0','Accept':'image/*','Accept-Encoding':'identity'},lookup:(_host,opts,cb)=>{if(opts?.all)cb(null,[{address:addresses[0].address,family:4}]);else cb(null,addresses[0].address,4);}},res=>{
        if([301,302,303,307,308].includes(res.statusCode)) {const location=res.headers.location;res.destroy();if(!location)return reject(fail('Hibás képátirányítás.'));return resolve({redirect:location});}
        if(res.statusCode!==200){res.destroy();return reject(fail(`A képforrás HTTP ${res.statusCode} választ adott.`));}
        if(Number(res.headers['content-length']||0)>MAX_BYTES){res.destroy();return reject(fail('A kép legfeljebb 10 MB lehet.'));}
        const chunks=[];let size=0;
        res.on('data',chunk=>{size+=chunk.length;if(size>MAX_BYTES){res.destroy(fail('A kép legfeljebb 10 MB lehet.'));return;}chunks.push(chunk);});
        res.on('end',()=>resolve({bytes:Buffer.concat(chunks)}));
        res.on('error',reject);
      });
      const timeout=setTimeout(()=>req.destroy(fail('A kép letöltése túllépte a 30 másodpercet.')),Math.max(1,deadline-Date.now()));
      req.on('error',reject);req.on('close',()=>clearTimeout(timeout));
    });
    if(result.redirect){url=new URL(result.redirect,url);continue;}
    return {bytes:result.bytes,finalUrl:url.href};
  }
  throw fail('Túl sok átirányítás a képforrásnál.');
}
export async function archiveRemoteImage(source) {
  source=String(source||'').trim();
  const cfg=config();
  if(isOwnImageUrl(source))return {url:source,alreadyOwned:true};
  const {bytes,finalUrl}=await fetchPublicImage(source);
  const [ext,type]=imageFormat(bytes);
  const digest=hash(bytes);
  const key=`products/archived/${digest}.${ext}`;
  const url=cfg.base+'/'+key;
  await cfg.client.send(new PutObjectCommand({Bucket:cfg.bucket,Key:key,Body:bytes,ContentType:type,CacheControl:'public, max-age=31536000, immutable'}));
  // Keep full provenance independently of supplier URL longevity.
  await cfg.client.send(new PutObjectCommand({Bucket:cfg.bucket,Key:`products/archived/sources/${hash(source)}.json`,Body:JSON.stringify({sourceUrl:source,finalUrl,url,key,sha256:digest,bytes:bytes.length,archivedAt:new Date().toISOString()}),ContentType:'application/json'}));
  return {url,key,bytes:bytes.length,alreadyOwned:false};
}
