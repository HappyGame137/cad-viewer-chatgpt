import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseStl,measure,normalize,demoModel,convertBytes,decodeStepName} from '../server/cad.mjs';

const ascii=Buffer.from('solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 20 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid triangle');
test('ASCII STL dimensions and explicit unit conversion',()=>{
  assert.deepEqual(parseStl(ascii,'triangle.stl').bounds.size,[20,10,0]);
  assert.deepEqual(parseStl(ascii,'triangle.stl','in').bounds.size,[508,254,0]);
  const inch=parseStl(ascii,'triangle.stl','in').parts[0];assert.ok(inch.features.some(f=>Math.abs(f.length-508)<1e-8));assert.ok(Math.abs(inch.faces[0].area-64516)<1e-8);
});
test('binary STL is detected even when its header starts with solid',()=>{
  const b=Buffer.alloc(134);b.write('solid binary');b.writeUInt32LE(1,80);
  [0,0,0,20,0,0,0,10,0].forEach((v,i)=>b.writeFloatLE(v,96+i*4));
  assert.deepEqual(parseStl(b,'triangle.stl').bounds.size,[20,10,0]);
});
test('two-point distance, axis differences, and invalid input',()=>{
  assert.deepEqual(measure([0,0,0],[3,4,12]),{distance:13,delta:[3,4,12],unit:'mm',method:'point-to-point'});
  assert.throws(()=>measure([NaN,0,0],[0,0,0]));
});
test('reject malformed STL, unsupported input and invalid mesh indices',async()=>{
  assert.throws(()=>parseStl(Buffer.from('solid fake\nendsolid'),'fake.stl'));
  assert.throws(()=>normalize([{positions:[0,0,0],indices:[0,1,2]}],{name:'bad',format:'TEST'}));
  await assert.rejects(convertBytes(Buffer.from('abc'),'data.txt'),/Supported file/);
});
test('generic demo has known extents and three independently selectable parts',()=>{
  const m=demoModel();assert.equal(m.parts.length,3);assert.deepEqual(m.bounds.size,[40,24,27]);assert.equal(m.triangles,36);
});
test('preserve Unicode STEP names and repair UTF-8 wrapped as Latin-1',()=>{
  const correct='透镜波片座上盖';assert.equal(decodeStepName(Buffer.from(correct).toString('latin1')),correct);
  assert.equal(decodeStepName(correct),correct);assert.equal(decodeStepName('Référence'),'Référence');
});
test('retain millimetre details at a large model origin',()=>{
  const m=normalize([{positions:[100000000,0,0,100000000.02,0,0,100000000,1,0],indices:[0,1,2]}],{name:'offset',format:'TEST'});
  const b=Buffer.from(m.parts[0].positions,'base64');assert.ok(Math.abs(b.readDoubleLE(24)-b.readDoubleLE(0)-.02)<1e-7);
});
