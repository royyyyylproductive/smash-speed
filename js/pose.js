import {applyH} from './geometry.js';
export class PlayerTracker{
 constructor(){this.players=[];this.memory=[];this.serial=0}
 update(detections,{H,lengthM=13.4,width=1,height=1,names=['球員A','球員B','球員C','球員D'],mode='doubles',now=Date.now()}={}){
 const old=this.memory.filter(p=>now-p.seen<1500&&p.slot<(mode==='singles'?2:4)),used=new Set(),limit=mode==='singles'?2:4,tracks=[];
 for(const d of detections.slice(0,limit)){const foot=d.foot;let court=null;try{if(H)court=applyH(H,foot)}catch{}const side=court?(court.y<lengthM/2?'near':'far'):(foot.y>height/2?'near':'far');let match=old.filter(p=>!used.has(p.id)&&p.side===side).sort((a,b)=>Math.hypot(a.foot.x-foot.x,a.foot.y-foot.y)-Math.hypot(b.foot.x-foot.x,b.foot.y-foot.y))[0];if(match&&Math.hypot(match.foot.x-foot.x,match.foot.y-foot.y)>Math.hypot(width,height)*.25)match=null;
 const slots=limit/2,base=side==='near'?0:slots;let slot=match?.slot;if(slot==null||tracks.some(p=>p.slot===slot))slot=Array.from({length:slots},(_,i)=>base+i).find(i=>!tracks.some(p=>p.slot===i)&&!old.some(p=>p.slot===i&&!used.has(p.id)));if(slot==null)slot=Array.from({length:slots},(_,i)=>base+i).find(i=>!tracks.some(p=>p.slot===i));if(slot==null)continue;
 const id=match?.id??++this.serial;used.add(id);tracks.push({...d,id,slot,name:names[slot],foot,court,side,seen:now})
 }this.memory=[...tracks,...old.filter(p=>!used.has(p.id)&&!tracks.some(t=>t.slot===p.slot))];this.players=tracks;return tracks;
 }
}
// Dedicated worker owns TF tensors; only a single 256px sample can be in flight.
export class PoseSampler{
 constructor(onResult,onFallback){this.onResult=onResult;this.onFallback=onFallback;this.busy=false;this.last=0;this.slow=0;this.enabled=false}
 start(){if(this.worker||this.failed)return;try{this.worker=new Worker(new URL('./pose-worker.js',import.meta.url));this.busy=true;this.timer=setTimeout(()=>this.fail(),20000);this.worker.onmessage=({data:m})=>{clearTimeout(this.timer);this.busy=false;if(m.error)return this.fail();if(m.ready)return;this.slow=m.ms>100?this.slow+1:0;if(this.slow>=3)return this.fail();if(this.enabled)this.onResult(m.people)};this.worker.onerror=()=>this.fail()}catch{this.fail()}}
 fail(){clearTimeout(this.timer);this.worker?.terminate();this.worker=null;this.busy=false;this.failed=true;this.onFallback()}
 sample(video){if(!this.enabled||this.failed||document.hidden||video.readyState<2||performance.now()-this.last<160||this.busy)return;this.start();if(this.busy||!this.worker)return;this.last=performance.now();this.canvas ||= document.createElement('canvas');this.canvas.width=this.canvas.height=256;const c=this.canvas.getContext('2d',{willReadFrequently:true});c.drawImage(video,0,0,256,256);const image=c.getImageData(0,0,256,256);this.busy=true;this.timer=setTimeout(()=>this.fail(),5000);this.worker.postMessage({buffer:image.data.buffer},[image.data.buffer])}
 stop(){this.enabled=false;clearTimeout(this.timer);this.worker?.terminate();this.worker=null;this.busy=false}
}
