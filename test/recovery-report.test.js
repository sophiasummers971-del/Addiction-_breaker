'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {build}=require('../web/public/recovery-report.js');
test('shows missing days separately for drugs and gambling',()=>{
 const r=build([{date:'2026-10-19',category:'drugs',engaged:false,urge:4,financialStress:3,note:'SECRET',plan:'HIDDEN'}],'2026-10-19');
 assert.equal(r.rows.length,14);
 assert.equal(r.rows[0].status,'REPORTED NO ACTIVITY');
 assert.equal(r.rows[1].status,'NOT RECORDED');
 assert.equal(r.rows[2].status,'NOT RECORDED');
 assert.doesNotMatch(JSON.stringify(r),/SECRET|HIDDEN|note|plan|Echo/i);
});
test('one topic can report an activity without implying the other',()=>{
 const r=build([{date:'2026-10-19',category:'gambling',played:true,note:'DO NOT EXPORT'}],'2026-10-19');
 assert.equal(r.rows[0].status,'NOT RECORDED');
 assert.equal(r.rows[1].status,'REPORTED ACTIVITY');
 assert.doesNotMatch(JSON.stringify(r),/DO NOT EXPORT/);
});
