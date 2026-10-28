'use strict';
/* The private writing space never enters JournalStore or account sync. */
(()=>{
 const mount=document.getElementById('private-diary-root'),vault=window.PrivateDiaryCrypto;
 if(!mount||!window.JournalStore||!vault)return;
 const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const legacyKey=()=>window.JournalStore.KEY+':private-diary:v1';
 const encryptedKey=()=>window.JournalStore.KEY+':private-diary:encrypted:v1';
 let currentScope=encryptedKey(),text='',visible=false,remembered=false,dirty=false,locked=false,epoch=0;
 const card=make('article');card.className='card';card.id='private-diary-card';
 const title=make('h2','A space for your own thoughts');
 const hint=make('p','Private writing stays out of recovery PDFs and cloud sync. Saved writing is encrypted on this device, with no extra password. Clearing browser data or moving devices may make it unrecoverable.');
 const label=make('label','Write whatever you need to put down');
 const field=make('textarea');field.id='private-diary-text';field.rows=6;field.maxLength=20000;field.autocomplete='off';field.spellcheck=false;label.append(field);
 const toggle=make('button','Reveal writing');toggle.type='button';toggle.id='private-diary-toggle';toggle.className='secondary';
 const checkLabel=make('label');checkLabel.className='inline';
 const check=make('input');check.type='checkbox';check.id='private-diary-remember';
 checkLabel.append(check,document.createTextNode(' Save encrypted on this device'));
 const save=make('button','Keep these words');save.type='button';save.className='primary';save.id='private-diary-save';
 const clear=make('button','Clear this space');clear.type='button';clear.className='secondary';
 const status=make('p');status.id='private-diary-status';status.setAttribute('role','status');
 card.append(title,hint,label,toggle,checkLabel,save,clear,status);mount.append(card);
 const scopeStill=(token,scope)=>token===epoch&&scope===currentScope;
 function paint(){
  field.value=text;
  field.style.color=visible?'':'transparent';
  field.style.caretColor=visible?'':'transparent';
  field.style.textShadow=visible?'':'0 0 9px currentColor';
  toggle.textContent=visible?'Hide writing':'Reveal writing';
  toggle.setAttribute('aria-pressed',String(visible));
  check.checked=remembered;
  field.disabled=locked;save.disabled=locked;clear.disabled=locked;check.disabled=locked;
 }
 async function load(){
  const token=++epoch,scope=currentScope=encryptedKey();
  text='';visible=false;remembered=false;dirty=false;locked=true;status.textContent='Opening private writing on this device...';paint();
  let encrypted=null,legacy=null;
  try{encrypted=localStorage.getItem(scope);legacy=localStorage.getItem(legacyKey());}
  catch{if(scopeStill(token,scope)){locked=false;status.textContent='Device storage unavailable. Session-only writing is possible.';paint();}return;}
  try{
   if(encrypted!==null){const plain=await vault.open(encrypted,scope);
    if(scopeStill(token,scope)){text=plain;remembered=true;status.textContent='Encrypted writing loaded on this device.';}
   }else if(legacy!==null){
    // Verify a complete encrypted round-trip before removing old plaintext.
    const sealed=await vault.seal(legacy,scope);
    const verified=await vault.open(sealed,scope);
    if(verified!==legacy)throw new Error('Migration verification failed');
    if(!scopeStill(token,scope))return;
    localStorage.setItem(scope,sealed);
    if(localStorage.getItem(scope)!==sealed)throw new Error('Encrypted save failed');
    localStorage.removeItem(legacyKey());
    text=legacy;remembered=true;status.textContent='Existing writing converted to encrypted device storage.';
   }else if(scopeStill(token,scope))status.textContent='This space is yours. Nothing is sent.';
  }catch{
   if(scopeStill(token,scope)){
    status.textContent=encrypted!==null?'Encrypted writing could not be opened. Original saved data was preserved.':'Existing writing could not be encrypted. Original saved data was preserved. Please do not clear browser data.';
    // Do not permit saving over an unreadable encrypted copy or failed migration.
    locked=true;paint();return;
   }
  }
  if(scopeStill(token,scope)){locked=false;paint();}
 }
 field.addEventListener('input',()=>{text=field.value;dirty=true;if(!visible){visible=true;paint();}});
 toggle.addEventListener('click',()=>{visible=!visible;paint();if(visible)field.focus();});
 save.addEventListener('click',async()=>{
  if(locked)return;
  const token=epoch,scope=currentScope,value=field.value,shouldRemember=check.checked;
  locked=true;paint();status.textContent='Saving...';
  try{
   if(shouldRemember){
    const sealed=await vault.seal(value,scope);
    if(!scopeStill(token,scope))return;
    localStorage.setItem(scope,sealed);
    if(localStorage.getItem(scope)!==sealed)throw Error('Save verification failed');
    // A migrated legacy value, if present, is only cleared after success.
    localStorage.removeItem(legacyKey());
    remembered=true;status.textContent='Saved encrypted on this device.';
   }else{
    if(!scopeStill(token,scope))return;
    localStorage.removeItem(scope);localStorage.removeItem(legacyKey());
    remembered=false;status.textContent='Kept in this page only. Refreshing will clear it.';
   }
   text=value;dirty=false;
  }catch{if(scopeStill(token,scope))status.textContent='Could not save. Previously saved writing was not overwritten.';}
  finally{if(scopeStill(token,scope)){locked=false;paint();}}
 });
 clear.addEventListener('click',()=>{
  if(locked||!confirm('Delete the writing saved in this space on this device? This cannot be undone.'))return;
  try{localStorage.removeItem(currentScope);localStorage.removeItem(legacyKey());}
  catch{status.textContent='Could not delete saved writing. Please try again.';return;}
  text='';visible=false;remembered=false;dirty=false;status.textContent='Private writing cleared.';paint();
 });
 function conceal(){visible=false;paint();}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)conceal();});
 window.addEventListener('pagehide',conceal);
 document.addEventListener('journal:context',load);
 document.addEventListener('journal:erased',()=>{try{localStorage.removeItem(currentScope);localStorage.removeItem(legacyKey());}catch{}load();});
 load();
})();
