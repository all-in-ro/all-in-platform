import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
try {
 await client.query('BEGIN READ ONLY');
 await client.query("SET LOCAL statement_timeout='20s'");
 console.log('Számozási beállítások');
 console.table((await client.query('SELECT series,next_number,sequence_year,yearly_reset,include_year,digits FROM aif_reception_document_settings WHERE id=1')).rows);
 console.log('Legutóbbi sorszámok és dátumok');
 console.table((await client.query(`SELECT aviz_number,reception_date::text,invoice_number,status,
 aviz_sequence_number,aviz_sequence_year FROM aif_receptions WHERE aviz_number IS NOT NULL
 ORDER BY created_at DESC,id DESC LIMIT 20`)).rows);
 const settings=(await client.query('SELECT * FROM aif_reception_document_settings WHERE id=1')).rows[0];
 if(settings){
   let n=Number(settings.next_number), year=Number(settings.sequence_year);
   let preview;
   for(let attempt=0;attempt<100000;attempt++,n++){
     const parts=[settings.series];
     if(settings.include_year!==false)parts.push(String(year));
     parts.push(String(n).padStart(Number(settings.digits)||5,'0'));
     const candidate=parts.join('/');
     const occupied=await client.query(`SELECT 1 FROM aif_receptions
       WHERE aviz_number=$1 OR (aviz_series=$2 AND aviz_sequence_number=$3
       AND ($4::boolean=false OR aviz_sequence_year=$5)) LIMIT 1`,
       [candidate,settings.series,n,settings.include_year!==false,year]);
     if(!occupied.rowCount){preview=candidate;break;}
   }
   const bounds=await client.query(`SELECT MAX(reception_date)::text AS earliest
     FROM aif_receptions WHERE aviz_series=$1 AND aviz_number IS NOT NULL`,[settings.series]);
   console.log('Új, most létrehozandó receptió – csak előnézet:');
   console.table([{kovetkezo_szam:preview,legkorabbi_datum:bounds.rows[0]?.earliest||null}]);
 }
 await client.query('ROLLBACK');
} catch(e) {await client.query('ROLLBACK').catch(()=>{});console.error(e.message);process.exitCode=1;}
finally {client.release();await pool.end();}
