import {courtLines,drawMinimap} from './minimap.js';
import {applyH,invertH,homographyFrom4} from './geometry.js';
import {selectMime,RecordingState,attachAudio,recordingName,elapsedTime} from './record.js';
export class ChromeState {
 constructor(){this.until=0;this.recording=false}
 reveal(now){this.until=now+3000}
 hide(){this.until=0}
 visible(now){return now<this.until}
 get indicatorVisible(){return this.recording}
}
export function overlayLayout(width,height,insets={}){
 const left=(insets.left||0)+16,top=(insets.top||0)+16,right=width-(insets.right||0)-16,bottom=height-(insets.bottom||0)-16,w=right-left,h=bottom-top;
 const rect=(x,y,width,height)=>({x,y,width:Math.min(width,w),height:Math.min(height,h)});
 return {bounds:{left,top,right,bottom},timer:rect(left,top,140,28),hud:rect(left,top+38,Math.min(280,w),50),speed:rect(left,bottom-112,Math.min(230,w-92),96),minimap:rect(right-86,bottom-144,86,144)};
}
export function installBroadcast({video,courtUI}){
 const $=id=>document.getElementById(id),shell=$('broadcast'),canvas=$('broadcastCanvas'),c=canvas.getContext('2d'),chrome=$('broadcastChrome'),status=$('broadcastStatus'),record=$('broadcastRecord'),save=$('broadcastSave'),mic=$('broadcastMic'),lines=$('broadcastLines');
 const machine=new RecordingState(),chromeState=new ChromeState(),mini=document.createElement('canvas');
 let active=false,demo=false,closePending=false,recorder,stream,audio,chunks=[],started=0,lastSmash=-Infinity,speed=0,lastFrame=-1,callback,raf,blob,url,choice,session=0,preparing=false,audioWarning=false,outputWidth=0,outputHeight=0,lastMini=0,lastPaint=-Infinity,renderCost=0;
 const originalParent=video.parentNode,originalNext=video.nextSibling;
 const hint=t=>{status.textContent=t;chromeState.reveal(performance.now());sync()};
 function sync(){chrome.hidden=!chromeState.visible(performance.now());record.textContent=machine.state==='recording'?'停止錄影':machine.state==='stopping'?'正在完成…':'錄影';record.disabled=preparing||machine.state==='stopping';mic.disabled=preparing||machine.state==='recording'||machine.state==='stopping';shell.setAttribute('aria-busy',String(preparing));}
 function snapshot(){return demo?demoData():courtUI.broadcastSnapshot()}
 function insets(){const s=getComputedStyle(shell);return Object.fromEntries(['top','right','bottom','left'].map(k=>[k,parseFloat(s.getPropertyValue('--safe-'+k))||0]))}
 function dimensions(){return {w:Math.round(shell.clientWidth),h:Math.round(shell.clientHeight)}}
 function paint(now=performance.now()){
  if(!active)return;const paintStart=performance.now();const screen=dimensions();if(!outputWidth){const scale=Math.min(1,1280/Math.max(screen.w,screen.h));const nw=Math.round(screen.w*scale),nh=Math.round(screen.h*scale);if(canvas.width!==nw||canvas.height!==nh){canvas.width=nw;canvas.height=nh}}
  const w=canvas.width,h=canvas.height,viewportRatio=w/screen.w,ins=insets();for(const k in ins)ins[k]*=viewportRatio;
  const L=overlayLayout(w,h,ins),data=snapshot(),vw=demo?1280:video.videoWidth,vh=demo?720:video.videoHeight;
  c.fillStyle='#080f1c';c.fillRect(0,0,w,h);const scale=Math.max(w/(vw||w),h/(vh||h)),ox=(w-vw*scale)/2,oy=(h-vh*scale)/2;
  if(demo)drawDemo(c,w,h);else if(video.readyState>=2)c.drawImage(video,ox,oy,vw*scale,vh*scale);
  const xy=p=>({x:ox+p.x*scale,y:oy+p.y*scale});for(const p of data.players||[]){const q=xy(p.foot);c.fillStyle='#c7f36b';c.beginPath();c.arc(q.x,q.y,5,0,7);c.fill();c.font='bold 12px system-ui';c.fillText(p.name,q.x+7,q.y-7)}
  const path=points=>{c.beginPath();points.forEach((p,i)=>{const q=xy(p);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y)});c.stroke()};
  if(data.H&&lines.checked){c.strokeStyle='#c7f36b99';c.lineWidth=1.5;try{const inverse=invertH(data.H);for(const line of courtLines(data.widthM,data.lengthM))path(line.map(([x,y])=>applyH(inverse,{x,y})))}catch{}}
  c.strokeStyle='#65d8e6';c.lineWidth=2.5;path(data.points||[]);c.fillStyle='#c7f36b';for(const p of (data.points||[]).slice(-40)){const q=xy(p);c.beginPath();c.arc(q.x,q.y,2.8,0,7);c.fill()}
  const box=(r)=>{c.fillStyle='#080f1cdd';c.fillRect(r.x,r.y,r.width,r.height)};
  box(L.hud);c.fillStyle='#c7f36b';c.font='bold 15px system-ui';c.fillText(data.score||'近場 0 : 0 遠場',L.hud.x+10,L.hud.y+20,L.hud.width-20);c.fillStyle='#f1f6fa';c.font='11px system-ui';c.fillText(data.playerStatus||data.hud||'等待擊球',L.hud.x+10,L.hud.y+39,L.hud.width-20);
  if(data.H){if(now-lastMini>(renderCost>12?600:160)){drawMinimap(mini,data.H,data.points||[],data);lastMini=now}box(L.minimap);c.drawImage(mini,L.minimap.x,L.minimap.y,L.minimap.width,L.minimap.height)}
  else {c.fillStyle='#f1f6fa';c.font='12px system-ui';c.fillText('請先完成設定及校準場地；可先用鏡頭控制構圖',L.bounds.left,L.bounds.bottom-12,w-32)}
  const age=demo?400:now-lastSmash;if(speed>0&&age<4700){const alpha=Math.min(1,age/160,(4700-age)/700),r=L.speed;c.save();c.globalAlpha=Math.max(0,alpha);const pop=1+(renderCost>12?0:.12)*Math.max(0,1-age/260);c.translate(r.x,r.y+r.height);c.scale(pop,pop);c.fillStyle='#080f1cbb';c.fillRect(0,-r.height,r.width,r.height);c.fillStyle='#65d8e6';c.font='bold 11px system-ui';c.fillText('上一球 · 殺球',10,-72);c.fillStyle='#c7f36b';c.font=`900 ${Math.min(52,r.width/3.3)}px system-ui`;c.fillText(speed.toFixed(0),8,-20);c.font='bold 12px system-ui';c.fillText('km/h',10,-4);c.restore()}
  if(demo){c.fillStyle='#c7f36b';c.font='bold 13px system-ui';c.fillText('DEMO · 示範畫面',L.bounds.left+150,L.timer.y+19,w-180)}
  if(chromeState.indicatorVisible){box(L.timer);c.fillStyle='#ff525e';c.beginPath();c.arc(L.timer.x+12,L.timer.y+14,4,0,7);c.fill();c.fillStyle='#fff';c.font='bold 14px system-ui';c.fillText('REC '+elapsedTime(now-started),L.timer.x+24,L.timer.y+19)}
  if(audioWarning&&chromeState.recording){c.fillStyle='#f1f6fa';c.font='11px system-ui';c.fillText('咪高峰未能啟用 · 無聲錄影',L.bounds.left,L.hud.y+L.hud.height+17,w-32)}
  renderCost=performance.now()-paintStart;sync();
 }
 function schedule(){if(!active)return;if(demo){raf=requestAnimationFrame(now=>{if(now-lastFrame>33){lastFrame=now;paint(now)}schedule()})}else if(video.requestVideoFrameCallback)callback=video.requestVideoFrameCallback(now=>{if(now-lastPaint>=1000/30){lastPaint=now;paint(now)}schedule()});else raf=requestAnimationFrame(now=>{if(video.currentTime!==lastFrame){lastFrame=video.currentTime;paint(now)}schedule()})}
 async function open(isDemo=false){if(active)return;if(!isDemo&&video.readyState<2){$('liveStatus').textContent='請先開啟鏡頭，再撳轉播畫面。';return}demo=isDemo;active=true;shell.hidden=false;document.body.classList.add('broadcast-active');shell.prepend(video);if(!demo)shell.requestFullscreen?.().catch(()=>{});video.classList.add('broadcast-video');lines.checked=!!snapshot().H;chromeState.reveal(performance.now());if(demo){speed=286;lastSmash=performance.now()}paint();schedule();if(!demo&&video.paused){try{await video.play()}catch{hint('鏡頭暫停，請返回即時畫面檢查。')}}}
 function close(){if(preparing)return;if(machine.state==='recording'||machine.state==='stopping'){closePending=true;stop();return}closePending=false;active=false;video.cancelVideoFrameCallback?.(callback);cancelAnimationFrame(raf);originalParent.insertBefore(video,originalNext);video.classList.remove('broadcast-video');shell.hidden=true;document.body.classList.remove('broadcast-active');if(document.fullscreenElement===shell)document.exitFullscreen?.().catch(()=>{});}
 function release(){stream?.getTracks().forEach(t=>t.stop());audio?.getTracks().forEach(t=>t.stop());stream=null;audio=null;outputWidth=outputHeight=0;chromeState.recording=false;sync()}
 async function start(){if(preparing||!['idle','ready'].includes(machine.state))return;if(!globalThis.MediaRecorder||!canvas.captureStream){hint('此瀏覽器未支援應用程式內錄影；你仍可用手機螢幕錄影。');return}choice=selectMime(m=>MediaRecorder.isTypeSupported(m));if(!choice){hint('未有支援的影片格式；你仍可用手機螢幕錄影。');return}
  const run=++session;audioWarning=false;const warnAudio=()=>{audioWarning=true;hint('未能啟用咪高峰，會繼續錄製無聲影片。')};preparing=true;sync();try{paint();outputWidth=canvas.width;outputHeight=canvas.height;stream=canvas.captureStream(30);if(mic.checked)audio=await attachAudio(stream,()=>navigator.mediaDevices.getUserMedia({audio:true,video:false}),warnAudio);if(run!==session||!active||document.hidden){release();return}const makeRecorder=()=>new MediaRecorder(stream,{mimeType:choice.mime});try{recorder=makeRecorder()}catch(error){if(!audio)throw error;for(const track of stream.getAudioTracks())stream.removeTrack(track);audio.getTracks().forEach(t=>t.stop());audio=null;warnAudio();recorder=makeRecorder()}chunks=[];blob=null;save.hidden=true;$('liveRecordingSave').hidden=true;recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};recorder.onerror=e=>{machine.fail();release();hint('錄影失敗：'+(e.error?.name||'瀏覽器錯誤')+'。可改用手機螢幕錄影。')};recorder.onstop=()=>{if(machine.state==='recording')machine.stop();blob=new Blob(chunks,{type:recorder.mimeType||choice.mime});const ok=machine.ready(blob);release();save.hidden=!ok;$('liveRecordingSave').hidden=!ok;if(active)paint();hint(ok?'影片已完成，撳「儲存／分享」。':'影片內容係空白，請錄耐少少再試；亦可用螢幕錄影。');if(closePending)close()};try{recorder.start()}catch(error){if(!audio)throw error;for(const track of stream.getAudioTracks())stream.removeTrack(track);audio.getTracks().forEach(t=>t.stop());audio=null;warnAudio();const old=recorder;recorder=makeRecorder();recorder.ondataavailable=old.ondataavailable;recorder.onerror=old.onerror;recorder.onstop=old.onstop;recorder.start()}machine.start();started=performance.now();chromeState.recording=true;chromeState.hide();paint();}catch(e){machine.fail();release();hint('無法開始錄影：'+e.name+'。你仍可用手機螢幕錄影。')}finally{preparing=false;sync()}}
 function stop(){if(preparing){session++;return}if(!machine.stop())return;try{if(recorder.state==='recording'){try{recorder.requestData()}catch{}recorder.stop()}}catch(e){machine.fail();release();hint('未能完成影片：'+e.name+'。請用手機螢幕錄影。')}sync()}
 async function exportVideo(){if(!blob?.size)return;const ext=blob.type.startsWith('video/mp4')?'mp4':'webm',file=new File([blob],recordingName(ext),{type:blob.type});try{if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'殺球測速'});return}}catch{}
  if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);const a=$('broadcastDownload');a.href=url;a.download=file.name;a.hidden=false;if(/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1)){a.target='_blank';a.textContent='開啟影片並儲存';a.click()}else{a.textContent='下載影片';a.click()}hint('已準備影片；如未自動儲存，請撳影片連結。')}
 $('broadcastOpen').onclick=()=>open();$('broadcastClose').onclick=close;record.onclick=()=>machine.state==='recording'?stop():start();save.onclick=exportVideo;$('liveRecordingSave').onclick=exportVideo;
 shell.addEventListener('pointerdown',e=>{chromeState.reveal(performance.now());sync();if(e.target===canvas)paint()});
 lines.onchange=()=>paint();window.addEventListener('resize',()=>{if(machine.state==='recording'&&((canvas.width>canvas.height)!==(shell.clientWidth>shell.clientHeight))){stop();hint('手機方向已改變，正在完成目前影片。')}paint()});document.addEventListener('keydown',e=>{if(active&&e.key==='Escape')close()});
 const finalize=()=>{session++;stop()};window.addEventListener('pagehide',finalize);document.addEventListener('visibilitychange',()=>{if(document.hidden)finalize()});
 // Chrome timeout is independent of camera frames (including a paused camera).
 setInterval(()=>{if(active)sync()},200);
 if(new URLSearchParams(location.search).get('broadcastDemo')==='1')open(true);
 return {shot(e){if(e.smash){speed=e.speedKmh;lastSmash=performance.now()}}};
 function demoData(){const corners=[{x:180,y:660},{x:1100,y:660},{x:850,y:170},{x:430,y:170}],H=homographyFrom4(corners,[{x:0,y:0},{x:6.1,y:0},{x:6.1,y:13.4},{x:0,y:13.4}]);return {H,widthM:6.1,lengthM:13.4,points:Array.from({length:14},(_,i)=>({x:560+i*14,y:280+i*14+i*i*.65})),score:'近場 12 : 9 遠場',hud:'第 8 拍 · 殺球 3 次 · 上一球 286 km/h'}}
 function drawDemo(c,w,h){const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#172c43');g.addColorStop(1,'#080f1c');c.fillStyle=g;c.fillRect(0,0,w,h);const scale=Math.max(w/1280,h/720),x=(w-1280*scale)/2,y=(h-720*scale)/2;c.save();c.translate(x,y);c.scale(scale,scale);c.fillStyle='#17434a';c.beginPath();c.moveTo(180,660);c.lineTo(1100,660);c.lineTo(850,170);c.lineTo(430,170);c.closePath();c.fill();c.strokeStyle='#65d8e644';for(let i=0;i<8;i++){c.beginPath();c.moveTo(0,i*100);c.lineTo(1280,i*100);c.stroke()}for(const [px,py] of [[550,430],[780,270]]){c.fillStyle='#a4b4c7';c.beginPath();c.arc(px,py-45,11,0,7);c.fill();c.strokeStyle='#c7f36b';c.lineWidth=9;c.beginPath();c.moveTo(px,py-30);c.lineTo(px,py);c.lineTo(px-17,py+25);c.moveTo(px,py);c.lineTo(px+18,py+25);c.moveTo(px-20,py-12);c.lineTo(px+25,py-32);c.stroke()}c.restore()}
}
