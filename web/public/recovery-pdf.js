'use strict';
/* Fixed three-page patient-generated recovery report. Only explicitly
   projected structured fields are used. No notes, Echoes, diary, or plan. */
(function(root){
const enc=new TextEncoder();
const clean=x=>String(x??'').replace(/[^\x20-\x7e]/g,'?').replace(/[\\()]/g,m=>'\\'+m);
function page(){
 const lines=[];
 const t=(x,y,s,v,bold=false)=>lines.push('BT /'+(bold?'B':'R')+' '+s+' Tf '+x+' '+y+' Td ('+clean(v)+') Tj ET');
 const line=(x1,y1,x2,y2)=>lines.push('0.82 0.85 0.86 RG 0.6 w '+x1+' '+y1+' m '+x2+' '+y2+' l S');
 const fill=(x,y,w,h)=>lines.push('0.94 0.96 0.97 rg '+x+' '+y+' '+w+' '+h+' re f 0 0 0 rg');
 return {lines,t,line,fill};
}
function header(p,title,index,period){
 p.fill(0,805,595,37);p.t(43,817,12,'ADDICTION BREAKER',true);
 p.t(43,778,20,title,true);
 p.t(43,753,10,'Reporting period: '+period);
 p.line(43,742,552,742);
 p.line(43,55,552,55);
 p.t(43,39,8,'PRIVATE RECOVERY INFORMATION - SHARE ONLY WITH CONSENT');
 p.t(522,39,8,index+'/3');
}
function summary(p,report){
 header(p,'Weekly recovery report',1,report.start+' to '+report.end);
 p.t(43,717,10,'Patient-generated self-report. Not a clinical or legal verification.');
 p.t(43,696,10,'Missing entries mean NOT RECORDED, never presumed abstinent.');
 p.fill(43,638,509,33);p.t(54,650,12,'WEEKLY OVERVIEW',true);
 let y=605;
 for(const category of ['drugs','gambling']){
  const rows=report.rows.filter(r=>r.topic===category);
  const total=rows.length===0?7:rows.filter(r=>r.status==='NOT RECORDED').length;
  const active=rows.filter(r=>r.status==='REPORTED ACTIVITY').length;
  const none=rows.filter(r=>r.status==='REPORTED NO ACTIVITY').length;
  p.t(53,y,13,category==='drugs'?'DRUG USE':'GAMBLING',true);
  p.t(53,y-22,10,'Recorded activity: '+active+' day(s)   Confirmed no activity: '+none+' day(s)');
  p.t(53,y-40,10,'Unrecorded: '+total+' day(s)');
  p.line(43,y-57,552,y-57);y-=107;
 }
 p.fill(43,305,509,30);p.t(54,316,12,'HOW TO READ THIS REPORT',true);
 p.t(43,279,10,'NOT RECORDED: no entry submitted for that day.');
 p.t(43,257,10,'REPORTED NO ACTIVITY: the person actively recorded no use.');
 p.t(43,235,10,'REPORTED ACTIVITY: the person recorded activity for that day.');
 p.fill(43,161,509,34);p.t(54,174,12,'PRIVACY AND SHARING',true);
 p.t(43,141,9,'Private thoughts, free-writing, notes, Echoes and plans are excluded.');
 p.t(43,125,9,'Review and approve the recipient before sharing any copy.');
 p.t(43,106,9,'Not an official Open Road, NHS, prison or probation form.');
}
function detail(p,report,topic,index){
 const name=topic==='drugs'?'Drugs':'Gambling';
 header(p,name+' | Daily records',index,report.start+' to '+report.end);
 p.t(43,715,10,'Entries are self-reported. Unknown information is not interpreted as zero.');
 const rows=report.rows.filter(r=>r.topic===topic);
 p.fill(43,670,509,25);
 p.t(52,680,10,'DATE',true);p.t(140,680,10,'STATUS',true);p.t(343,680,10,'URGE',true);p.t(427,680,10,'MONEY PRESSURE',true);
 let y=650;
 const start=new Date(report.start+'T12:00:00Z');
 for(let i=0;i<7;i++){
  let dt=new Date(start);dt.setUTCDate(dt.getUTCDate()+i);
  const date=dt.toISOString().slice(0,10);
  const r=rows.find(x=>x.date===date);
  p.t(52,y,9,date);
  p.t(140,y,9,r?.status||'NOT RECORDED');
  p.t(353,y,9,r?.urge===null||r?.urge===undefined?'-':r.urge+'/10');
  p.t(443,y,9,r?.moneyPressure===null||r?.moneyPressure===undefined?'-':r.moneyPressure+'/10');
  p.line(43,y-11,552,y-11);y-=45;
 }
 p.fill(43,274,509,31);p.t(53,285,12,topic==='drugs'?'OPEN ROAD-STYLE FIELDS':'GAMBLING RECOVERY FIELDS',true);
 if(topic==='drugs'){
  p.t(43,251,9,'Substance | route/method | amount | where/with whom | cost');
  p.t(43,234,9,'Consequences | prescribed yes/no | feelings before use');
 }else{
  p.t(43,251,9,'Activity | frequency | amount staked | net loss/gain | context');
  p.t(43,234,9,'Consequences | support used | feelings before gambling');
 }
 p.t(43,205,9,'These additional details are not yet collected as structured data.');
 p.t(43,188,9,'They are intentionally left unavailable rather than invented.');
 p.t(43,144,10,'Participant review:  [ ] Reviewed   [ ] Corrections needed   [ ] Approved to share');
 p.t(43,117,9,'This is a personal recovery record, not proof of attendance or compliance.');
}
function generate(report){
 if(!report||!/^\d{4}-\d{2}-\d{2}$/.test(report.start)||!/^\d{4}-\d{2}-\d{2}$/.test(report.end)||!Array.isArray(report.rows)||report.rows.length>28)throw Error('Invalid report');
 const pages=[page(),page(),page()];
 summary(pages[0],report);
 detail(pages[1],report,'drugs',2);detail(pages[2],report,'gambling',3);
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 6 0 R 8 0 R] /Count 3 >>'];
 const pids=[[3,5],[6,7],[8,9]];
 for(let i=0;i<3;i++){
  const [pid,cid]=pids[i],stream=pages[i].lines.join('\n')+'\n';
  while(objects.length<pid-1)objects.push('');
  objects[pid-1]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /R 4 0 R /B 10 0 R >> >> /Contents '+cid+' 0 R >>';
  objects[cid-1]='<< /Length '+enc.encode(stream).length+' >>\nstream\n'+stream+'endstream';
 }
 objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
 objects[9]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
 let out='%PDF-1.4\n',offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(enc.encode(out).length);out+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
 const start=enc.encode(out).length;
 out+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
 for(let i=1;i<offsets.length;i++)out+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 out+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n';
 return enc.encode(out);
}
const api={generate};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RecoveryPDF=api;
})(typeof window!=='undefined'?window:null);
