// Render-time correction using public Three.js skeletons; no host stores.
import {Matrix4,Quaternion,Vector3} from 'three'
import {prepareTorsoSamples,fitTorsoToSurface,measureTorsoSurface} from './torso-support.mjs'

const aliases={hips:['hips','pelvis','chips'],spine:['spine','cspine'],chest:['chest','cchest','spine1'],neck:['neck','cneck'],head:['head','chead'],leftUpperArm:['leftupperarm','leftarm','lupperarm'],leftLowerArm:['leftlowerarm','leftforearm','llowerarm'],leftHand:['lefthand','lhand'],rightUpperArm:['rightupperarm','rightarm','rupperarm'],rightLowerArm:['rightlowerarm','rightforearm','rlowerarm'],rightHand:['righthand','rhand'],leftUpperLeg:['leftupperleg','leftupleg','lupperleg'],leftLowerLeg:['leftlowerleg','leftleg','llowerleg'],leftFoot:['leftfoot','lfoot'],rightUpperLeg:['rightupperleg','rightupleg','rupperleg'],rightLowerLeg:['rightlowerleg','rightleg','rlowerleg'],rightFoot:['rightfoot','rfoot']}
const required=['hips','head','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot']
export function roleOf(name){const compact=name.toLowerCase().replace(/^normalized_?/,'').replace(/^character\d+[_:]/,'').replace(/_sub(?:_\d+)?$/,'').replace(/[^a-z0-9]/g,'').replace(/^mixamorig/,'').replace(/^jbip/,'');return Object.keys(aliases).find(role=>aliases[role].includes(compact))??null}
export function inspectHumanoidRigs(scene){
  const groups=new Map()
  scene.traverse(object=>{
    if(!object.isSkinnedMesh||groups.has(object.skeleton))return
    const bones={},candidates=new Map()
    for(const bone of object.skeleton.bones){const role=roleOf(bone.name);if(!role)continue;const score=(/_sub(?:_\d+)?$/i.test(bone.name)?2:0)+(/^normalized_?/i.test(bone.name)?1:0),old=candidates.get(role);if(!old||score<old.score)candidates.set(role,{score,bones:[bone]});else if(score===old.score&&!old.bones.includes(bone))old.bones.push(bone)}
    // Never let an appended _sub joint overwrite the actual human joint.
    // Equally ranked aliases are ambiguous and therefore unsupported.
    for(const [role,candidate] of candidates)if(candidate.bones.length===1)bones[role]=candidate.bones[0]
    const missing=required.filter(role=>!bones[role])
    groups.set(object.skeleton,{mesh:object,skeleton:object.skeleton,bones,missing,supported:missing.length===0})
  })
  return [...groups.values()]
}
export function captureBones(skeleton){return skeleton.bones.map(bone=>({bone,position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()}))}
export function restoreBones(snapshot){const set=new Set(snapshot.map(s=>s.bone));for(const s of snapshot){s.bone.position.copy(s.position);s.bone.quaternion.copy(s.quaternion);s.bone.scale.copy(s.scale)}for(const s of snapshot)if(!set.has(s.bone.parent))s.bone.updateWorldMatrix(true,true)}
const worldPoint=bone=>bone.getWorldPosition(new Vector3())
function worldQuaternion(bone,q){const parent=bone.parent?.getWorldQuaternion(new Quaternion())??new Quaternion();bone.quaternion.copy(parent.invert().multiply(q));bone.updateWorldMatrix(true,true)}
function translateWorld(bone,delta){const p=worldPoint(bone).add(delta);if(bone.parent)bone.parent.worldToLocal(p);bone.position.copy(p);bone.updateWorldMatrix(true,true)}
function aim(bone,child,target){const p=worldPoint(bone),from=worldPoint(child).sub(p).normalize(),to=target.clone().sub(p).normalize(),q=new Quaternion().setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(new Quaternion()));worldQuaternion(bone,q)}
// A segment direction alone has no roll. Preserve an anatomical lateral axis,
// rather than inheriting the twist of a seated animation or a nearly straight knee.
function segmentFrame(direction,lateral){
  const y=direction.clone().normalize(),x=lateral.clone().addScaledVector(y,-lateral.dot(y)).normalize()
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,new Vector3().crossVectors(x,y)))
}
function alignLegSegment(rig,role,direction,lateral){
  const rest=rig.legFrames[role],desired=segmentFrame(direction,lateral)
  worldQuaternion(rig.bones[role],desired.multiply(rest.frame.clone().invert()).multiply(rest.rotation))
}
export const PRONE_LEG_DEFAULTS=Object.freeze({kneeBendDegrees:8,legSplayDegrees:2,anklePointDegrees:45})
function legSettings(values={}){
  const range={kneeBendDegrees:[3,20],legSplayDegrees:[0,6],anklePointDegrees:[20,55]}
  return Object.fromEntries(Object.entries(PRONE_LEG_DEFAULTS).map(([key,fallback])=>[key,Number.isFinite(values[key])?Math.max(range[key][0],Math.min(range[key][1],values[key])):fallback]))
}
function bendArm(upper,lower,hand,target,pole){
  const start=worldPoint(upper),l1=start.distanceTo(worldPoint(lower)),l2=worldPoint(lower).distanceTo(worldPoint(hand)),direction=target.clone().sub(start)
  const distance=Math.max(Math.abs(l1-l2)+.0001,Math.min(direction.length(),l1+l2-.0001));direction.normalize()
  const along=(l1*l1+distance*distance-l2*l2)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along))
  const side=pole.clone().sub(start);side.addScaledVector(direction,-side.dot(direction));if(side.lengthSq()<1e-8)side.set(0,-1,0);side.normalize()
  const elbow=start.clone().addScaledVector(direction,along).addScaledVector(side,height)
  aim(upper,lower,elbow);aim(lower,hand,start.clone().addScaledVector(direction,distance))
}

