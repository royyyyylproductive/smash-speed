export function classifyCamera(label=''){
 if(/front|user|前|自拍|facetime/i.test(label))return 'front';
 if(/ultra|超廣|dual wide|triple/i.test(label))return 'ultra';
 if(/tele|望遠|長焦/i.test(label))return 'tele';
 return 'main';
}
export function rearDevices(devices){return devices.filter(d=>d.kind==='videoinput'&&classifyCamera(d.label)!=='front').sort((a,b)=>(classifyCamera(a.label)==='ultra'?0:1)-(classifyCamera(b.label)==='ultra'?0:1))}
export function clampZoom(value,caps){return Math.max(caps.min,Math.min(caps.max,Number(value)||1))}
export function zoomOptions(caps){if(!caps||!Number.isFinite(caps.min)||!Number.isFinite(caps.max))return [];return [...new Set([caps.min,...(caps.min<=1&&caps.max>=1?[1]:[])])].map(value=>({value,label:value<1?'超廣角':'主鏡頭'}))}
export function cameraConstraints(rate,deviceId){return {audio:false,video:{facingMode:{ideal:'environment'},frameRate:{ideal:rate},...(deviceId?{deviceId:{exact:deviceId}}:{})}}}
export function zoomConstraint(value,caps){return {advanced:[{zoom:clampZoom(value,caps)}]}}
