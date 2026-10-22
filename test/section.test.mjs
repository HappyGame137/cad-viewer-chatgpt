import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sectionGeometry} from '../web/section.mjs';

function area(geometry){const p=geometry.attributes.position,idx=geometry.index;if(!idx)return 0;let total=0;for(let i=0;i<idx.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,idx.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,idx.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,idx.getX(i+2));const cross=b.sub(a).cross(c.sub(a));assert.ok(cross.y>=0,'Caps face toward the removed half');total+=cross.length()/2;}return total;}
function combine(...geometries){const coords=geometries.flatMap(g=>Array.from((g.index?g.toNonIndexed():g).attributes.position.array));const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));return result;}
function tube(){const shape=new THREE.Shape();shape.moveTo(-10,-10).lineTo(10,-10).lineTo(10,10).lineTo(-10,10).closePath();const hole=new THREE.Path();hole.moveTo(-5,-5).lineTo(-5,5).lineTo(5,5).lineTo(5,-5).closePath();shape.holes.push(hole);return new THREE.ExtrudeGeometry(shape,{depth:20,bevelEnabled:false,steps:1}).rotateX(Math.PI/2).translate(0,10,0);}
function rayHits(geometry,x,z){const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();return new THREE.Raycaster(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh,false);}

test('solid cube section is filled, including a plane exactly through subdivided edges',()=>{
  for(const segments of [1,2,3])for(const y of [-9,0,3,9]){
    const cap=sectionGeometry(new THREE.BoxGeometry(20,20,20,segments,segments,segments),y);
    assert.equal(cap.incomplete,false);assert.ok(Math.abs(area(cap.geometry)-400)<.001);assert.ok(rayHits(cap.geometry,0,0).length);
    for(let i=0;i<cap.geometry.attributes.position.count;i++)assert.ok(Math.abs(cap.geometry.attributes.position.getY(i)-y)<1e-6);
  }
});
test('section keeps through holes empty and pickable material on their walls',()=>{
  const cap=sectionGeometry(tube(),0);assert.equal(cap.incomplete,false);assert.ok(Math.abs(area(cap.geometry)-300)<.001);
  assert.equal(rayHits(cap.geometry,0,0).length,0);assert.ok(rayHits(cap.geometry,7,0).length);
});
test('disconnected solids and nested solid islands are capped independently',()=>{
  const island=new THREE.BoxGeometry(4,20,4),separate=new THREE.BoxGeometry(4,20,4).translate(30,0,0);
  const cap=sectionGeometry(combine(tube(),island,separate),0);
  assert.equal(cap.incomplete,false);assert.ok(Math.abs(area(cap.geometry)-332)<.001);
  assert.ok(rayHits(cap.geometry,0,0).length);assert.equal(rayHits(cap.geometry,3,0).length,0);assert.ok(rayHits(cap.geometry,30,0).length);assert.equal(rayHits(cap.geometry,20,0).length,0);
});
test('an open cut contour is reported without inventing a solid face',()=>{
  const source=new THREE.BoxGeometry(20,20,20).toNonIndexed();const partial=new THREE.BufferGeometry();partial.setAttribute('position',new THREE.Float32BufferAttribute(source.attributes.position.array.slice(18),3));
  const cap=sectionGeometry(partial,0);assert.equal(cap.incomplete,true);assert.equal(area(cap.geometry),0);
});
test('planes outside or tangent to the solid create no floating caps',()=>{
  for(const y of [-30,-10,10,30]){const cap=sectionGeometry(new THREE.BoxGeometry(20,20,20),y);assert.equal(cap.incomplete,false);assert.equal(area(cap.geometry),0);}
});
