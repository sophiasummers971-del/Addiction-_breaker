'use strict';
(()=>{
 const app=window.AddictionApp;if(!app)return;
 const panel=document.getElementById('account-panel'),banner=document.getElementById('sync-status');
 let session=null,configured=false,enabled=false,revision=0,pending=false,conflict=null,busy=false,unavailable=false,epoch=0,changes=0,reconciled=false,timer;
 const snapshot=()=>{const s=app.getState();return {version:2,entries:s.entries,plan:s.plan,profile:s.profile};};
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const nonempty=d=>d.entries.length>0||d.plan.length>0||(d.profile?.categories?.length||0)>0;
 function normalized(data){if(!window.JournalStore)return data;const d=window.JournalStore.validate(data);return {version:d.version,entries:d.entries,plan:d.plan,profile:d.profile};}
 function applyOnboarding(){if(!session||app.getState().profile?.categories?.length)return;try{const raw=sessionStorage.getItem('addiction-breaker:onboarding-profile');if(!raw)return;if(app.setProfile(JSON.parse(raw))===false)return;sessionStorage.removeItem('addiction-breaker:onboarding-profile');}catch{status('Please choose your support journeys again.');}}
 const key=()=> 'addiction-breaker:sync:'+session.user.id;
 function metadata(){try{localStorage.setItem(key(),JSON.stringify({enabled,revision,pending:pending&&app.getState().remember}));}catch{}}
 function status(message){banner.textContent=message;}
 function node(tag,text,parent=panel){const el=document.createElement(tag);if(text)el.textContent=text;parent.append(el);return el;}
 function button(text,handler,parent=panel){const b=node('button',text,parent);b.className='secondary';b.type='button';b.disabled=busy;b.addEventListener('click',handler);return b;}
 async function request(path,options={}){
  const headers={'Content-Type':'application/json',...options.headers};
  if(options.method&&options.method!=='GET'&&session)headers['X-CSRF-Token']=session.csrfToken;
  const response=await fetch('/api/'+path,{...options,headers,credentials:'same-origin',cache:'no-store'});
  const data=await response.json();
  if(!response.ok){const error=new Error(response.status===401?'Your session expired. Sign in again before syncing.':({forbidden:'Account security check failed. Reload and sign in again.',rate_limited:'Too many requests. Wait ten minutes before retrying.',client_upgrade_required:'Reload the app to use the updated journal format.',invalid_snapshot:'Cloud storage rejected this journal. Export a backup and check its size and entries.',unavailable:'Cloud storage is unavailable. Your current journal remains here.'}[data.error]||'Cloud request failed. Your current journal remains here.'));error.status=response.status;error.data=data;throw error;}
  return data;
 }
 function draw(){
  panel.replaceChildren();
  if(!session){node('h2','Keep your progress your way');node('p',unavailable?'Account service could not be reached. Guest tools still work.':configured?'Google sign-in is optional. Your existing guest journal stays on this browser until you explicitly import it.':'Accounts are not configured on this installation yet. Guest check-ins, backups and support are available.');
   if(configured){const a=node('a','Continue with Google');a.href='/api/auth/google/start';a.className='button primary';node('p','If you use an app wrapper, open this site in your normal browser to sign in.');}
   button('Check account connection again',init);return;
  }
  node('h2','Signed in as '+session.user.name);node('p',session.user.email);const home=node('a','Open my dashboard →');home.href='/dashboard/';home.className='text-link';
  node('p',enabled?'Cloud sync is enabled for this account.':'Cloud sync is off. Enable it only if you want your journal, support choices and plan stored on our server.');
  node('p','Cloud journal limit: 1 MB. Device backups can be larger. Raw gambling-history exports stay on your device.');
  if(conflict){const box=node('div');box.className='inset';node('h3','Two different versions need your choice',box);node('p','Another device may have changed your cloud journal. Nothing has been overwritten. Export your device journal from Support before replacing it if you want to keep both.',box);
   button('Use cloud version',()=>resolve(false),box);button('Keep this device version',()=>resolve(true),box);
  }else if(!enabled){button('Enable cloud sync',enable);}else{button(pending?'Retry pending sync':'Check cloud now',()=>reconcile());button('Turn off cloud sync',()=>{enabled=false;reconciled=false;epoch++;clearTimeout(timer);metadata();status('Cloud sync is off. Existing cloud records remain in your account.');draw();});}
  const guest=app.guestData();if(guest.entries.length||guest.plan)button('Import guest journal into this account',()=>{
   if(!confirm('Replace this account’s current journal and plan with the guest journal? Your original guest copy stays on this device. If sync is enabled, this also updates the cloud copy.'))return;
   try{app.replaceState({...guest,remember:app.getState().remember});markChanged();}catch(error){status(error.message);}
  });
  const a=node('a','Download cloud backup');a.href='/api/export';a.className='text-link';
  button('Sign out and clear this account from this browser',()=>endAccount(false));
  node('h3','Delete application account');node('p','This deletes your application account and cloud journal. It does not delete your Google account or downloaded backups.');
  const label=node('label','Type DELETE to confirm');const input=node('input',null,label);input.id='delete-account-confirmation';input.autocomplete='off';
  button('Delete account and cloud journal',()=>{if(input.value!=='DELETE'){status('Type DELETE exactly to confirm account deletion.');return;}endAccount(true);});
 }
 function pendingStatus(){status(enabled?(pending?(app.getState().remember?'Changes waiting to sync. Saved on this browser.':'Changes waiting to sync in this page only. Keep it open or export a backup.'):'Account journal is up to date.'):'Cloud sync is off.');}
 async function init(){
  const generation=++epoch;clearTimeout(timer);busy=true;
  try{const next=await request('session');if(generation!==epoch)return;configured=next.configured;unavailable=false;
   if(session?.user.id!==next.user?.id){if(session)app.clearContext();app.switchContext(next.user?.id||null);}
   session=next.user?next:null;reconciled=false;enabled=false;pending=false;revision=0;conflict=null;
   if(session){try{const m=JSON.parse(localStorage.getItem(key())||'{}');enabled=m.enabled===true;revision=Number.isSafeInteger(m.revision)?m.revision:0;pending=m.pending===true;}catch{} }
   busy=false;draw();if(session&&enabled)await reconcile();else {applyOnboarding();status(session?'Signed in. Cloud sync is off.':'Guest mode · your journal stays here.');}
  }catch{if(generation!==epoch)return;unavailable=true;busy=false;status('Account connection unavailable. Your current journal remains here.');draw();}
 }
 async function enable(){
  if(!confirm('Enable cloud storage for this account’s journal, support choices and plan? Your notes will be accessible to this service. Guest notes are not included unless you import them.'))return;
  enabled=true;reconciled=false;metadata();await reconcile();
 }
 async function reconcile(){
  if(!session||!enabled||busy)return;const generation=epoch;reconciled=false;busy=true;draw();
  try{const remote=await request('snapshot');if(generation!==epoch)return;
   remote.data=normalized(remote.data);const local=snapshot();
   if(equal(local,remote.data)){revision=remote.revision;pending=false;conflict=null;}
   else if(!nonempty(local)&&!pending){app.replaceState({...remote.data,remember:app.getState().remember});revision=remote.revision;pending=false;}
   else if(remote.revision===revision&&(pending||remote.revision===0)){pending=true;}
   else {conflict=remote;status('Sync paused: choose which journal to keep on your account page.');}
   reconciled=true;metadata();busy=false;if(!conflict)applyOnboarding();draw();if(!conflict&&pending)await flush();else if(!conflict)pendingStatus();
  }catch(error){if(generation!==epoch)return;busy=false;status(error.message);draw();}
 }
 function markChanged(){changes++;if(!session)return;pending=true;metadata();pendingStatus();if(enabled&&!conflict){clearTimeout(timer);timer=setTimeout(flush,650);}}
 async function flush(){
  if(!session||!enabled||busy||conflict||!pending)return;
  if(!reconciled){await reconcile();return;}
  const generation=epoch,sequence=changes,body={baseRevision:revision,data:snapshot()};
  if(new Blob([JSON.stringify(body.data)]).size>1024*1024){status('Cloud sync paused: journal exceeds 1 MB. Export a backup before removing older entries.');return;}
  busy=true;draw();
  try{const remote=await request('snapshot',{method:'PUT',body:JSON.stringify(body)});if(generation!==epoch)return;revision=remote.revision;pending=changes!==sequence;metadata();busy=false;draw();pendingStatus();if(pending)timer=setTimeout(flush,650);
  }catch(error){if(generation!==epoch)return;busy=false;if(error.status===409){conflict=error.data;status('Sync paused: another version exists. Open Your account to choose.');}else status(error.message+' Changes have not been marked as synced.');metadata();draw();}
 }
 async function resolve(keepLocal){
  if(!conflict||busy)return;
  if(!confirm(keepLocal?'Replace the cloud journal with this device’s current version?':'Replace this device’s journal with the cloud version? Export a device backup first if needed.'))return;
  try{if(!keepLocal)app.replaceState({...normalized(conflict.data),remember:app.getState().remember});revision=conflict.revision;pending=keepLocal;conflict=null;reconciled=true;metadata();draw();if(pending)await flush();else pendingStatus();}catch(error){status(error.message);draw();}
 }
 async function endAccount(remove){
  if(busy)return;if((remove||pending)&&!confirm(remove?'Permanently delete this application account and its cloud journal?':'Some changes may not be synced. Sign out and remove the local account copy anyway?'))return;
  busy=true;draw();const generation=++epoch;clearTimeout(timer);
  try{await request(remove?'account':'logout',{method:remove?'DELETE':'POST',body:JSON.stringify(remove?{confirmation:'DELETE'}:{})});if(generation!==epoch)return;
   try{localStorage.removeItem(key());}catch{}app.clearContext();app.switchContext(null);session=null;enabled=false;pending=false;conflict=null;busy=false;status(remove?'Account deleted. Your separate guest journal is still available.':'Signed out. Account data removed from this browser.');draw();
  }catch(error){busy=false;status(error.message);draw();}
 }
 document.addEventListener('journal:changed',markChanged);
 document.addEventListener('journal:erased',()=>{epoch++;clearTimeout(timer);busy=false;enabled=false;reconciled=false;pending=false;conflict=null;if(session)metadata();status('Device journal erased. Sync is off; cloud records have not been deleted.');draw();});
 window.addEventListener('storage',event=>{if(session&&event.key===key()&&event.newValue===null)init();});
 window.addEventListener('online',()=>{if(session&&enabled)reconcile();else if(!session)init();});
 window.addEventListener('beforeunload',event=>{if(pending&&enabled&&!app.getState().remember){event.preventDefault();event.returnValue='';}});
 init().then(()=>{if(new URLSearchParams(location.search).get('auth')==='failed')status('Google sign-in did not complete. Try again, or continue as a guest.');});
})();
