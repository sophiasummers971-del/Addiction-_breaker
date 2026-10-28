'use strict';
/* Optional, structured, user-entered fields. No private freewriting. */
(()=>{
 const form=document.getElementById('checkin-form');
 if(!form)return;
 const specs={
 drugs:[['activity','Substance used'],['route','Route / method'],['quantity','Quantity / occasions'],['context','Where / with whom'],['feelings','Feeling before use'],['cost','Cost (GBP)'],['consequences','Consequences'],['prescribed','Prescribed? (yes / no / unknown)']],
 gambling:[['activity','Gambling activity'],['frequency','Frequency / duration'],['stake','Money staked (GBP)'],['net','Net loss or gain (GBP, if known)'],['context','Where / with whom'],['feelings','Feeling before'],['consequences','Consequences'],['support','Support or limits used']]
 };
 const box=document.createElement('fieldset');box.id='recovery-detail-fields';
 const legend=document.createElement('legend');legend.textContent='Optional recovery details for professional reports';
 box.append(legend);
 const help=document.createElement('p');help.className='small';help.textContent='Only these structured answers can appear in recovery reports. Your private thoughts diary and free-writing notes cannot.';
 box.append(help);
 form.insertBefore(box,document.getElementById('remember').closest('label'));
 let current='';
 function show(category){
  if(current===category)return;
  current=category;box.querySelectorAll('label').forEach(n=>n.remove());
  box.hidden=!specs[category];if(!specs[category])return;
  for(const [key,title] of specs[category]){
   const label=document.createElement('label');label.textContent=title;
   const input=document.createElement('input');input.type='text';input.maxLength=180;input.dataset.recoveryKey=key;
   input.autocomplete='off';label.append(input);box.append(label);
  }
 }
 window.RecoveryFields={
  load(category,detail){show(category);for(const e of box.querySelectorAll('[data-recovery-key]'))e.value=typeof detail[e.dataset.recoveryKey]==='string'?detail[e.dataset.recoveryKey]:'';},
  collect(category){show(category);const result={};for(const e of box.querySelectorAll('[data-recovery-key]')){if(e.value.trim())result[e.dataset.recoveryKey]=e.value.trim();}return result;}
 };
 // app.js handles initial loadDate before this script loads.
 const choice=document.getElementById('active-category');
 show(choice?.value||'gambling');
 document.addEventListener('journal:changed',()=>{});
})();
