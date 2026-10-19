'use strict';
/* A separate personal writing space. Never enters JournalStore state,
 * account sync, recovery report projection or ordinary journal backups.
 * Local device saving is opt-in and unencrypted, plainly disclosed. */
(()=>{
 const mount=document.getElementById('private-diary-root');
 if(!mount||!window.JournalStore)return;
 const $=id=>document.getElementById(id);
 const key=()=>window.JournalStore.KEY+':private-diary:v1';
 let sessionText='',saved=false,visible=false;
 function read(){saved=false;sessionText='';visible=false;
  try{const raw=localStorage.getItem(key());if(raw!==null){sessionText=raw;saved=true;}}catch{}
  draw();
 }
 function draw(){
  $('private-diary-text').value=sessionText;
  $('private-diary-text').type='text';
  $('private-diary-text').style.webkitTextSecurity=visible?'none':'disc';
  $('private-diary-text').setAttribute('aria-label','Personal thoughts, '+(visible?'visible':'concealed'));
  $('private-diary-toggle').textContent=visible?'Hide writing':'Reveal writing';
  $('private-diary-remember').checked=saved;
 }
 const container=document.createElement('article');container.className='card';container.id='private-diary-card';
 const title=document.createElement('h2');title.textContent='A space for your own thoughts';
 const p=document.createElement('p');p.textContent='This is not a treatment record. Private writing never enters recovery PDFs, ordinary journal backups or cloud sync. Device saving is optional and unencrypted.';
 const label=document.createElement('label');label.textContent='Write whatever you need to put down';
 const field=document.createElement('textarea');field.id='private-diary-text';field.rows=6;field.maxLength=20000;field.autocomplete='off';field.spellcheck=false;
 label.append(field);
 const hide=document.createElement('button');hide.id='private-diary-toggle';hide.type='button';hide.className='secondary';
 const rememberLabel=document.createElement('label');rememberLabel.className='inline';
 const remember=document.createElement('input');remember.type='checkbox';remember.id='private-diary-remember';
 rememberLabel.append(remember,document.createTextNode(' Remember this writing on this device (unencrypted)'));
 const save=document.createElement('button');save.type='button';save.className='primary';save.textContent='Keep these words';save.id='private-diary-save';
 const clear=document.createElement('button');clear.type='button';clear.className='secondary';clear.textContent='Clear this space';
 const status=document.createElement('p');status.id='private-diary-status';status.setAttribute('role','status');
 container.append(title,p,label,hide,rememberLabel,save,clear,status);
 mount.append(container);
 field.addEventListener('input',()=>{sessionText=field.value;});
 hide.addEventListener('click',()=>{visible=!visible;draw();field.focus();});
 save.addEventListener('click',()=>{
  sessionText=field.value;
  try{
   if(remember.checked){localStorage.setItem(key(),sessionText);saved=true;status.textContent='Saved on this browser, unencrypted. Anyone using this browser profile may access it.';}
   else{localStorage.removeItem(key());saved=false;status.textContent='Kept for this page session only. It will be lost after refresh.';}
  }catch{status.textContent='Device saving failed. Your words are in this page only. Copy them elsewhere if needed.';}
 });
 clear.addEventListener('click',()=>{
  if(!confirm('Clear this private writing on this device? This cannot be undone.'))return;
  try{localStorage.removeItem(key());}catch{}
  sessionText='';visible=false;saved=false;draw();status.textContent='Private writing cleared from this space.';
 });
 function conceal(){visible=false;field.style.webkitTextSecurity='disc';hide.textContent='Reveal writing';}
 window.addEventListener('pagehide',conceal);document.addEventListener('visibilitychange',()=>{if(document.hidden)conceal();});
 document.addEventListener('journal:context',read);
 document.addEventListener('journal:erased',()=>{try{localStorage.removeItem(key());}catch{}read();});
 read();
})();
