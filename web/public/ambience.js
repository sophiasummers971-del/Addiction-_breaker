'use strict';
// Original, sparse piano-like motif. Synthesised locally: no stream, tracking,
// subliminal layer, binaural beat, or therapeutic claim.
(()=>{
 const button=document.getElementById('sound-toggle');
 const volume=document.getElementById('sound-volume');
 const status=document.getElementById('sound-status');
 let context=null,master=null,interval=null,playing=false,starting=false,generation=0;
 let nextTime=0,step=0;
 const melody=[64,null,67,71,null,69,67,null,62,null,66,69,null,67,66,null,60,null,64,67,null,64,62,null,59,null,62,67,null,66,62,null];
 function show(text){button.textContent=playing?'Turn piano off':'Play gentle piano';button.setAttribute('aria-pressed',String(playing));status.textContent=text;}
 function stop(text='Sound off · optional'){
  generation++;playing=false;starting=false;clearInterval(interval);interval=null;
  const old=context;context=null;master=null;
  // Closing the context also cancels notes scheduled ahead, so Off is immediate.
  if(old)old.close().catch(()=>{});
  show(text);
 }
 function note(midi,time,strength){
  const fundamental=440*Math.pow(2,(midi-69)/12);
  // Fast rounded attack and independently decaying harmonics, like a soft key.
  [1,2,3,4].forEach((harmonic,i)=>{
   const oscillator=context.createOscillator(),gain=context.createGain();
   oscillator.type='sine';oscillator.frequency.value=fundamental*harmonic;
   gain.gain.setValueAtTime(0,time);
   gain.gain.linearRampToValueAtTime(strength*[1,.28,.09,.025][i],time+.018);
   gain.gain.exponentialRampToValueAtTime(.0001,time+3.8/(1+i*.5));
   oscillator.connect(gain);gain.connect(master);oscillator.start(time);oscillator.stop(time+4);
   oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  });
 }
 function schedule(){
  if(!playing||!context||context.state!=='running')return;
  while(nextTime<context.currentTime+.2){
   const midi=melody[step%melody.length];if(midi!==null)note(midi,nextTime,.19);
   if(step%8===0)note([48,50,48,43][Math.floor(step/8)%4],nextTime,.13);
   step++;nextTime+=1.15;
  }
 }
 button.addEventListener('click',async()=>{
  if(playing||starting){stop();return;}
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext){show('Piano unavailable in this browser.');return;}
  const token=++generation;starting=true;button.textContent='Cancel piano';
  try{
   const current=new AudioContext();context=current;
   master=current.createGain();master.gain.value=Number(volume.value)/100*.5;master.connect(current.destination);
   await current.resume();
   if(token!==generation)return;
   if(current.state!=='running')throw new Error('Audio did not start');
   starting=false;playing=true;step=0;nextTime=current.currentTime+.08;
   current.onstatechange=()=>{if(context===current&&playing&&current.state!=='running')stop('Piano paused · tap Play to resume');};
   show('Piano on · optional');schedule();interval=setInterval(schedule,100);
  }catch{if(token===generation)stop('Piano unavailable · you can continue silently.');}
 });
 volume.addEventListener('input',()=>{
  if(master&&context)master.gain.setTargetAtTime(Number(volume.value)/100*.5,context.currentTime,.05);
 });
 // Never restart automatically after switching apps, receiving a call, or reload.
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&(playing||starting))stop('Piano paused · tap Play to resume');});
 window.addEventListener('pagehide',()=>stop());
})();
