'use strict';
(function(root){
const GUEST_KEY='addiction-breaker:v1';
let context=null;
function storageKey(){return context ? GUEST_KEY+':account:'+context : GUEST_KEY;}
function setContext(id){if(id!==null&&(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)))throw new Error('Invalid account context.');context=id;}

function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
const CATEGORIES=Object.freeze(['gambling','alcohol','smoking','drugs','behaviours','general']);
function validateProfile(profile){
 if(!profile||!Array.isArray(profile.categories)||profile.categories.length>CATEGORIES.length||profile.categories.some(c=>!CATEGORIES.includes(c))||new Set(profile.categories).size!==profile.categories.length||!CATEGORIES.includes(profile.active)||(profile.categories.length>0&&!profile.categories.includes(profile.active)))throw new Error('Choose valid, unique journey categories.');
 return {categories:[...profile.categories],active:profile.active};
}
function validateEntry(e,legacy=false){
 if(!e || typeof e!=='object' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date||'') || !Number.isFinite(Date.parse(e.date)) || new Date(e.date).toISOString().slice(0,10)!==e.date || e.date>today()) throw new Error('Use a valid date, today or earlier.');
 const category=legacy?'gambling':(e.category===undefined?'gambling':e.category);
 if(!CATEGORIES.includes(category))throw new Error('Choose a valid journey category.');
 const result={date:e.date,category};
 for(const key of ['urge','loneliness','social','sleep','financialStress']) {if(!Number.isInteger(e[key])||e[key]<0||e[key]>10)throw new Error('Check-in ratings must be whole numbers from 0 to 10.');result[key]=e[key];}
 const behaviour=category==='gambling'?'played':'engaged';
 if(typeof e[behaviour]!=='boolean')throw new Error('Choose whether this behaviour happened.');
 result[behaviour]=e[behaviour];
 if(typeof e.note!=='string'||e.note.length>4000)throw new Error('Notes must be at most 4,000 characters.');result.note=e.note;
 const tags=e.tags===undefined?[]:e.tags;
 if(!Array.isArray(tags)||tags.length>20||tags.some(t=>typeof t!=='string'||t.length>80))throw new Error('Use at most 20 short text tags.');
 result.tags=[...tags];return result;
}
function empty(){return {version:2,entries:[],plan:'',profile:{categories:[],active:'gambling'},remember:false};}
function validate(data){
 if(!data||![1,2].includes(data.version)||!Array.isArray(data.entries)||data.entries.length>5000||typeof data.plan!=='string'||data.plan.length>2000)throw new Error('This is not a supported Addiction Breaker backup.');
 if(data.version===2&&data.entries.some(e=>!e||!CATEGORIES.includes(e.category)))throw new Error('Choose a valid journey category.');
 const entries=data.entries.map(e=>validateEntry(e,data.version===1));
 if(new Set(entries.map(e=>e.category+':'+e.date)).size!==entries.length)throw new Error('The backup contains duplicate dates within a journey.');
 const profile=data.version===1?{categories:(entries.length||data.plan)?['gambling']:[],active:'gambling'}:validateProfile(data.profile);
 const result={version:2,entries:entries.sort((a,b)=>a.date.localeCompare(b.date)||a.category.localeCompare(b.category)),plan:data.plan,profile,remember:data.remember===true};
 if(new Blob([JSON.stringify({...result,remember:false},null,2)]).size>5*1024*1024)throw new Error('Journal backup would exceed 5 MB. Export your entries and remove older entries before adding more.');
 return result;
}
function load(storage){const raw=storage.getItem(storageKey());return raw ? validate(JSON.parse(raw)) : empty();}
function save(storage,data){const value=validate(data);if(value.remember)storage.setItem(storageKey(),JSON.stringify(value));else storage.removeItem(storageKey());return value;}
const api={get KEY(){return storageKey();},GUEST_KEY,setContext,today,CATEGORIES,validateProfile,validateEntry,validate,empty,load,save};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JournalStore=api;
})(typeof window!=='undefined'?window:null);
