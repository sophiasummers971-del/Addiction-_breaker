'use strict';
// Original “One Next Step” piano-like composition with a soft pulse. Synthesised locally: no stream, tracking,
// subliminal layer, binaural beat, or therapeutic claim.
(()=>{
 const button=document.getElementById('sound-toggle');
 const volume=document.getElementById('sound-volume');
 const status=document.getElementById('sound-status');
 let context=null,master=null,interval=null,playing=false,starting=false,generation=0;
 let nextTime=0,step=0;
 // Eight gently voiced bars, 54 beats/minute; all notes composed for this app.
 const chords=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,59],
  [48,55,60,64],[45,52,57,60],[41,48,55,57],[43,50,55,62]];
 const melody=[[76,null,null,74,71,null,67,null],[72,null,71,null,69,null,null,null],
  [69,null,null,67,64,null,67,null],[71,null,69,null,67,null,null,null],
  [72,null,76,null,79,null,76,null],[76,null,null,72,71,null,69,null],
  [69,null,72,null,67,null,64,null],[67,null,null,69,71,null,null,null]];
 const halfBeat=60/54/2;
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
   gain.gain.linearRampToValueAtTime(strength*[1,.22,.065,.015][i],time+.035);
   gain.gain.exponentialRampToValueAtTime(.0001,time+5.8/(1+i*.45));
   oscillator.connect(gain);gain.connect(master);oscillator.start(time);oscillator.stop(time+6);
   oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  });
 }
 function pulse(time,strength){
  const oscillator=context.createOscillator(),gain=context.createGain();
  oscillator.type='sine';oscillator.frequency.value=78;
  gain.gain.setValueAtTime(0,time);
  gain.gain.linearRampToValueAtTime(strength,time+.035);
  gain.gain.exponentialRampToValueAtTime(.0001,time+.19);
  oscillator.connect(gain);gain.connect(master);oscillator.start(time);oscillator.stop(time+.22);
  oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
 }
 function schedule(){
  if(!playing||!context||context.state!=='running')return;
  // A stalled foreground tab skips ahead instead of playing a burst of old notes.
  if(nextTime<context.currentTime-.2){const missed=Math.ceil((context.currentTime-nextTime)/halfBeat);step+=missed;nextTime+=missed*halfBeat;}
  while(nextTime<context.currentTime+.2){
   const bar=Math.floor(step/8)%chords.length,position=step%8;
   const chord=chords[bar],midi=melody[bar][position];
   note(chord[[0,2,1,3,1,2,3,2][position]],nextTime,.085);
   if(position===0)note(chord[0]-12,nextTime,.065);
   if(midi!==null){note(midi,nextTime,.13);note(midi,nextTime+.31,.025);}
   if(position%2===0){pulse(nextTime,.055);pulse(nextTime+.23,.032);}
   step++;nextTime+=halfBeat;
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