/** Build rest rotations from inverse bind matrices, never from the seated animation. */
export function prepareRig(rig){
  if(!rig.supported)throw Error('Unsupported bone names: '+rig.missing.join(', '))
  const restWorld=new Map(rig.skeleton.bones.map((bone,index)=>[bone,rig.skeleton.boneInverses[index].clone().invert()]))
  const restLocal=new Map()
  for(const [bone,matrix] of restWorld){const local=matrix.clone(),parent=restWorld.get(bone.parent);if(parent)local.premultiply(parent.clone().invert());const p=new Vector3(),q=new Quaternion(),s=new Vector3();local.decompose(p,q,s);restLocal.set(bone,{position:p,quaternion:q,scale:s})}
  const pos=role=>new Vector3().setFromMatrixPosition(restWorld.get(rig.bones[role]))
  const up=pos('head').sub(pos('hips')).normalize(),left=pos('leftUpperArm').sub(pos('rightUpperArm')).normalize(),face=new Vector3().crossVectors(left,up).normalize()
  left.crossVectors(up,face).normalize()
  const restBasis=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(left,up,face))
  const restRotations=new Map()
  for(const [bone,matrix] of restWorld){const position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();matrix.decompose(position,rotation,scale);restRotations.set(bone,rotation)}
  const hipsRest=restRotations.get(rig.bones.hips).clone()
  const legFrames={},footRotations={}
  for(const side of ['left','right']){
    for(const [role,child] of [[side+'UpperLeg',side+'LowerLeg'],[side+'LowerLeg',side+'Foot']]){
      const rotation=new Quaternion(),p=new Vector3(),s=new Vector3();restWorld.get(rig.bones[role]).decompose(p,rotation,s)
      legFrames[role]={frame:segmentFrame(pos(child).sub(pos(role)),left),rotation}
    }
    const rotation=new Quaternion(),p=new Vector3(),s=new Vector3();restWorld.get(rig.bones[side+'Foot']).decompose(p,rotation,s);footRotations[side]=rotation
  }
  const headRest=new Quaternion(),headPosition=new Vector3(),headScale=new Vector3();restWorld.get(rig.bones.head).decompose(headPosition,headRest,headScale)
  let torsoSamples=null
  return {...rig,restWorld,restRotations,restLocal,restBasis,hipsRest,headRest,legFrames,footRotations,get torsoSamples(){return torsoSamples??=prepareTorsoSamples(rig,restWorld,restBasis)}}
}

