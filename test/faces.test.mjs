import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {measureFace} from '../server/faces.mjs';
import {sectionGeometry} from '../web/section.mjs';
test('a section face retains hole area and its plane normal',()=>{
  const shape=new THREE.Shape();shape.moveTo(-10,-10).lineTo(10,-10).lineTo(10,10).lineTo(-10,10).closePath();const hole=new THREE.Path();hole.moveTo(-5,-5).lineTo(-5,5).lineTo(5,5).lineTo(5,-5).closePath();shape.holes.push(hole);
  const solid=new THREE.ExtrudeGeometry(shape,{depth:20,bevelEnabled:false}).rotateX(Math.PI/2).translate(0,10,0),cap=sectionGeometry(solid,0).geometry;
  const result=measureFace(cap.attributes.position.array,cap.index.array);assert.equal(result.surfaceType,'plane');assert.ok(Math.abs(result.area-300)<1e-5);assert.ok(Math.hypot(...result.centroid)<1e-6);assert.deepEqual(result.normal,[0,1,0]);
});
test('triangle fallback reports a correct area and centroid away from the origin',()=>{
  const face=measureFace([1000000,0,5,1000020,0,5,1000000,10,5],[0,1,2]);
  assert.equal(face.area,100);assert.ok(Math.abs(face.centroid[0]-(1000000+20/3))<1e-7);assert.ok(Math.abs(face.centroid[1]-10/3)<1e-7);assert.equal(face.centroid[2],5);assert.deepEqual(face.normal,[0,0,1]);
});
test('a curved surface does not invent a constant normal',()=>{
  const sphere=new THREE.SphereGeometry(3,32,16),face=measureFace(sphere.attributes.position.array,sphere.index.array);
  assert.equal(face.surfaceType,'curved');assert.equal(face.normal,undefined);assert.ok(face.area>110&&face.area<114);assert.ok(Math.hypot(...face.centroid)<1e-6);
});
