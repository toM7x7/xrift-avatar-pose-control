import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,Group,Vector3,Quaternion} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {createComplexFixture} from '../src/repro/complex-fixture.mjs'
import {prepareHumanoidRig} from '../src/index.mjs'
import {captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {applySupportedSeatPose} from '../src/supported-seat.mjs'
const families=['chair','straddle','side-sit'],point=bone=>bone.getWorldPosition(new Vector3()),close=(a,z,tolerance=1e-7)=>assert.ok(Math.abs(a-z)<tolerance,`${a} != ${z}`),transforms=s=>s.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()])
function sample(scale=1,kind=null){const f=kind?createComplexFixture(kind):createPoseFixture(),scene=new Scene(),root=new Group();root.scale.setScalar(scale);root.add(f.mesh);scene.add(root);scene.updateMatrixWorld(true);const rig=prepareHumanoidRig({mesh:f.mesh,bones:f.bones});f.seated(.2);return {f,scene,root,rig,snapshot:captureBones(f.skeleton)}}

test('three waist-supported families retain head rotation and lengths across three sizes, with reachable feet at the reference plane',()=>{
 for(const scale of [.65,1,1.35])for(const family of families){const s=sample(scale),r=applySupportedSeatPose(s.rig,{family});assert.equal(r.family,family);assert.ok(r.supportErrorMm<.001);assert.ok(r.footTargetErrorMm<.001);assert.ok(r.handTargetErrorMm<.001);assert.ok(r.boneLengthErrorMm<.001);assert.ok(r.headRotationErrorDegrees<.001);assert.ok(r.headDriftMm>100*scale);assert.ok(r.feetWorld.every(p=>Math.abs(p[1])<1e-8));assert.ok(r.knees.every(k=>k>60&&k<115));assert.deepEqual(r.warnings,[]);s.f.dispose()}
})
test('chair puts both feet forward, straddle widens them, and side sitting puts both feet on the selected side',()=>{
 const s=sample(),results={};for(const family of families){restoreBones(s.snapshot);results[family]=applySupportedSeatPose(s.rig,{family})}
 assert.ok(results.chair.feetWorld.every(p=>p[2]>results.chair.hipsWorld[2]+.3));assert.ok(Math.abs(results.straddle.feetWorld[0][0]-results.straddle.feetWorld[1][0])>Math.abs(results.chair.feetWorld[0][0]-results.chair.feetWorld[1][0])+.2)
 assert.ok(results['side-sit'].feetWorld.every(p=>p[0]>results['side-sit'].hipsWorld[0]+.2));restoreBones(s.snapshot);const left=applySupportedSeatPose(s.rig,{family:'side-sit',side:'left'});assert.ok(left.feetWorld.every(p=>p[0]<left.hipsWorld[0]-.2));s.f.dispose()
})
test('explicit tilted frames support the waist exactly, preserve head world up and transport target geometry rigidly',()=>{
 for(const family of families){const s=sample(),headUpBefore=new Vector3(0,1,0).applyQuaternion(s.f.bones.head.getWorldQuaternion(new Quaternion())).y,position=new Vector3(2,3,-4),quaternion=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.7).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-.2)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-.25)),frame={position,quaternion:quaternion.toArray().map(v=>v*3)},r=applySupportedSeatPose(s.rig,{family,supportFrame:frame,heading:-2}),normal=new Vector3().fromArray(r.supportFrame.normal)
  assert.ok(point(s.f.bones.hips).distanceTo(position)<1e-8);assert.ok(r.supportErrorMm<.001);assert.ok(r.headRotationErrorDegrees<.001);close(r.headUpDotWorld,headUpBefore);assert.ok(r.footTargetErrorMm<.001);assert.ok(r.boneLengthErrorMm<.001);close(new Quaternion().fromArray(r.supportFrame.quaternion).length(),1)
  for(const target of r.footTargetsWorld)close(new Vector3().fromArray(target).sub(position).dot(normal),-r.parameters.seatHeightRatio*(.4+Math.hypot(.39,.02)))
  assert.deepEqual(position.toArray(),[2,3,-4]);s.f.dispose()
 }
})
test('relaxed and grip arms descend through the elbow without wrist twists, while lean changes the torso rather than only the neck',()=>{
 const s=sample();for(const family of families)for(const handMode of ['relaxed','grip']){
  restoreBones(s.snapshot);const r=applySupportedSeatPose(s.rig,{family,handMode,leanRadians:family==='straddle'?.45:0})
  assert.ok(r.armMetrics.every(arm=>arm.elbowAboveHandM>0&&arm.handBelowShoulderM>0));assert.ok(r.armMetrics.every(arm=>arm.wristBindDeviationDegrees<.001));assert.ok(r.headNeckAngleDegrees<15);assert.ok(r.handTargetErrorMm<.001);assert.ok(r.headRotationErrorDegrees<.001)
 }
 restoreBones(s.snapshot);const upright=applySupportedSeatPose(s.rig,{family:'chair'});restoreBones(s.snapshot);const reclined=applySupportedSeatPose(s.rig,{family:'chair',leanRadians:-.5});assert.ok(reclined.headWorld[2]<upright.headWorld[2]-.15);assert.ok(reclined.headRotationErrorDegrees<.001);assert.ok(reclined.headNeckAngleDegrees<15);s.f.dispose()
})
test('unreachable grip and foot settings report misses without stretching bones or moving the waist support',()=>{
 const s=sample(),r=applySupportedSeatPose(s.rig,{family:'straddle',seatHeightRatio:1.05,widthRatio:.85,handMode:'grip',gripReachRatio:1.4})
 assert.ok(r.footTargetErrorMm>100);assert.ok(r.handTargetErrorMm>100);assert.ok(r.warnings.includes('foot-target-unreachable'));assert.ok(r.warnings.includes('hand-target-unreachable'));assert.ok(r.warnings.includes('grip-finger-closure-not-simulated'));assert.ok(r.boneLengthErrorMm<.001);assert.ok(r.supportErrorMm<.001);s.f.dispose()
})
test('tracked hands retain their input rotations and expose unreachable positions as errors',()=>{
 const s=sample();s.f.bones.leftHand.position.x=3;s.f.mesh.updateWorldMatrix(true,true);const q=s.f.bones.leftHand.getWorldQuaternion(new Quaternion()),r=applySupportedSeatPose(s.rig,{family:'chair',handMode:'tracked'})
 assert.ok(r.handTargetErrorMm>1000);assert.ok(r.handRotationErrorDegrees<.001);assert.ok(s.f.bones.leftHand.getWorldQuaternion(new Quaternion()).angleTo(q)<1e-7);assert.ok(r.warnings.includes('hand-target-unreachable'));assert.ok(r.boneLengthErrorMm<.001);assert.ok(r.headRotationErrorDegrees<.001);s.f.dispose()
})
test('raw mappings with arbitrary names, reversed bind direction, omitted knee parents and garments remain supported',()=>{
 for(const kind of ['leg-pivot','cloth','helper-alias','reversed']){
  const s=sample(1,kind==='reversed'?null:kind)
  if(kind==='reversed'){restoreBones(s.snapshot);s.f.mesh.rotation.y=Math.PI;s.root.updateWorldMatrix(true,true);s.f.skeleton.calculateInverses();s.f.skeleton.bones.forEach((bone,index)=>bone.name='raw-'+index);s.rig=prepareHumanoidRig({mesh:s.f.mesh,bones:s.f.bones});s.f.seated()}
  const cloth=(s.f.cloth??[]).map(b=>({b,p:b.position.clone(),q:b.quaternion.clone()})),r=applySupportedSeatPose(s.rig,{family:'straddle',heading:kind==='reversed'?Math.PI:0})
  assert.ok(r.footTargetErrorMm<.001,JSON.stringify(r));assert.ok(r.boneLengthErrorMm<.001);assert.ok(r.headRotationErrorDegrees<.001);for(const {b,p,q}of cloth){assert.ok(b.position.equals(p));assert.ok(b.quaternion.angleTo(q)<1e-7)}s.f.dispose()
 }
})
test('caller snapshots restore exactly and pose application does not install scene hooks',()=>{
 const s=sample(),before=transforms(s.f.skeleton),beforeRender=s.scene.onBeforeRender,afterRender=s.scene.onAfterRender
 for(const family of families){applySupportedSeatPose(s.rig,{family});restoreBones(s.snapshot);assert.deepEqual(transforms(s.f.skeleton),before)}assert.equal(s.scene.onBeforeRender,beforeRender);assert.equal(s.scene.onAfterRender,afterRender);s.f.dispose()
})
test('bad families or frames reject before mutation and non-finite tuning uses finite defaults',()=>{
 const s=sample(),before=transforms(s.f.skeleton)
 for(const options of [{family:'unknown'},{handMode:'unknown'},{side:'unknown'},{supportFrame:{position:[0,NaN,0],quaternion:[0,0,0,1]}},{supportFrame:{position:[0,0,0],quaternion:[0,0,0,0]}}]){assert.throws(()=>applySupportedSeatPose(s.rig,options));assert.deepEqual(transforms(s.f.skeleton),before)}
 const r=applySupportedSeatPose(s.rig,{seatHeightRatio:NaN,widthRatio:Infinity,leanRadians:NaN,gripReachRatio:Infinity});assert.ok(r.feetWorld.flat().every(Number.isFinite));assert.equal(r.parameters.seatHeightRatio,.55);assert.equal(r.parameters.widthRatio,.13);assert.equal(r.parameters.leanRadians,0);s.f.dispose()
})
