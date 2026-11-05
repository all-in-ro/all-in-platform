// AllInFashion ajandekutalvany - nyomtathato, tobboldalas PDF kimutatas.
// A mar hasznalt pdfkit csomagot hasznalja; nem ir adatbazisba.
import PDFDocument from 'pdfkit';
import fs from 'node:fs';

const regularCandidates=[
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
];
const boldCandidates=[
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
];
const findFont=(candidates,fallback)=>candidates.find(file=>fs.existsSync(file)) || fallback;
const number=(v)=>Number.isFinite(Number(v))?Number(v):0;
const ron=(v)=>`${number(v).toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2})} RON`;
const ink='#273447', muted='#617184', teal='#108D8B', line='#D7DEE6';

export function buildVoucherPdf({title,description='',columns,rows,summary=[]}) {
  if (!Array.isArray(columns)||!columns.length||!Array.isArray(rows)) throw new Error('Hibas PDF export adatok.');
  const doc=new PDFDocument({size:'A4',layout:'landscape',margin:0,bufferPages:true,autoFirstPage:true,compress:true});
  const pieces=[];
  const done=new Promise((resolve,reject)=>{
    doc.on('data',chunk=>pieces.push(chunk));
    doc.on('error',reject);
    doc.on('end',()=>resolve(Buffer.concat(pieces)));
  });
  const font=findFont(regularCandidates,'Helvetica');
  const bold=findFont(boldCandidates,'Helvetica-Bold');
  const W=doc.page.width,H=doc.page.height;
  const margin=30,tableW=W-2*margin;
  const rowH=25;
  const widthTotal=columns.reduce((sum,c)=>sum+Number(c.weight||1),0);
  const widths=columns.map(c=>tableW*Number(c.weight||1)/widthTotal);
  const stop=H-46;
  const truncate=(value,width,maxSize=8.1)=>{
    let out=String(value??'').replace(/[\r\n\t]+/g,' ').trim();
    if (!out) return '–';
    const maxWidth=Math.max(10,width-12);
    doc.font(font).fontSize(maxSize);
    if(doc.widthOfString(out)<=maxWidth)return out;
    while(out.length>2&&doc.widthOfString(out+'…')>maxWidth)out=out.slice(0,-1);
    return out+'…';
  };
  function labelText(value,x,y,width,options={}) {
    const size=options.size||8;
    doc.font(options.bold?bold:font).fontSize(size)
      .fillColor(options.color||ink)
      .text(String(value??''),x,y,{width,align:options.align||'left',lineBreak:false});
  }
  function pageHeader(first){
    doc.rect(0,0,W,6).fill(teal);
    labelText('ALLINFASHION  /  AJÁNDÉKUTALVÁNY',margin,23,tableW,{size:8.1,color:teal,bold:true});
    labelText(title,margin,43,tableW,{size:18,bold:true});
    labelText(description,margin,75,tableW,{size:8.2,color:muted});
    let nextY=102;
    if(first&&summary.length){
      const metrics=summary.slice(0,4);
      const gap=9;const boxW=(tableW-gap*(metrics.length-1))/metrics.length;
      for(const [i,metric] of metrics.entries()){
        const x=margin+i*(boxW+gap);
        doc.roundedRect(x,nextY,boxW,49,7).fill('#EFF8F7');
        labelText(metric.label,x+10,nextY+7,boxW-20,{size:7,color:muted});
        labelText(metric.money?ron(metric.value):String(metric.value??''),x+10,nextY+23,boxW-20,{size:12,bold:true,color:teal});
      }
      nextY+=63;
    }
    const tableTop=nextY+8;
    doc.roundedRect(margin,tableTop,tableW,27,4).fill('#354153');
    let x=margin;
    columns.forEach((column,i)=>{
      labelText(column.label,x+5,tableTop+8,widths[i]-10,{size:7.6,bold:true,color:'#FFFFFF',align:column.align||'left'});
      x+=widths[i];
    });
    return tableTop+27;
  }
  let y=pageHeader(true);
  if(!rows.length){
    labelText('Nincs találat a kiválasztott feltételekkel.',margin+6,y+21,tableW-12,{size:10,color:muted});
  }
  for(const [i,row] of rows.entries()){
    if(y+rowH>stop){doc.addPage();y=pageHeader(false);}
    if(i%2===0)doc.rect(margin,y,tableW,rowH).fill('#F4F7F9');
    let x=margin;
    columns.forEach((c,j)=>{
      const text=truncate(row[j],widths[j],c.size||8);
      labelText(text,x+5,y+8,widths[j]-10,{size:c.size||8,align:c.align||'left',color:c.money?teal:ink});
      x+=widths[j];
    });
    doc.moveTo(margin,y+rowH).lineTo(margin+tableW,y+rowH).lineWidth(.3).strokeColor(line).stroke();
    y+=rowH;
  }
  const range=doc.bufferedPageRange();
  for(let page=range.start;page<range.start+range.count;page++){
    doc.switchToPage(page);
    doc.moveTo(margin,H-34).lineTo(W-margin,H-34).lineWidth(.5).strokeColor(line).stroke();
    labelText('AllInFashion · belső nyilvántartási export',margin,H-27,tableW/2,{size:7,color:muted});
    labelText(`${page-range.start+1} / ${range.count}`,W-margin-70,H-27,70,{size:7,color:muted,align:'right'});
  }
  doc.end();
  return done;
}
