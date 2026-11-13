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
 ORDER BY aviz_sequence_year DESC NULLS LAST,aviz_sequence_number DESC NULLS LAST LIMIT 20`)).rows);
 await client.query('ROLLBACK');
} catch(e) {await client.query('ROLLBACK').catch(()=>{});console.error(e.message);process.exitCode=1;}
finally {client.release();await pool.end();}
