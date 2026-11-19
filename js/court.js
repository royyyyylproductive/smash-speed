import {homographyFrom4,applyH} from './geometry.js';
export const metreCorners=(w=6.10,l=13.40)=>[{x:0,y:0},{x:w,y:0},{x:w,y:l},{x:0,y:l}];
// Bounded white-line Hough transform, verified against the full badminton marking template.
export function detectCourt(image,options={}){
 const strict=detectLines(image,{...options,compressed:false});
 return strict.ok?strict:detectLines(image,{...options,compressed:true});
}
function detectLines(image,{widthM=6.10,lengthM=13.40,diagnostics=null,compressed=false}={}){
 let orientation='unknown';
 const fail=reason=>({ok:false,confidence:0,corners:[],widthM,lengthM,H:null,reason,orientation});
 if(!image?.data||image.width<32||image.height<32||!(widthM>0&&lengthM>0))return fail('畫面或場地尺寸無效');
 const scale=Math.min(1,640/image.width),w=Math.round(image.width*scale),h=Math.round(image.height*scale),mask=new Uint8Array(w*h);let pts=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(Math.min(image.height-1,Math.floor(y/scale))*image.width+Math.min(image.width-1,Math.floor(x/scale)))*4,r=image.data[i],g=image.data[i+1],b=image.data[i+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b);if(compressed?lo>80&&hi>140&&hi-lo<Math.max(40,hi*.45):lo>105&&hi-lo<Math.max(35,hi*.24)){let floor=0;for(const [dx,dy] of [[-5,0],[5,0],[0,-5],[0,5]]){const xx=Math.floor((x+dx)/scale),yy=Math.floor((y+dy)/scale);if(xx<0||xx>=image.width||yy<0||yy>=image.height)continue;const j=(yy*image.width+xx)*4,R=image.data[j],G=image.data[j+1],B=image.data[j+2];if(G>R*1.12||B>R*1.12)floor++;}if(!compressed||floor>=2){mask[y*w+x]=1;pts.push({x,y})}}}
 // Isolated texture pixels have no short collinear run; court paint does.
 const coherent=pts.filter(p=>[[1,0],[0,1],[1,1],[1,-1]].some(([dx,dy])=>{let n=0;for(let k=-2;k<=2;k++){const x=p.x+k*dx,y=p.y+k*dy;if(x>=0&&x<w&&y>=0&&y<h&&mask[y*w+x])n++;}return n>=4;}));
 mask.fill(0);for(const p of coherent)mask[p.y*w+p.x]=1;pts=coherent;
 if(pts.length<100||pts.length>w*h*.12)return fail('未能分辨白色場線，請用手動四角校準');
 const diag=Math.ceil(Math.hypot(w,h)),bins=diag*2+1,acc=new Uint16Array(180*bins),cs=[],sn=[],stride=Math.max(1,Math.ceil(pts.length/18000));
 for(let a=0;a<180;a++){cs[a]=Math.cos(a*Math.PI/180);sn[a]=Math.sin(a*Math.PI/180);for(let i=0;i<pts.length;i+=stride){const p=pts[i];acc[a*bins+Math.round(p.x*cs[a]+p.y*sn[a])+diag]++}}
 const peaks=[];for(let a=0;a<180;a++)for(let r=0;r<bins;r++){const votes=acc[a*bins+r];if(votes>Math.max(20,Math.min(w,h)*.10/stride))peaks.push({a,r:r-diag,votes})}peaks.sort((a,b)=>b.votes-a.votes);
 const lines=[];for(const p of peaks){if(lines.length>=48)break;const nx=cs[p.a],ny=sn[p.a];if(lines.some(q=>Math.abs(nx*q.nx+ny*q.ny)>.998&&Math.abs(p.r-(nx*q.nx+ny*q.ny)*q.r)<7))continue;
 let support=pts.filter(q=>Math.abs(nx*q.x+ny*q.y-p.r)<2.4);if(support.length<30)continue;
 let mx=0,my=0;for(const q of support){mx+=q.x;my+=q.y}mx/=support.length;my/=support.length;let xx=0,yy=0,xy=0;for(const q of support){xx+=(q.x-mx)**2;yy+=(q.y-my)**2;xy+=(q.x-mx)*(q.y-my)}const theta=.5*Math.atan2(2*xy,xx-yy),n={nx:-Math.sin(theta),ny:Math.cos(theta)};n.r=n.nx*mx+n.ny*my;n.votes=p.votes;lines.push(n);
 }
 if(diagnostics)diagnostics.lines=lines;
 const across=lines.filter(p=>Math.abs(p.ny)>.9).slice(0,18),along=lines.filter(p=>Math.abs(p.nx)>.25).slice(0,18);
 orientation=along.length<2?'side-or-low':'baseline-behind';
 if(along.length<2)return fail('側面或低角度畫面：請手動點選四角及球路方向');
 const intersect=(a,b)=>{const d=a.nx*b.ny-a.ny*b.nx;return Math.abs(d)<.05?null:{x:(a.r*b.ny-a.ny*b.r)/d,y:(a.nx*b.r-a.r*b.nx)/d}};
 const support=(a,b)=>{let hits=0,visible=0;const n=Math.max(20,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/3));for(let i=0;i<=n;i++){const x=Math.round(a.x+(b.x-a.x)*i/n),y=Math.round(a.y+(b.y-a.y)*i/n);if(x<0||x>=w||y<0||y>=h)continue;visible++;let found=false;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h&&mask[(y+dy)*w+x+dx])found=true;if(found)hits++}return visible>n*.2?hits/visible:0};
 // A rectangle alone is insufficient: both short-service lines, singles sidelines,
 // and the centre service markings must agree with one projective 13.4 m court.
 const verify=q=>{
 const crosses=q.map((a,n)=>{const b=q[(n+1)%4],c=q[(n+2)%4];return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)});if(!crosses.every(v=>v<0))return;
 const area=Math.abs(q.reduce((s,p,n)=>s+p.x*q[(n+1)%4].y-p.y*q[(n+1)%4].x,0))/2;
 const near=Math.hypot(q[0].x-q[1].x,q[0].y-q[1].y),far=Math.hypot(q[2].x-q[3].x,q[2].y-q[3].y),depth=(q[0].y+q[1].y-q[2].y-q[3].y)/2;
 if(Math.abs((q[0].x+q[1].x-q[2].x-q[3].x)/2)>near*.55)return;
 if(area<w*h*.08||depth<h*.16||near/depth<.85||far/near<.25||far/near>1.15)return;
 try{
 const H=homographyFrom4(metreCorners(widthM,lengthM),q);
 const line=(x,y,X,Y)=>support(applyH(H,{x,y}),applyH(H,{x:X,y:Y}));
 const edge=q.map((a,n)=>support(a,q[(n+1)%4]));
 const cropped=q[0].y>=h||q[1].y>=h;
 const edgeOK=!(edge[1]<.48||edge[3]<.48||edge[2]<.32||(!cropped&&edge[0]<.5));
 if(!edgeOK&&!diagnostics)return;
 const service=[lengthM/2-1.98,lengthM/2+1.98].map(y=>line(0,y,widthM,y));
 const singles=[.46,widthM-.46].map(x=>line(x,0,x,lengthM));
 const centre=[line(widthM/2,0,widthM/2,lengthM/2-1.98),line(widthM/2,lengthM/2+1.98,widthM/2,lengthM)];
 if(diagnostics)(diagnostics.quads ||= []).push({q,edge,service,singles,centre});
 if(!edgeOK)return;
 if(Math.min(...service)<.32||Math.max(...service)<.6||Math.min(...singles)<.4||Math.max(...centre)<.45)return;
 // Floor colour on BOTH sides of the net rejects studio frames, walls and ads.
 let floor=0,total=0;
 for(const y of [2,4,9,11])for(const x of [1,2,4,5]){const p=applyH(H,{x,y}),ix=Math.round(p.x),iy=Math.round(p.y);if(ix<0||ix>=w||iy<0||iy>=h)continue;const i=(Math.floor(iy/scale)*image.width+Math.floor(ix/scale))*4,r=image.data[i],g=image.data[i+1],b=image.data[i+2];total++;if(g>r*1.12||b>r*1.12)floor++;}
 if(floor<total*.55)return;
 const internal=(service.reduce((a,b)=>a+b,0)+singles.reduce((a,b)=>a+b,0)+centre.reduce((a,b)=>a+b,0))/6;
 const score=area*internal**3*(cropped?.8:1);return {q,score,evidence:{edge,service,singles,centre,internal},confidence:Math.min(1,(edge[1]+edge[2]+edge[3]+internal)/4),cropped};
 }catch{return;}
 };
 let best=null;for(let i=0;i<across.length;i++)for(let j=i+1;j<across.length;j++)for(let k=0;k<along.length;k++)for(let m=k+1;m<along.length;m++){
 let q=[intersect(across[i],along[k]),intersect(across[i],along[m]),intersect(across[j],along[m]),intersect(across[j],along[k])];if(q.some(p=>!p||p.x<-w*.12||p.x>w*1.12||p.y<0||p.y>h*1.2))continue;
 const rows=[[q[0],q[1]],[q[3],q[2]]].sort((a,b)=>(b[0].y+b[1].y)-(a[0].y+a[1].y));rows.forEach(r=>r.sort((a,b)=>a.x-b.x));q=[...rows[0],rows[1][1],rows[1][0]];
 const result=verify(q);if(result&&(!best||result.score>best.score))best=result;
 // A visible doubles long-service line may be the last transverse line in frame.
 // Map it to 0.76 m, then extend the already observed sidelines to y=0.
 if((q[0].y+q[1].y)/2>h*.72)try{
 const H=homographyFrom4([{x:0,y:.76},{x:widthM,y:.76},{x:widthM,y:lengthM},{x:0,y:lengthM}],q);
 const extended=metreCorners(widthM,lengthM).map(p=>applyH(H,p));
 if(extended.slice(0,2).some(p=>p.y>=h)&&extended.every(p=>p.x>=-w*.12&&p.x<=w*1.12&&p.y>=0&&p.y<h*1.2)){
 const r=verify(extended);if(r&&(!best||r.score>best.score))best=r;}
 }catch{}
 }

 if(!best)return fail('場線不足或角度太斜，請手動點選四角');const corners=best.q.map(p=>({x:p.x/scale,y:p.y/scale}));return {ok:true,confidence:best.confidence,corners,widthM,lengthM,evidence:best.evidence,orientation:'baseline-behind',inferredNearBaseline:best.cropped,H:homographyFrom4(corners,metreCorners(widthM,lengthM))};
}
