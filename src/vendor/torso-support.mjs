import {Quaternion,Vector3} from 'three'

// Existing v05 chest pad top and the interval between its chest/hip pads.
// This continuous insert is a local fitting study, not a measured real aircraft.
export const GLIDER_SUPPORT=Object.freeze({center:[0,-.6325,.07],size:[.4,.04,1.09],topY:-.6125,headZ:.76,clearanceM:.001,grip:[.2,-.45,.75],elbowPole:[.4,-.53,.35]})

export function gliderSupportSurface(frame,{trim=0,revision=0}={}){
  frame.updateWorldMatrix(true,false)
  const point=(x,y,z)=>frame.localToWorld(new Vector3(x,y,z))
  return {point:point(0,GLIDER_SUPPORT.topY,GLIDER_SUPPORT.center[2]),normal:new Vector3(0,1,0).transformDirection(frame.matrixWorld),forward:new Vector3(0,0,1).transformDirection(frame.matrixWorld),lateral:new Vector3(1,0,0).transformDirection(frame.matrixWorld),headProjection:point(0,0,GLIDER_SUPPORT.headZ),halfSize:[GLIDER_SUPPORT.size[0]/2,GLIDER_SUPPORT.size[2]/2],clearanceM:GLIDER_SUPPORT.clearanceM,neckExtension:Math.max(.15,Math.min(.85,.4+trim*4)),revision,grips:Object.fromEntries([[1,'left'],[-1,'right']].map(([sign,side])=>[side,point(sign*GLIDER_SUPPORT.grip[0],GLIDER_SUPPORT.grip[1],GLIDER_SUPPORT.grip[2])])),elbowPoles:Object.fromEntries([[1,'left'],[-1,'right']].map(([sign,side])=>[side,point(sign*GLIDER_SUPPORT.elbowPole[0],GLIDER_SUPPORT.elbowPole[1],GLIDER_SUPPORT.elbowPole[2])]))}
}

/** Cache a small skin sample once; never walk all avatar vertices per frame. */
export function prepareTorsoSamples(rig,restWorld,restBasis){
  const b=rig.bones,regions={chest:[],abdomen:[]}
  if(!b.chest||!b.spine)return {regions,source:'unavailable'}
  const position=bone=>new Vector3().setFromMatrixPosition(restWorld.get(bone))
  const up=new Vector3(0,1,0).applyQuaternion(restBasis),left=new Vector3(1,0,0).applyQuaternion(restBasis),face=new Vector3(0,0,1).applyQuaternion(restBasis)
  const hips=position(b.hips),chest=position(b.chest),spine=position(b.spine),width=position(b.leftUpperArm).distanceTo(position(b.rightUpperArm))
  // Find the common avatar scope; some hosts put face and body in separate skins.
  let scope=rig.mesh
  while(scope.parent&&!contains(scope,b.hips))scope=scope.parent
  const meshes=[];scope.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton.bones.includes(b.hips))meshes.push(o)})
  const core=new Set([b.hips,b.spine,b.chest]),seen=new Set()
  for(const mesh of meshes){
    const g=mesh.geometry,positions=g.getAttribute('position'),indices=g.getAttribute('skinIndex'),weights=g.getAttribute('skinWeight')
    if(!positions||!indices||!weights||seen.has(g.uuid))continue
    seen.add(g.uuid)
    for(let index=0;index<positions.count;index++){
      let torsoWeight=0
      for(let j=0;j<4;j++)if(core.has(mesh.skeleton.bones[indices.getComponent(index,j)]))torsoWeight+=weights.getComponent(index,j)
      if(torsoWeight<.7)continue
      const p=new Vector3().fromBufferAttribute(positions,index).applyMatrix4(mesh.bindMatrix),side=p.clone().sub(hips).dot(left)
      if(Math.abs(side)>width*.46)continue
      const dc=Math.abs(p.clone().sub(chest).dot(up)),da=Math.abs(p.clone().sub(spine).dot(up)),region=dc<=da?'chest':'abdomen',center=region==='chest'?chest:spine
      if(Math.min(dc,da)>width*.55)continue
      const anterior=p.clone().sub(center).dot(face)
      if(anterior<=0)continue
      regions[region].push({mesh,index,anterior})
    }
  }
  for(const key of Object.keys(regions)){
    const samples=regions[key],maximum=samples.reduce((maximum,s)=>Math.max(maximum,s.anterior),0)
    // Retain the anterior surface; exclude back, hair and distant cloth edges.
    const front=samples.filter(s=>s.anterior>=maximum*.7)
    regions[key]=front.filter((_,i)=>i%Math.max(1,Math.ceil(front.length/48))===0).slice(0,48)
  }
  return {regions,source:regions.chest.length&&regions.abdomen.length?'sampled-skin':'unavailable'}
}
function contains(root,bone){for(let p=bone;p;p=p.parent)if(p===root)return true;return false}
function worldPoint(bone){return bone.getWorldPosition(new Vector3())}
function setWorldQuaternion(bone,q){const parent=bone.parent?.getWorldQuaternion(new Quaternion())??new Quaternion();bone.quaternion.copy(parent.invert().multiply(q));bone.updateWorldMatrix(true,true)}
function translateWorld(bone,delta){const p=worldPoint(bone).add(delta);if(bone.parent)bone.parent.worldToLocal(p);bone.position.copy(p);bone.updateWorldMatrix(true,true)}
function skinPoint(sample){const p=new Vector3().fromBufferAttribute(sample.mesh.geometry.getAttribute('position'),sample.index);sample.mesh.applyBoneTransform(sample.index,p);return sample.mesh.localToWorld(p)}
function closest(rig,region,surface){
  let result=null
  for(const sample of rig.torsoSamples.regions[region]){
    const point=skinPoint(sample),gap=point.clone().sub(surface.point).dot(surface.normal)
    if(!result||gap<result.gap)result={point,gap}
  }
  return result
}
export function measureTorsoSurface(rig,surface){
  if(rig.torsoSamples.source!=='sampled-skin')return {source:'unavailable',fitted:false}
  const chest=closest(rig,'chest',surface),abdomen=closest(rig,'abdomen',surface)
  const inside=p=>!surface.halfSize||(Math.abs(p.clone().sub(surface.point).dot(surface.lateral))<=surface.halfSize[0]&&Math.abs(p.clone().sub(surface.point).dot(surface.forward))<=surface.halfSize[1])
  return {source:'sampled-skin',fitted:false,chestGapMm:chest.gap*1000,abdomenGapMm:abdomen.gap*1000,withinBoard:inside(chest.point)&&inside(abdomen.point),headWorldPosition:worldPoint(rig.bones.head).toArray()}
}

