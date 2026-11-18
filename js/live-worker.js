import {LiveDetector} from './live.js';
let detector;
self.onmessage=({data:m})=>{try{if(m.type==='init'){detector=new LiveDetector(m.options);self.postMessage({ready:true});}else if(m.type==='frame'&&detector){const frame={width:m.width,height:m.height,data:new Uint8ClampedArray(m.buffer)};self.postMessage({...detector.push(frame,m.t),t:m.t});}}catch(e){self.postMessage({error:e.message});}};
