// Browser-independent recording policy; unsupported browsers retain screen recording.
export const MIME_TYPES=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
export function extensionForMime(mime){return mime?.split(';')[0]==='video/mp4'?'mp4':mime?.split(';')[0]==='video/webm'?'webm':null}
export function selectMime(supported){for(const mime of MIME_TYPES){try{if(supported(mime))return {mime,extension:extensionForMime(mime)}}catch{}}return null}
export function recordingName(extension,date=new Date()){const p=n=>String(n).padStart(2,'0');return `殺球測速-${date.getFullYear()}${p(date.getMonth()+1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.${extension}`}
export class RecordingState {
 constructor(){this.state='idle';this.blob=null;this.empty=false}
 start(){if(!['idle','ready'].includes(this.state))return false;this.state='recording';this.blob=null;this.empty=false;return true}
 stop(){if(this.state!=='recording')return false;this.state='stopping';return true}
 ready(blob){if(this.state!=='stopping')return false;this.blob=blob;this.empty=!blob?.size;this.state='ready';return !this.empty}
 fail(){this.state='idle'}
}
export async function attachAudio(stream,getAudio,onFailure=()=>{}){let audio;try{audio=await getAudio();const tracks=audio.getAudioTracks();if(!tracks.length)throw Error('no audio');for(const track of tracks)stream.addTrack(track);return audio}catch(error){audio?.getTracks().forEach(t=>t.stop());onFailure(error);return null}}
export function elapsedTime(ms){const s=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
