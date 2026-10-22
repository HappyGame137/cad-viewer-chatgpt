import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { normalize } from './cad.mjs';
const require=createRequire(import.meta.url);
try {
  const factory=require('./vendor/occt-import-js.cjs');
  const occt=await factory();
  const raw=occt.ReadStepFile(workerData.bytes,{linearUnit:'millimeter',linearDeflectionType:'absolute_value',linearDeflection:workerData.tolerance,angularDeflection:.25});
  if (!raw.success) throw new Error('STEP import failed. Check that the file contains valid geometry.');
  const parts=raw.meshes.map(m=>({name:m.name,color:m.color,positions:m.attributes.position.array,indices:m.index.array,faces:m.brep_faces?.map(f=>[f.first,f.last])}));
  parentPort.postMessage({model:normalize(parts,{name:workerData.name,format:'STEP',tolerance:workerData.tolerance})});
} catch(e) {parentPort.postMessage({error:e.message});}
