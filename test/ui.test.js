'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const {analyzeText}=require('../src/analysis');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'web/public/index.html'),'utf8');
function mount(saved){
 const dom=new JSDOM(html,{url:'http://localhost:3737',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
 if(saved)w.localStorage.setItem('addiction-breaker:v1',saved);
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
 const app=mount();try{app.w.location.hash='journal';app.w.dispatchEvent(new app.w.HashChangeEvent('hashchange'));assert.equal(app.$('journal').hidden,false);assert.equal(app.$('today').hidden,true);assert.equal(app.w.document.querySelector('nav [aria-current]').textContent,'Journal & Echoes');}finally{app.close();}
});
