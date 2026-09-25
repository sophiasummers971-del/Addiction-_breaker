'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const {analyzeText}=require('../src/analysis');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'web/public/index.html'),'utf8');
function mount(saved,url='http://localhost:3737',draft=null,pauseEnd=null){
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
 if(saved)w.localStorage.setItem('addiction-breaker:v1',saved);
 if(draft)w.localStorage.setItem('addiction-breaker:v1:draft',draft);
 if(pauseEnd)w.sessionStorage.setItem('addiction-breaker:pause',String(pauseEnd));
 for(const script of ['src/journal.js','web/public/store.js','web/public/app.js'])w.eval(fs.readFileSync(path.join(root,script),'utf8'));
 const $=id=>w.document.getElementById(id);
 return {dom,w,$,close:()=>w.close()};
}
function checkin(app,date,note){const {$,w}=app;$('entry-date').value=date;$('entry-date').dispatchEvent(new w.Event('change'));$('urge').value='8';$('loneliness').value='7';$('financialStress').value='7';w.document.querySelector('input[name=played][value=no]').checked=true;$('entry-note').value=note;$('checkin-form').dispatchEvent(new w.Event('submit',{cancelable:true}));}
test('check-in, exact Echo text, persisted reload and editing work through the interface',()=>{
 const app=mount();try{
 app.$('remember').checked=true;
 checkin(app,'2026-09-01','I took a walk. <img src=x onerror=alert(1)>');
 checkin(app,'2026-09-02','I messaged someone.');
 assert.match(app.$('entry-status').textContent,/Saved on this browser/);
 assert.match(app.$('echoes').textContent,/I took a walk/);assert.equal(app.$('echoes').querySelector('img'),null);
 assert.equal(app.$('entry-count').textContent,'2 ENTRIES');
 const saved=app.w.localStorage.getItem('addiction-breaker:v1');
 const reloaded=mount(saved);try{assert.equal(reloaded.$('entry-count').textContent,'2 ENTRIES');const edit=reloaded.$('entries').querySelector('button');edit.click();assert.equal(reloaded.$('entry-note').value,'I messaged someone.');reloaded.$('entry-note').value='Edited';reloaded.$('checkin-form').dispatchEvent(new reloaded.w.Event('submit',{cancelable:true}));assert.equal(reloaded.$('entry-count').textContent,'2 ENTRIES');assert.match(reloaded.$('entries').textContent,/Edited/);}finally{reloaded.close();}
 }finally{app.close();}
});
test('session-only default, plan, pause and reset do not need a server',()=>{
 const app=mount();try{checkin(app,'2026-09-01','Session only');assert.equal(app.w.localStorage.length,0);assert.match(app.$('entry-status').textContent,/page session only/);app.$('plan').value='Message a friend';app.$('save-plan').click();assert.match(app.$('global-status').textContent,/page session only/);app.$('start-pause').click();assert.equal(app.$('start-pause').disabled,true);assert.equal(app.$('timer').textContent,'10:00');app.$('reset-pause').click();assert.equal(app.$('start-pause').disabled,false);assert.equal(app.$('timer').textContent,'10:00');}finally{app.close();}
});
test('delete, backup restore and erase update both saved and displayed state',async()=>{
 const app=mount();try{app.$('remember').checked=true;checkin(app,'2026-09-01','Earlier');const backup=app.w.localStorage.getItem('addiction-breaker:v1');app.$('entries').querySelector('.danger').click();assert.equal(app.$('entry-count').textContent,'0 ENTRIES');Object.defineProperty(app.$('restore-file'),'files',{value:[{size:backup.length,text:async()=>backup}],configurable:true});app.$('restore').click();await new Promise(r=>setImmediate(r));assert.equal(app.$('entry-count').textContent,'1 ENTRIES');app.$('erase').click();assert.equal(app.w.localStorage.getItem('addiction-breaker:v1'),null);assert.equal(app.$('entry-count').textContent,'0 ENTRIES');assert.equal(app.$('entry-note').value,'');}finally{app.close();}
});
test('corrupt backup and save failures do not claim success or discard current entries',async()=>{
 const app=mount();try{checkin(app,'2026-09-01','Keep me');Object.defineProperty(app.$('restore-file'),'files',{value:[{size:5,text:async()=>'bad'}]});app.$('restore').click();await new Promise(r=>setImmediate(r));assert.match(app.$('global-status').textContent,/Restore failed/);assert.equal(app.$('entry-count').textContent,'1 ENTRIES');app.$('remember').checked=true;app.w.Storage.prototype.setItem=()=>{throw new Error('Storage full');};checkin(app,'2026-09-02','Unsaved');assert.match(app.$('entry-status').textContent,/Storage full/);assert.equal(app.$('entry-count').textContent,'1 ENTRIES');}finally{app.close();}
});
test('corrupt existing storage is protected until explicit erase',()=>{
 const app=mount('not json');try{checkin(app,'2026-09-01','New');assert.match(app.$('entry-status').textContent,/Saving is paused/);assert.equal(app.w.localStorage.getItem('addiction-breaker:v1'),'not json');app.$('erase').click();checkin(app,'2026-09-01','New');assert.equal(app.$('entry-count').textContent,'1 ENTRIES');}finally{app.close();}
});
test('local analysis sends no file content over network, renders safely and clears',async()=>{
 const app=mount();try{
 const source='ts,userId,action,stake,payout\n2026-09-01T12:00:00Z,<img src=x>,bet,10,\n2026-09-01T12:00:01Z,<img src=x>,loss,,';
 Object.defineProperty(app.$('history-file'),'files',{value:[{name:'sample.csv',size:source.length,text:async()=>source}],configurable:true});
 let requests=0;app.w.fetch=async()=>{requests++;throw new Error('Network forbidden');};
 let terminated=false;app.w.Worker=class {postMessage(data){queueMicrotask(()=>this.onmessage({data:{result:analyzeText(data.text,data.name)}}));}terminate(){terminated=true;}};
 app.$('analyze').click();await new Promise(r=>setImmediate(r));assert.equal(requests,0);assert.equal(terminated,true);assert.match(app.$('analysis-results').textContent,/Recorded net loss/);assert.equal(app.$('analysis-results').querySelector('img'),null);assert.equal(app.$('analyze').disabled,false);
 app.$('analysis-results').querySelector('button').click();assert.equal(app.$('analysis-results').textContent,'');
 }finally{app.close();}
});
test('navigation exposes the requested page and hides others',()=>{
 const app=mount();try{app.w.location.hash='journal';app.w.dispatchEvent(new app.w.HashChangeEvent('hashchange'));assert.equal(app.$('journal').hidden,false);assert.equal(app.$('dashboard').hidden,true);assert.match(app.w.document.querySelector('nav [aria-current]').textContent,/Journal & Echoes/);}finally{app.close();}
});
test('piano is opt-in, stops on request and stays off after leaving the page',async()=>{
 const app=mount();let created=0,closed=0;
 try{
 const param={setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}};
 app.w.AudioContext=class{constructor(){created++;this.state='running';this.currentTime=0;this.destination={};}createGain(){return{gain:{...param},connect(){},disconnect(){}};}createOscillator(){return{frequency:{value:0},connect(){},disconnect(){},start(){},stop(){}};}async resume(){}async close(){closed++;this.state='closed';}};
 app.w.eval(fs.readFileSync(path.join(root,'web/public/ambience.js'),'utf8'));
 assert.equal(created,0);assert.equal(app.$('sound-toggle').getAttribute('aria-pressed'),'false');
 app.$('sound-toggle').click();await new Promise(r=>setImmediate(r));assert.equal(created,1);assert.equal(app.$('sound-toggle').getAttribute('aria-pressed'),'true');
 app.$('sound-toggle').click();assert.equal(closed,1);assert.equal(app.$('sound-toggle').getAttribute('aria-pressed'),'false');
 app.$('sound-toggle').click();await new Promise(r=>setImmediate(r));Object.defineProperty(app.w.document,'hidden',{value:true,configurable:true});app.w.document.dispatchEvent(new app.w.Event('visibilitychange'));assert.equal(closed,2);assert.equal(app.$('sound-toggle').getAttribute('aria-pressed'),'false');
 Object.defineProperty(app.w.document,'hidden',{value:false});app.w.document.dispatchEvent(new app.w.Event('visibilitychange'));assert.equal(created,2);assert.equal(app.$('sound-toggle').getAttribute('aria-pressed'),'false');
 }finally{app.close();}
});
test('unsupported piano does not break the rest of the app',()=>{
 const app=mount();try{app.w.eval(fs.readFileSync(path.join(root,'web/public/ambience.js'),'utf8'));app.$('sound-toggle').click();assert.match(app.$('sound-status').textContent,/unavailable/);checkin(app,'2026-09-01','Still works');assert.equal(app.$('entry-count').textContent,'1 ENTRIES');}finally{app.close();}
});
test('real page navigation preserves guest entries and moves focus to page heading',()=>{
 const app=mount();try{checkin(app,'2026-09-01','Keep in this page');app.w.document.querySelector('a[href="/journal/"]').click();assert.equal(app.w.location.pathname,'/journal/');assert.equal(app.$('journal').hidden,false);assert.equal(app.$('check-in').hidden,true);assert.equal(app.w.document.activeElement.tagName,'H1');assert.equal(app.w.AddictionApp.getState().entries.length,1);app.w.document.querySelector('a[href="/journeys/"]').click();assert.equal(app.$('journeys').hidden,false);}finally{app.close();}
});
test('remember immediately writes and removes device journal and opted-in drafts',()=>{
 const app=mount();try{checkin(app,'2026-09-01','Keep');app.$('remember').checked=true;app.$('remember').dispatchEvent(new app.w.Event('change'));assert.ok(app.w.localStorage.getItem('addiction-breaker:v1'));app.$('entry-note').value='Unfinished';app.$('entry-note').dispatchEvent(new app.w.Event('input',{bubbles:true}));assert.match(app.w.localStorage.getItem('addiction-breaker:v1:draft'),/Unfinished/);app.$('remember').checked=false;app.$('remember').dispatchEvent(new app.w.Event('change'));assert.equal(app.w.localStorage.getItem('addiction-breaker:v1'),null);assert.equal(app.w.localStorage.getItem('addiction-breaker:v1:draft'),null);assert.equal(app.w.AddictionApp.getState().entries.length,1);}finally{app.close();}
});
test('journal filters search literal text and dates without changing saved state',()=>{
 const app=mount();try{checkin(app,'2026-09-01','Walk outside');checkin(app,'2026-09-02','Message friend');app.$('journal-search').value='walk';app.$('journal-search').dispatchEvent(new app.w.Event('input'));assert.match(app.$('entries').textContent,/Walk outside/);assert.doesNotMatch(app.$('entries').textContent,/Message friend/);app.$('journal-from').value='2026-09-02';app.$('journal-from').dispatchEvent(new app.w.Event('input'));assert.match(app.$('entries').textContent,/No entries match/);app.$('clear-filters').click();assert.equal(app.$('entries').querySelectorAll('article').length,2);assert.equal(app.w.AddictionApp.getState().entries.length,2);}finally{app.close();}
});
test('account context isolation and replacement do not emit user mutation loops',()=>{
 const app=mount();try{app.$('remember').checked=true;checkin(app,'2026-09-01','Guest only');let changes=0;app.w.document.addEventListener('journal:changed',()=>changes++);app.w.AddictionApp.switchContext('user-1');assert.equal(app.w.AddictionApp.getState().entries.length,0);assert.equal(app.w.AddictionApp.guestData().entries[0].note,'Guest only');app.w.AddictionApp.replaceState({version:1,entries:[],plan:'Account plan'});assert.equal(changes,0);app.w.AddictionApp.clearContext();app.w.AddictionApp.switchContext(null);assert.equal(app.w.AddictionApp.getState().entries[0].note,'Guest only');assert.equal(changes,0);}finally{app.close();}
});
test('draft recovery requires remember opt-in and pause survives tab reload',()=>{
 const saved=JSON.stringify({version:1,remember:true,entries:[],plan:''});const draft=JSON.stringify({date:'2026-09-01',note:'Still writing',plan:'My draft plan',played:'no',urge:7});
 const app=mount(saved,'http://localhost:3737/check-in/',draft,Date.now()+590000);try{assert.equal(app.$('entry-note').value,'Still writing');assert.equal(app.$('plan').value,'My draft plan');assert.match(app.$('draft-status').textContent,/Recovered/);assert.equal(app.$('start-pause').disabled,true);assert.match(app.$('timer').textContent,/09:/);}finally{app.close();}
 const guest=mount(null,'http://localhost:3737/check-in/',draft);try{assert.equal(guest.$('entry-note').value,'');}finally{guest.close();}
});
test('journeys have real nested routes, safe signposting and isolated optional selections',()=>{
 const app=mount(null,'http://localhost:3737/journeys/alcohol/');try{
 app.w.eval(fs.readFileSync(path.join(root,'web/public/journeys.js'),'utf8'));
 assert.equal(app.$('journeys').hidden,false);assert.match(app.$('journey-content').textContent,/Sudden withdrawal can be dangerous/);
 app.$('journey-content').querySelector('a[href="/journeys/"]').click();assert.equal(app.w.location.pathname,'/journeys/');
 const checkbox=app.$('journey-content').querySelector('input');checkbox.checked=true;checkbox.dispatchEvent(new app.w.Event('change'));assert.equal(app.w.localStorage.getItem('addiction-breaker:v1:journeys'),null);
 app.$('remember').checked=true;app.$('remember').dispatchEvent(new app.w.Event('change'));assert.match(app.w.localStorage.getItem('addiction-breaker:v1'),/gambling/);
 app.w.AddictionApp.switchContext('account-test');assert.equal(app.$('journey-content').querySelector('input').checked,false);
 app.w.AddictionApp.switchContext(null);assert.equal(app.$('journey-content').querySelector('input').checked,true);
 app.w.AddictionApp.clearContext();assert.equal(app.w.localStorage.getItem('addiction-breaker:v1:journeys'),null);assert.equal(app.$('journey-content').querySelector('input').checked,false);
 }finally{app.close();}
});
test('all page sections and navigation controls are structurally accessible',()=>{
 const app=mount();try{const sections=[...app.w.document.querySelectorAll('main > section.page')];assert.equal(sections.length,12);assert.equal(sections.filter(s=>!s.hidden).length,1);assert.equal(new Set([...app.w.document.querySelectorAll('[id]')].map(n=>n.id)).size,app.w.document.querySelectorAll('[id]').length);app.$('more-toggle').click();assert.equal(app.$('more-menu').hidden,false);assert.equal(app.$('more-toggle').getAttribute('aria-expanded'),'true');app.w.document.dispatchEvent(new app.w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(app.$('more-menu').hidden,true);}finally{app.close();}
});
test('device erase emits a dedicated event rather than an empty cloud mutation',()=>{
 const app=mount();try{checkin(app,'2026-09-01','Local');let changes=0,erased=0;app.w.document.addEventListener('journal:changed',()=>changes++);app.w.document.addEventListener('journal:erased',()=>erased++);app.$('erase').click();assert.equal(changes,0);assert.equal(erased,1);assert.equal(app.w.AddictionApp.getState().entries.length,0);}finally{app.close();}
});
test('cloud replacement cannot overwrite unreadable device state and guest preview is safe',()=>{
 const app=mount('bad json');try{assert.throws(()=>app.w.AddictionApp.replaceState({version:1,entries:[],plan:'Cloud'}),/Saving is paused/);assert.equal(app.w.AddictionApp.guestData().entries.length,0);assert.equal(app.w.localStorage.getItem('addiction-breaker:v1'),'bad json');assert.match(app.$('global-status').textContent,/preserved/);}finally{app.close();}
});
test('welcome chooses multiple journeys and sign-in carries only profile choice',()=>{
 const app=mount();try{assert.equal(app.w.location.pathname,'/start/');assert.equal(app.$('start').hidden,false);app.$('start-guest').click();assert.match(app.$('onboarding-status').textContent,/Choose at least/);for(const id of ['smoking','general'])app.w.document.querySelector(`#onboarding-categories input[value="${id}"]`).checked=true;app.$('start-account').click();assert.equal(app.w.location.pathname,'/account/');const pending=JSON.parse(app.w.sessionStorage.getItem('addiction-breaker:onboarding-profile'));assert.deepEqual(pending,{categories:['smoking','general'],active:'smoking'});assert.equal(app.w.localStorage.length,0);}finally{app.close();}
});
test('same-day categories keep separate entries, labels and delete targets',()=>{
 const app=mount();try{app.w.AddictionApp.setProfile({categories:['gambling','smoking','drugs'],active:'gambling'});checkin(app,'2026-09-01','Gambling note');app.w.AddictionApp.setProfile({categories:['gambling','smoking','drugs'],active:'smoking'});checkin(app,'2026-09-01','Smoking note');assert.equal(app.w.AddictionApp.getState().entries.length,2);assert.match(app.$('engagement-question').textContent,/smoke/);assert.match(app.$('entries').textContent,/Smoking note/);assert.doesNotMatch(app.$('entries').textContent,/Gambling note/);assert.match(app.$('echoes').textContent,/gambling only/);const smoking=app.w.AddictionApp.getState().entries.find(e=>e.category==='smoking');assert.equal(smoking.engaged,false);assert.equal('played'in smoking,false);app.$('entries').querySelector('.danger').click();assert.equal(app.w.AddictionApp.getState().entries.length,1);assert.equal(app.w.AddictionApp.getState().entries[0].category,'gambling');app.w.AddictionApp.setProfile({categories:['gambling','smoking','drugs'],active:'drugs'});assert.match(app.$('engagement-question').textContent,/Do not count medication taken as prescribed/);assert.equal(app.$('category-warning').hidden,false);}finally{app.close();}
});
test('cancelled category switch preserves unfinished draft and selected context',()=>{
 const app=mount();try{app.w.AddictionApp.setProfile({categories:['gambling','alcohol'],active:'gambling'});app.$('entry-note').value='Unfinished thought';app.$('entry-note').dispatchEvent(new app.w.Event('input',{bubbles:true}));app.w.confirm=()=>false;app.$('active-category').value='alcohol';app.$('active-category').dispatchEvent(new app.w.Event('change'));assert.equal(app.w.AddictionApp.getState().profile.active,'gambling');assert.equal(app.$('entry-note').value,'Unfinished thought');assert.equal(app.$('active-category').value,'gambling');}finally{app.close();}
});
test('skip starts general support and dashboard links to selected category guidance',()=>{
 const app=mount();try{app.$('start-general').click();assert.equal(app.w.location.pathname,'/dashboard/');assert.equal(app.w.AddictionApp.getState().profile.active,'general');assert.match(app.$('dashboard-category').textContent,/General/);assert.equal(app.$('dashboard-support').getAttribute('href'),'/journeys/');app.w.AddictionApp.setProfile({categories:['alcohol'],active:'alcohol'});assert.equal(app.$('dashboard-support').getAttribute('href'),'/journeys/alcohol/');}finally{app.close();}
});
test('restored account profile leaves automatic welcome but preserves intentional journey editing',()=>{
 const app=mount();try{app.w.AddictionApp.replaceState({version:2,entries:[],plan:'',profile:{categories:['smoking'],active:'smoking'}});assert.equal(app.w.location.pathname,'/dashboard/');app.w.AddictionApp.navigate('/start/');app.w.AddictionApp.replaceState({version:2,entries:[],plan:'',profile:{categories:['smoking'],active:'smoking'}});assert.equal(app.w.location.pathname,'/start/');}finally{app.close();}
});

test('optional coping tags survive editing, remember, reload and journey separation',()=>{
 const app=mount();try{app.w.AddictionApp.setProfile({categories:['gambling','drugs'],active:'drugs'});app.$('remember').checked=true;app.$('entry-trigger').value='Stress';app.$('entry-helped').value='A pause';app.w.document.querySelector('input[name=played][value=no]').checked=true;app.$('checkin-form').dispatchEvent(new app.w.Event('submit',{cancelable:true}));assert.deepEqual(Array.from(app.w.AddictionApp.getState().entries[0].tags),['Trigger: Stress','Helped: A pause']);const saved=app.w.localStorage.getItem('addiction-breaker:v1');const next=mount(saved);try{assert.equal(next.$('entry-trigger').value,'Stress');assert.match(next.$('entries').textContent,/Helped: A pause/);next.w.AddictionApp.setProfile({categories:['gambling','drugs'],active:'gambling'});assert.equal(next.$('entry-trigger').value,'');}finally{next.close();}}finally{app.close();}
});
test('cloud replacement refuses to clear an unfinished check-in draft',()=>{const app=mount();try{app.$('entry-note').value='Still writing';app.$('entry-note').dispatchEvent(new app.w.Event('input',{bubbles:true}));assert.throws(()=>app.w.AddictionApp.replaceState({version:1,entries:[],plan:''}),/unfinished draft/);assert.equal(app.$('entry-note').value,'Still writing');}finally{app.close();}});
test('coping support follows selected journey and plan helper requires explicit saving',()=>{const app=mount();try{app.w.eval(fs.readFileSync(path.join(root,'web/public/coping.js'),'utf8'));app.w.AddictionApp.setProfile({categories:['drugs'],active:'drugs'});assert.match(app.$('pause-journey-support').href,/journeys\/drugs/);assert.equal(app.$('pause-safety').hidden,false);app.$('plan-reason').value='My sleep';const button=[...app.w.document.querySelectorAll('button')].find(b=>b.textContent==='Add these words to my plan');button.click();assert.equal(app.w.AddictionApp.getState().plan,'');app.$('save-plan').click();assert.match(app.w.AddictionApp.getState().plan,/My sleep/);app.$('plan-person').value='Private name';app.w.AddictionApp.switchContext('another-user');assert.equal(app.$('plan-person').value,'');}finally{app.close();}});
