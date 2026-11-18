// Fit distance along a total-least-squares direction, avoiding noise-biased
// cumulative segment lengths. Times are seconds and coordinates are metres.
export function fitDrag(marks, {pixelMetres=0.006, prior=0.22}={}) {
 if(marks.length<2) return null;
 const dims=marks.some(p=>Number.isFinite(p.z))?['x','y','z']:['x','y'];
 if(marks.some((p,i)=>!Number.isFinite(p.time)||dims.some(d=>!Number.isFinite(p[d]))||(i&&p.time<=marks[i-1].time)))return null;
 const t0=marks[0].time, ts=marks.map(p=>p.time-t0), mean=dims.map(d=>marks.reduce((s,p)=>s+p[d],0)/marks.length);
 let dir=dims.map((d,j)=>marks.at(-1)[d]-marks[0][d]), n=Math.hypot(...dir); if(!n)return null; dir=dir.map(x=>x/n);
 for(let q=0;q<12;q++){const next=dims.map((d,j)=>marks.reduce((s,p)=>s+(p[d]-mean[j])*dims.reduce((v,e,k)=>v+(p[e]-mean[k])*dir[k],0),0));n=Math.hypot(...next);if(!n)return null;dir=next.map(x=>x/n)}
 if(dims.reduce((s,d,j)=>s+(marks.at(-1)[d]-marks[0][d])*dir[j],0)<0)dir=dir.map(x=>-x);
 const y=marks.map(p=>dims.reduce((s,d,j)=>s+(p[d]-mean[j])*dir[j],0));
 const path=(v,k,t)=>k<1e-8?v*t:Math.log1p(k*v*t)/k;
 let active=marks.map((_,i)=>i), rejected=[], result;
 function solve(indices){
  const span=ts[indices.at(-1)]-ts[indices[0]], slope=(y[indices.at(-1)]-y[indices[0]])/span;
  let v=Math.max(0.01,slope*(1+prior*Math.max(0,slope)*span/2)),k=prior,s0=y[0],lambda=1e-3;
  const free=indices.length>=4;
  // A weak physically plausible prior stabilizes the poorly observable drag term.
  function cost(a,b,c){return indices.reduce((s,i)=>s+(y[i]-c-path(a,b,ts[i]))**2,0)+(free?((b-prior)*pixelMetres*2)**2:0)}
  for(let it=0;it<60;it++){
   let A=0,B=0,C=0,D=0,E=0,F=0,g=0,h=0,j=0;
   for(const i of indices){const t=ts[i],r=y[i]-s0-path(v,k,t),dv=t/(1+k*v*t),dk=k<1e-6?-.5*v*v*t*t:(k*v*t/(1+k*v*t)-Math.log1p(k*v*t))/(k*k);A+=dv*dv;B+=dv*dk;C+=dv;D+=dk*dk;E+=dk;F++;g+=dv*r;h+=dk*r;j+=r}
   if(free){const w=(pixelMetres*2)**2;D+=w;h+=w*(prior-k)}else{D=1;B=E=h=0}
   A+=lambda;D+=lambda;F+=lambda;
   const det=A*(D*F-E*E)-B*(B*F-E*C)+C*(B*E-D*C);if(Math.abs(det)<1e-20)break;
   const dv=(g*(D*F-E*E)-B*(h*F-E*j)+C*(h*E-D*j))/det,dk=(A*(h*F-E*j)-g*(B*F-E*C)+C*(B*j-h*C))/det,ds=(A*(D*j-h*E)-B*(B*j-h*C)+g*(B*E-D*C))/det;
   const nv=Math.max(.01,v+dv),nk=free?Math.max(0,Math.min(.6,k+dk)):prior,ns=s0+ds;
   if(cost(nv,nk,ns)<cost(v,k,s0)){v=nv;k=nk;s0=ns;lambda*=.4}else lambda*=5;
  }
  const residuals=y.map((p,i)=>p-s0-path(v,k,ts[i]));
  const rms=Math.sqrt(indices.reduce((s,i)=>s+residuals[i]**2,0)/indices.length);
  const mt=indices.reduce((s,i)=>s+ts[i],0)/indices.length,den=indices.reduce((s,i)=>s+(ts[i]-mt)**2,0);
  return {v0:v,k,s0,residuals,rmsPx:rms/pixelMetres,sigma:den?Math.sqrt(indices.reduce((s,i)=>s+residuals[i]**2,0)/Math.max(1,indices.length-(free?3:2))/den):NaN};
 }
 // Seed the fit with the most consistent three-point trajectory. The drag
 // prior keeps these minimal fits stable even over a short frame span.
 if(marks.length>=5){
  let best=null, bestScore=Infinity;
  for(let a=0;a<marks.length-2;a++)for(let b=a+1;b<marks.length-1;b++)for(let c=b+1;c<marks.length;c++){
   const candidate=solve([a,b,c]), errors=candidate.residuals.map((r,i)=>Math.abs(r)/(pixelMetres*(marks[i].sigma||2))).sort((x,y)=>x-y);
   const score=errors.slice(0,marks.length-Math.floor(marks.length*.25)).reduce((sum,e)=>sum+e*e,0);
   if(score<bestScore){bestScore=score;best=candidate}
  }
  if(best){const suspects=best.residuals.map((r,i)=>({i,e:Math.abs(r)/(pixelMetres*(marks[i].sigma||2))})).filter(x=>x.e>2.5).sort((a,b)=>b.e-a.e).slice(0,Math.floor(marks.length*.25));rejected=suspects.map(x=>x.i);active=active.filter(i=>!rejected.includes(i))}
 }
 for(;;){result=solve(active);if(rejected.length>=Math.floor(marks.length*.25)||active.length<=3)break;const sorted=active.map(i=>result.residuals[i]).sort((a,b)=>a-b),med=sorted[Math.floor(sorted.length/2)],dev=sorted.map(x=>Math.abs(x-med)).sort((a,b)=>a-b),threshold=Math.max(3*1.4826*dev[Math.floor(dev.length/2)],1.5*pixelMetres);let worst=active.reduce((a,b)=>Math.abs(result.residuals[a]-med)>Math.abs(result.residuals[b]-med)?a:b);if(Math.abs(result.residuals[worst]-med)<=threshold)break;active=active.filter(i=>i!==worst);rejected.push(worst)}
 return {...result,rejected,average:(path(result.v0,result.k,ts.at(-1))-path(result.v0,result.k,ts[0]))/(ts.at(-1)-ts[0])};
}
