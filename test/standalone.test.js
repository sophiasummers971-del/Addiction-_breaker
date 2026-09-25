'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {analyzeUser} = require('../src/model');
const {recoveryMath} = require('../src/truth');
const {findEchoes} = require('../src/journal');
const {analyzeText} = require('../src/analysis');
const {createServer} = require('../web/app');
const log = 'ts,userId,action,stake,payout,sessionId\n2026-09-01T12:00:00Z,a,bet,10,,s\n2026-09-01T12:00:01Z,a,loss,,,s\n2026-09-01T12:00:05Z,a,bet,20,,s\n2026-09-01T12:00:06Z,a,win,,5,s';
test('analysis gives counted history, not a forecast',()=>{
 const r = analyzeText(log,'history.csv');
 assert.equal(r.users[0].staked,30); assert.equal(r.users[0].returned,5);
 assert.equal(r.users[0].netLoss,25); assert.equal(r.users[0].losses,1);
 assert.equal(r.users[0].pReBetAfterLoss30s,1);
 assert.match(r.users[0].narrative,/recorded/i);
});
test('missing payouts and bad money never become a zero-return conclusion',()=>{
 const r=analyzeText('ts,action,stake\n2026-09-01T12:00:00Z,bet,10\n2026-09-01T12:00:01Z,win,','a.csv');
 assert.equal(r.users[0].rtp,null); assert.equal(r.users[0].netLoss,null);
 assert.throws(()=>analyzeText(log.replace(',10,',',garbage,'),'a.csv'),/amount|money|stake/i);
});
test('no outcome evidence is not a zero chase rate',()=>{
 const r=analyzeText('ts,action,stake,payout\n2026-09-01T12:00:00Z,bet,10,','a.csv');
 assert.equal(r.users[0].pReBetAfterLoss30s,null); assert.equal(r.users[0].hook,null);
});
test('JSON, TSV, prototype-like IDs, and malformed input are handled',()=>{
 assert.equal(analyzeText(log.replaceAll(',', '\t'),'a.tsv').users[0].netLoss,25);
 assert.equal(analyzeText(log.replaceAll(',a,',',__proto__,'),'a.csv').users[0].user,'__proto__');
 assert.throws(()=>analyzeText('[null]','a.json'),/object/i);
 assert.throws(()=>analyzeText('ts,action\n"unfinished','a.csv'),/quote/i);
 assert.throws(()=>analyzeText('[]','a.json'),/records/i);
});
test('loss streak survives intermediate bets and resets on a win',()=>{
 const actions=['bet','loss','bet','loss','bet','loss','bet'];
 const events=actions.map((action,i)=>({action,userId:'a',sessionId:'s',ts:i*1000,hour:12,gapSec:1,stake:action==='bet'?10+i:undefined}));
 assert.equal(analyzeUser(events,'a').avgStakeByConsecutiveLosses[3],16);
});
test('recovery math does not extrapolate observed RTP by default',()=>{
 const r=recoveryMath({totalStaked:100,totalReturned:50,actualRTP:50,totalBets:10});
 assert.equal(r.netLoss,50); assert.equal(r.costPer1000Chased,null);
 const scenario=recoveryMath({totalStaked:100,totalReturned:50,actualRTP:50,totalBets:10},96);
 assert.equal(scenario.costPer1000Chased,40); assert.equal(scenario.assumedRTP,96);
});
test('Echoes require explicit non-play and a strictly earlier date',()=>{
 const today={date:'2026-09-23',urge:8,loneliness:8,financialStress:8};
 const base={...today,note:'My words',played:false};
 const entries=[{...base,date:'2026-09-24'},{...base,date:'2026-09-22',played:undefined},{...base,date:'2026-09-21'}];
 assert.deepEqual(findEchoes(entries,today).map(e=>e.date),['2026-09-21']);
});
test('HTTP startup, upload contract, limits, origin and security headers',async()=>{
 const server=createServer(); await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try {
 let r=await fetch(base); assert.equal(r.status,200); assert.match(r.headers.get('content-security-policy'),/default-src 'self'/);
 r=await fetch(base+'/api/analyze?name=history.csv',{method:'POST',headers:{'content-type':'text/plain'},body:log});
 assert.equal(r.status,200); assert.equal((await r.json()).users[0].netLoss,25);
 r=await fetch(base+'/api/analyze?name=history.csv',{method:'POST',headers:{origin:'https://evil.example','content-type':'text/plain'},body:log}); assert.equal(r.status,403);
 r=await fetch(base+'/api/analyze?name=history.csv',{method:'POST',headers:{'content-type':'text/plain'},body:'x'.repeat(2*1024*1024+1)}); assert.equal(r.status,413);
 r=await fetch(base+'/src/truth.js'); assert.equal(r.status,404);
 r=await fetch(base+'/api/health'); assert.equal(r.status,200);
 } finally {await new Promise(r=>server.close(r));}
});
const Store=require('../web/public/store');
test('journal storage is opt-in, round-trips, and can be removed without other site data',()=>{
 const values=new Map([['other-app','keep']]);const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const entry={category:'gambling',date:'2026-09-01',urge:8,loneliness:7,social:2,sleep:4,financialStress:6,played:false,note:'My exact words <img src=x>',tags:[]};
 let state={...Store.empty(),entries:[entry],plan:'Message someone'};
 Store.save(storage,state);assert.equal(values.has(Store.KEY),false);
 state.remember=true;Store.save(storage,state);assert.deepEqual(Store.load(storage),state);
 Store.save(storage,{...state,remember:false});assert.equal(values.has(Store.KEY),false);assert.equal(values.get('other-app'),'keep');
});
test('damaged, duplicate, future or invalid journal records are rejected',()=>{
 const entry={category:'gambling',date:'2026-09-01',urge:8,loneliness:7,social:2,sleep:4,financialStress:6,played:false,note:'note'};
 assert.throws(()=>Store.validate({...Store.empty(),entries:[entry,entry]}),/duplicate/);
 assert.throws(()=>Store.validateEntry({...entry,date:'2099-01-01'}),/date/);
 assert.throws(()=>Store.validateEntry({...entry,date:'2026-02-30'}),/date/);
 assert.throws(()=>Store.validateEntry({...entry,played:'false'}),/behaviour/);
 assert.throws(()=>Store.validateEntry({...entry,urge:11}),/ratings/);
 assert.throws(()=>Store.validateEntry({...entry,note:'x'.repeat(4001)}),/4,000/);
});
test('storage write failures propagate rather than claiming saved',()=>{
 assert.throws(()=>Store.save({setItem(){throw new Error('quota');}}, {...Store.empty(),remember:true}),/quota/);
});
test('complete JSON history and invalid monetary formats are distinguished',()=>{
 const rows=[{ts:'2026-09-01T12:00:00Z',action:'bet',stake:10,payout:0},{ts:'2026-09-01T12:00:01Z',action:'loss',stake:0,payout:0}];
 assert.equal(analyzeText(JSON.stringify({events:rows}),'a.json').users[0].netLoss,10);
 assert.throws(()=>analyzeText(JSON.stringify([{...rows[0],stake:'1,23'},rows[1]]),'a.json'),/amount/);
 assert.throws(()=>analyzeText(JSON.stringify([{...rows[0],currency:'GBP'},{...rows[1],currency:'EUR'}]),'a.json'),/currencies/);
 assert.equal(analyzeText(JSON.stringify([rows[0]]),'a.json').users[0].rtp,null);
 assert.throws(()=>analyzeText('ts,action,action\n2026-09-01,bet,win','a.csv'),/unique/);
});
test('all app shell assets are served and no research documents are exposed',async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{for(const asset of ['/app.js','/styles.css','/journal.js','/store.js','/sample.csv','/manifest.webmanifest','/icon.svg','/sw.js']){const response=await fetch(base+asset);assert.equal(response.status,200,asset);assert.ok((await response.text()).length>10);}
 assert.equal((await fetch(base+'/output/report_data.json')).status,404);
 }finally{await new Promise(r=>server.close(r));}
});
test('legacy journal backup migrates without relabeling gambling history',()=>{
 const entry={date:'2026-01-01',urge:1,loneliness:1,social:1,sleep:1,financialStress:1,played:false,note:'old',tags:[]};
 const v=Store.validate({version:1,entries:[{...entry,category:'alcohol'}],plan:'shared',remember:true});
 assert.equal(v.version,2);assert.equal(v.entries[0].category,'gambling');assert.equal(v.entries[0].played,false);assert.deepEqual(v.profile,{categories:['gambling'],active:'gambling'});
 assert.deepEqual(Store.validate({version:1,entries:[],plan:''}).profile,{categories:[],active:'gambling'});
 assert.deepEqual(Store.validate({version:1,entries:[],plan:'existing plan'}).profile.categories,['gambling']);
});
test('multiple journeys allow one entry per category and date with strict behavior types',()=>{
 const base={date:'2026-01-01',urge:1,loneliness:1,social:1,sleep:1,financialStress:1,note:'note',tags:[]};
 const entries=[{...base,category:'gambling',played:false},{...base,category:'smoking',engaged:true}];
 const data={...Store.empty(),entries,profile:{categories:['gambling','smoking'],active:'smoking'}};
 assert.equal(Store.validate(data).entries.length,2);assert.equal(Store.validate(data).entries[1].played,undefined);
 assert.throws(()=>Store.validate({...data,entries:[entries[1],entries[1]]}),/duplicate/);
 assert.throws(()=>Store.validate({...data,entries:[{...base,category:'smoking',played:true}]}),/behaviour/);
 assert.throws(()=>Store.validate({...data,profile:{categories:['smoking','smoking'],active:'smoking'}}),/unique/);
 assert.throws(()=>Store.validate({...data,entries:[{...entries[0],category:'unknown'}]}),/category/);
});

test('active journey is one of the selected profile categories',()=>{assert.throws(()=>Store.validate({...Store.empty(),profile:{categories:['drugs'],active:'alcohol'}}),/journey/);assert.doesNotThrow(()=>Store.validate({...Store.empty(),profile:{categories:[],active:'general'}}));});
