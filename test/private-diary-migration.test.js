'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const code=fs.readFileSync('web/public/private-diary.js','utf8');
const wait=()=>new Promise(resolve=>setTimeout(resolve,25));
function setup(fail=false){
 const dom=new JSDOM('<div id="private-diary-root"></div>',{url:'https://example.test/journal/',runScripts:'outside-only'});
 const w=dom.window;w.JournalStore={KEY:'owner'};
 w.PrivateDiaryCrypto={
  async seal(text,scope){if(fail)throw Error('encrypt failed');return JSON.stringify({cipher:Buffer.from(text).toString('base64'),scope});},
  async open(data,scope){const obj=JSON.parse(data);if(obj.scope!==scope)throw Error('different account');return Buffer.from(obj.cipher,'base64').toString();}
 };
 w.confirm=()=>true;return {dom,w,run(){w.eval(code)},close(){dom.window.close()}};
}
test('legacy writing survives migration failure, without being overwritten',async()=>{
 const a=setup(true);try{
  a.w.localStorage.setItem('owner:private-diary:v1','Original');
  a.run();await wait();
  assert.equal(a.w.localStorage.getItem('owner:private-diary:v1'),'Original');
  assert.equal(a.w.localStorage.getItem('owner:private-diary:encrypted:v1'),null);
  assert.equal(a.w.document.getElementById('private-diary-save').disabled,true);
 }finally{a.close();}
});
test('legacy writing migrates only after encrypted roundtrip',async()=>{
 const a=setup();try{
  a.w.localStorage.setItem('owner:private-diary:v1','Original');
  a.run();await wait();
  assert.equal(a.w.localStorage.getItem('owner:private-diary:v1'),null);
  assert.equal(a.w.document.getElementById('private-diary-text').value,'Original');
  assert.ok(!a.w.localStorage.getItem('owner:private-diary:encrypted:v1').includes('Original'));
  a.w.document.getElementById('private-diary-toggle').click();
  assert.equal(a.w.document.getElementById('private-diary-toggle').textContent,'Hide writing');
 }finally{a.close();}
});
test('report generator never imports personal diary keys',()=>{
 const report=fs.readFileSync('web/public/recovery-report.js','utf8');
 const sync=fs.readFileSync('web/public/sync.js','utf8');
 assert.doesNotMatch(report,/private-diary/);
 assert.doesNotMatch(sync,/private-diary:encrypted/);
});
