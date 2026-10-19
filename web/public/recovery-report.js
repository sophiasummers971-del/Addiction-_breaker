'use strict';
/* Strictly allowlisted recovery report projection. Never copy note, plan,
   Echoes, private freewriting, unknown properties or raw backup objects. */
(function(root){
 const TOPICS=['drugs','gambling'];
 function dateInRange(date,start,end){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&date>=start&&date<=end;}
 function week(start){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isFinite(Date.parse(start)))throw new Error('Choose a valid starting date.');
  const days=[];const d=new Date(start+'T12:00:00Z');
  for(let i=0;i<7;i++){days.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1);}return days;
 }
 function build(entries,start,topics=TOPICS){
  const days=week(start);
  if(!Array.isArray(entries)||!Array.isArray(topics)||!topics.length||topics.some(t=>!TOPICS.includes(t)))throw new Error('Choose valid recovery topics.');
  const selected=[...new Set(topics)];
  const rows=[];
  for(const date of days)for(const topic of selected){
   const matches=entries.filter(e=>e&&e.date===date&&(e.category||'gambling')===topic);
   const e=matches.length===1?matches[0]:null;
   const active=topic==='gambling'?e?.played:e?.engaged;
   rows.push({
    date,topic,
    status: !e?'NOT RECORDED':active===true?'REPORTED ACTIVITY':active===false?'REPORTED NO ACTIVITY':'INCOMPLETE',
    activity:typeof active==='boolean'?(active?'Yes':'No'):'Not recorded',
    urge:Number.isInteger(e?.urge)&&e.urge>=0&&e.urge<=10?e.urge:null,
    moneyPressure:Number.isInteger(e?.financialStress)&&e.financialStress>=0&&e.financialStress<=10?e.financialStress:null
   });
  }
  return {start:days[0],end:days[6],topics:selected,rows};
 }
 const api={week,build};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.RecoveryReport=api;
})(typeof window!=='undefined'?window:null);
