'use strict';
(()=>{
 const $=id=>document.getElementById(id),app=window.AddictionApp;
 const make=(tag,text,parent)=>{const n=document.createElement(tag);n.textContent=text;if(parent)parent.append(n);return n;};
 const card=make('article','');card.className='card';
 make('h2','Help for this moment',card);
 make('p','You can use support without completing a check-in or deciding on a label.',card);
 const support=make('a','Find support for my selected journey →',card);support.className='text-link';support.id='pause-journey-support';
 const caution=make('p','',card);caution.className='inset';caution.id='pause-safety';
 make('h3','Ask someone to stay alongside you',card);
 make('p','You could copy this into your usual messaging app. Nothing is sent for you, and no contact details are stored here.',card);
 const draft=make('blockquote','I’m finding this moment difficult. Could you text with me for a little while? I don’t need you to solve it; some company would help.',card);draft.id='support-message';
 const copy=make('button','Copy message',card);copy.className='secondary';copy.type='button';const status=make('p','',card);status.setAttribute('role','status');
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(draft.textContent);status.textContent='Copied. Choose who to send it to in your messaging app.';}catch{status.textContent='Copy is unavailable. Select the message above and copy it manually.';}});
 make('p','This app does not monitor your safety. In immediate danger in the UK, call 999. Outside the UK, use your local emergency service.',card);
 const urgent=make('a','NHS urgent mental health help →',card);urgent.href='https://www.nhs.uk/nhs-services/mental-health-services/where-to-get-urgent-help-for-mental-health/';urgent.rel='noreferrer';
 $('pause').querySelector('.reading-width').prepend(card);
 const focused=make('div','');focused.className='inset';const focusedLink=make('a','Support for my selected journey →',focused);$('support').querySelector('h1').after(focused);
 function update(){const c=app.getState().profile.active;support.href=c==='general'?'/journeys/':'/journeys/'+c+'/';focusedLink.href=support.href;caution.hidden=!['alcohol','drugs'].includes(c);caution.textContent=c==='alcohol'?'If you may be dependent on alcohol, get medical advice before stopping or sharply reducing. This timer is not a detox plan.':c==='drugs'?'Speak with a qualified clinician about dependent use and your prescriber before changing medication. A pause is not treatment for withdrawal or overdose.':'';}
 for(const event of ['journal:changed','journal:context','journey:route'])document.addEventListener(event,update);update();
 const helper=make('details','');helper.append(make('summary','Help me put my plan into words'));
 make('p','Optional prompts for your shared plan. Keep names or contact details out if you prefer. These fields are not saved until you add them to your plan and press Save my plan.',helper);
 const fields=[];
 for(const [id,label] of [['reason','What matters to me / what I want to protect'],['step','One manageable next step'],['person','Someone or a service I could contact']]){const wrap=make('label',label,helper),input=document.createElement('input');input.id='plan-'+id;input.type='text';input.maxLength=350;wrap.append(input);fields.push([label,input]);}
 const add=make('button','Add these words to my plan',helper);add.type='button';add.className='secondary';const result=make('p','',helper);result.setAttribute('role','status');
 add.addEventListener('click',()=>{const text=fields.filter(([,i])=>i.value.trim()).map(([label,i])=>label+': '+i.value.trim()).join('\n');if(!text){result.textContent='Write one thing that matters to you first.';return;}const value=[$('plan').value,text].filter(Boolean).join('\n\n');if(value.length>2000){result.textContent='Your plan would exceed 2,000 characters. Shorten it before adding these words.';return;}$('plan').value=value;$('plan').dispatchEvent(new Event('input',{bubbles:true}));fields.forEach(([,i])=>i.value='');result.textContent='Added to your draft. Press Save my plan to keep it.';});
 $('plan').before(helper);
 // Prevent unsaved helper words leaking between guest and account contexts.
 for(const event of ['journal:context','journal:erased'])document.addEventListener(event,()=>{fields.forEach(([,i])=>i.value='');result.textContent='';status.textContent='';});
})();
