export function poseInput(width,height,roi,size=256){
 let x=0,y=0,w=width,h=height;
 if(roi?.length>=3){const xs=roi.map(p=>p.x),ys=roi.map(p=>p.y),padX=(Math.max(...xs)-Math.min(...xs))*.08,padY=(Math.max(...ys)-Math.min(...ys))*.18;x=Math.max(0,Math.min(...xs)-padX);y=Math.max(0,Math.min(...ys)-padY);w=Math.min(width,Math.max(...xs)+padX)-x;h=Math.min(height,Math.max(...ys)+padY)-y}
 if(!(w>0&&h>0))return poseInput(width,height,null,size);
 const scale=Math.min(size/w,size/h);return {x,y,w,h,scale,px:(size-w*scale)/2,py:(size-h*scale)/2,size};
}
export const toModel=(p,t)=>({x:((p.x-t.x)*t.scale+t.px)/t.size,y:((p.y-t.y)*t.scale+t.py)/t.size});
export const fromModel=(p,t)=>({...p,x:(p.x*t.size-t.px)/t.scale+t.x,y:(p.y*t.size-t.py)/t.scale+t.y});
export function mapPerson(p,t){const a=fromModel(p.box,t);return {...p,foot:fromModel(p.foot,t),keypoints:p.keypoints?.map(k=>fromModel(k,t)),box:{...a,width:p.box.width*t.size/t.scale,height:p.box.height*t.size/t.scale}}}
