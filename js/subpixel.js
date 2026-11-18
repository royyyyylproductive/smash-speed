// Weighted difference moments in image pixel coordinates.
export function refineDifference(previous,current,next=null,{fraction=.25,minContrast=15}={}){
 const {width:w,height:h,data:b}=current;if(!previous||previous.width!==w||previous.height!==h||next&&(next.width!==w||next.height!==h))return null;
 const lum=(a,i)=>.2126*a[i]+.7152*a[i+1]+.0722*a[i+2],weights=new Float32Array(w*h);let max=0;
 for(let i=0;i<w*h;i++){let j=i*4,d=Math.abs(lum(b,j)-lum(previous.data,j));if(next)d=Math.min(d,Math.abs(lum(b,j)-lum(next.data,j)));weights[i]=d;max=Math.max(max,d)}if(max<minContrast)return null;
 let sum=0,x=0,y=0;for(let i=0;i<weights.length;i++){let a=weights[i];if(a<max*fraction)continue;sum+=a;x+=a*(i%w);y+=a*Math.floor(i/w)}if(!sum)return null;x/=sum;y/=sum;
 let xx=0,xy=0,yy=0;for(let i=0;i<weights.length;i++){let a=weights[i];if(a<max*fraction)continue;let dx=i%w-x,dy=Math.floor(i/w)-y;xx+=a*dx*dx;xy+=a*dx*dy;yy+=a*dy*dy}xx/=sum;xy/=sum;yy/=sum;let root=Math.hypot(xx-yy,2*xy),major=Math.sqrt(Math.max(0,(xx+yy+root)/2)),minor=Math.sqrt(Math.max(0,(xx+yy-root)/2)),elongation=major/Math.max(minor,1e-9);return {x,y,major,minor,orientation:.5*Math.atan2(2*xy,xx-yy),elongation,streak:elongation>2,contrast:max};
}

// Fallback when adjacent frames are unavailable: contrast against the patch median.
export function refineLocalMedian(current, options={}) {
 const {width,height,data}=current, values=[];
 for(let i=0;i<width*height;i++)values.push(.2126*data[4*i]+.7152*data[4*i+1]+.0722*data[4*i+2]);
 values.sort((a,b)=>a-b);const median=values[Math.floor(values.length/2)], background=new Uint8ClampedArray(data.length);
 for(let i=0;i<width*height;i++){background[4*i]=background[4*i+1]=background[4*i+2]=median;background[4*i+3]=255}
 return refineDifference({width,height,data:background},current,null,options);
}

// Deterministic RANSAC followed by orthogonal least-squares refinement.
export function snapLineCorner({width:w,height:h,data}){
 const pixels=[],lum=[];for(let i=0;i<w*h;i++)lum.push(.2126*data[i*4]+.7152*data[i*4+1]+.0722*data[i*4+2]);
 const sorted=[...lum].sort((a,b)=>a-b),med=sorted[Math.floor(sorted.length/2)],threshold=med+Math.max(15,(sorted.at(-1)-med)*.35);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(lum[y*w+x]>threshold)pixels.push({x,y});
 if(pixels.length<12)return null;
 let seed=12345;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 function line(points){if(points.length<8)return null;let best=[];for(let k=0;k<500;k++){const a=points[Math.floor(rand()*points.length)],b=points[Math.floor(rand()*points.length)],dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy);if(n<8)continue;const inliers=points.filter(p=>Math.abs(dy*(p.x-a.x)-dx*(p.y-a.y))/n<1.5);if(inliers.length>best.length)best=inliers}if(best.length<8)return null;const cx=best.reduce((s,p)=>s+p.x,0)/best.length,cy=best.reduce((s,p)=>s+p.y,0)/best.length;let xx=0,xy=0,yy=0;for(const p of best){xx+=(p.x-cx)**2;xy+=(p.x-cx)*(p.y-cy);yy+=(p.y-cy)**2}const a=.5*Math.atan2(2*xy,xx-yy);return {x:cx,y:cy,dx:Math.cos(a),dy:Math.sin(a)}}
 const a=line(pixels);if(!a)return null;const remaining=pixels.filter(p=>Math.abs(a.dy*(p.x-a.x)-a.dx*(p.y-a.y))>2);const b=line(remaining);if(!b)return null;const det=a.dx*b.dy-a.dy*b.dx;if(Math.abs(det)<Math.sin(20*Math.PI/180))return null;const t=((b.x-a.x)*b.dy-(b.y-a.y)*b.dx)/det,x=a.x+t*a.dx,y=a.y+t*a.dy;return x>=0&&x<w&&y>=0&&y<h?{x,y}:null;
}
