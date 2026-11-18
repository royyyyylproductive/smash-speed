// Connected components of absolute luminance changes. With a next frame,
// intersection of both differences selects the object's current position.
export function findMotion(previous, current, {next=null, threshold=45, minPixels=2, maxPixels=500, center=null, radius=Infinity, includeBounds=false}={}) {
 const {width:w,height:h,data:b}=current, a=previous.data;
 if(previous.width!==w||previous.height!==h||a.length!==b.length || (next && (next.width!==w||next.height!==h||next.data.length!==b.length))) return [];
 const mask=new Uint8Array(w*h), seen=new Uint8Array(w*h), weights=new Float32Array(w*h);
 const lum=(data,j)=>0.2126*data[j]+0.7152*data[j+1]+0.0722*data[j+2];
 for(let y=0;y<h;y++) for(let x=0;x<w;x++) {const i=y*w+x,j=i*4;if(center&&Math.hypot(x-center.x,y-center.y)>radius)continue; const d=Math.abs(lum(b,j)-lum(a,j)); const d2=next?Math.abs(lum(b,j)-lum(next.data,j)):d; if(d>=threshold&&d2>=threshold){mask[i]=1;weights[i]=Math.min(d,d2);}}
 const blobs=[];
 for(let i=0;i<mask.length;i++){if(!mask[i]||seen[i])continue;let q=[i],sx=0,sy=0,weight=0,minX=w,minY=h,maxX=0,maxY=0;seen[i]=1;for(let n=0;n<q.length;n++){const p=q[n],x=p%w,y=Math.floor(p/w),wt=weights[p];if(includeBounds){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}sx+=x*wt;sy+=y*wt;weight+=wt;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,k=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[k]&&!seen[k]){seen[k]=1;q.push(k);}}}if(q.length>=minPixels&&q.length<=maxPixels)blobs.push({x:sx/weight,y:sy/weight,size:q.length,brightness:weight,...(includeBounds?{minX,minY,maxX,maxY}:{})});}
 return blobs.sort((a,b)=>center ? (Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y)) || a.size-b.size : a.size-b.size || b.brightness-a.brightness);
}
