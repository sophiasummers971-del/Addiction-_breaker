'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Store=require('../web/public/store.js');
const Reports=require('../web/public/recovery-report.js');
test('recorded structured details survive validation and report projection',()=>{
 const e={date:'2026-10-19',category:'drugs',engaged:true,urge:7,loneliness:1,social:1,sleep:5,financialStress:7,note:'NOT SHARED',tags:[],recovery:{activity:'Sample',cost:'20'}};
 const v=Store.validateEntry(e);
 const report=Reports.build([v],'2026-10-19',['drugs']);
 assert.equal(report.rows[0].recovery.cost,'20');
 assert.equal(report.rows[0].recovery.activity,'Sample');
 assert.ok(!JSON.stringify(report).includes('NOT SHARED'));
});
