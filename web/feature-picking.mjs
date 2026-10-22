import {Vector2,Vector3,Plane,Raycaster} from 'three';

export function pickEdge({meshes,center,camera,viewport,screen,clipPlane=null,occluded=()=>false}){
  const boundary=[],interior=[],ray=new Raycaster();
  ray.setFromCamera(new Vector2(screen[0]/viewport.width*2-1,-screen[1]/viewport.height*2+1),camera);
  const world=(point,mesh)=>new Vector3().fromArray(point).sub(center).add(mesh.position);
  const project=point=>{const p=point.clone().project(camera);return new Vector3((p.x+1)*viewport.width/2,(1-p.y)*viewport.height/2,p.z);};
  for(const mesh of meshes.filter(m=>m.visible))for(const feature of mesh.userData.part.features||[]){
    let best=null;
    for(let i=1;i<feature.points.length;i++){
      let a=world(feature.points[i-1],mesh),b=world(feature.points[i],mesh);
      if(clipPlane){const da=clipPlane.distanceToPoint(a),db=clipPlane.distanceToPoint(b);if(da<0&&db<0)continue;if(da<0)a.lerp(b,da/(da-db));else if(db<0)b.lerp(a,db/(db-da));}
      const pa=project(a),pb=project(b);if(pa.z< -1||pa.z>1||pb.z< -1||pb.z>1)continue;
      const dx=pb.x-pa.x,dy=pb.y-pa.y,length2=dx*dx+dy*dy;
      const t=length2?Math.max(0,Math.min(1,((screen[0]-pa.x)*dx+(screen[1]-pa.y)*dy)/length2)):0;
      const pixels=Math.hypot(screen[0]-pa.x-t*dx,screen[1]-pa.y-t*dy);
      if(pixels>9||best&&pixels>=best.pixels)continue;
      const depthA=-a.clone().applyMatrix4(camera.matrixWorldInverse).z,depthB=-b.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const weight=(t/depthB)/((1-t)/depthA+t/depthB),point=a.clone().lerp(b,weight);
      best={mesh,feature,point,pixels,depth:ray.ray.origin.distanceTo(point)};
    }
    if(best)boundary.push(best);
    if(feature.type==='circle'){
      const origin=world(feature.center,mesh),plane=new Plane().setFromNormalAndCoplanarPoint(new Vector3().fromArray(feature.normal),origin),point=ray.ray.intersectPlane(plane,new Vector3());
      if(point&&ray.ray.direction.dot(point.clone().sub(ray.ray.origin))>0&&point.distanceTo(origin)<=feature.radius&&(!clipPlane||clipPlane.distanceToPoint(point)>=0))interior.push({mesh,feature,point,depth:ray.ray.origin.distanceTo(point)});
    }
  }
  boundary.sort((a,b)=>a.pixels-b.pixels||a.depth-b.depth);interior.sort((a,b)=>a.depth-b.depth||a.feature.radius-b.feature.radius);
  return [...boundary,...interior].find(candidate=>!occluded(candidate.point))||null;
}

export function isFeatureOccluded(point,camera,meshes,clipPlane,scale){
  const ray=new Raycaster(camera.position,point.clone().sub(camera.position).normalize());
  const pickable=meshes.filter(m=>m.visible).flatMap(m=>m.userData.cap?.visible?[m,m.userData.cap]:[m]);
  const first=ray.intersectObjects(pickable,false).find(hit=>hit.object.userData.sourceMesh||!clipPlane||clipPlane.distanceToPoint(hit.point)>=-1e-6);
  return Boolean(first&&first.distance<camera.position.distanceTo(point)-Math.max(scale*1e-4,.001));
}
