import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {extractEdges,fitCircle} from '../server/edges.mjs';
import {pickEdge,isFeatureOccluded} from '../web/feature-picking.mjs';

function edges(geometry){const p=geometry.attributes.position;return extractEdges(Array.from(p.array),geometry.index?Array.from(geometry.index.array):Array.from({length:p.count},(_,i)=>i));}
function circlePoints(radius,from=0,to=Math.PI*2,count=32){return Array.from({length:count+1},(_,i)=>{const a=from+(to-from)*i/count;return [radius*Math.cos(a),radius*Math.sin(a),0];});}
test('box edges are twelve straight lines with known endpoints and lengths',()=>{
  const result=edges(new THREE.BoxGeometry(20,10,5));assert.equal(result.features.length,12);assert.ok(result.features.every(f=>f.type==='line'));
  assert.deepEqual(result.features.map(f=>f.length).sort((a,b)=>a-b),[5,5,5,5,10,10,10,10,20,20,20,20]);
});
test('circle fit retains centre, diameter and normal in a rotated, translated assembly',()=>{
  const matrix=new THREE.Matrix4().makeRotationX(.7).setPosition(1e6,-20,30),points=circlePoints(3).map(p=>new THREE.Vector3(...p).applyMatrix4(matrix).toArray()),fit=fitCircle(points,true);
  assert.ok(fit);assert.ok(new THREE.Vector3(...fit.center).distanceTo(new THREE.Vector3(1e6,-20,30))<1e-7);assert.ok(Math.abs(fit.diameter-6)<1e-7);
  assert.ok(Math.abs(fit.length-Math.PI*6)<1e-7);
});
test('arc fit reports its angle, radius and arc length; ellipse, warped and sparse shapes are rejected',()=>{
  const arc=fitCircle(circlePoints(5,0,Math.PI/2,12));assert.ok(arc);assert.ok(Math.abs(arc.angle-90)<1e-8);assert.ok(Math.abs(arc.length-Math.PI*2.5)<1e-8);
  assert.equal(fitCircle(circlePoints(5).map(([x,y,z])=>[x,y*1.1,z]),true),null);
  assert.equal(fitCircle(circlePoints(5).map(([x,y,z],i)=>[x,y,z+(i%3)*.1]),true),null);
  assert.equal(fitCircle(circlePoints(5,0,Math.PI*2,4),true),null);
});
test('cylinder rims are recognised as two circles without triangulation diagonals',()=>{
  const result=edges(new THREE.CylinderGeometry(3,3,8,32));const circles=result.features.filter(f=>f.type==='circle');
  assert.equal(circles.length,2);assert.ok(circles.every(f=>Math.abs(f.diameter-6)<1e-5));assert.deepEqual(circles.map(f=>Math.round(f.center[1])).sort((a,b)=>a-b),[-4,4]);
});
test('coplanar STL triangles are combined into six box faces with correct area and centroids',()=>{
  const result=edges(new THREE.BoxGeometry(20,10,5).toNonIndexed());assert.equal(result.faces.length,6);
  assert.deepEqual(result.faces.map(f=>Math.round(f.area)).sort((a,b)=>a-b),[50,50,100,100,200,200]);
  assert.ok(result.faces.every(f=>f.surfaceType==='plane'&&Math.abs(Math.hypot(...f.normal)-1)<1e-8));
});
test('elliptical outlines remain general closed curves rather than misleading circles',()=>{
  const result=edges(new THREE.CircleGeometry(5,48).scale(1,1.2,1));assert.equal(result.features.length,1);assert.equal(result.features[0].type,'curve');assert.equal(result.features[0].closed,true);assert.ok(result.features[0].length>34&&result.features[0].length<35);
});
test('circle interior picking chooses its visible front rim and respects part hiding, clipping and occlusion',()=>{
  const camera=new THREE.PerspectiveCamera(35,1,.1,1000);camera.position.set(0,0,100);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const feature={type:'circle',points:circlePoints(5),...fitCircle(circlePoints(5),true)},mesh=new THREE.Mesh();mesh.userData.part={features:[feature]};
  const args={meshes:[mesh],center:new THREE.Vector3(),camera,viewport:{width:500,height:500},screen:[250,250]};
  assert.equal(pickEdge(args).feature,feature);mesh.visible=false;assert.equal(pickEdge(args),null);mesh.visible=true;
  assert.equal(pickEdge({...args,clipPlane:new THREE.Plane(new THREE.Vector3(0,0,1),-1)}),null);
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));wall.position.z=10;wall.updateMatrixWorld();
  assert.equal(pickEdge({...args,occluded:p=>isFeatureOccluded(p,camera,[wall],null,30)}),null);
  mesh.position.x=20;assert.equal(pickEdge(args),null);
});
