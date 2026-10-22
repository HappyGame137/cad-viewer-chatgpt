const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=a=>Math.hypot(...a);
const point=(positions,index)=>[positions[index*3],positions[index*3+1],positions[index*3+2]];

export function measureFace(positions,indices,triangleIds=null){
  let area=0,reference=null,planar=true;const weighted=[0,0,0],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const triangle of triangleIds||Array.from({length:indices.length/3},(_,i)=>i)){
    const p=[0,1,2].map(j=>point(positions,indices[triangle*3+j]));
    const n=cross(sub(p[1],p[0]),sub(p[2],p[0])),twiceArea=length(n);if(twiceArea<1e-20)continue;
    const normal=n.map(v=>v/twiceArea);reference||=normal;if(Math.abs(dot(reference,normal))<1-1e-6)planar=false;
    const a=twiceArea/2;area+=a;
    for(let i=0;i<3;i++){weighted[i]+=(p[0][i]+p[1][i]+p[2][i])/3*a;for(const v of p){min[i]=Math.min(min[i],v[i]);max[i]=Math.max(max[i],v[i]);}}
  }
  if(!area)return {surfaceType:'mesh',area:0,centroid:[0,0,0],bounds:{min:[0,0,0],max:[0,0,0],size:[0,0,0]}};
  const centroid=weighted.map(v=>v/area),result={surfaceType:planar?'plane':'curved',area,centroid,bounds:{min,max,size:max.map((v,i)=>v-min[i])}};
  if(planar){result.normal=reference;result.planeOffset=-dot(reference,centroid);}
  return result;
}

export function buildFaces(positions,indices,sourceFaceIds,edges){
  const count=indices.length/3,parent=Uint32Array.from({length:count},(_,i)=>i);
  const find=i=>{let root=i;while(parent[root]!==root)root=parent[root];while(parent[i]!==i){const next=parent[i];parent[i]=root;i=next;}return root;};
  for(const edge of edges.values())if(edge.otherTriangle!==undefined&&edge.coplanar&&sourceFaceIds[edge.triangle]<0&&sourceFaceIds[edge.otherTriangle]<0){const a=find(edge.triangle),b=find(edge.otherTriangle);if(a!==b)parent[b]=a;}
  const groups=[],ids=new Map(),faceMap=new Uint32Array(count);
  for(let i=0;i<count;i++){
    const key=sourceFaceIds[i]>=0?'face'+sourceFaceIds[i]:'mesh'+find(i);let id=ids.get(key);
    if(id===undefined){id=groups.length;ids.set(key,id);groups.push([]);}groups[id].push(i);faceMap[i]=id;
  }
  if(groups.length>10000)return {faces:[],faceMap,groups:[]};
  const faces=groups.map((triangles,id)=>({id,...measureFace(positions,indices,triangles)}));
  return {faces,faceMap,groups};
}

export function enrichCylinders(faces,groups,features,positions,indices){
  const circular=features.filter(f=>f.type==='circle'||f.type==='arc');
  for(const face of faces){
    if(face.surfaceType!=='curved')continue;const candidates=circular.filter(f=>f.faceIds.includes(face.id));let found=false;
    for(let i=0;i<candidates.length&&!found;i++)for(let j=i+1;j<candidates.length&&!found;j++){
      const a=candidates[i],b=candidates[j],delta=sub(b.center,a.center),h=length(delta),radius=(a.radius+b.radius)/2,tolerance=Math.max(radius*3e-4,1e-6);
      if(h<1e-6||Math.abs(a.radius-b.radius)>tolerance||Math.abs(dot(a.normal,b.normal))<.9999)continue;
      const direction=delta.map(v=>v/h);if(Math.abs(dot(direction,a.normal))<.9999)continue;
      let low=Infinity,high=-Infinity,valid=true;
      for(const triangle of groups[face.id])for(let k=0;k<3;k++){
        const p=sub(point(positions,indices[triangle*3+k]),a.center),t=dot(p,direction),radial=p.map((v,i)=>v-t*direction[i]);
        if(Math.abs(length(radial)-radius)>tolerance){valid=false;break;}low=Math.min(low,t);high=Math.max(high,t);
      }
      if(valid){Object.assign(face,{surfaceType:'cylinder',radius,diameter:radius*2,height:high-low,axis:{origin:a.center,direction,min:low,max:high}});found=true;}
    }
  }
}
