import {fitDrag} from './fit.js';
import {intersectRay,planeQuality} from './geometry.js';
import {refineDifference} from './subpixel.js';
import {findMotion} from './track.js';
import {monteCarlo} from './uncertainty.js';
const median=a=>{a=[...a].sort((x,y)=>x-y);return a.length?a[a.length>>1]:0};
// Coordinates supplied to calibration are full camera pixels; all tracking is analysis pixels.
export class LiveDetector {
 constructor({width,height,calib,minSpeedKmh=100,sensitivity=50,settings={}}){if(typeof calib==='number')calib={mpp:calib,fullWidth:width};Object.assign(this,{width,height,calib,minSpeedKmh,sensitivity,settings});this.tracks=[];this.intervals=[];this.serial=0;}
 world(p){const c=this.calib,s=c.fullWidth/this.width||c.scale||1,q={x:p.x*s,y:p.y*s};return c.camera?intersectRay(c.camera,q,c.plane):{x:q.x*c.mpp,y:q.y*c.mpp};}
 finish(track){
  const p=track.points,ts=p.slice(1).map((q,i)=>q.time-p[i].time),fps=1/median(ts);
  if(p.length<(fps<40?2:3))return null;
  let marks;try{marks=p.map(q=>({...this.world(q),time:q.time,sigma:.5}));}catch{return null;}
  const a=marks[0],z=marks.at(-1),dist=Math.hypot(z.x-a.x,z.y-a.y,(z.z||0)-(a.z||0));
  if(dist/(z.time-a.time)*3.6<this.minSpeedKmh*.65)return null;
  const dx=p.at(-1).x-p[0].x,dy=p.at(-1).y-p[0].y,n=Math.hypot(dx,dy);
  // A motion streak must agree with the trajectory, not a swinging racket.
  if(p.some(q=>q.streak&&Math.abs(Math.cos(q.orientation)*dx+Math.sin(q.orientation)*dy)<.85*n))return null;
  if(!n||p.slice(1).some((q,i)=>{const sx=q.x-p[i].x,sy=q.y-p[i].y;return (sx*dx+sy*dy)<.75*Math.hypot(sx,sy)*n;}))return null;
  const crossRms=Math.sqrt(p.reduce((sum,q)=>sum+((q.x-p[0].x)*dy-(q.y-p[0].y)*dx)**2,0)/p.length)/n;if(crossRms>Math.max(2,n*.04))return null;
  const pixelMetres=this.calib.mpp*(this.calib.fullWidth/this.width||1)||.015;
  // fitDrag v0 is anchored to the first detection, so extrapolation beyond observed time is capped at zero.
  const fit=fitDrag(marks,{pixelMetres,prior:.2});if(!fit||fit.rmsPx>3)return null;
  const speedKmh=fit.v0*3.6;if(speedKmh<this.minSpeedKmh||speedKmh>700)return null;
  // Two isolated blobs cannot establish a fast smash. At low frame rates retain
  // a two-point estimate only when independent, aligned exposure streaks support it.
  if(p.length===2&&(!p.every(q=>q.streak&&q.contrast>=35)||ts[0]>1.5/fps))return null;
  if(speedKmh>400&&p.length<4&&!p.every(q=>q.streak&&q.contrast>=50&&q.major>=2))return null;
  const s=this.calib.fullWidth/this.width||1, jitter=Math.max(.00005,Math.sqrt(ts.reduce((v,t)=>v+(t-median(ts))**2,0)/ts.length)*.15);
  const options=this.calib.uncertainty||(!this.calib.camera?{mode:'side',points:[{x:0,y:0},{x:1000,y:0}],distance:1000*this.calib.mpp}:null);
  // Spread four samples across the accepted trajectory for bounded-cost uncertainty propagation.
  // The primary robust fit above still uses every detection.
  const count=Math.min(4,p.length),mcPoints=Array.from({length:count},(_,i)=>p[Math.round(i*(p.length-1)/(count-1))]);
  const mc=options?monteCarlo({...options,marks:mcPoints.map(q=>({...q,x:q.x*s,y:q.y*s,sigma:.5*s})),timeSigma:jitter,impactTime:0},12):null;
  const planeAngle=this.calib.camera?planeQuality(this.calib.camera,this.calib.plane).angle:90;
  const sigmaKmh=Math.max(planeAngle<10?speedKmh*.5:0,mc?.sigma*3.6||0,speedKmh*(fps<40?.20:fps<90?.10:.04),fit.sigma*3.6||0);
  const reasons=[];if(planeAngle<10)reasons.push('球路平面夾角太小，球速不可靠');if(fps<40)reasons.push('30fps：取樣不足');else if(fps<90)reasons.push('60fps：時間解析度有限');if(p.length<4)reasons.push('可用球點少');if(this.calib.camera?.source==='fallback')reasons.push('鏡頭焦距為估算');if(this.calib.camera&&!mc)reasons.push('斜角校準誤差未能完整估計');
  const downward=this.calib.camera?z.z<a.z:dy>0;
  if(!downward)reasons.push('非向下球路');
  let streakKmh;const exposure=this.settings.exposureTime;if(exposure>0){const values=p.filter(q=>q.streak).map(q=>{try{const d=q.length/2,v={x:Math.cos(q.orientation)*d,y:Math.sin(q.orientation)*d},a=this.world({x:q.x-v.x,y:q.y-v.y}),b=this.world({x:q.x+v.x,y:q.y+v.y});return Math.hypot(b.x-a.x,b.y-a.y,(b.z||0)-(a.z||0))/exposure*3.6}catch{return NaN}}).filter(Number.isFinite);if(values.length)streakKmh=median(values);}
  const curve=Array.from({length:25},(_,i)=>{const t=(z.time-a.time)*i/24,span=fit.k?Math.log1p(fit.k*fit.v0*t)/fit.k:fit.v0*t,total=fit.k?Math.log1p(fit.k*fit.v0*(z.time-a.time))/fit.k:fit.v0*(z.time-a.time);return {x:p[0].x+dx*span/total,y:p[0].y+dy*span/total}});
  return {speedKmh,sigmaKmh,confidence:fps<40||sigmaKmh/speedKmh>.2?'低':fps<90||reasons.length?'中':'高',reasons,points:p,fps,downward,smash:downward,method:`${this.calib.camera?'斜角':'側面'} · drag 擬合（首個偵測點）`,streakKmh,curve,firstTime:p[0].time,extrapolationSeconds:0};
 }
 push(frame,t){
  const {width:w,height:h,data}=frame;if(w!==this.width||h!==this.height||data.length!==w*h*4||!Number.isFinite(t))throw Error('Invalid live frame');
  if(this.time!==undefined&&t<=this.time)return {candidates:[]};
  const lum=new Float32Array(w*h);for(let i=0;i<lum.length;i++)lum[i]=.2126*data[i*4]+.7152*data[i*4+1]+.0722*data[i*4+2];
  if(!this.bg){this.bg=lum.slice();this.prev=frame;this.time=t;return {candidates:[]};}
  // A cut (including colour-to-monochrome replay) invalidates every active track.
  let changed=0,sampled=0;for(let i=0;i<data.length;i+=68){const d=(Math.abs(data[i]-this.prev.data[i])+Math.abs(data[i+1]-this.prev.data[i+1])+Math.abs(data[i+2]-this.prev.data[i+2]))/3;if(d>28)changed++;sampled++;}
  if(changed/sampled>.35){this.bg=lum.slice();this.prev=frame;this.time=t;this.tracks=[];this.intervals=[];this.exposureOffset=0;return {candidates:[],sceneCut:true};}
  this.intervals.push(t-this.time);if(this.intervals.length>30)this.intervals.shift();this.time=t;
  // Remove the robust global exposure offset before foreground segmentation.
  // A small shuttle/player occupies too little of the image to move this median.
  const offsets=new Uint32Array(511);let samples=0;
  for(let i=0;i<lum.length;i+=17){offsets[Math.max(0,Math.min(510,Math.round(lum[i]-this.bg[i])+255))]++;samples++;}
  let accumulated=0,offset=0;for(let i=0;i<511;i++){accumulated+=offsets[i];if(accumulated>=samples/2){offset=i-255;break;}}
  // Quantised histograms give a robust median/MAD without sorting thousands of samples per frame.
  const histogram=new Uint32Array(256);let count=0;
  for(let i=0;i<lum.length;i+=17){histogram[Math.min(255,Math.round(Math.abs(lum[i]-this.bg[i]-offset))) ]++;count++;}
  let cumulative=0,noise=0;for(;noise<255;noise++){cumulative+=histogram[noise];if(cumulative>=count/2)break;}
  const deviations=new Uint32Array(256);for(let i=0;i<256;i++)deviations[Math.abs(i-noise)]+=histogram[i];
  cumulative=0;let mad=0;for(;mad<255;mad++){cumulative+=deviations[mad];if(cumulative>=count/2)break;}
  const threshold=Math.max(18,Math.max(noise*4,1.4826*mad*6)+(50-this.sensitivity)*.2);
  // Background mask retains stationary player interiors, so small fragments inside them are suppressed.
  const bgFrame={width:w,height:h,data:new Uint8ClampedArray(data.length)};
  for(let i=0;i<lum.length;i++){const b=Math.max(0,Math.min(255,this.bg[i]+offset));bgFrame.data[i*4]=bgFrame.data[i*4+1]=bgFrame.data[i*4+2]=b;bgFrame.data[i*4+3]=255;if(Math.abs(lum[i]-b)<threshold)this.bg[i]+=.008*(lum[i]-b);}
  const blobs=findMotion(bgFrame,frame,{threshold,minPixels:2,maxPixels:w*h,includeBounds:true});
  const resolution=Math.max(1,w/320),maxBlob=180*resolution*resolution;
  const large=blobs.filter(b=>b.size>maxBlob),candidates=[];
  for(const b of blobs){if(b.size>maxBlob||b.brightness/b.size<threshold*1.3)continue;
   // Keep a detached bright shuttle beside a player/racket at impact. Reject
   // only components actually inside a player's body, rather than its padded box.
   const inside=large.filter(a=>a.maxX-a.minX<w*.2&&a.maxY-a.minY<h*.75).some(a=>b.maxX>=a.minX-1&&b.minX<=a.maxX+1&&b.maxY>=a.minY-1&&b.minY<=a.maxY+1);
   if(inside)continue;
   // Refine a local patch with the existing intensity moment / streak helper.
   const x0=Math.max(0,b.minX-1),y0=Math.max(0,b.minY-1),pw=Math.min(w-x0,b.maxX-x0+2),ph=Math.min(h-y0,b.maxY-y0+2);
   const patch=f=>{const d=new Uint8ClampedArray(pw*ph*4);for(let y=0;y<ph;y++)d.set(f.data.subarray(((y+y0)*w+x0)*4,((y+y0)*w+x0+pw)*4),y*pw*4);return {data:d,width:pw,height:ph}};
   const r=refineDifference(patch(bgFrame),patch(frame),null,{fraction:.4,minContrast:threshold});// At 320px a shuttle can be long under blur, but remains narrow.
   if(!r||r.minor>1.3*resolution)continue;
   // Require change from previous image too; static highlights cannot start tracks.
   const ix=Math.max(0,Math.min(w*h-1,Math.round(b.y)*w+Math.round(b.x))),j=ix*4;
   if(lum[ix]<this.bg[ix]+offset+threshold*.65)continue;
   if(Math.abs(lum[ix]-(.2126*this.prev.data[j]+.7152*this.prev.data[j+1]+.0722*this.prev.data[j+2])-(offset-(this.exposureOffset||0)))<threshold*.6)continue;
   candidates.push({...r,streak:r.streak&&r.major>=1.2*resolution,x:r.x+x0,y:r.y+y0,time:t,length:Math.sqrt(12)*r.major});
  }
  this.prev=frame;this.exposureOffset=offset;let event;const used=new Set();
  for(const tr of this.tracks){const p=tr.points,last=p.at(-1),dt=t-last.time;let vx=0,vy=0;if(p.length>1){const a=p.at(-2),d=last.time-a.time;vx=(last.x-a.x)/d;vy=(last.y-a.y)/d;const decay=1/(1+.2*Math.hypot(vx,vy)*(this.calib.mpp*(this.calib.fullWidth/w||1)||.015)*dt);vx*=decay;vy*=decay;}
   const predicted={x:last.x+vx*dt,y:last.y+vy*dt},gate=p.length>1?Math.max(7*resolution,Math.hypot(vx,vy)*dt*.45):w*.65;
   let best=-1,cost=Infinity;for(let i=0;i<candidates.length;i++){if(used.has(i))continue;const q=candidates[i];if(Math.hypot(q.x-last.x,q.y-last.y)<.75*resolution)continue;const d=Math.hypot(q.x-predicted.x,q.y-predicted.y);if(d<gate&&d<cost){cost=d;best=i;}}
   if(best>=0){p.push(candidates[best]);if(p.length>8)p.shift();used.add(best);tr.missed=0;}else tr.missed++;
   // Bridge two absent observations; retain actual elapsed timestamps.
   const ended=tr.missed>=3||predicted.x<0||predicted.x>=w||predicted.y<0||predicted.y>=h;if(ended||p.length>=8){if(!tr.reported){const result=this.finish(tr);if(result){event ||= result;tr.reported=true;}}if(ended)tr.done=true;}
  }
  this.tracks=this.tracks.filter(tr=>!tr.done);candidates.forEach((p,i)=>{if(!used.has(i)&&this.tracks.length<24)this.tracks.push({id:++this.serial,points:[p],missed:0})});
  return {candidates,event,people:large.map(b=>({minX:b.minX,minY:b.minY,maxX:b.maxX,maxY:b.maxY,size:b.size})),points:this.tracks.reduce((a,b)=>a.length>b.points.length?a:b.points,[])};
 }
}
