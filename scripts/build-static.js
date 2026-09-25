'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..'),out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
const names=['index.html','styles.css','ambience.js','thin-ice.webp','app.js','sync.js','journeys.js','store.js','sample.csv','manifest.webmanifest','icon.svg','sw.js'];
for(const name of names)fs.copyFileSync(path.join(root,'web/public',name),path.join(out,name));
fs.copyFileSync(path.join(root,'src/journal.js'),path.join(out,'journal.js'));
// Bundle only our four dependency-free CommonJS modules. No eval or remote code.
const modules=['adapters','model','truth','analysis'].map(name=>`${JSON.stringify('./'+name)}: function(module,exports,require){\n${fs.readFileSync(path.join(root,'src',name+'.js'),'utf8')}\n}`).join(',\n');
const worker=`'use strict';\n(()=>{\nconst modules={${modules}};\nconst cache=Object.create(null);\nfunction require(name){if(!modules[name])throw new Error('Unknown module');if(!cache[name]){const m={exports:{}};cache[name]=m;modules[name](m,m.exports,require);}return cache[name].exports;}\nconst {analyzeText}=require('./analysis');\nself.onmessage=event=>{try{const {text,name}=event.data;if(typeof text!=='string'||typeof name!=='string')throw new Error('Choose a supported event export.');if(new TextEncoder().encode(text).length>2*1024*1024)throw new Error('The file limit is 2 MB.');self.postMessage({result:analyzeText(text,name)});}catch(error){self.postMessage({error:error.message||'Unable to read this export.'});}};\n})();\n`;
fs.writeFileSync(path.join(out,'analysis-worker.js'),worker);
fs.writeFileSync(path.join(out,'_headers'),`/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000
  Cache-Control: no-cache
`);
fs.writeFileSync(path.join(out,'404.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><title>Page not found</title><h1>Page not found</h1><a href="/">Return to Addiction Breaker</a></html>');
const routes=['dashboard','check-in','pause','journal','mirror','support','account','journeys','journeys/gambling','journeys/alcohol','journeys/smoking','journeys/drugs','journeys/behaviours'];
const shell=fs.readFileSync(path.join(out,'index.html'),'utf8');
for(const route of routes){const folder=path.join(out,route);fs.mkdirSync(folder,{recursive:true});const title=route.split('/').at(-1).replaceAll('-',' ');fs.writeFileSync(path.join(folder,'index.html'),shell.replace(/<title>.*?<\/title>/,`<title>${title[0].toUpperCase()+title.slice(1)} — Addiction Breaker</title>`));}
fs.writeFileSync(path.join(out,'_routes.json'),JSON.stringify({version:1,include:['/api/*'],exclude:[]},null,2));
console.log('Built multi-page Cloudflare Pages site in dist/. Accounts use Pages Functions and D1 when configured.');
