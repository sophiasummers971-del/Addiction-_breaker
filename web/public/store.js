'use strict';
(function(root){
const GUEST_KEY='addiction-breaker:v1';
let context=null;
function storageKey(){return context ? GUEST_KEY+':account:'+context : GUEST_KEY;}
function setContext(id){if(id!==null&&(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)))throw new Error('Invalid account context.');context=id;}

function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function validateEntry(e){
 if(!e || typeof e!=='object' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date||'') || !Number.isFinite(Date.parse(e.date)) || new Date(e.date).toISOString().slice(0,10)!==e.date || e.date>today()) throw new Error('Use a valid date, today or earlier.');
 const result={date:e.date};
 for(const key of ['urge','loneliness','social','sleep','financialStress']) {if(!Number.isInteger(e[key])||e[key]<0||e[key]>10)throw new Error('Check-in ratings must be whole numbers from 0 to 10.');result[key]=e[key];}
 if(typeof e.played!=='boolean')throw new Error('Choose whether you gambled.');result.played=e.played;
 if(typeof e.note!=='string'||e.note.length>4000)throw new Error('Notes must be at most 4,000 characters.');result.note=e.note;
 result.tags=[];return result;
}
function empty(){return {version:1,entries:[],plan:'',remember:false};}
function validate(data){
 if(!data||data.version!==1||!Array.isArray(data.entries)||data.entries.length>5000||typeof data.plan!=='string'||data.plan.length>2000)throw new Error('This is not a supported Addiction Breaker backup.');
 const entries=data.entries.map(validateEntry);
 if(new Set(entries.map(e=>e.date)).size!==entries.length)throw new Error('The backup contains duplicate dates.');
 const result={version:1,entries:entries.sort((a,b)=>a.date.localeCompare(b.date)),plan:data.plan,remember:data.remember===true};
 if(new Blob([JSON.stringify({...result,remember:false},null,2)]).size>5*1024*1024)throw new Error('Journal backup would exceed 5 MB. Export your entries and remove older entries before adding more.');
 return result;
}
function load(storage){const raw=storage.getItem(storageKey());return raw ? validate(JSON.parse(raw)) : empty();}
function save(storage,data){const value=validate(data);if(value.remember)storage.setItem(storageKey(),JSON.stringify(value));else storage.removeItem(storageKey());return value;}
const api={get KEY(){return storageKey();},GUEST_KEY,setContext,today,validateEntry,validate,empty,load,save};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JournalStore=api;
})(typeof window!=='undefined'?window:null);