export function applyPronePose(rig,{heading=0,orientation=null,rotationOnly=false,preserveHands=false,legs={},support=null}={}){
  const b=rig.bones,headPosition=worldPoint(b.head),headRotation=b.head.getWorldQuaternion(new Quaternion())
  const hands=preserveHands?Object.fromEntries(['left','right'].map(side=>[side,{position:worldPoint(b[side+'Hand']),quaternion:b[side+'Hand'].getWorldQuaternion(new Quaternion()),pole:worldPoint(b[side+'LowerArm'])}])):null
  const q=orientation??new Quaternion().setFromAxisAngle(new Vector3(0,1,0),heading)
  const forward=new Vector3(0,0,1).applyQuaternion(q),left=new Vector3(1,0,0).applyQuaternion(q),down=new Vector3(0,-1,0).applyQuaternion(q)
  const desiredBasis=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(left,forward,down))
  if(rotationOnly){
    const q=new Quaternion().setFromAxisAngle(left,Math.PI/2).multiply(b.hips.getWorldQuaternion(new Quaternion()));worldQuaternion(b.hips,q)
  }else{
    for(const [bone,rest] of rig.restLocal){if(bone!==b.hips)bone.position.copy(rest.position);bone.quaternion.copy(rest.quaternion);bone.scale.copy(rest.scale)}
    b.hips.updateWorldMatrix(true,true)
    worldQuaternion(b.hips,desiredBasis.multiply(rig.restBasis.clone().invert()).multiply(rig.hipsRest))
    // Share neck extension, then preserve the exact host-produced head orientation.
    if(b.neck){
      // A support-anchored torso has a stable neutral neck. Looking up/down
      // rotates the head without raising the entire supported body each frame.
      const neutral=support?q.clone().multiply(rig.restBasis.clone().invert()).multiply(rig.headRest):headRotation
      const neck=b.neck.getWorldQuaternion(new Quaternion()).slerp(neutral,support?.neckExtension??.4);worldQuaternion(b.neck,neck)
    }
    worldQuaternion(b.head,headRotation)
  }
  translateWorld(b.hips,headPosition.clone().sub(worldPoint(b.head)))
  const torsoContact=!rotationOnly&&support?(support.fit===false?measureTorsoSurface(rig,support):fitTorsoToSurface(rig,support)):null
  // The support fit changes body pitch; looking direction still follows the host.
  if(torsoContact?.source==='sampled-skin'&&support?.fit!==false)worldQuaternion(b.head,headRotation)
  if(torsoContact?.aligned){const delta=worldPoint(b.head).sub(headPosition);torsoContact.headDeltaLocal=[delta.dot(support.lateral),delta.dot(support.normal),delta.dot(support.forward)]}
  if(!rotationOnly){
    const h=worldPoint(b.head),height=worldPoint(b.hips).distanceTo(h)/.64
    const settings=legSettings(legs),bend=settings.kneeBendDegrees*Math.PI/180,splay=settings.legSplayDegrees*Math.PI/180,point=settings.anklePointDegrees*Math.PI/180
    for(const [sign,side] of [[1,'left'],[-1,'right']]){
      const grip=hands?.[side].position??support?.grips?.[side]??h.clone().addScaledVector(left,sign*.20*height).addScaledVector(forward,-.13*height).addScaledVector(down,.28*height)
      const pole=hands?.[side].pole??support?.elbowPoles?.[side]??h.clone().addScaledVector(left,sign*.45*height).addScaledVector(forward,-.44*height).addScaledVector(down,.25*height)
      bendArm(b[side+'UpperArm'],b[side+'LowerArm'],b[side+'Hand'],grip,pole)
      if(hands)worldQuaternion(b[side+'Hand'],hands[side].quaternion)
      const upper=b[side+'UpperLeg'],lower=b[side+'LowerLeg'],foot=b[side+'Foot']
      const l1=worldPoint(upper).distanceTo(worldPoint(lower)),l2=worldPoint(lower).distanceTo(worldPoint(foot))
      // The ankle stays level with the hip while the knee is gently flexed.
      // Split the bend according to limb lengths, without scaling any bones.
      const thighAngle=Math.atan2(l2*Math.sin(bend),l1+l2*Math.cos(bend))
      const back=forward.clone().negate().multiplyScalar(Math.cos(splay)).addScaledVector(left,sign*Math.sin(splay))
      const thigh=back.clone().multiplyScalar(Math.cos(thighAngle)).addScaledVector(down,Math.sin(thighAngle))
      const calf=back.clone().multiplyScalar(Math.cos(bend-thighAngle)).addScaledVector(down,-Math.sin(bend-thighAngle))
      alignLegSegment(rig,side+'UpperLeg',thigh,left)
      alignLegSegment(rig,side+'LowerLeg',calf,left)
      // Plantar flexion relative to the lower leg; toes point back/down. Use
      // inverse-bind orientation so nonstandard VRM bone axes remain supported.
      const footLeft=new Vector3().crossVectors(down,back).normalize()
      const calfDown=new Vector3().crossVectors(calf,footLeft).normalize()
      const toes=calfDown.multiplyScalar(Math.cos(point)).addScaledVector(calf,Math.sin(point)).normalize()
      const footBasis=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(footLeft,new Vector3().crossVectors(toes,footLeft),toes))
      worldQuaternion(foot,footBasis.multiply(rig.restBasis.clone().invert()).multiply(rig.footRotations[side]))
    }
  }
  rig.skeleton.update()
  const knee=side=>{const a=worldPoint(b[side+'UpperLeg']),m=worldPoint(b[side+'LowerLeg']),z=worldPoint(b[side+'Foot']);return 180-a.sub(m).angleTo(z.sub(m))*180/Math.PI}
  const handPositionErrorMm=hands?Math.max(...['left','right'].map(side=>worldPoint(b[side+'Hand']).distanceTo(hands[side].position)*1000)):null
  const supportGripErrorMm=!hands&&support?.grips?Math.max(...['left','right'].map(side=>worldPoint(b[side+'Hand']).distanceTo(support.grips[side])*1000)):null
  const gap=role=>worldPoint(b['left'+role]).sub(worldPoint(b['right'+role])).dot(left)
  return {headDriftMm:worldPoint(b.head).distanceTo(headPosition)*1000,headRotationErrorDegrees:b.head.getWorldQuaternion(new Quaternion()).angleTo(headRotation)*180/Math.PI,leftKneeDegrees:knee('left'),rightKneeDegrees:knee('right'),ankleLateralGapM:gap('Foot'),kneeLateralGapM:gap('LowerLeg'),handPositionErrorMm,supportGripErrorMm,torsoContact,rotationOnly}
}

