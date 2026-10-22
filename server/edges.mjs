import {buildFaces,enrichCylinders} from './faces.mjs';
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a);
const unit=a=>{const d=norm(a);return d?a.map(v=>v/d):[0,0,0];};
const distance=(a,b)=>norm(sub(a,b));
const pathLength=p=>p.slice(1).reduce((s,v,i)=>s+distance(v,p[i]),0);

// Fit in a local plane to avoid losing small radii at large assembly coordinates.
export function fitCircle(input,closed=false){
  const points=input.slice();if(points.length>1&&distance(points[0],points.at(-1))<1e-9)points.pop();
  if(points.length<(closed?10:5))return null;
  const origin=[0,1,2].map(i=>points.reduce((s,p)=>s+p[i],0)/points.length),local=points.map(p=>sub(p,origin));
  const u=unit(local.reduce((a,b)=>norm(a)>norm(b)?a:b)),axis=local.map(p=>cross(u,p)).reduce((a,b)=>norm(a)>norm(b)?a:b),normal=unit(axis);
  if(norm(axis)<1e-10)return null;
  const v=cross(normal,u),scale=local.reduce((largest,p)=>Math.max(largest,norm(p)),0);if(!scale)return null;
  const xy=local.map(p=>[dot(p,u)/scale,dot(p,v)/scale]);let xx=0,yy=0,xySum=0,bx=0,by=0;
  for(const [x,y] of xy){const r2=x*x+y*y;xx+=x*x;yy+=y*y;xySum+=x*y;bx+=x*r2/2;by+=y*r2/2;}
  const determinant=xx*yy-xySum*xySum;if(determinant<1e-10*(xx+yy)**2)return null;
  const cx=(bx*yy-by*xySum)/determinant,cy=(by*xx-bx*xySum)/determinant;
  const radius=scale*Math.sqrt((xx+yy)/points.length+cx*cx+cy*cy),center=origin.map((p,i)=>p+scale*(u[i]*cx+v[i]*cy));
  const tolerance=Math.max(1e-6,scale*2e-7,radius*1e-4);
  const planeError=local.reduce((largest,p)=>Math.max(largest,Math.abs(dot(p,normal))),0);
  const residual=points.reduce((largest,p)=>Math.max(largest,Math.abs(distance(p,center)-radius)),0);
  if(planeError>tolerance||residual>tolerance)return null;
  const angles=xy.map(([x,y])=>Math.atan2(y-cy,x-cx));let sweep=0,sign=0;
  for(let i=1;i<angles.length+(closed?1:0);i++){
    const delta=Math.atan2(Math.sin(angles[i%angles.length]-angles[i-1]),Math.cos(angles[i%angles.length]-angles[i-1]));
    if(Math.abs(delta)>Math.PI/2||Math.abs(delta)<1e-10)return null;
    if(sign&&Math.sign(delta)!==sign)return null;sign=Math.sign(delta);sweep+=delta;
  }
  if(closed?Math.abs(Math.abs(sweep)-Math.PI*2)>.01:Math.abs(sweep)<.12||Math.abs(sweep)>Math.PI*2+.001)return null;
  return {center,radius,diameter:radius*2,normal,residual,angle:Math.abs(sweep)*180/Math.PI,length:radius*Math.abs(sweep)};
}

function primitives(points,closed,epsilon){
  const total=pathLength(points),span=distance(points[0],points.at(-1));
  if(!closed&&total-span<=Math.max(epsilon*5,total*1e-7))return [{type:'line',points:[points[0],points.at(-1)],length:span,closed:false}];
  const circle=fitCircle(points,closed);
  if(circle)return [{type:closed?'circle':'arc',points,closed,...circle}];
  const p=closed?points.slice(0,-1):points,kinks=[];
  for(let i=closed?0:1;i<(closed?p.length:p.length-1);i++){
    const a=unit(sub(p[i],p[(i+p.length-1)%p.length])),b=unit(sub(p[(i+1)%p.length],p[i]));
    if(dot(a,b)<Math.cos(Math.PI/9))kinks.push(i);
  }
  if(kinks.length){
    const breaks=closed?kinks:[0,...kinks,p.length-1],result=[];
    for(let i=0;i<breaks.length-(closed?0:1);i++){
      const start=breaks[i],end=breaks[(i+1)%breaks.length],segment=[];let j=start;segment.push(p[j]);
      do{j=(j+1)%p.length;segment.push(p[j]);}while(j!==end);
      const length=pathLength(segment),line=distance(segment[0],segment.at(-1)),arc=fitCircle(segment,false);
      result.push(length-line<=Math.max(epsilon*5,length*1e-7)?{type:'line',points:[segment[0],segment.at(-1)],closed:false,length:line}:arc?{type:'arc',points:segment,closed:false,...arc}:{type:'curve',points:segment,closed:false,length});
    }
    return result;
  }
  return [{type:'curve',points,closed,length:total}];
}

