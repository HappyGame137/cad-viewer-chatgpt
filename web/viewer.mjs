import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { App } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions, OpenAIFileEntrypointInputSchema } from '@openai/mcp-extensions/app';
import { resolveLanguage, translate, ViewerError, errorText } from './i18n.mjs';
import { sectionGeometry } from './section.mjs';
import { pickEdge, isFeatureOccluded } from './feature-picking.mjs';
import { measureFace } from '../server/faces.mjs';

const root=document.getElementById('cad-viewer-app');
const $=id=>root.querySelector(`#cad-${id}`);
const stage=$('stage');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.localClippingEnabled=true;
renderer.domElement.tabIndex=0;stage.prepend(renderer.domElement);
const scene=new THREE.Scene(), modelGroup=new THREE.Group(), annotations=new THREE.Group();
scene.add(modelGroup,annotations);
const camera=new THREE.PerspectiveCamera(35,1,.01,100000);camera.up.set(0,0,1);
const controls=new OrbitControls(camera,renderer.domElement);controls.listenToKeyEvents(renderer.domElement);controls.enableDamping=false;
scene.add(new THREE.HemisphereLight(0xffffff,0x71828b,2.6));
const key=new THREE.DirectionalLight(0xffffff,2.2);key.position.set(-1,-2,3);scene.add(key);
const fill=new THREE.DirectionalLight(0xffffff,1);fill.position.set(2,1,-1);scene.add(fill);
const plane=new THREE.Plane(new THREE.Vector3(0,-1,0),0);
let savedLanguage;try{savedLanguage=localStorage.getItem('cad-viewer.language');}catch{}
const state={language:resolveLanguage(savedLanguage,navigator.language),error:null,loading:false,selectedPartName:null,visibleParts:new Set(),selectedEdge:null,edgeMode:false,edgeMiss:false,faceMode:false,selectedFace:null,model:null,meshes:[],points:[],measureMode:false,center:new THREE.Vector3(),radius:30,app:null,extensions:null,lastBytes:null,lastName:null};
const raycaster=new THREE.Raycaster(), ndc=new THREE.Vector2();
const units={mm:1,cm:10,in:25.4};
const t=(key,params)=>translate(state.language,key,params);
const locale=()=>state.language==='zh'?'zh-CN':'en-US';
const formatNumber=n=>(Math.abs(n)<.0005?0:n).toLocaleString(locale(),{minimumFractionDigits:2,maximumFractionDigits:3});
const fmt=n=>formatNumber(n/units[$('unit').value]);
const fmtArea=n=>formatNumber(n/units[$('unit').value]**2);
function showError(error){state.error=error;$('error').textContent=errorText(state.language,error);}
function updatePartDetail(){const m=state.model,visible=m?.parts.filter((_,i)=>state.visibleParts.has(i));$('part-detail').textContent=!m?'':state.selectedPartName||t(visible.length===m.parts.length?'counts':'selectedCounts',{parts:visible.length.toLocaleString(locale()),total:m.parts.length.toLocaleString(locale()),triangles:visible.reduce((sum,p)=>sum+p.triangles,0).toLocaleString(locale())});}
function updateNote(){const m=state.model;let note=!m?t('defaultNote'):m.format==='STEP'?t('stepNote',{tolerance:m.tolerance.toLocaleString(locale())}):m.format==='STL'?t('stlNote',{unit:m.sourceUnits}):t('demoNote');if($('section').checked)note+=' '+t(state.meshes.some(mesh=>mesh.visible&&mesh.userData.sectionIncomplete)?'sectionOpen':'sectionFilled');if(state.edgeMode&&state.meshes.some(mesh=>mesh.visible&&mesh.userData.part.featureStatus==='limit'))note+=' '+t('edgeLimit');$('note').textContent=note;}
function updateFilename(){$('file-name').textContent=state.loading?t('loading'):state.model?.name||t('chooseFile');}
function applyLanguage(){
  document.documentElement.lang=state.language==='zh'?'zh-CN':'en';document.title=t('title');$('language').value=state.language;
  root.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  root.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));
  renderer.domElement.setAttribute('aria-label',t('stageAria'));updatePartSelection();
  updateFilename();updatePartDetail();updateDims();updateNote();updateMeasurementText();showError(state.error);
}
function render(){renderer.render(scene,camera);}
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render();}
new ResizeObserver(resize).observe(stage);controls.addEventListener('change',render);
function dispose(group){group.children.slice().forEach(obj=>{group.remove(obj);obj.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});});}
function decode(text,Type){const raw=atob(text),array=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)array[i]=raw.charCodeAt(i);return new Type(array.buffer);}
function rememberMeasurement(){if(!state.app)return;let measurement;if(state.selectedFace){measurement={type:'face',...state.selectedFace.face,source:state.selectedFace.source,unit:'mm',areaUnit:'mm2',basis:'display mesh face; approximate',part:state.model.parts[state.selectedFace.partId].name};}else if(state.selectedEdge){const f=state.selectedEdge.feature;measurement={type:f.type,center:f.center,diameter:f.diameter,radius:f.radius,length:f.length,angle:f.angle,endpoints:[f.points[0],f.points.at(-1)],unit:'mm',basis:'display mesh boundary; approximate fit',part:state.model.parts[state.selectedEdge.partId].name};}else if(state.points.length===2){const [a,b]=state.points.map(p=>p.model.toArray());measurement={a,b,distance:Math.hypot(...a.map((v,i)=>v-b[i])),unit:'mm',basis:'display mesh',displayToleranceMm:state.model.tolerance};}else return;state.app.updateModelContext({content:[{type:'text',text:JSON.stringify({file:state.model.name,measurement})}]}).catch(()=>{});}
function fit(){
  const box=new THREE.Box3();state.meshes.filter(m=>m.visible).forEach(m=>box.expandByObject(m));
  if(box.isEmpty())return;
  const center=box.getCenter(new THREE.Vector3()),r=Math.max(box.getSize(new THREE.Vector3()).length()/2,1);
  const direction=camera.position.clone().sub(controls.target);if(direction.length()<1)direction.set(-1,-1,.8);
  const verticalFov=THREE.MathUtils.degToRad(camera.fov),limitingFov=2*Math.atan(Math.tan(verticalFov/2)*Math.min(camera.aspect,1));
  camera.position.copy(center).add(direction.normalize().multiplyScalar(r/Math.sin(limitingFov/2)*1.12));
  controls.target.copy(center);camera.near=Math.max(r/10000,.001);camera.far=r*1000;camera.updateProjectionMatrix();controls.update();render();
}
function loadModel(model){
  if(!model?.parts?.length)throw new ViewerError('noParts');
  clearMeasurement();dispose(modelGroup);state.meshes=[];state.model=model;state.selectedPartName=null;
  if(model.name!==state.lastName){state.lastBytes=null;state.lastName=null;}
  if(model.format==='STL')$('stl-unit').value=model.sourceUnits;
  state.center.fromArray(model.bounds.min).add(new THREE.Vector3().fromArray(model.bounds.max)).multiplyScalar(.5);
  state.radius=Math.max(new THREE.Vector3().fromArray(model.bounds.size).length()/2,1);
  state.visibleParts=new Set(model.parts.map((_,i)=>i));$('part-options').replaceChildren();
  model.parts.forEach((part,i)=>{
    const geometry=new THREE.BufferGeometry();const rawPositions=decode(part.positions,part.positionType==='float64'?Float64Array:Float32Array),positions=new Float32Array(rawPositions.length);
    for(let j=0;j<positions.length;j++)positions[j]=rawPositions[j]-state.center.getComponent(j%3);
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(new THREE.BufferAttribute(decode(part.indices,Uint32Array),1));geometry.computeVertexNormals();geometry.computeBoundingBox();
    const color=part.color?.length===3?new THREE.Color(...part.color):new THREE.Color().setHSL((i*.13+.46)%1,.3,.55);
    const material=new THREE.MeshStandardMaterial({color,metalness:.12,roughness:.62,side:THREE.DoubleSide,clippingPlanes:[]});
    const mesh=new THREE.Mesh(geometry,material);mesh.userData={part,faceMap:part.faceMap?decode(part.faceMap,Uint32Array):null,baseColor:color.clone(),shift:geometry.boundingBox.getCenter(new THREE.Vector3())};
    if(mesh.userData.shift.length()<1)mesh.userData.shift.set(0,0,i+1);
    mesh.userData.shift.normalize().multiplyScalar(state.radius*.55);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,32),new THREE.LineBasicMaterial({color:0x33515b,transparent:true,opacity:.26,clippingPlanes:[]}));
    mesh.add(edges);modelGroup.add(mesh);state.meshes.push(mesh);
    const label=document.createElement('label'),checkbox=document.createElement('input'),text=document.createElement('span');checkbox.type='checkbox';checkbox.checked=true;checkbox.value=String(i);text.textContent=part.name;label.append(checkbox,text);$('part-options').append(label);
    checkbox.onchange=()=>{checkbox.checked?state.visibleParts.add(i):state.visibleParts.delete(i);state.selectedPartName=null;updatePartSelection();updateDims();updatePartDetail();updateScene();};
  });
  updateFilename();updatePartDetail();updateNote();
  $('explode').value='0';$('section').checked=false;$('section-pos').hidden=true;
  updatePartSelection();updateDims();updateScene();camera.position.set(-1,-1,.75);controls.target.set(0,0,0);fit();showError('');
}
function updatePartSelection(){const total=state.model?.parts.length||0,count=state.visibleParts.size;$('part-summary').textContent=count===total?t('parts'):t('partsSelected',{count,total});$('all-parts').checked=total>0&&count===total;$('all-parts').indeterminate=count>0&&count<total;$('part-options').querySelectorAll('input').forEach(input=>input.checked=state.visibleParts.has(Number(input.value)));}
function updateDims(){if(state.model){const selected=state.model.parts.filter((_,i)=>state.visibleParts.has(i));if(!selected.length){$('dims').textContent=t('noPartsSelected');return;}const min=[0,1,2].map(i=>Math.min(...selected.map(p=>p.bounds.min[i]))),max=[0,1,2].map(i=>Math.max(...selected.map(p=>p.bounds.max[i])));$('dims').textContent=t(selected.length===state.model.parts.length?'assemblyBounds':selected.length===1?'partBounds':'selectionBounds',{size:max.map((v,i)=>fmt(v-min[i])).join(' × '),unit:$('unit').value});}}
function updateScene(){
  const explode=Number($('explode').value)/100;
  plane.constant=Number($('section-pos').value)/100*state.radius;
  state.meshes.forEach((mesh,i)=>{mesh.position.copy(mesh.userData.shift).multiplyScalar(explode);mesh.visible=state.visibleParts.has(i);mesh.material.clippingPlanes=$('section').checked?[plane]:[];mesh.children[0].material.clippingPlanes=mesh.material.clippingPlanes;updateSection(mesh);});
  updateNote();updateAnnotations();render();
}
function updateSection(mesh){
  const data=mesh.userData,active=$('section').checked&&mesh.visible,cutY=plane.constant-mesh.position.y;
  if(!active){if(data.cap)data.cap.visible=false;if(state.selectedFace?.source==='section'&&state.meshes[state.selectedFace.partId]===mesh)state.selectedFace=null;return;}
  if(data.cutY!==cutY){
    if(state.selectedFace?.source==='section'&&state.meshes[state.selectedFace.partId]===mesh)state.selectedFace=null;
    if(data.cap){mesh.remove(data.cap);data.cap.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
    const {geometry,outline,incomplete}=sectionGeometry(mesh.geometry,cutY);data.cutY=cutY;data.sectionIncomplete=incomplete;
    const color=data.baseColor.clone().lerp(new THREE.Color(0xf0bb72),.6);
    data.cap=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.85,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
    data.cap.userData.sourceMesh=mesh;
    data.cap.add(new THREE.LineSegments(outline,new THREE.LineBasicMaterial({color:color.clone().multiplyScalar(.65)})));mesh.add(data.cap);
  }
  data.cap.visible=Boolean(data.cap.geometry.index?.count);
}
function updateAnnotations(){
  dispose(annotations);
  if(state.faceMode){drawSelectedFace();updateMeasurementText();return;}
  if(state.edgeMode){drawSelectedEdge();updateMeasurementText();return;}
  if(!state.measureMode){updateMeasurementText();return;}
  const displayed=state.points.map(p=>{
    const mesh=state.meshes[p.partId],point=p.model.clone().sub(state.center).add(mesh.position);
    return {point,visible:mesh.visible&&(!$('section').checked||plane.distanceToPoint(point)>=-1e-6)};
  });
  const c=getComputedStyle(root).getPropertyValue('--accent').trim();const material=new THREE.MeshBasicMaterial({color:new THREE.Color(c.startsWith('#')?c:0xe5b24c),depthTest:false});
  displayed.filter(p=>p.visible).forEach(({point})=>{const sphere=new THREE.Mesh(new THREE.SphereGeometry(state.radius*.011,12,8),material.clone());sphere.position.copy(point);sphere.renderOrder=10;annotations.add(sphere);});material.dispose();
  if(displayed.length===2&&displayed.every(p=>p.visible)){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(displayed.map(p=>p.point)),new THREE.LineBasicMaterial({color:0xe5b24c,depthTest:false}));line.renderOrder=11;annotations.add(line);}
  updateMeasurementText();
}
function derivedFace(geometry,triangles=null){
  const face=measureFace(geometry.attributes.position.array,geometry.index?.array||Array.from({length:geometry.attributes.position.count},(_,i)=>i),triangles);
  face.centroid=face.centroid.map((v,i)=>v+state.center.getComponent(i));
  for(const key of ['min','max'])face.bounds[key]=face.bounds[key].map((v,i)=>v+state.center.getComponent(i));
  if(face.normal)face.planeOffset=-face.normal.reduce((sum,v,i)=>sum+v*face.centroid[i],0);return face;
}
function drawSelectedFace(){
  const selection=state.selectedFace;if(!selection)return;const mesh=state.meshes[selection.partId];if(!mesh?.visible)return;
  const geometry=selection.source==='section'?mesh.userData.cap?.geometry:mesh.geometry;if(!geometry?.attributes.position)return;
  const position=geometry.attributes.position,index=geometry.index,vertices=[];
  const triangles=selection.triangles||Array.from({length:index?index.count/3:position.count/3},(_,i)=>i);
  for(const triangle of triangles)for(let k=0;k<3;k++){const v=index?index.getX(triangle*3+k):triangle*3+k;vertices.push(position.getX(v)+mesh.position.x,position.getY(v)+mesh.position.y,position.getZ(v)+mesh.position.z);}
  const overlay=new THREE.BufferGeometry();overlay.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  annotations.add(new THREE.Mesh(overlay,new THREE.MeshBasicMaterial({color:0xe5b24c,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,clippingPlanes:$('section').checked&&selection.source!=='section'?[plane]:[]})));
}
function drawSelectedEdge(){
  if(!state.selectedEdge)return;const {partId,feature}=state.selectedEdge,mesh=state.meshes[partId];if(!mesh?.visible)return;
  const world=p=>new THREE.Vector3().fromArray(p).sub(state.center).add(mesh.position);
  const material=()=>new THREE.LineBasicMaterial({color:0xe5b24c,depthTest:false,clippingPlanes:$('section').checked?[plane]:[]});
  const addLine=(points,segments=false)=>{const geometry=new THREE.BufferGeometry().setFromPoints(points),line=segments?new THREE.LineSegments(geometry,material()):new THREE.Line(geometry,material());line.renderOrder=11;annotations.add(line);};
  addLine(feature.points.map(world));
  const marker=(p,size)=>{const center=world(p),d=[[size,0,0],[0,size,0],[0,0,size]],points=[];for(const axis of d){points.push(center.clone().sub(new THREE.Vector3(...axis)),center.clone().add(new THREE.Vector3(...axis)));}addLine(points,true);};
  if(feature.center){marker(feature.center,Math.max(feature.radius*.1,state.radius*.004));const c=world(feature.center),a=world(feature.points[0]);addLine(feature.type==='circle'?[a,c.clone().multiplyScalar(2).sub(a)]:[c,a]);}
  else{const size=Math.max(feature.length*.012,state.radius*.004);marker(feature.points[0],size);if(!feature.closed)marker(feature.points.at(-1),size);}
}
function updateMeasurementText(){
  if(state.faceMode){
    if(!state.selectedFace){$('measure-result').textContent=t('faceInstruction');return;}
    const selection=state.selectedFace;if(!state.meshes[selection.partId]?.visible){$('measure-result').textContent=t('faceHidden');return;}
    const f=selection.face,vector=p=>p?.map(v=>formatNumber(v)).join(', '),values={unit:$('unit').value,area:fmtArea(f.area),center:f.centroid.map(fmt).join(', '),normal:vector(f.normal),diameter:f.diameter?fmt(f.diameter):'',height:f.height?fmt(f.height):'',axis:vector(f.axis?.direction),size:f.bounds.size.map(fmt).join(' × ')};
    $('measure-result').textContent=t(selection.source==='section'?'faceSection':selection.source==='triangle'?'faceTriangle':f.surfaceType==='plane'?'facePlane':f.surfaceType==='cylinder'?'faceCylinder':'faceCurved',values)+' '+t('edgeBasis');return;
  }
  if(state.edgeMode){
    if(!state.selectedEdge){$('measure-result').textContent=t(state.edgeMiss?'edgeNotFound':'edgeInstruction');return;}
    if(!state.meshes[state.selectedEdge.partId]?.visible){$('measure-result').textContent=t('edgeHidden');return;}
    const f=state.selectedEdge.feature,point=p=>p.map(fmt).join(', '),values={unit:$('unit').value,length:fmt(f.length),start:point(f.points[0]),end:point(f.points.at(-1)),center:f.center?point(f.center):'',diameter:f.diameter?fmt(f.diameter):'',radius:f.radius?fmt(f.radius):'',angle:f.angle?.toLocaleString(locale(),{maximumFractionDigits:2})};
    $('measure-result').textContent=t(f.type==='circle'?'edgeCircle':f.type==='arc'?'edgeArc':f.type==='line'?'edgeLine':f.closed?'edgeClosedCurve':'edgeCurve',values)+' '+t('edgeBasis');return;
  }
  if(state.points.length===0){$('measure-result').textContent=t(state.measureMode?'measureFirst':'measureOff');return;}
  if(state.points.length===1){$('measure-result').textContent=t('measureSecond',{point:state.points[0].model.toArray().map(fmt).join(', '),unit:$('unit').value});return;}
  const delta=state.points[1].model.clone().sub(state.points[0].model);
  $('measure-result').textContent=t('measureResult',{distance:fmt(delta.length()),unit:$('unit').value,x:fmt(Math.abs(delta.x)),y:fmt(Math.abs(delta.y)),z:fmt(Math.abs(delta.z))});
}
function clearMeasurement(){state.points=[];state.selectedEdge=null;state.selectedFace=null;state.edgeMiss=false;dispose(annotations);updateMeasurementText();render();}
function selectAt(event){
  const rect=renderer.domElement.getBoundingClientRect();ndc.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(ndc,camera);
  if(state.edgeMode){
    const clipPlane=$('section').checked?plane:null,picked=pickEdge({meshes:state.meshes,center:state.center,camera,viewport:{width:rect.width,height:rect.height},screen:[event.clientX-rect.left,event.clientY-rect.top],clipPlane,occluded:point=>isFeatureOccluded(point,camera,state.meshes,clipPlane,state.radius)});
    state.selectedEdge=picked?{partId:state.meshes.indexOf(picked.mesh),feature:picked.feature}:null;state.edgeMiss=!picked;
    if(picked){state.selectedPartName=picked.mesh.userData.part.name;updatePartDetail();rememberMeasurement();}updateAnnotations();render();return;
  }
  const pickable=state.meshes.filter(m=>m.visible).flatMap(m=>m.userData.cap?.visible?[m,m.userData.cap]:[m]);
  const hit=raycaster.intersectObjects(pickable,false).find(h=>h.object.userData.sourceMesh||!$('section').checked||plane.distanceToPoint(h.point)>=-1e-6);
  if(!hit){if(state.faceMode){state.selectedFace=null;updateAnnotations();render();}return;}
  const selected=hit.object.userData.sourceMesh||hit.object;
  state.meshes.forEach(m=>m.material.emissive.set(0x000000));if(!state.faceMode)selected.material.emissive.copy(selected.userData.baseColor).multiplyScalar(.2);
  state.selectedPartName=selected.userData.part.name===state.model.name?null:selected.userData.part.name;updatePartDetail();
  if(state.faceMode){
    let face,source,triangles;
    if(hit.object.userData.sourceMesh){source='section';face=derivedFace(hit.object.geometry);}
    else{const faceId=selected.userData.faceMap?.[hit.faceIndex];face=selected.userData.part.faces?.find(f=>f.id===faceId);source='original';
      if(face){triangles=[];selected.userData.faceMap.forEach((id,i)=>{if(id===faceId)triangles.push(i);});}
      else{source='triangle';triangles=[hit.faceIndex];face=derivedFace(selected.geometry,triangles);}}
    state.selectedFace={partId:state.meshes.indexOf(selected),face,source,triangles};updateAnnotations();rememberMeasurement();render();return;
  }
  if(state.measureMode){
    const local=hit.object.worldToLocal(hit.point.clone());
    if($('snap').checked){const pos=hit.object.geometry.attributes.position;const candidates=[hit.face.a,hit.face.b,hit.face.c].map(i=>new THREE.Vector3().fromBufferAttribute(pos,i));candidates.sort((a,b)=>a.distanceToSquared(local)-b.distanceToSquared(local));local.copy(candidates[0]);}
    if(state.points.length===2)state.points=[];
    state.points.push({model:local.add(state.center),partId:state.meshes.indexOf(selected)});updateAnnotations();rememberMeasurement();
  }
  render();
}
let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)down={x:e.clientX,y:e.clientY,id:e.pointerId};});
renderer.domElement.addEventListener('pointerup',e=>{if(down&&e.pointerId===down.id&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<4)selectAt(e);down=null;});
renderer.domElement.addEventListener('pointercancel',()=>down=null);
$('fit').onclick=fit;$('clear').onclick=clearMeasurement;
function toggleMeasureMode(mode){const enabled=state[mode];for(const key of ['measureMode','edgeMode','faceMode'])state[key]=key===mode&&!enabled;$('measure').setAttribute('aria-pressed',String(state.measureMode));$('edge').setAttribute('aria-pressed',String(state.edgeMode));$('face').setAttribute('aria-pressed',String(state.faceMode));$('snap').disabled=state.edgeMode||state.faceMode;clearMeasurement();updateNote();}
$('measure').onclick=()=>toggleMeasureMode('measureMode');$('edge').onclick=()=>toggleMeasureMode('edgeMode');$('face').onclick=()=>toggleMeasureMode('faceMode');
$('explode').oninput=updateScene;$('section-pos').oninput=updateScene;
$('section').onchange=()=>{$('section-pos').hidden=!$('section').checked;updateScene();};
function setVisibleParts(parts){state.visibleParts=new Set(parts);state.selectedPartName=null;updatePartSelection();updateDims();updatePartDetail();updateScene();}
$('all-parts').onchange=()=>setVisibleParts($('all-parts').checked?state.model?.parts.map((_,i)=>i):[]);
$('no-parts').onclick=()=>setVisibleParts([]);
document.addEventListener('pointerdown',event=>{if(!$('parts-menu').contains(event.target))$('parts-menu').open=false;});
$('parts-menu').addEventListener('keydown',event=>{if(event.key==='Escape')$('parts-menu').open=false;});
$('parts-menu').addEventListener('toggle',()=>$('part-summary').setAttribute('aria-expanded',String($('parts-menu').open)));
$('unit').onchange=()=>{updateDims();updateMeasurementText();};
$('stl-unit').onchange=async()=>{try{if(state.lastBytes&&state.lastName?.toLowerCase().endsWith('.stl'))await openBytes(state.lastBytes,state.lastName);}catch(e){showError(e);}};
$('language').onchange=()=>{state.language=$('language').value;try{localStorage.setItem('cad-viewer.language',state.language);}catch{}applyLanguage();};
function toBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
async function call(name,args){
  let result;
  if(state.app)result=await state.app.callServerTool({name,arguments:args});
  else {const response=await fetch(name==='cad_demo'?'/api/demo':'/api/convert',name==='cad_demo'?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});result=await response.json();}
  if(result.error||result.isError){const detail=result.error||result.content?.find(c=>c.type==='text')?.text;throw detail?new Error(detail):new ViewerError('readFailed');}
  if(result._meta?.model)loadModel(result._meta.model);
  return result;
}
async function openBytes(bytes,name){
  if(bytes.byteLength>30*1024*1024)throw new ViewerError('fileTooLarge');
  state.lastBytes=bytes;state.lastName=name;state.loading=true;updateFilename();showError('');
  $('file').disabled=true;$('demo').disabled=true;$('stl-unit').disabled=true;root.setAttribute('aria-busy','true');
  try{await call('convert_cad',{name,base64:toBase64(bytes),tolerance:.05,stlUnits:$('stl-unit').value});}
  finally{state.loading=false;updateFilename();$('file').disabled=false;$('demo').disabled=false;$('stl-unit').disabled=false;root.removeAttribute('aria-busy');}
}
$('file').onchange=async()=>{try{const f=$('file').files[0];if(f)await openBytes(new Uint8Array(await f.arrayBuffer()),f.name);}catch(e){showError(e);}finally{$('file').value='';}};
$('demo').onclick=()=>call('cad_demo',{}).catch(showError);
async function start(){
  resize();
  if(window.parent!==window){
    const app=new App({name:'cad-viewer-ui',version:'0.4.0'},{},{autoResize:true});state.app=app;
    const ext=new OpenAIExtensions(app);state.extensions=ext;
    app.ontoolresult=params=>{if(params._meta?.model)loadModel(params._meta.model);else if(params.isError)showError(params.content?.find(c=>c.type==='text')?.text || new ViewerError('readFailed'));};
    app.ontoolinput=async({arguments:args})=>{
      const input=OpenAIFileEntrypointInputSchema.safeParse(args);
      if(!input.success)return;
      try{
        if(!ext.resources)throw new ViewerError('noFileApi');
        const resource=await ext.resources.read({uri:input.data.file.resourceUri,representation:'blob'});
        const content=resource.contents.find(c=>'blob' in c);
        if(!content)throw new ViewerError('noFileContent');
        const raw=atob(content.blob);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
        const file=input.data.file;const uriName=decodeURIComponent(file.resourceUri.split('/').pop()?.split('?')[0]||'');
        await openBytes(bytes,file.name||file.filename||uriName);
      }catch(e){showError(e);}
    };
    app.onteardown=async()=>{controls.dispose();renderer.dispose();dispose(modelGroup);dispose(annotations);return {};};
    await app.connect();
  }else {const response=await fetch('/api/model');const result=await response.json();if(result._meta?.model)loadModel(result._meta.model);}
}
applyLanguage();start().catch(showError);
