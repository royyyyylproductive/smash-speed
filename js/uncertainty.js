import {metresPerPixel} from '../speed.js';
import {fitDrag} from './fit.js';
import {homographyFrom4,cameraFromHomography,groundPoint,planeFromGround,intersectRay} from './geometry.js';

// All times are real seconds. Results are metres per second.
export function monteCarlo(options, runs=200, seed=123456789){
 let x=seed>>>0; const random=()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return (x+.5)/4294967296};
 const normal=()=>Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
 const perturb=(p,s)=>({...p,x:p.x+normal()*s,y:p.y+normal()*s});
 const cal=p=>perturb(p,p.snapped?.7:1.5), values=[];
 for(let i=0;i<runs;i++)try{
  let mpp, camera, plane;
  if(options.mode==='angled'){
   const [w,l]=options.size, H=homographyFrom4([{x:0,y:0},{x:w,y:0},{x:w,y:l},{x:0,y:l}],options.corners.map(cal));
   camera=cameraFromHomography(H,options.width,options.height,options.fov);camera.f*=1+normal()*.05;
   plane=planeFromGround(...options.direction.map(p=>groundPoint(H,cal(p))));
  }else mpp=metresPerPixel(...options.points.map(cal),options.distance);
  const marks=options.marks.map(p=>{const q=perturb(p,p.sigma??(p.streak?1.5:p.snapped?.7:2));return {...(camera?intersectRay(camera,q,plane):{x:q.x*mpp,y:q.y*mpp}),time:p.time+normal()*options.timeSigma,sigma:p.sigma??2}});
  const fit=fitDrag(marks,{pixelMetres:camera?.006:mpp});if(!fit)continue;
  let value=fit.v0;if(options.impactTime>0){const t=options.impactTime+normal()*options.timeSigma,den=1-fit.k*value*t;if(den>0)value/=den}
  if(Number.isFinite(value))values.push(value);
 }catch{}
 if(values.length<runs*.5)return null;
 values.sort((a,b)=>a-b);const mean=values.reduce((a,b)=>a+b,0)/values.length, sigma=Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length);
 const quantile=p=>{const i=(values.length-1)*p,j=Math.floor(i);return values[j]+(values[Math.ceil(i)]-values[j])*(i-j)};
 return {mean,sigma,low:quantile(.025),high:quantile(.975),count:values.length};
}
