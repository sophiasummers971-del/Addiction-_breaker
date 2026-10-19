'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('appointments script included in shell, build and local server',()=>{
 const shell=fs.readFileSync('web/public/index.html','utf8'),build=fs.readFileSync('scripts/build-static.js','utf8'),server=fs.readFileSync('web/app.js','utf8');
 assert.match(shell,/appointments\.js/);assert.match(shell,/appointments-root/);assert.match(build,/appointments\.js/);assert.match(server,/appointments\.js/);
});
test('appointment export is calendar only, with no remote API or diary access',()=>{
 const src=fs.readFileSync('web/public/appointments.js','utf8');
 assert.match(src,/BEGIN:VCALENDAR/);assert.match(src,/BEGIN:VALARM/);assert.match(src,/localStorage/);
 assert.doesNotMatch(src,/fetch\(|JournalStore|private-diary|\.note\b/);
});