/** Explicit rig selection only: never guess which user owns a nearby skeleton. */
export function installRenderPose(scene,rig,getOptions,onError,relatedSkeletons=[]){
  let snapshot=null,disposed=false,cameraSnapshot=null
  const saved=captureBones(rig.skeleton)
  const before=scene.onBeforeRender,after=scene.onAfterRender
  const api={last:null,frames:0,restored:true,cameraPositionDriftMm:0,cameraRotationErrorDegrees:0,
    restore(){if(snapshot){restoreBones(snapshot);rig.skeleton.update();for(const skeleton of relatedSkeletons)skeleton.update();snapshot=null}api.restored=true},
    dispose(){api.restore();disposed=true;if(scene.onBeforeRender===onBefore)scene.onBeforeRender=before;if(scene.onAfterRender===onAfter)scene.onAfterRender=after},
  }
  function onBefore(...args){
    api.restore();before.call(this,...args)
    const options=getOptions();if(disposed||!options.enabled)return
    const camera=args[2];cameraSnapshot=camera?{camera,position:camera.getWorldPosition(new Vector3()),quaternion:camera.getWorldQuaternion(new Quaternion())}:null
    for(const s of saved){s.position.copy(s.bone.position);s.quaternion.copy(s.bone.quaternion);s.scale.copy(s.bone.scale)}
    snapshot=saved;api.restored=false
    try{api.last=applyPronePose(rig,options);api.frames++}catch(error){api.restore();if(onError)onError(error);else throw error}
  }
  function onAfter(...args){try{after.call(this,...args)}finally{api.restore();if(cameraSnapshot){const {camera,position,quaternion}=cameraSnapshot;api.cameraPositionDriftMm=camera.getWorldPosition(new Vector3()).distanceTo(position)*1000;api.cameraRotationErrorDegrees=camera.getWorldQuaternion(new Quaternion()).angleTo(quaternion)*180/Math.PI;cameraSnapshot=null}}}
  scene.onBeforeRender=onBefore;scene.onAfterRender=onAfter
  return api
}
