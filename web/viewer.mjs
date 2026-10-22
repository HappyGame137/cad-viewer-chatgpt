import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { App } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions, OpenAIFileEntrypointInputSchema } from '@openai/mcp-extensions/app';

const root=document.getElementById('cad-viewer-app');
const $=id=>root.querySelector(`#cad-${id}`);
const stage=$('stage');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.localClippingEnabled=true;
renderer.domElement.setAttribute('aria-label','三维模型：拖动旋转，滚轮缩放；测量模式下点击两个点。');
renderer.domElement.tabIndex=0;stage.prepend(renderer.domElement);
const scene=new THREE.Scene(), modelGroup=new THREE.Group(), annotations=new THREE.Group();
scene.add(modelGroup,annotations);
const camera=new THREE.PerspectiveCamera(35,1,.01,100000);camera.up.set(0,0,1);
const controls=new OrbitControls(camera,renderer.domElement);controls.listenToKeyEvents(renderer.domElement);controls.enableDamping=false;
scene.add(new THREE.HemisphereLight(0xffffff,0x71828b,2.6));
const key=new THREE.DirectionalLight(0xffffff,2.2);key.position.set(-1,-2,3);scene.add(key);
const fill=new THREE.DirectionalLight(0xffffff,1);fill.position.set(2,1,-1);scene.add(fill);
const plane=new THREE.Plane(new THREE.Vector3(0,-1,0),0);
const state={model:null,meshes:[],points:[],measureMode:false,center:new THREE.Vector3(),radius:30,app:null,extensions:null,lastBytes:null,lastName:null};
const raycaster=new THREE.Raycaster(), ndc=new THREE.Vector2();
const units={mm:1,cm:10,in:25.4};
const fmt=n=>(n/units[$('unit').value]).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:3});
function showError(error){$('error').textContent=error?.message || String(error || '');}
function render(){renderer.render(scene,camera);}
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render();}
new ResizeObserver(resize).observe(stage);controls.addEventListener('change',render);
function dispose(group){group.children.slice().forEach(obj=>{group.remove(obj);obj.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});});}
function decode(text,Type){const raw=atob(text),array=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)array[i]=raw.charCodeAt(i);return new Type(array.buffer);}
function rememberMeasurement(){if(!state.app||state.points.length!==2)return;const [a,b]=state.points.map(p=>p.model.toArray());state.app.updateModelContext({content:[{type:'text',text:JSON.stringify({file:state.model.name,measurement:{a,b,distance:Math.hypot(...a.map((v,i)=>v-b[i])),unit:'mm',basis:'display mesh',displayToleranceMm:state.model.tolerance}})}]}).catch(()=>{});}
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
  if(!model?.parts?.length)throw new Error('模型没有可显示的零件。');
  clearMeasurement();dispose(modelGroup);state.meshes=[];state.model=model;
  if(model.name!==state.lastName){state.lastBytes=null;state.lastName=null;}
  if(model.format==='STL')$('stl-unit').value=model.sourceUnits;
  state.center.fromArray(model.bounds.min).add(new THREE.Vector3().fromArray(model.bounds.max)).multiplyScalar(.5);
  state.radius=Math.max(new THREE.Vector3().fromArray(model.bounds.size).length()/2,1);
  $('part').replaceChildren(new Option('全部零件','all'));
  model.parts.forEach((part,i)=>{
    const geometry=new THREE.BufferGeometry();const rawPositions=decode(part.positions,part.positionType==='float64'?Float64Array:Float32Array),positions=new Float32Array(rawPositions.length);
    for(let j=0;j<positions.length;j++)positions[j]=rawPositions[j]-state.center.getComponent(j%3);
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(new THREE.BufferAttribute(decode(part.indices,Uint32Array),1));geometry.computeVertexNormals();geometry.computeBoundingBox();
    const color=part.color?.length===3?new THREE.Color(...part.color):new THREE.Color().setHSL((i*.13+.46)%1,.3,.55);
    const material=new THREE.MeshStandardMaterial({color,metalness:.12,roughness:.62,side:THREE.DoubleSide,clippingPlanes:[]});
    const mesh=new THREE.Mesh(geometry,material);mesh.userData={part,baseColor:color.clone(),shift:geometry.boundingBox.getCenter(new THREE.Vector3())};
    if(mesh.userData.shift.length()<1)mesh.userData.shift.set(0,0,i+1);
    mesh.userData.shift.normalize().multiplyScalar(state.radius*.55);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,32),new THREE.LineBasicMaterial({color:0x33515b,transparent:true,opacity:.26,clippingPlanes:[]}));
    mesh.add(edges);modelGroup.add(mesh);state.meshes.push(mesh);$('part').add(new Option(part.name,String(i)));
  });
  $('file-name').textContent=model.name;$('part-detail').textContent=`${model.parts.length} 个零件 · ${model.triangles.toLocaleString()} 个三角面`;
  $('note').textContent=model.format==='STEP'?`STEP 显示网格偏差参数 ${model.tolerance} mm；两点测量为网格近似，不能替代精确曲面、孔径或加工检验。`:model.format==='STL'?`STL 原始单位：${model.sourceUnits}（由用户指定）；测量基于文件三角网格。`:'通用装配演示；点到点测量基于显示网格。';
  $('explode').value='0';$('section').checked=false;$('section-pos').hidden=true;
  updateDims();updateScene();camera.position.set(-1,-1,.75);controls.target.set(0,0,0);fit();showError('');
}
function updateDims(){if(state.model){const all=$('part').value==='all',bounds=all?state.model.bounds:state.model.parts[Number($('part').value)].bounds;$('dims').textContent=`${all?'总装':'零件'}外形 X / Y / Z：${bounds.size.map(fmt).join(' × ')} ${$('unit').value}`;}}
function updateScene(){
  const explode=Number($('explode').value)/100;
  plane.constant=Number($('section-pos').value)/100*state.radius;
  state.meshes.forEach((mesh,i)=>{mesh.position.copy(mesh.userData.shift).multiplyScalar(explode);mesh.visible=$('part').value==='all'||$('part').value===String(i);mesh.material.clippingPlanes=$('section').checked?[plane]:[];mesh.children[0].material.clippingPlanes=mesh.material.clippingPlanes;});
  updateAnnotations();render();
}
function updateAnnotations(){
  dispose(annotations);
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
function updateMeasurementText(){
  if(state.points.length===0){$('measure-result').textContent=state.measureMode?'选择第一个测量点。':'开启“两点测量”后，在模型上选择两个点。';return;}
  if(state.points.length===1){$('measure-result').textContent=`点 A：${state.points[0].model.toArray().map(fmt).join(', ')} ${$('unit').value}；选择第二个点。`;return;}
  const delta=state.points[1].model.clone().sub(state.points[0].model);
  $('measure-result').textContent=`距离 ≈ ${fmt(delta.length())} ${$('unit').value}　|　ΔX ${fmt(Math.abs(delta.x))}　ΔY ${fmt(Math.abs(delta.y))}　ΔZ ${fmt(Math.abs(delta.z))}`;
}
function clearMeasurement(){state.points=[];dispose(annotations);updateMeasurementText();render();}
function selectAt(event){
  const rect=renderer.domElement.getBoundingClientRect();ndc.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(ndc,camera);
  const hit=raycaster.intersectObjects(state.meshes.filter(m=>m.visible),false).find(h=>!$('section').checked||plane.distanceToPoint(h.point)>=-1e-6);
  if(!hit)return;
  state.meshes.forEach(m=>m.material.emissive.set(0x000000));hit.object.material.emissive.copy(hit.object.userData.baseColor).multiplyScalar(.2);
  $('part-detail').textContent=hit.object.userData.part.name;
  if(state.measureMode){
    const local=hit.object.worldToLocal(hit.point.clone());
    if($('snap').checked){const pos=hit.object.geometry.attributes.position;const candidates=[hit.face.a,hit.face.b,hit.face.c].map(i=>new THREE.Vector3().fromBufferAttribute(pos,i));candidates.sort((a,b)=>a.distanceToSquared(local)-b.distanceToSquared(local));local.copy(candidates[0]);}
    if(state.points.length===2)state.points=[];
    state.points.push({model:local.add(state.center),partId:state.meshes.indexOf(hit.object)});updateAnnotations();rememberMeasurement();
  }
  render();
}
let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)down={x:e.clientX,y:e.clientY,id:e.pointerId};});
renderer.domElement.addEventListener('pointerup',e=>{if(down&&e.pointerId===down.id&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<4)selectAt(e);down=null;});
renderer.domElement.addEventListener('pointercancel',()=>down=null);
$('fit').onclick=fit;$('clear').onclick=clearMeasurement;
$('measure').onclick=()=>{state.measureMode=!state.measureMode;$('measure').setAttribute('aria-pressed',String(state.measureMode));if(state.measureMode)updateMeasurementText();else clearMeasurement();};
$('explode').oninput=updateScene;$('section-pos').oninput=updateScene;
$('section').onchange=()=>{$('section-pos').hidden=!$('section').checked;updateScene();};
$('part').onchange=()=>{updateDims();updateScene();fit();};
$('unit').onchange=()=>{updateDims();updateMeasurementText();};
$('stl-unit').onchange=async()=>{if(state.lastBytes&&state.lastName?.toLowerCase().endsWith('.stl'))await openBytes(state.lastBytes,state.lastName);};
function toBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
async function call(name,args){
  let result;
  if(state.app)result=await state.app.callServerTool({name,arguments:args});
  else {const response=await fetch(name==='cad_demo'?'/api/demo':'/api/convert',name==='cad_demo'?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});result=await response.json();}
  if(result.error||result.isError)throw new Error(result.error || result.content?.find(c=>c.type==='text')?.text || '无法读取模型');
  if(result._meta?.model)loadModel(result._meta.model);
  return result;
}
async function openBytes(bytes,name){
  if(bytes.byteLength>30*1024*1024)throw new Error('文件超过 30 MB。');
  state.lastBytes=bytes;state.lastName=name;$('file-name').textContent='正在读取模型…';
  $('file').disabled=true;$('demo').disabled=true;$('stl-unit').disabled=true;root.setAttribute('aria-busy','true');
  try{await call('convert_cad',{name,base64:toBase64(bytes),tolerance:.05,stlUnits:$('stl-unit').value});}
  catch(e){if(state.model)$('file-name').textContent=state.model.name;throw e;}
  finally{$('file').disabled=false;$('demo').disabled=false;$('stl-unit').disabled=false;root.removeAttribute('aria-busy');}
}
$('file').onchange=async()=>{try{const f=$('file').files[0];if(f)await openBytes(new Uint8Array(await f.arrayBuffer()),f.name);}catch(e){showError(e);}finally{$('file').value='';}};
$('demo').onclick=()=>call('cad_demo',{}).catch(showError);
async function start(){
  resize();
  if(window.parent!==window){
    const app=new App({name:'cad-viewer-ui',version:'0.1.2'},{},{autoResize:true});state.app=app;
    const ext=new OpenAIExtensions(app);state.extensions=ext;
    app.ontoolresult=params=>{if(params._meta?.model)loadModel(params._meta.model);else if(params.isError)showError(params.content?.find(c=>c.type==='text')?.text || '无法读取模型');};
    app.ontoolinput=async({arguments:args})=>{
      const input=OpenAIFileEntrypointInputSchema.safeParse(args);
      if(!input.success)return;
      try{
        if(!ext.resources)throw new Error('当前客户端未提供文件读取接口，请使用“打开文件”。');
        const resource=await ext.resources.read({uri:input.data.file.resourceUri,representation:'blob'});
        const content=resource.contents.find(c=>'blob' in c);
        if(!content)throw new Error('文件内容不可用，请使用“打开文件”。');
        const raw=atob(content.blob);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
        const file=input.data.file;const uriName=decodeURIComponent(file.resourceUri.split('/').pop()?.split('?')[0]||'');
        await openBytes(bytes,file.name||file.filename||uriName);
      }catch(e){showError(e);}
    };
    app.onteardown=async()=>{controls.dispose();renderer.dispose();dispose(modelGroup);dispose(annotations);return {};};
    await app.connect();
  }else {const response=await fetch('/api/model');const result=await response.json();if(result._meta?.model)loadModel(result._meta.model);}
}
start().catch(showError);
