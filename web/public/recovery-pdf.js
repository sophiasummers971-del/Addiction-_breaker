'use strict';
/* Small self-contained PDF writer for a fixed, allowlisted weekly report.
 * No external service, personal notes, Echoes, diary or arbitrary JSON. */
(function(root){
function generate(report){
 if(!report||!Array.isArray(report.rows)||report.rows.length>28)throw Error('Invalid report');
 const line=[];
 const safe=s=>String(s??'').replace(/[^\x20-\x7e]/g,'?').replace(/[\\()]/g,m=>'\\'+m);
 function text(x,y,size,value){line.push('BT /F1 '+size+' Tf '+x+' '+y+' Td ('+safe(value)+') Tj ET');}
 text(43,798,18,'ADDICTION BREAKER');
 text(43,775,12,'WEEKLY RECOVERY RECORD');
 text(43,748,10,'Reporting period: '+report.start+' to '+report.end);
 text(43,729,9,'Patient-generated self-report. Not independently or clinically verified.');
 text(43,715,9,'Missing entries do not indicate abstinence. Sharing is voluntary.');
 text(43,692,9,'DATE            AREA          STATUS                    ACTIVITY   URGE    MONEY PRESSURE');
 let y=676;
 for(const row of report.rows){
  const date=String(row.date).slice(0,10).padEnd(13);
  const topic=String(row.topic).slice(0,9).padEnd(13);
  const status=String(row.status).slice(0,18).padEnd(24);
  const act=String(row.activity).slice(0,7).padEnd(10);
  text(43,y,8,date+topic+status+act+String(row.urge??'-').padEnd(9)+String(row.moneyPressure??'-'));y-=20;
 }
 text(43,y-17,9,'Only structured recovery fields are included.');
 text(43,y-31,9,'Private thoughts, notes, Echoes and personal plans are excluded.');
 text(43,y-51,9,'Not proof of treatment attendance, abstinence, or legal compliance.');
 const content=line.join('\n')+'\n';
 const objects=[
 '<< /Type /Catalog /Pages 2 0 R >>',
 '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
 '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
 '<< /Length '+new TextEncoder().encode(content).length+' >>\nstream\n'+content+'endstream'];
 let out='%PDF-1.4\n',offsets=[0],enc=new TextEncoder();
 for(let i=0;i<objects.length;i++){offsets.push(enc.encode(out).length);out+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
 const xref=enc.encode(out).length;
 out+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
 for(let i=1;i<offsets.length;i++)out+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 out+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return enc.encode(out);
}
const api={generate};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RecoveryPDF=api;
})(typeof window!=='undefined'?window:null);