// STEP face boundaries are preferred. STL falls back to mesh boundaries and 35-degree creases.
// All returned measurements are mesh-derived, including circles fitted through boundary vertices.
export function extractEdges(positions,indices,faces=[]){
  if(indices.length/3>250000)return {features:[],featureStatus:'limit',faces:[],faceMap:null};
  let size=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i++){const k=i%3;min[k]=Math.min(min[k],positions[i]);max[k]=Math.max(max[k],positions[i]);}
  size=distance(min,max);const epsilon=Math.max(size*1e-8,1e-7),vertices=[],welded=new Uint32Array(positions.length/3),buckets=new Map();
  for(let i=0;i<welded.length;i++){
    const p=[positions[i*3],positions[i*3+1],positions[i*3+2]],key=p.map((n,k)=>Math.round((n-min[k])/epsilon)).join(',');
    let id=buckets.get(key);if(id===undefined){id=vertices.length;vertices.push(p);buckets.set(key,id);}welded[i]=id;
  }
  const faceIds=new Int32Array(indices.length/3).fill(-1);
  for(let i=0;i<faces.length;i++){const [first,last]=faces[i];if(Number.isInteger(first)&&Number.isInteger(last)&&first>=0&&last<faceIds.length)faceIds.fill(i,first,last+1);}
  const edges=new Map(),cosine=Math.cos(35*Math.PI/180);
  for(let i=0;i<indices.length;i+=3){
    const ids=[welded[indices[i]],welded[indices[i+1]],welded[indices[i+2]]];if(new Set(ids).size<3)continue;
    const normal=unit(cross(sub(vertices[ids[1]],vertices[ids[0]]),sub(vertices[ids[2]],vertices[ids[0]]))),face=faceIds[i/3];
    for(let j=0;j<3;j++){
      const a=ids[j],b=ids[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`,old=edges.get(key);
      if(!old)edges.set(key,{a,b,normal,face,triangle:i/3,count:1,feature:false});
      else{old.otherTriangle=i/3;old.coplanar=Math.abs(dot(normal,old.normal))>1-1e-8;old.count++;old.feature||=old.count>2||(face>=0&&old.face>=0?face!==old.face:dot(normal,old.normal)<cosine);}
    }
  }
  const boundary=[...edges.values()].filter(e=>e.count===1||e.feature),adjacent=new Map();
  boundary.forEach((e,i)=>{for(const id of [e.a,e.b]){if(!adjacent.has(id))adjacent.set(id,[]);adjacent.get(id).push(i);}});
  const {faces:faceData,faceMap,groups}=buildFaces(positions,indices,faceIds,edges);
  const used=new Set(),features=[];let samples=0,limited=false;
  function trace(start,edgeId){
    if(limited)return;const points=[vertices[start]],sourceFaces=new Set();let node=start,nextEdge=edgeId;
    do{used.add(nextEdge);const edge=boundary[nextEdge];sourceFaces.add(faceMap[edge.triangle]);if(edge.otherTriangle!==undefined)sourceFaces.add(faceMap[edge.otherTriangle]);node=edge.a===node?edge.b:edge.a;points.push(vertices[node]);const links=adjacent.get(node);if(node===start||links.length!==2)break;nextEdge=links.find(i=>!used.has(i));}while(nextEdge!==undefined);
    for(const feature of primitives(points,node===start,epsilon)){
      samples+=feature.points.length;if(features.length>=5000||samples>100000){limited=true;break;}
      if(feature.length>epsilon*2)features.push({id:features.length,approximate:true,faceIds:[...sourceFaces],...feature});
    }
  }
  for(const [node,links] of adjacent)if(links.length!==2)for(const id of links)if(!used.has(id))trace(node,id);
  boundary.forEach((edge,i)=>{if(!used.has(i))trace(edge.a,i);});
  enrichCylinders(faceData,groups,features,positions,indices);
  return {features,featureStatus:limited?'limit':'ready',faces:faceData,faceMap:faceData.length?faceMap:null};
}
