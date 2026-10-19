'use strict';
(()=> {
 const $=id=>document.getElementById(id);
 function el(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
 const area=$('check-in');if(!area||!window.RecoveryReport||!window.JournalStore)return;
 const panel=el('article');panel.className='card';panel.id='recovery-report-panel';
 const h=el('h2','Prepare a weekly recovery report');
 const explain=el('p','A self-reported summary for your review. No private diary writing, notes, Echoes or plan text is included. Missing dates mean not recorded, not abstinent.');
 const label=el('label','First day of the seven-day period '),date=el('input');date.type='date';
 const today=new Date();today.setDate(today.getDate()-((today.getDay()+6)%7));
 date.value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');date.max=window.JournalStore.today();label.append(date);
 const topics=el('div');const boxes=[];
 for(const [key,name] of [['drugs','Drugs'],['gambling','Gambling']]){
  const l=el('label'),cb=el('input');cb.type='checkbox';cb.checked=true;cb.value=key;
  l.append(cb,document.createTextNode(' '+name+' '));topics.append(l);boxes.push(cb);
 }
 const preview=el('div');preview.setAttribute('aria-live','polite');
 const review=el('button','Review report');review.type='button';review.className='secondary';
 const print=el('button','Print report');print.type='button';print.className='primary';print.disabled=true;
 const download=el('button','Download PDF');download.type='button';download.className='primary';download.disabled=true;
 let valid=null;
 function makeTable(report){
  const table=el('table'),head=el('tr');
  for(const text of ['Date','Area','Status','Activity','Urge /10','Money pressure /10','Structured detail'])head.append(el('th',text));
  const thead=el('thead');thead.append(head);table.append(thead);
  const tbody=el('tbody');
  for(const r of report.rows){const tr=el('tr');for(const v of [r.date,r.topic,r.status,r.activity,r.urge??'Not recorded',r.moneyPressure??'Not recorded',Object.entries(r.recovery||{}).map(([k,v])=>k+': '+v).join('; ')||'Not supplied'])tr.append(el('td',String(v)));tbody.append(tr);}table.append(tbody);
  return table;
 }
 function generate(){
  valid=null;print.disabled=true;download.disabled=true;preview.replaceChildren();
  try{
   const selected=boxes.filter(c=>c.checked).map(c=>c.value);
   const state=window.AddictionApp?.getState?.();
   if(!state)throw new Error('Your current journal is not available.');
   const report=window.RecoveryReport.build(state.entries,date.value,selected);
   const scroll=el('div');scroll.className='report-preview-scroll';scroll.append(makeTable(report));
   preview.append(el('h3','Preview: '+report.start+' to '+report.end),el('p','The downloadable PDF contains a professional overview plus separate Drugs and Gambling pages. Only separately entered structured recovery details are included. Older private notes remain excluded.'),scroll);
   valid=report;print.disabled=false;download.disabled=false;
  }catch(e){preview.append(el('p','Unable to prepare report: '+e.message));}
 }
 review.addEventListener('click',generate);
 const reset=()=>{valid=null;print.disabled=true;download.disabled=true;preview.replaceChildren(el('p','Your selection changed. Review again before sharing.'));};
 date.addEventListener('change',reset);boxes.forEach(c=>c.addEventListener('change',reset));
 print.addEventListener('click',()=>{
  if(!valid)return;
  const sheet=el('section');sheet.id='recovery-print';sheet.append(el('h1','Addiction Breaker | Weekly Recovery Record'),
   el('p',valid.start+' to '+valid.end),
   el('p','Patient-generated, self-reported summary. Not independently verified. Missing records do not establish abstinence.'),
   makeTable(valid),
   el('p','Prepared for voluntary sharing. Only structured fields are included. Private diary entries, notes, Echoes and the personal plan are excluded.'));
  document.body.append(sheet);
  const cleanup=()=>{sheet.remove();window.removeEventListener('afterprint',cleanup);};
  window.addEventListener('afterprint',cleanup,{once:true});
  window.print();
 });
 download.addEventListener('click',()=>{if(!valid)return;let pdf;try{pdf=window.RecoveryPDF?.generate(valid);}catch(e){preview.append(el('p','PDF preparation failed: '+e.message));return;}if(!pdf){preview.append(el('p','PDF generation unavailable.'));return;}const blob=new Blob([pdf],{type:'application/pdf'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='addiction-breaker-weekly-'+valid.start+'.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);});
 panel.append(h,explain,label,topics,review,document.createTextNode(' '),download,document.createTextNode(' '),print,preview);
 area.querySelector('.reading-width')?.append(panel);
})();
