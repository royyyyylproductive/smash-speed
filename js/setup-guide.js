export const cornerNames=['左近（靠近你、左手邊底線角）','右近（靠近你、右手邊底線角）','右遠（遠離你、右手邊底線角）','左遠（遠離你、左手邊底線角）'];
export class SetupGuide{
 constructor(){this.camera=false;this.framed=false;this.court=false;this.player=false;this.live=false;this.corners=0;this.continued=false}
 event(type,value=true){if(type==='resolution'){this.court=this.player=this.continued=false;this.corners=0}else if(type==='player'){if(this.court&&this.live)this.player=!!value}else if(type==='court'){this.court=this.camera&&!!value}else if(type==='corners')this.corners=Math.max(0,Math.min(4,value));else if(type==='continue'){if(this.court&&this.live)this.continued=true}else if(['camera','framed','live'].includes(type))this[type]=!!value;return this}
 get step(){return !this.camera?1:!this.framed?2:!this.court?3:!this.player&&!this.continued?4:5}
 get instruction(){return ['開啟鏡頭','調校鏡頭，令成個場入晒畫面',`校準場地 · 第 ${Math.min(4,this.corners+1)}／4 步：${cornerNames[Math.min(3,this.corners)]}`,'識別球員 · 請球員走進場內…','可以開始測速'][this.step-1]}
}
