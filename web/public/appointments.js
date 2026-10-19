'use strict';
(()=> {
 const root=document.getElementById('appointments-root');
 if(!root)return;
 const key='addiction-breaker:appointments:v1';
 const make=(tag,txt)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;return e;};
 const card=make('article');card.className='card';
 card.append(make('h2','My appointments'),make('p','A simple place to remember appointments. Saved on this device only. For reliable reminders, add the event to your phone calendar.'));
 const form=make('form');
 const title=make('input');title.type='text';title.placeholder='Appointment name';title.required=true;title.maxLength=120;
 const date=make('input');date.type='date';date.required=true;
 const time=make('input');time.type='time';time.required=true;
 const lead=make('select');for(const [v,t] of [['0','At the time'],['60','1 hour before'],['1440','1 day before'],['2880','2 days before'],['-1','No reminder']]){let o=make('option',t);o.value=v;lead.append(o);}lead.value='1440';
 const save=make('button','Save appointment');save.type='submit';save.className='primary';
 for(const [name,node] of [['Name',title],['Date',date],['Time',time],['Calendar reminder',lead]]){const l=make('label',name);l.append(node);form.append(l);}
 form.append(save);
 const items=make('div');items.id='appointment-items';
 const note=make('p');note.setAttribute('role','status');
 card.append(form,items,note);root.append(card);
 let entries=[];
 try{const raw=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(raw))entries=raw.filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&/^\d\d:\d\d$/.test(x.time)).slice(0,50);}catch{note.textContent='Saved appointments could not be read. Please check this device.';}
 function persist(){try{localStorage.setItem(key,JSON.stringify(entries));return true;}catch{note.textContent='Device storage unavailable. Appointment not saved.';return false;}}
 function calendar(x){
  const d=x.date.replaceAll('-',''),t=x.time.replace(':','');
  const start=new Date(x.date+'T'+x.time+':00');
  const end=new Date(start.getTime()+30*60000);
  const fmt=v=>[v.getFullYear(),String(v.getMonth()+1).padStart(2,'0'),String(v.getDate()).padStart(2,'0')].join('')+'T'+[String(v.getHours()).padStart(2,'0'),String(v.getMinutes()).padStart(2,'0'),'00'].join('');
  const esc=s=>s.replace(/\\/g,'\\\\').replace(/[,;]/g,m=>'\\'+m).replace(/\n/g,'\\n');
  let ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Addiction Breaker//Appointments//EN\r\nBEGIN:VEVENT\r\nUID:'+x.id+'@addiction-breaker.local\r\nDTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')+'\r\nDTSTART:'+fmt(start)+'\r\nDTEND:'+fmt(end)+'\r\nSUMMARY:'+esc(x.title)+'\r\n';
  if(Number(x.lead)>=0)ics+='BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:You have an appointment\r\nTRIGGER:-PT'+Number(x.lead)+'M\r\nEND:VALARM\r\n';
  ics+='END:VEVENT\r\nEND:VCALENDAR\r\n';
  const url=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}));const a=make('a');a.href=url;a.download='appointment-'+d+'-'+t+'.ics';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function render(){items.replaceChildren();if(!entries.length)items.append(make('p','No appointments saved yet.'));
  for(const x of [...entries].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))){
   const row=make('div');row.className='card';
   row.append(make('strong',x.title),make('p',x.date+' · '+x.time));
   const add=make('button','Add to phone calendar');add.type='button';add.className='secondary';add.addEventListener('click',()=>calendar(x));
   const del=make('button','Delete');del.type='button';del.className='secondary';del.addEventListener('click',()=>{if(!confirm('Delete this appointment from Addiction Breaker?'))return;entries=entries.filter(y=>y.id!==x.id);persist();render();});
   row.append(add,document.createTextNode(' '),del);items.append(row);
  }
 }
 form.addEventListener('submit',e=>{e.preventDefault();if(entries.length>=50){note.textContent='Maximum 50 appointments on this device.';return;}
  const x={id:(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random()),title:title.value.trim(),date:date.value,time:time.value,lead:lead.value};
  if(!x.title||!x.date||!x.time)return;
  entries.push(x);if(!persist()){entries.pop();return;}form.reset();lead.value='1440';note.textContent='Saved on this device. Use Add to phone calendar for notifications while the app is closed.';render();
 });render();
})();
