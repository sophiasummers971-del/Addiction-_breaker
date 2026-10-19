'use strict';
/* Browser-profile bound, non-extractable AES-GCM key, stored in IndexedDB.
 * No network calls. Protects at-rest text from ordinary storage inspection,
 * not an unlocked session, browser compromise, XSS or device theft. */
(function(root){
 const DB='addiction-breaker-private-v1',STORE='keys',ID='device-key';
 let cached;
 function database(){return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error('Secure storage unavailable'));
 });}
 async function key(){
  if(cached)return cached;
  if(!root.crypto?.subtle||!root.indexedDB)throw new Error('Browser encryption unavailable');
  cached=(async()=>{
   const db=await database();
   try{
    const existing=await new Promise((resolve,reject)=>{
     const q=db.transaction(STORE,'readonly').objectStore(STORE).get(ID);
     q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    });
    if(existing)return existing;
    const created=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    await new Promise((resolve,reject)=>{
     const tx=db.transaction(STORE,'readwrite');
     tx.objectStore(STORE).put(created,ID);
     tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
     tx.onabort=()=>reject(tx.error);
    });
    return created;
   }finally{db.close();}
  })().catch(e=>{cached=null;throw e;});
  return cached;
 }
 const bytes=s=>new TextEncoder().encode(s);
 const b64=u=>{let s='';for(const n of u)s+=String.fromCharCode(n);return btoa(s);};
 const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 async function seal(value,scope){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes(scope)},await key(),bytes(value));
  return JSON.stringify({version:1,iv:b64(iv),data:b64(new Uint8Array(ct))});
 }
 async function open(value,scope){
  const data=JSON.parse(value);
  if(!data||data.version!==1||typeof data.iv!=='string'||typeof data.data!=='string')throw new Error('Invalid encrypted diary');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(data.iv),additionalData:bytes(scope)},await key(),unb64(data.data));
  return new TextDecoder('utf-8',{fatal:true}).decode(plain);
 }
 const api={seal,open};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.PrivateDiaryCrypto=api;
})(typeof window!=='undefined'?window:undefined);
