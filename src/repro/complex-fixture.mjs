// Authored adversarial skeletons. These do NOT claim to be the user's VRM.
import {Bone,Group,Skeleton,SkinnedMesh,BoxGeometry,MeshStandardMaterial,Float32BufferAttribute,Uint16BufferAttribute,Vector3} from 'three'
import {createPoseFixture} from '../vendor/fixture.mjs'

function skinBox(bone,size,offset,color){
 bone.updateWorldMatrix(true,true)
 const geometry=new BoxGeometry(...size);geometry.translate(...offset);geometry.applyMatrix4(bone.matrixWorld)
 const count=geometry.getAttribute('position').count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4)
 for(let i=0;i<count;i++)weights[i*4]=1
 geometry.setAttribute('skinIndex',new Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new Float32BufferAttribute(weights,4))
 const material=new MeshStandardMaterial({color,roughness:.85}),mesh=new SkinnedMesh(geometry,material),skeleton=new Skeleton([bone])
 mesh.bind(skeleton);mesh.frustumCulled=false
 return {mesh,skeleton,dispose(){geometry.dispose();material.dispose();skeleton.dispose()}}
}
export function createComplexFixture(kind='cloth'){
 const body=createPoseFixture(),accessories=[],omitted=[],cloth=[]
 // Reparent without changing the neutral world pose. The non-deforming pivot
 // is legitimately absent from the skin's joint palette.
 if(kind==='leg-pivot')for(const side of ['left','right']){
  const lower=body.bones[side+'LowerLeg'],parent=lower.parent,pivot=new Bone();pivot.name=side+'UnweightedKneeSpace';pivot.rotation.z=Math.PI;parent.add(pivot);parent.updateWorldMatrix(true,true);pivot.attach(lower);omitted.push(pivot)
 }
 if(kind==='cloth')for(const [sign,side] of [[1,'left'],[-1,'right']]){
  const space=new Group();space.name=side+'GarmentExportSpace';space.position.x=sign*.2;space.rotation.x=Math.PI;body.bones.hips.add(space)
  const bone=new Bone();bone.name=side+'CoatHem';bone.rotation.x=Math.PI;space.add(bone);cloth.push(bone)
  body.mesh.updateWorldMatrix(true,true)
  const panel=skinBox(bone,[.3,1.15,.12],[0,-.575,0],'#1736bc');body.mesh.add(panel.mesh);accessories.push(panel)
  // A full avatar palette may contain the accessory joint too; all of the
  // preceding body-only tests lacked this common exported hierarchy.
  body.skeleton.bones.push(bone)
 }
 if(kind==='helper-alias')for(const side of ['left','right']){
  const helper=new Bone();helper.name=side+'UpperLeg_sub';helper.position.set(.02,-.1,0);body.bones[side+'UpperLeg'].add(helper);body.skeleton.bones.push(helper)
 }
 body.mesh.updateWorldMatrix(true,true);body.skeleton.calculateInverses()
 const poseRest=body.skeleton.bones.map(b=>({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}))
 const neutral=()=>{for(const {b,p,q,s} of poseRest){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s)}body.mesh.updateWorldMatrix(true,true)}
 function seated(t=0){
  neutral()
  for(const side of ['left','right']){body.bones[side+'UpperLeg'].rotation.x=-Math.PI/2;body.bones[side+'LowerLeg'].rotateX(Math.PI/2);body.bones[side+'UpperArm'].rotation.z=side==='left'?-Math.PI/2:Math.PI/2;body.bones[side+'LowerArm'].rotation.x=-.6}
  body.bones.head.rotation.y=Math.sin(t*.6)*.22;body.mesh.updateWorldMatrix(true,true);body.skeleton.update();accessories.forEach(a=>a.skeleton.update())
 }
 function measure(){
  body.mesh.updateWorldMatrix(true,true)
  const pos=b=>b.getWorldPosition(new Vector3()),hip=pos(body.bones.hips)
  const legs=['left','right'].map(side=>{
   const upper=pos(body.bones[side+'UpperLeg']),lower=pos(body.bones[side+'LowerLeg']),foot=pos(body.bones[side+'Foot'])
   return {kneeDegrees:180-upper.clone().sub(lower).angleTo(foot.clone().sub(lower))*180/Math.PI,footRelativeHipY:foot.y-hip.y,thighLength:upper.distanceTo(lower),calfLength:lower.distanceTo(foot)}
  })
  const panels=cloth.map(b=>{const root=pos(b),tip=b.localToWorld(new Vector3(0,-1.15,0));return {tipRelativeRootY:tip.y-root.y,tipRelativeHipY:tip.y-hip.y,localPosition:b.position.toArray(),localQuaternion:b.quaternion.toArray()}})
  return {legs,panels}
 }
 return {...body,seated,neutral,kind,cloth,omitted,accessories,measure,dispose(){accessories.forEach(a=>a.dispose());body.dispose()}}
}
