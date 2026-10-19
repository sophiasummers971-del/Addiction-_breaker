'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {generate}=require('../web/public/recovery-pdf.js');
test('generates a PDF with only safe structured report fields',()=>{
 const report={start:'2026-10-19',end:'2026-10-25',rows:[{date:'2026-10-19',topic:'drugs',status:'NOT RECORDED',activity:'Not recorded',urge:null,moneyPressure:null,note:'PRIVATE SECRET'}]};
 const buffer=generate(report);
 assert.equal(Buffer.from(buffer).subarray(0,8).toString(),'%PDF-1.4');
 const pdf=Buffer.from(buffer).toString();
 assert.match(pdf,/NOT RECORDED/);
 assert.match(pdf,/\/Count 3/);
 assert.match(pdf,/Weekly recovery report/);
 assert.match(pdf,/Drugs \\| Daily records/);
 assert.match(pdf,/Gambling \\| Daily records/);
 assert.doesNotMatch(pdf,/PRIVATE SECRET/);
});
test('report screen is on check-in and audio stays user initiated',()=>{
 const code=fs.readFileSync('web/public/recovery-report-ui.js','utf8');
 const music=fs.readFileSync('web/public/ambience.js','utf8');
 assert.match(code,/\$\('check-in'\)/);
 assert.match(code,/Download PDF/);
 assert.match(music,/radioButton\.addEventListener\('click'/);
 assert.match(music,/stopRadio\(\)/);
});
