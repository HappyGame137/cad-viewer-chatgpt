import {BufferGeometry,Float32BufferAttribute,ShapeUtils,Vector2} from 'three';

// The viewer keeps y <= cutY. Build its +Y-facing boundary from mesh/plane intersections.
// Separate contours and nesting preserve bores, cavities and islands rather than filling a bounding rectangle.
export function sectionGeometry(source,cutY){
  if(!source.boundingBox)source.computeBoundingBox();
  const box=source.boundingBox,epsilon=Math.max(box.max.distanceTo(box.min)*1e-7,1e-7);
  const empty=incomplete=>({geometry:new BufferGeometry(),outline:new BufferGeometry(),incomplete});
  if(cutY<=box.min.y+epsilon||cutY>=box.max.y-epsilon)return empty(false);
  const positions=source.attributes.position,index=source.index;
  const points=[],buckets=new Map(),edges=new Map();
  function weld(x,z){
    const gx=Math.round(x/epsilon),gz=Math.round(z/epsilon);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      for(const id of buckets.get(`${gx+dx},${gz+dz}`)||[]){const p=points[id];if((p.x-x)**2+(p.y-z)**2<=epsilon**2)return id;}
    }
    const id=points.length,key=`${gx},${gz}`;points.push(new Vector2(x,z));
    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);return id;
  }
  const count=index?index.count:positions.count;
  for(let i=0;i<count;i+=3){
    const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
    const d=ids.map(j=>positions.getY(j)-cutY),sign=d.map(v=>v>epsilon?1:v< -epsilon?-1:0);
    const zero=sign.filter(v=>v===0).length;
    if(zero===3)continue;
    if(zero===2){if(!sign.includes(-1))continue;}
    else if(!sign.includes(1)||!sign.includes(-1))continue;
    const hits=[];
    for(let j=0;j<3;j++){
      const a=ids[j],k=(j+1)%3,b=ids[k];
      if(sign[j]===0)hits.push(weld(positions.getX(a),positions.getZ(a)));
      if(sign[j]*sign[k]<0){const t=d[j]/(d[j]-d[k]);hits.push(weld(positions.getX(a)+(positions.getX(b)-positions.getX(a))*t,positions.getZ(a)+(positions.getZ(b)-positions.getZ(a))*t));}
    }
    const unique=[...new Set(hits)];if(unique.length!==2)continue;
    const [a,b]=unique,key=a<b?`${a},${b}`:`${b},${a}`;
    // A tangent edge shared by two retained triangles does not bound a cut face.
    if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);
  }
  if(!edges.size)return empty(false);
  const adjacent=new Map();
  for(const [a,b] of edges.values()){
    if(!adjacent.has(a))adjacent.set(a,[]);if(!adjacent.has(b))adjacent.set(b,[]);
    adjacent.get(a).push(b);adjacent.get(b).push(a);
  }
  // An open or branching contour may be a missing hole boundary: do not invent material there.
  if([...adjacent.values()].some(neighbors=>neighbors.length!==2))return empty(true);
  const visited=new Set(),loops=[];
  for(const start of adjacent.keys()){
    if(visited.has(start))continue;
    const loop=[];let current=start,previous=-1;
    do{visited.add(current);loop.push(points[current]);const next=adjacent.get(current).find(id=>id!==previous);previous=current;current=next;}while(current!==start&&!visited.has(current));
    if(current!==start||loop.length<3)return empty(true);
    const area=Math.abs(ShapeUtils.area(loop));if(area>epsilon**2)loops.push({points:loop,area,parent:null,depth:0});
  }
  loops.sort((a,b)=>b.area-a.area);
  function contains(p,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }return inside;}
  for(let i=0;i<loops.length;i++)for(let j=i-1;j>=0;j--)if(contains(loops[i].points[0],loops[j].points)){loops[i].parent=loops[j];loops[i].depth=loops[j].depth+1;break;}
  const vertices=[],triangles=[],lines=[];
  for(const outer of loops.filter(loop=>loop.depth%2===0)){
    const holes=loops.filter(loop=>loop.parent===outer&&loop.depth%2===1).map(loop=>loop.points.slice());
    const contour=outer.points.slice(),faces=ShapeUtils.triangulateShape(contour,holes),flat=[...contour,...holes.flat()],offset=vertices.length/3;
    let area=0;
    for(const [a,b,c] of faces){const p=flat[a],q=flat[b],r=flat[c],cross=(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);area+=Math.abs(cross)/2;triangles.push(offset+a,offset+(cross>0?c:b),offset+(cross>0?b:c));}
    const expected=outer.area-holes.reduce((sum,hole)=>sum+Math.abs(ShapeUtils.area(hole)),0);
    if(Math.abs(area-expected)>Math.max(epsilon**2*10,expected*1e-5))return empty(true);
    for(const p of flat)vertices.push(p.x,cutY,p.y);
  }
  for(const loop of loops)for(let i=0;i<loop.points.length;i++){
    const a=loop.points[i],b=loop.points[(i+1)%loop.points.length];lines.push(a.x,cutY,a.y,b.x,cutY,b.y);
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.setIndex(triangles);geometry.computeVertexNormals();
  const outline=new BufferGeometry();outline.setAttribute('position',new Float32BufferAttribute(lines,3));
  return {geometry,outline,incomplete:false};
}
