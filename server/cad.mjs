import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, basename, resolve, relative, isAbsolute, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { extractEdges } from './edges.mjs';

export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4 };
export function measure(a, b) {
  if (![a,b].every(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))) throw new Error('Expected two finite XYZ points in millimetres.');
  const delta = b.map((v,i) => v-a[i]);
  return { distance: Math.hypot(...delta), delta, unit: 'mm', method: 'point-to-point' };
}
function encoded(array, Type) { return Buffer.from(new Type(array).buffer).toString('base64'); }
export function decodeStepName(name) {
  if(!name || [...name].some(c=>c.charCodeAt(0)>255))return name;
  const decoded=Buffer.from(name,'latin1').toString('utf8');
  return decoded.includes('\ufffd')?name:decoded;
}
export function normalize(rawParts, { name, format, tolerance=0, sourceUnits='mm' }) {
  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
  let triangles=0, vertices=0;
  const parts=rawParts.map((p,partId) => {
    const positions=p.positions, indices=p.indices;
    const partMin=[Infinity,Infinity,Infinity],partMax=[-Infinity,-Infinity,-Infinity];
    if (!positions.length || positions.length%3 || !indices.length || indices.length%3) throw new Error('Empty or malformed mesh.');
    if (positions.some(v => !Number.isFinite(v) || Math.abs(v)>1e9)) throw new Error('Invalid or excessively large coordinates.');
    if (indices.some(v => !Number.isInteger(v) || v<0 || v>=positions.length/3)) throw new Error('Mesh contains invalid indices.');
    for (let i=0;i<positions.length;i++) {const k=i%3;min[k]=Math.min(min[k],positions[i]);max[k]=Math.max(max[k],positions[i]);partMin[k]=Math.min(partMin[k],positions[i]);partMax[k]=Math.max(partMax[k],positions[i]);}
    triangles += indices.length/3; vertices += positions.length/3;
    if (triangles>1_000_000 || vertices>2_000_000) throw new Error('Model exceeds the one million triangle preview limit. Use a coarser display tolerance.');
    const edgeData=extractEdges(positions,indices,p.faces);if(edgeData.faceMap)edgeData.faceMap=encoded(edgeData.faceMap,Uint32Array);
    return { id:partId, name:decodeStepName(p.name) || `Part ${partId+1}`, color:p.color?.slice(0,3),...edgeData,
      positionType:'float64',positions:encoded(positions,Float64Array), indices:encoded(indices,Uint32Array),
      bounds:{min:partMin,max:partMax,size:partMax.map((v,i)=>v-partMin[i])},
      triangles:indices.length/3, vertices:positions.length/3 };
  });
  if (!parts.length || min.some(v=>!Number.isFinite(v))) throw new Error('No displayable solids or triangles were found.');
  const model={schema:1,name,format,unit:'mm',sourceUnits,tolerance,bounds:{min,max,size:max.map((v,i)=>v-min[i])},parts,triangles,vertices};
  if (JSON.stringify(model).length>24*1024*1024) throw new Error('Converted display mesh exceeds the 24 MB limit. Use a coarser tolerance.');
  return model;
}
export function parseStl(bytes, name, units='mm') {
  const factor=UNITS[units];
  if (!factor) throw new Error('STL source units must be mm, cm, m, or in.');
  const b=Buffer.from(bytes); const positions=[];
  const count=b.length>=84?b.readUInt32LE(80):0;
  const binary=count>0 && 84+count*50===b.length;
  if (binary) {
    if (count>1_000_000) throw new Error('STL exceeds the one million triangle limit.');
    for (let t=0;t<count;t++) for(let j=0;j<9;j++) positions.push(b.readFloatLE(84+t*50+12+j*4)*factor);
  } else {
    const s=b.toString('utf8');
    if (!/^\s*solid\b/i.test(s) || !/endsolid\b/i.test(s)) throw new Error('Not a valid ASCII or binary STL.');
    const re=/\bvertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/gi;
    for(const m of s.matchAll(re)) {for(let i=1;i<=3;i++) positions.push(Number(m[i])*factor);if(positions.length>9_000_000)throw new Error('STL exceeds the triangle limit.');}
    if (!positions.length || positions.length%9) throw new Error('Incomplete ASCII STL triangles.');
  }
  const indices=Array.from({length:positions.length/3},(_,i)=>i);
  return normalize([{name,positions,indices}],{name,format:'STL',sourceUnits:units});
}
export async function convertBytes(bytes, name, { tolerance=.05, stlUnits='mm' }={}) {
  if (bytes.length===0 || bytes.length>MAX_FILE_BYTES) throw new Error('Select a nonempty CAD file smaller than 30 MB.');
  const format=extname(name).toLowerCase();
  if (format==='.stl') return parseStl(bytes,basename(name),stlUnits);
  if (!['.step','.stp'].includes(format)) throw new Error('Supported file types: STEP (.step/.stp) and STL (.stl).');
  if (!Number.isFinite(tolerance) || tolerance<.01 || tolerance>2) throw new Error('Display tolerance must be between 0.01 and 2 mm.');
  return new Promise((ok,fail)=>{
    const worker=new Worker(new URL('./convert-worker.mjs',import.meta.url),{workerData:{bytes:Uint8Array.from(bytes),name:basename(name),tolerance},stdout:true,stderr:true});
    // OCCT can print import diagnostics; keep protocol stdout clean.
    worker.stdout.resume();worker.stderr.resume();
    const timer=setTimeout(()=>{worker.terminate();fail(new Error('STEP conversion exceeded 45 seconds. Try a smaller assembly or coarser tolerance.'));},45_000);
    worker.once('message',r=>{clearTimeout(timer);r.error?fail(new Error(r.error)):ok(r.model);});
    worker.once('error',e=>{clearTimeout(timer);fail(e);});
    worker.once('exit',code=>{clearTimeout(timer);if(code!==0)fail(new Error(`STEP converter exited (${code}).`));});
  });
}
export async function openFile(path, options={}) {
  if (!isAbsolute(path)) throw new Error('Provide an absolute local CAD file path.');
  if (/^(\\\\|\/\/)/.test(path)) throw new Error('Network and device paths are not supported. Choose a local drive path.');
  if(!['.step','.stp','.stl'].includes(extname(path).toLowerCase()))throw new Error('Supported file types: STEP and STL.');
  const target=await realpath(path);
  const roots=(process.env.CAD_VIEWER_ALLOWED_ROOTS?.split(delimiter) || [homedir(),process.cwd()]);
  const canonical=await Promise.all(roots.map(r=>realpath(resolve(r))));
  if (!canonical.some(root=>{const rel=relative(root,target);return rel==='' || (!rel.startsWith('..')&&!isAbsolute(rel));})) throw new Error('File is outside permitted roots. Configure CAD_VIEWER_ALLOWED_ROOTS to include its folder.');
  const info=await stat(target);
  if(!info.isFile()||info.size>MAX_FILE_BYTES)throw new Error('CAD file must be a regular file smaller than 30 MB.');
  return convertBytes(await readFile(target),basename(target),options);
}
export function demoModel() {
  const box=(name,x,y,z,w,d,h,color)=>({name,color,
    positions:[x,y,z,x+w,y,z,x+w,y+d,z,x,y+d,z,x,y,z+h,x+w,y,z+h,x+w,y+d,z+h,x,y+d,z+h],
    indices:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]});
  return normalize([box('Base · 40 × 24 × 4 mm',0,0,0,40,24,4,[.25,.57,.63]),box('Mount · 8 × 24 × 20 mm',0,0,4,8,24,20,[.77,.54,.30]),box('Top · 24 × 12 × 3 mm',8,6,24,24,12,3,[.43,.66,.50])],{name:'Generic assembly · 通用装配',format:'DEMO'});
}
export function summary(m) {return {name:m.name,format:m.format,unit:m.unit,sourceUnits:m.sourceUnits,displayToleranceMm:m.tolerance,bounds:m.bounds,parts:m.parts.map(({id,name,triangles})=>({id,name,triangles})),triangles:m.triangles,measurement:'Display mesh approximation; not exact B-rep metrology. STL contains no intrinsic unit.'};}
