// Read box headers and the few metadata fields needed; media data is never loaded.
async function read(blob, start, length) {
  if (start < 0 || length < 0 || start + length > blob.size) throw new Error('無效的影片檔案');
  return new DataView(await blob.slice(start, start + length).arrayBuffer());
}
const text = (view, offset, length) => String.fromCharCode(...Array.from({length}, (_, i) => view.getUint8(offset + i)));
function u64(view, offset) {
  const n = view.getUint32(offset) * 4294967296 + view.getUint32(offset + 4);
  if (!Number.isSafeInteger(n)) throw new Error('影片資料過大');
  return n;
}
async function boxes(blob, start, end) {
  const result = [];
  while (start + 8 <= end) {
    const head = await read(blob, start, Math.min(16, end - start));
    let size = head.getUint32(0), header = 8;
    if (size === 1) { if (head.byteLength < 16) throw new Error('無效的影片區塊'); size = u64(head, 8); header = 16; }
    else if (size === 0) size = end - start;
    if (size < header || start + size > end) throw new Error('無效的影片區塊');
    result.push({type:text(head, 4, 4), start:start + header, end:start + size});
    start += size;
  }
  return result;
}
async function child(blob, parent, type) { return (await boxes(blob, parent.start, parent.end)).find(b => b.type === type); }
async function fields(blob, box, bytes) { if (!box || box.end - box.start < bytes) throw new Error('缺少影片資料'); return read(blob, box.start, bytes); }
export function buildPts(stts, ctts=[], timescale=1, offset=0, limit=20000) {
 const total=stts.reduce((s,e)=>s+e.count,0); if(total>limit||!timescale)return null;
 const offsets=[];for(const e of ctts)for(let i=0;i<e.count;i++)offsets.push(e.offset);
 if(ctts.length&&offsets.length!==total)return null;
 let dts=0,idx=0;const pts=[];for(const e of stts)for(let i=0;i<e.count;i++){pts.push((dts+(offsets[idx++]||0)-offset)/timescale);dts+=e.delta}
 return pts.sort((a,b)=>a-b);
}
export function nearestPts(pts,time){let l=0,r=pts.length-1;while(l<r){const m=(l+r)>>1;if(pts[m]<time)l=m+1;else r=m}return l&&Math.abs(pts[l-1]-time)<=Math.abs(pts[l]-time)?l-1:l}
export async function mp4Fps(blob) {
  const moov = (await boxes(blob, 0, blob.size)).find(b => b.type === 'moov');
  if (!moov) throw new Error('找不到影片資料');
  for (const trak of (await boxes(blob, moov.start, moov.end)).filter(b => b.type === 'trak')) {
    const mdia = await child(blob, trak, 'mdia'); if (!mdia) continue;
    const hdlr = await child(blob, mdia, 'hdlr'); if (!hdlr || text(await fields(blob, hdlr, 12), 8, 4) !== 'vide') continue;
    const mdhd = await child(blob, mdia, 'mdhd'), tkhd = await child(blob, trak, 'tkhd');
    const version = (await fields(blob, mdhd, 1)).getUint8(0);
    if (version > 1) throw new Error('不支援的時間資料');
    const md = await fields(blob, mdhd, version ? 32 : 20);
    const timescale = md.getUint32(version ? 20 : 12), duration = version ? u64(md, 24) : md.getUint32(16);
    if (!tkhd || tkhd.end - tkhd.start < 8) throw new Error('缺少影片尺寸');
    const tk = await read(blob, tkhd.end - 8, 8);
    const width = tk.getUint32(0) / 65536, height = tk.getUint32(4) / 65536;
    const minf = await child(blob, mdia, 'minf'), stbl = minf && await child(blob, minf, 'stbl'), stts = stbl && await child(blob, stbl, 'stts');
    const st = await fields(blob, stts, 8), entries = st.getUint32(4);
    if (!timescale || !duration || !entries || entries > (stts.end - stts.start - 8) / 8) throw new Error('無效的時間資料');
    let sampleCount = 0, minDelta = Infinity, maxDelta = 0, timing = [];
    // Read bounded chunks even for exceptionally large sample tables.
    for (let i = 0; i < entries; i += 4096) {
      const n = Math.min(4096, entries - i), chunk = await read(blob, stts.start + 8 + i * 8, n * 8);
      for (let j = 0; j < n; j++) { const count = chunk.getUint32(j * 8), delta = chunk.getUint32(j * 8 + 4); if (!delta) throw new Error('無效的時間資料'); timing.push({count,delta}); sampleCount += count; minDelta = Math.min(minDelta, delta); maxDelta = Math.max(maxDelta, delta); }
    }
    let composition=[];const ctts=await child(blob,stbl,'ctts');
    if(ctts){const h=await fields(blob,ctts,8),version=h.getUint8(0),count=h.getUint32(4);if(version>1||count>(ctts.end-ctts.start-8)/8)throw Error('無效的時間資料');if(sampleCount<=20000){const data=await read(blob,ctts.start+8,count*8);for(let i=0;i<count;i++)composition.push({count:data.getUint32(i*8),offset:version?data.getInt32(i*8+4):data.getUint32(i*8+4)})}}
    let editOffset=0;const edts=await child(blob,trak,'edts'),elst=edts&&await child(blob,edts,'elst');if(elst){const h=await fields(blob,elst,8),version=h.getUint8(0),count=h.getUint32(4);if(count===1&&version<=1){const e=await fields(blob,elst,version?28:20);const media=version?Number(e.getBigInt64(16)):e.getInt32(12);const rate=e.getInt32(version?24:16);if(media>=0&&rate===65536)editOffset=media}}
    const pts=buildPts(timing,composition,timescale,editOffset);
    const durationSec = duration / timescale;
    return {pts, fps:sampleCount / durationSec, sampleCount, durationSec, constant:entries === 1, minDeltaFps:timescale / minDelta, maxDeltaFps:timescale / maxDelta, width, height};
  }
  throw new Error('找不到影片軌道');
}