/** Fit torso skin to a real support plane, rather than suspending it at eye height.
 * The fitted head position is an OUTPUT. A host Seat must use that calibration
 * before this mode is enabled for actual riders; render callbacks never move a camera.
 */
export function fitTorsoToSurface(rig,surface){
  if(rig.torsoSamples.source!=='sampled-skin')return {source:'unavailable',fitted:false}
  const {normal,forward,lateral}=surface,clearance=surface.clearanceM??.001
  let chest,abdomen,pitch=0
  for(let i=0;i<4;i++){
    chest=closest(rig,'chest',surface);abdomen=closest(rig,'abdomen',surface)
    const delta=chest.point.clone().sub(abdomen.point),length=delta.dot(forward)
    if(Math.abs(length)<.03)return {source:'sampled-skin',fitted:false}
    const step=Math.max(-.12,Math.min(.12,Math.atan2(delta.dot(normal),length))),next=Math.max(-.26,Math.min(.26,pitch+step))
    setWorldQuaternion(rig.bones.hips,new Quaternion().setFromAxisAngle(lateral,next-pitch).multiply(rig.bones.hips.getWorldQuaternion(new Quaternion())));pitch=next
    chest=closest(rig,'chest',surface);abdomen=closest(rig,'abdomen',surface)
    translateWorld(rig.bones.hips,normal.clone().multiplyScalar(clearance-Math.min(chest.gap,abdomen.gap)))
    if(Math.abs(chest.gap-abdomen.gap)<.0001)break
  }
  // Keep the pilot longitudinally over the support, independent of camera position.
  if(surface.headProjection){
    const delta=surface.headProjection.clone().sub(worldPoint(rig.bones.head))
    translateWorld(rig.bones.hips,forward.clone().multiplyScalar(delta.dot(forward)).addScaledVector(lateral,delta.dot(lateral)))
  }
  const result=measureTorsoSurface(rig,surface)
  const aligned=result.chestGapMm>=-.1&&result.abdomenGapMm>=-.1&&Math.max(result.chestGapMm,result.abdomenGapMm)<=clearance*1000+2
  return {...result,aligned,fitted:aligned&&result.withinBoard,pitchDegrees:pitch*180/Math.PI,revision:surface.revision??0}
}
