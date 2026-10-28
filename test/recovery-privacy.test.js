'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('private writing is excluded from sync and reports by code boundaries',()=>{
 const diary=fs.readFileSync('web/public/private-diary.js','utf8');
 const report=fs.readFileSync('web/public/recovery-report.js','utf8');
 const sync=fs.readFileSync('web/public/sync.js','utf8');
 assert.match(diary,/private-diary:v1/);
 assert.doesNotMatch(report,/\.note\b|\.plan\b|\.tags\b|\.privateDiary\b/);
 assert.doesNotMatch(sync,/private-diary:v1/);
});
test('new scripts are included in build and page',()=>{
 const build=fs.readFileSync('scripts/build-static.js','utf8');
 const shell=fs.readFileSync('web/public/index.html','utf8');
 for(const file of ['private-diary.js','recovery-report.js','recovery-report-ui.js']){
  assert.ok(build.includes(file),file+' absent from build');
  assert.ok(shell.includes('/'+file),file+' absent from html');
 }
 assert.ok(shell.includes('private-diary-root'));
});
