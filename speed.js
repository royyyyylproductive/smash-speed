export const distancePx = (a,b) => Math.hypot(b.x-a.x,b.y-a.y);
export function metresPerPixel(a,b,metres) { const d=distancePx(a,b); return d>0 && metres>0 ? metres/d : NaN; }
export function speedMs(dist,mpp,dt) { return dist>=0 && mpp>0 && dt>0 ? dist*mpp/dt : NaN; }
export const msToKmh = v => v*3.6;
export const timeBetweenFrames = (frames,fps) => fps>0 ? frames/fps : NaN;
export const realDt = (dt,timelineFps,captureFps,slowed) => slowed ? (timelineFps>0 && captureFps>0 ? dt*timelineFps/captureFps : NaN) : dt;
export function fitSpeed(marks,mpp,timeFn=(a,b)=>b.time-a.time) {
 if(marks.length<2 || !(mpp>0)) return NaN;
 let distance=0; const points=[[0,0]];
 for(let i=1;i<marks.length;i++){ distance+=distancePx(marks[i-1],marks[i])*mpp; points.push([timeFn(marks[0],marks[i]),distance]); }
 if(points.some(([t],i)=>!Number.isFinite(t)||(i>0&&t<=points[i-1][0]))) return NaN;
 const mt=points.reduce((s,p)=>s+p[0],0)/points.length, md=points.reduce((s,p)=>s+p[1],0)/points.length;
 const den=points.reduce((s,p)=>s+(p[0]-mt)**2,0); return den ? points.reduce((s,p)=>s+(p[0]-mt)*(p[1]-md),0)/den : NaN;
}
export const frameAt = (time, fps) => Math.floor(time * fps + 1e-3);
export const frameTime = (frameIndex, fps) => (frameIndex + 0.5) / fps;
