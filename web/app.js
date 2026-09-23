'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {analyzeText} = require('../src/analysis');
const MAX_BYTES = 2 * 1024 * 1024;
const assets = {
  '/ambience.js':['public/ambience.js','text/javascript'], '/thin-ice.webp':['public/thin-ice.webp','image/webp'],
  '/':['public/index.html','text/html'], '/index.html':['public/index.html','text/html'],
  '/analysis-worker.js':['../dist/analysis-worker.js','text/javascript'],
  '/app.js':['public/app.js','text/javascript'], '/styles.css':['public/styles.css','text/css'],
  '/journal.js':['../src/journal.js','text/javascript'], '/store.js':['public/store.js','text/javascript'],
  '/sample.csv':['public/sample.csv','text/csv'], '/manifest.webmanifest':['public/manifest.webmanifest','application/manifest+json'],
  '/icon.svg':['public/icon.svg','image/svg+xml'], '/sw.js':['public/sw.js','text/javascript']
};
function createServer() {
  return http.createServer(async(req,res)=>{
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control','no-store');
    const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
    let url; try {url=new URL(req.url,'http://localhost');} catch {return json(400,{error:'Invalid URL'});}
    if (req.method==='GET' && url.pathname==='/api/health') return json(200,{status:'ok'});
    if (req.method==='GET' && assets[url.pathname]) {
      const [file,type]=assets[url.pathname];
      try {const content=fs.readFileSync(path.join(__dirname,file)); res.writeHead(200,{'Content-Type':type+'; charset=utf-8'}); return res.end(content);} catch {return json(500,{error:'Application asset unavailable'});}
    }
    if (req.method!=='POST' || url.pathname!=='/api/analyze') return json(404,{error:'Not found'});
    // Reject cross-site and DNS-rebinding requests; public hosts must be explicitly configured.
    const allowed=new Set(['127.0.0.1','localhost','[::1]',...(process.env.ALLOWED_HOSTS||'').split(',').filter(Boolean)]);
    let host; try {host=new URL('http://'+req.headers.host).hostname;} catch {return json(403,{error:'Invalid host'});}
    if (!allowed.has(host)) return json(403,{error:'This host is not configured for uploads.'});
    if (req.headers['sec-fetch-site']==='cross-site') return json(403,{error:'Cross-site uploads are not allowed.'});
    if (req.headers.origin) {
      let origin; try {origin=new URL(req.headers.origin);} catch {return json(403,{error:'Invalid origin'});}
      if (origin.host!==req.headers.host) return json(403,{error:'Cross-site uploads are not allowed.'});
    }
    if (!(req.headers['content-type']||'').startsWith('text/plain')) return json(415,{error:'Upload the file as text/plain.'});
    if (Number(req.headers['content-length'])>MAX_BYTES) {req.resume();return json(413,{error:'The file limit is 2 MB.'});}
    const parts=[];let size=0;
    try {
      for await (const chunk of req) {size+=chunk.length;if(size>MAX_BYTES) {json(413,{error:'The file limit is 2 MB.'});req.resume();return;} parts.push(chunk);}
      const result=analyzeText(Buffer.concat(parts).toString('utf8'),url.searchParams.get('name')||'');
      json(200,result);
    } catch(e) {if(!res.headersSent) json(400,{error:e.message || 'Unable to read this export.'});}
  });
}
if(require.main===module){
 const server=createServer(); server.requestTimeout=15000;server.headersTimeout=10000;
 const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3737);
 server.listen(port,host,()=>console.log(`Addiction Breaker: http://${host}:${port}`));
 server.on('error',e=>{console.error('Unable to start:',e.message);process.exitCode=1;});
 for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(()=>process.exit(0)));
}
module.exports={createServer};
