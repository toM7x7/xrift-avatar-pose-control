// Original, deliberately simple skinned test body. This is not a user's avatar.
import {Bone,Skeleton,SkinnedMesh,BoxGeometry,MeshStandardMaterial,Matrix4,Color,Float32BufferAttribute,Uint16BufferAttribute} from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'
export function createPoseFixture(){
  const bones=[],byName={}
  const bone=(name,position,parent)=>{const b=new Bone();b.name=name;b.position.fromArray(position);if(parent)parent.add(b);bones.push(b);byName[name]=b;return b}
  const hips=bone('hips',[0,.90,0]),spine=bone('spine',[0,.16,0],hips),chest=bone('chest',[0,.20,0],spine),neck=bone('neck',[0,.18,0],chest),head=bone('head',[0,.10,0],neck)
  for(const [sign,side] of [[1,'left'],[-1,'right']]){
    const a=bone(side+'UpperArm',[sign*.20,.12,0],chest),e=bone(side+'LowerArm',[sign*.28,0,0],a);bone(side+'Hand',[sign*.25,0,0],e)
    const h=bone(side+'UpperLeg',[sign*.10,-.04,0],hips),k=bone(side+'LowerLeg',[0,-.40,0],h);bone(side+'Foot',[0,-.39,.02],k)
  }
  hips.updateMatrixWorld(true)
  const pieces=[],headPieces=[]
  const box=(b,size,offset,color)=>{
    const g=new BoxGeometry(...size);g.translate(...offset);g.applyMatrix4(b.matrixWorld)
    const count=g.attributes.position.count,index=bones.indexOf(b),indices=[],weights=[],colors=[],c=new Color(color)
    for(let i=0;i<count;i++){indices.push(index,0,0,0);weights.push(1,0,0,0);colors.push(c.r,c.g,c.b)}
    g.setAttribute('skinIndex',new Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));g.setAttribute('color',new Float32BufferAttribute(colors,3));(b===head?headPieces:pieces).push(g)
  }
  box(hips,[.28,.19,.18],[0,0,0],'#425d70');box(spine,[.29,.20,.18],[0,.06,0],'#347f91');box(chest,[.34,.22,.20],[0,.04,0],'#347f91');box(neck,[.09,.10,.09],[0,.02,0],'#cead87');box(head,[.18,.23,.19],[0,.085,.015],'#dfbd96');box(head,[.14,.035,.018],[0,.10,.118],'#374852')
  for(const [sign,side] of [[1,'left'],[-1,'right']]){
    box(byName[side+'UpperArm'],[.28,.10,.11],[sign*.14,0,0],'#347f91');box(byName[side+'LowerArm'],[.25,.075,.08],[sign*.125,0,0],'#dfbd96');box(byName[side+'Hand'],[.11,.065,.08],[sign*.035,0,0],'#dfbd96')
    box(byName[side+'UpperLeg'],[.125,.40,.14],[0,-.20,0],'#425d70');box(byName[side+'LowerLeg'],[.09,.39,.10],[0,-.195,0],'#425d70');box(byName[side+'Foot'],[.105,.075,.23],[0,-.025,.075],'#283b45')
  }
  const geometry=mergeGeometries(pieces),headGeometry=mergeGeometries(headPieces),material=new MeshStandardMaterial({vertexColors:true,roughness:.9}),mesh=new SkinnedMesh(geometry,material)
  ;[...pieces,...headPieces].forEach(p=>p.dispose());mesh.name='authored-pose-test-body';mesh.frustumCulled=false;mesh.userData.poseLabFixture=true;mesh.add(hips)
  const skeleton=new Skeleton(bones);mesh.bind(skeleton)
  // Same third-person layer used by XRift: don't look through one's own face.
  const headMesh=new SkinnedMesh(headGeometry,material);headMesh.name='authored-pose-test-head';headMesh.frustumCulled=false;headMesh.layers.set(10);mesh.add(headMesh);headMesh.bind(skeleton,new Matrix4())
  const rest=bones.map(b=>b.quaternion.clone())
  function seated(time=0){
    bones.forEach((b,i)=>b.quaternion.copy(rest[i]))
    for(const side of ['left','right']){byName[side+'UpperLeg'].rotation.x=-Math.PI/2;byName[side+'LowerLeg'].rotation.x=Math.PI/2;byName[side+'UpperArm'].rotation.z=side==='left'?-Math.PI/2:Math.PI/2;byName[side+'LowerArm'].rotation.x=-.6}
    head.rotation.y=Math.sin(time*.6)*.22;head.rotation.x=Math.sin(time*.4)*.07;hips.updateWorldMatrix(true,true);skeleton.update()
  }
  return {mesh,skeleton,bones:byName,seated,dispose(){geometry.dispose();headGeometry.dispose();material.dispose();skeleton.dispose()}}
}
