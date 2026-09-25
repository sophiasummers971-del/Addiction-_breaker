'use strict';
(()=>{
 const KEY='addiction-breaker:theme',valid=new Set(['system','light','dark']);
 const select=document.getElementById('theme-choice'),status=document.getElementById('theme-status');
 let choice='system',media=null;
 try{media=window.matchMedia?.('(prefers-color-scheme: dark)');}catch{}
 try{const stored=localStorage.getItem(KEY);if(valid.has(stored))choice=stored;}catch{}
 function apply(){const theme=choice==='system'?(media?.matches?'dark':'light'):choice;document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='light'?'#f3f5f0':'#10191e';if(select)select.value=choice;}
 select?.addEventListener('change',()=>{if(!valid.has(select.value)){select.value=choice;return;}choice=select.value;apply();try{localStorage.setItem(KEY,choice);if(status)status.textContent='Appearance saved on this device.';}catch{if(status)status.textContent='Appearance changed for this page. This browser could not save the preference.';}});
 const changed=()=>{if(choice==='system')apply();};
 if(media?.addEventListener)media.addEventListener('change',changed);else media?.addListener?.(changed);
 window.addEventListener('storage',event=>{if(event.key!==KEY&&event.key!==null)return;choice=valid.has(event.newValue)?event.newValue:'system';apply();});
 apply();
})();
