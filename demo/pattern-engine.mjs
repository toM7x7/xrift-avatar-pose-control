import {Vector3,Quaternion} from 'three'
import {prepareHumanoidRig,inspectHumanoidRigs,prepareRig,applyNimbusPose,applyStandingPose,applyPronePose,applyShoulderRidePose,applyShoulderCarrierPose} from '../src/index.mjs'
import {applySupportedSeatPose} from '../src/supported-seat.mjs'
import {captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {measureSkinDiagnostics} from './skin-diagnostics.mjs'
import {assessPatternSample} from './pattern-assessment.mjs'

const sides=['left','right'],point=b=>b.getWorldPosition(new Vector3()),up=new Vector3(0,1,0)
const pairs=[['hips','spine'],['spine','chest'],['chest','neck'],['neck','head'],...sides.flatMap(s=>[[s+'UpperArm',s+'LowerArm'],[s+'LowerArm',s+'Hand'],[s+'UpperLeg',s+'LowerLeg'],[s+'LowerLeg',s+'Foot']])]
const lengths=b=>pairs.filter(([a,z])=>b[a]&&b[z]).map(([a,z])=>point(b[a]).distanceTo(point(b[z])))
export function preparePatternRig(actor){
 if(actor.vrm){
  const meshes=[];actor.root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o)})
  for(const mesh of meshes.sort((a,b)=>b.skeleton.bones.length-a.skeleton.bones.length))try{return prepareHumanoidRig({mesh,bones:actor.bones})}catch{}
  throw Error('Required raw humanoid joints are absent from the selected skin palettes')
 }
 const chosen=inspectHumanoidRigs(actor.root).find(r=>r.supported)
 if(!chosen)throw Error('No supported humanoid rig')
 return prepareRig(chosen)
}
/** A browser/fixture kinematic bench. It does not integrate vehicle forces or solve rigid contacts. */
export function createPatternEngine({actor,scene,carrier,carrierRoot,kind='fixture'}){
 actor.animate(0,{seated:false});scene.updateMatrixWorld(true)
 const rig=preparePatternRig(actor),b=rig.bones,restLengths=lengths(b),diagnostics=measureSkinDiagnostics(actor)
 const originalCulling=new Map(),directBones=[]
 actor.root.traverse(node=>{if(node.isSkinnedMesh){originalCulling.set(node,node.frustumCulled);node.frustumCulled=false}if(node.isBone&&node!==b.hips&&node.parent?.isBone)directBones.push(node)})
 const matrixPoint=node=>new Vector3().setFromMatrixPosition(node.matrixWorld)
 const directLengths=directBones.map(bone=>matrixPoint(bone).distanceTo(matrixPoint(bone.parent)))
 const legLength=diagnostics.legLengthM??.79,scale=legLength/.79
 const soleOffset=Math.max(0,...diagnostics.feet.map(f=>f.soleOffsetM).filter(Number.isFinite))
 const model={kind,vertexCount:diagnostics.vertexCount,meshCount:diagnostics.meshCount,visibleFeet:diagnostics.feet.every(f=>f.weightedVertexCount>0),footWeightedVertexCounts:diagnostics.feet.map(f=>f.weightedVertexCount),legLengthM:legLength,soleOffsetM:soleOffset,skinCullingPolicy:'disabled-for-posed-lab-skins'}
 const footSets=sides.map(side=>{const set=new Set();b[side+'Foot'].traverse(node=>{if(node.isBone)set.add(node)});return set}),footSamples=[[],[]]
 actor.root.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return
  const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');if(!indices||!weights)return
  const eligible=footSets.map(set=>new Set(mesh.skeleton.bones.flatMap((bone,index)=>set.has(bone)?[index]:[])))
  const get=(attribute,i,c)=>c===0?attribute.getX(i):c===1?attribute.getY(i):c===2?attribute.getZ(i):attribute.getW(i)
  for(let i=0;i<indices.count;i++)for(let side=0;side<2;side++){
   let weight=0;for(let channel=0;channel<Math.min(4,indices.itemSize,weights.itemSize);channel++)if(eligible[side].has(get(indices,i,channel)))weight+=get(weights,i,channel)
   if(weight>.5)footSamples[side].push({mesh,index:i})
  }
 })
 const skeletons=[];actor.root.traverse(o=>{if(o.isSkinnedMesh&&!skeletons.includes(o.skeleton))skeletons.push(o.skeleton)})
 const carrierRig=prepareHumanoidRig({mesh:carrier.mesh,bones:carrier.bones}),carrierSaved=captureBones(carrier.skeleton)
 const calibrations=new Map(),baseHip=point(b.hips),neutralFootY=Math.min(...sides.map(s=>point(b[s+'Foot']).y))
 const update=()=>{scene.updateMatrixWorld(true);skeletons.forEach(s=>s.update());carrier.skeleton.update()}
 function reset(c){
  actor.animate(0,{seated:true,headYaw:c.condition?.headYaw??0,headPitch:c.condition?.headPitch??0})
  restoreBones(carrierSaved);carrierRoot.position.set(0,0,0);carrierRoot.quaternion.identity();carrierRoot.scale.setScalar(c.condition?.carrierScale??1)
  scene.updateMatrixWorld(true)
 }
 function solve(c,time=0){
  reset(c)
  const options=structuredClone(c.options),condition=c.condition??{},heading=options.heading??0
  // A modest continuous support perturbation exercises repeated solving. Case values stay explicit.
  const wobble=time===0?0:.025*Math.sin(time*2*Math.PI)
  const pitch=(condition.supportPitchRadians??0)+wobble,roll=(condition.supportRollRadians??0)-wobble*.6
  const q=new Quaternion().setFromAxisAngle(up,heading).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-pitch)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-roll))
  let raw,frame={position:[0,0,0],quaternion:q.toArray()},supportContactMeasured=false
  if(c.family==='nimbus'){
   if(!calibrations.has(c.id)){
    const initial=applyNimbusPose(rig,{...options,heading:0,anchorMode:'support',supportHeight:soleOffset,supportSoleOffsetM:soleOffset,maxKneeDegrees:100})
    calibrations.set(c.id,{footTargets:initial.footTargetsWorld.map(p=>new Vector3().fromArray(p))});reset(c)
   }
   raw=applyNimbusPose(rig,{...options,anchorMode:'support',supportSoleOffsetM:soleOffset,maxKneeDegrees:100,supportFrame:frame,footTargetsWorld:calibrations.get(c.id).footTargets.map(p=>p.clone().applyQuaternion(q).toArray())})
   supportContactMeasured=false // posed foot geometry is measured separately at the final sample.
  }else if(['chair','straddle','side-sit'].includes(c.family)){
   const initial=applySupportedSeatPose(rig,{...options,family:c.family,heading})
   frame={position:initial.supportFrame.position,quaternion:q.toArray()};reset(c)
   raw=applySupportedSeatPose(rig,{...options,family:c.family,supportFrame:frame})
   supportContactMeasured=false // targets are anatomical proxies; seat/clothing contacts remain unmeasured.
  }else if(c.family==='standing'){
   // Legacy standing rotations use the opposite sign to nose-up/right-bank support angles.
   raw=applyStandingPose(rig,{...options,pitch:(options.pitch??0)-pitch,roll:(options.roll??0)-roll})
  }else if(c.family==='prone'){
   const normal=up.clone().applyQuaternion(q),lateral=new Vector3(1,0,0).applyQuaternion(q),forward=new Vector3(0,0,1).applyQuaternion(q)
   const surface={point:new Vector3(baseHip.x,baseHip.y+.03*scale,baseHip.z),normal,lateral,forward,halfSize:[.7*scale,1.2*scale],clearanceM:.008*scale,neckExtension:.4}
   raw=applyPronePose(rig,{...options,orientation:q,support:surface})
   frame={position:surface.point.toArray(),quaternion:q.toArray()};supportContactMeasured=raw.torsoContact?.source==='sampled-skin'&&raw.torsoContact?.aligned===true
  }else if(c.family==='shoulder'){
   carrierRoot.quaternion.copy(q);scene.updateMatrixWorld(true)
   // Stabilize the carrier body BEFORE sampling its shoulders. Its arm solver
   // re-applies this same upright body and must not invalidate old anchors.
   applyStandingPose(carrierRig,{heading});scene.updateMatrixWorld(true)
   const carrierAnchors=Object.fromEntries(['leftShoulder','rightShoulder','head'].map((k,i)=>[k,point(carrier.bones[['leftUpperArm','rightUpperArm','head'][i]])]))
   // Shoulder offsets in the legacy solver are meters; catalog expresses them in reference-actor units.
   if(options.seatLift!=null)options.seatLift*=scale
   if(options.seatBack!=null)options.seatBack*=scale
   raw=applyShoulderRidePose(rig,{...options,carrierAnchors})
   const carrierMetrics=applyShoulderCarrierPose(carrierRig,{heading,shinTargets:Object.fromEntries(sides.map((s,i)=>[s,new Vector3().fromArray(raw.kneesWorld[i]).lerp(new Vector3().fromArray(raw.feetWorld[i]),.55)]))})
   raw.carrierHandTargetErrorMm=carrierMetrics.handTargetErrorMm
   const shoulderBefore=carrierAnchors.leftShoulder.clone().add(carrierAnchors.rightShoulder).multiplyScalar(.5)
   const shoulderAfter=point(carrier.bones.leftUpperArm).add(point(carrier.bones.rightUpperArm)).multiplyScalar(.5)
   const finalTarget=new Vector3().fromArray(raw.supportTargetWorld).add(shoulderAfter.sub(shoulderBefore))
   raw.supportErrorMm=point(b.hips).distanceTo(finalTarget)*1000;raw.supportTargetWorld=finalTarget.toArray()
   frame={position:raw.supportTargetWorld,quaternion:q.toArray()}
  }else throw Error('Unknown pattern family '+c.family)
  update()
  const after=lengths(b),allBones=Object.values(b),finite=allBones.every(bone=>[...point(bone).toArray(),...bone.getWorldQuaternion(new Quaternion()).toArray()].every(Number.isFinite))
  const head=point(b.head),hip=point(b.hips)
  const anatomical=role=>b[role].getWorldQuaternion(new Quaternion()).multiply(rig.restRotations.get(b[role]).clone().invert()).multiply(rig.restBasis)
  const headChestAngle=anatomical('head').angleTo(anatomical(b.chest?'chest':b.spine?'spine':'hips'))*180/Math.PI
  const headNeckAngle=anatomical('head').angleTo(anatomical(b.neck?'neck':b.chest?'chest':b.spine?'spine':'hips'))*180/Math.PI
  const knees=raw.knees??[raw.leftKneeDegrees,raw.rightKneeDegrees]
  const warnings=[...(raw.warnings??[]),...(raw.poseLimitReasons??[]),...(raw.bodyProxyWarnings??[])]
  if(c.family==='shoulder'&&(Math.abs(pitch)>.01||Math.abs(roll)>.01))warnings.push('carrier-tilt-proxy-only')
  if(['chair','straddle','side-sit'].includes(c.family))warnings.push('seat-and-clothing-contact-unmeasured')
  const directBoneLengthErrorMm=Math.max(0,...directBones.map((bone,i)=>Math.abs(matrixPoint(bone).distanceTo(matrixPoint(bone.parent))-directLengths[i])*1000))
  const metrics={...raw,finite,headWorld:head.toArray(),hipsWorld:hip.toArray(),feetWorld:sides.map(s=>point(b[s+'Foot']).toArray()),kneesWorld:sides.map(s=>point(b[s+'LowerLeg']).toArray()),handsWorld:sides.map(s=>point(b[s+'Hand']).toArray()),knees,maxKneeDegrees:Math.max(...knees.filter(Number.isFinite)),headChestAngleDegrees:headChestAngle,neckAngleDegrees:headNeckAngle,boneLengthErrorMm:directBoneLengthErrorMm,mappedSpanErrorMm:Math.max(...after.map((v,i)=>Math.abs(v-restLengths[i])*1000)),supportContactMeasured,warnings:[...new Set(warnings)]}
  return {metrics,frame,model,time,assessment:assessPatternSample({family:c.family,metrics,model})}
 }
 function measureSupport(c,result){
  if(!['nimbus','chair','straddle','side-sit'].includes(c.family))return null
  const normal=up.clone().applyQuaternion(new Quaternion().fromArray(result.frame.quaternion))
  const origin=c.family==='nimbus'?new Vector3().fromArray(result.frame.position):result.metrics.footTargetsWorld.map(p=>new Vector3().fromArray(p)).reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(.5).addScaledVector(normal,-soleOffset)
  const p=new Vector3(),feet=footSamples.map((samples,i)=>{
   let min=Infinity;for(const {mesh,index}of samples){mesh.getVertexPosition(index,p);mesh.localToWorld(p);min=Math.min(min,p.sub(origin).dot(normal))}
   return {side:sides[i],weightedVertexCount:samples.length,gapM:Number.isFinite(min)?min:null}
  })
  return {source:'posed-foot-weighted-vertices',weightThreshold:.5,position:origin.toArray(),normal:normal.toArray(),feet,contactPhysicsSolved:false}
 }
 function capture(){const snapshot=captureBones(rig.skeleton);snapshot.carrier=captureBones(carrier.skeleton);snapshot.carrierTransform={position:carrierRoot.position.clone(),quaternion:carrierRoot.quaternion.clone(),scale:carrierRoot.scale.clone()};return snapshot}
 function restore(snapshot){restoreBones(snapshot);restoreBones(snapshot.carrier);carrierRoot.position.copy(snapshot.carrierTransform.position);carrierRoot.quaternion.copy(snapshot.carrierTransform.quaternion);carrierRoot.scale.copy(snapshot.carrierTransform.scale);update()}
 const same=snapshot=>snapshot.every(s=>s.bone.position.equals(s.position)&&s.bone.quaternion.equals(s.quaternion)&&s.bone.scale.equals(s.scale))
 function isRestored(snapshot){return same(snapshot)&&same(snapshot.carrier)&&carrierRoot.position.equals(snapshot.carrierTransform.position)&&carrierRoot.quaternion.equals(snapshot.carrierTransform.quaternion)&&carrierRoot.scale.equals(snapshot.carrierTransform.scale)}
 function useAuthoredSkinCulling(enabled){for(const [mesh,value]of originalCulling)mesh.frustumCulled=enabled?value:false;return {policy:enabled?'authored-bounds':'disabled-for-posed-lab-skins',meshCount:originalCulling.size}}
 return {rig,model,solve,measureSupport,capture,restore,isRestored,reset,legLength,scale,soleOffset,neutralFootY,useAuthoredSkinCulling,measureBodyBounds:()=>measureSkinDiagnostics(actor).bounds}
}
