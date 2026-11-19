import {applyH} from './geometry.js';
export function attributeShot(points,players,{H,lengthM=13.4}={}){if(!points?.length||!players.length)return {playerId:null,name:'未能辨認',side:null,confidence:0};let start=points[0];try{if(H)start=applyH(H,start)}catch{return {playerId:null,name:'未能辨認',side:null,confidence:0}}const side=H?(start.y<lengthM/2?'near':'far'):null;const ranked=players.filter(p=>!side||p.side===side).map(p=>{const pos=H?p.court:p.foot;return {...p,d:pos?Math.hypot(pos.x-start.x,pos.y-start.y):Infinity}}).sort((a,b)=>a.d-b.d);const p=ranked[0];if(!p||!Number.isFinite(p.d))return {playerId:null,name:'未能辨認',side,confidence:0};return {playerId:p.id,name:p.name,side:p.side,confidence:H?Math.max(0,Math.min(.85,1-p.d/5,ranked[1]?(ranked[1].d-p.d)/3:.7)):.25}}
export class Rally{
 constructor(){this.score={near:0,far:0};this.next()}
 next(){this.shots=[];this.suggested=false;this.dismissedAt=0}
 add(shot){const s={...shot,index:this.shots.length+1,timestamp:shot.timestamp??Date.now()};this.shots.push(s);this.suggested=false;return s}
 get stats(){const n=this.shots.length,seconds=n>1?(this.shots.at(-1).timestamp-this.shots[0].timestamp)/1000:0;return {count:n,smashes:this.shots.filter(s=>s.smash===true).length,seconds,pace:n>1?seconds/(n-1):0}}
 suggest(now=Date.now(),gap=4000){this.suggested=!!this.shots.length&&now-Math.max(this.shots.at(-1).timestamp,this.dismissedAt)>=gap;return this.suggested}
 dismiss(now=Date.now()){this.suggested=false;this.dismissedAt=now}
 adjust(side,delta){if(side in this.score)this.score[side]=Math.max(0,this.score[side]+delta)}
 confirm(side){if(!this.suggested)return false;this.adjust(side,1);this.next();return true}
}
