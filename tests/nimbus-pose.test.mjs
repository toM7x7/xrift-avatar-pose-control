import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,Group,Vector3,Bone} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {createComplexFixture} from '../src/repro/complex-fixture.mjs'
import {inspectHumanoidRigs,prepareRig,captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {applyStandingPose} from '../src/standing.mjs'
import {applyNimbusPose} from '../src/nimbus-pose.mjs'
const point=bone=>bone.getWorldPosition(new Vector3())
const transforms=skeleton=>skeleton.bones.map(bone=>[...bone.position.toArray(),...bone.quaternion.toArray(),...bone.scale.toArray()])
function sample(scale=1){const scene=new Scene(),fixture=createPoseFixture(),root=new Group();root.scale.setScalar(scale);root.rotation.y=.6;root.position.set(1,2,-3);root.add(fixture.mesh);scene.add(root);fixture.seated(.8);scene.updateMatrixWorld(true);return {scene,fixture,rig:prepareRig(inspectHumanoidRigs(scene)[0])}}
test('N02 places spread ankles on one plane with deep knees and distributed oblique torso yaw, preserving head at three sizes',()=>{
 for(const scale of [.65,1,1.35]){
  const {fixture:f,rig}=sample(scale),result=applyNimbusPose(rig,{heading:.4})
  assert.ok(result.headDriftMm<.001);assert.ok(result.headRotationErrorDegrees<.001)
  assert.ok(result.knees.every(k=>k>60&&k<75),JSON.stringify(result));assert.ok(result.footTargetErrorMm<.001);assert.ok(result.ankleHeightSpreadMm<.001);assert.ok(result.boneLengthErrorMm<.001)
  assert.equal(result.poseLimited,false);assert.equal(result.requestedKneeDegrees,67);assert.ok(result.kneeTargetErrorDegrees<.001)
  assert.ok(result.stanceWorldM>.9*scale)
  assert.ok(result.bodyBalance.headChestYawDegrees<=20.01);assert.ok(result.bodyBalance.neckYawDegrees<=8.01);assert.ok(result.bodyBalance.hipChestYawDegrees>20);assert.equal(result.bodyBalance.footYawDegrees,62);f.dispose()
 }
})
test('N02 makes a measurable change from board: deeper knees, wider stance and raised balancing hands',()=>{
 const {fixture:f,rig}=sample(),snapshot=captureBones(f.skeleton),old=applyStandingPose(rig,{kneeBend:.22,pitch:.12}),oldHands=['left','right'].map(s=>point(f.bones[s+'Hand']).y)
 restoreBones(snapshot);const next=applyNimbusPose(rig),newHands=['left','right'].map(s=>point(f.bones[s+'Hand']).y)
 assert.ok(next.knees.every((k,i)=>k>old.knees[i]+35));assert.ok(next.stanceWorldM>new Vector3().fromArray(old.feetWorld[0]).distanceTo(new Vector3().fromArray(old.feetWorld[1]))*3)
 assert.ok(newHands.every((y,i)=>y>oldHands[i]+.18));assert.ok(next.armBalance.every(arm=>arm.handBelowShoulderM>0&&arm.elbowAboveHandM>0));f.dispose()
})
test('crouch and stance width provide independent visible variation without bone stretch',()=>{
 const {fixture:f,rig}=sample(),snapshot=captureBones(f.skeleton)
 const shallow=applyNimbusPose(rig,{crouch:0,stanceWidth:.8});restoreBones(snapshot)
 const deep=applyNimbusPose(rig,{crouch:.7,stanceWidth:.8});restoreBones(snapshot)
 const wide=applyNimbusPose(rig,{crouch:.7,stanceWidth:1.2})
 assert.ok(deep.knees[0]>shallow.knees[0]+35);assert.ok(deep.supportHeight>shallow.supportHeight+.1);assert.ok(wide.stanceWorldM>deep.stanceWorldM+.3)
 for(const r of [shallow,deep,wide]){assert.ok(r.headDriftMm<.001);assert.ok(r.boneLengthErrorMm<.001)}f.dispose()
})
test('reachable tracked hands retain world positions and orientations after sideways posing',()=>{
 const {fixture:f,rig}=sample();applyNimbusPose(rig);const result=applyNimbusPose(rig,{preserveHands:true})
 assert.ok(result.handPositionErrorMm<.05,JSON.stringify(result));assert.ok(result.handRotationErrorDegrees<.001);assert.ok(result.headDriftMm<.001);assert.equal(result.armBalance,null);f.dispose()
})
test('balance arms descend through elbows to hands with lead/trail asymmetry, palms down and neutral wrists',()=>{
 for(const scale of [.65,1,1.35]){
  const {fixture:f,rig}=sample(scale),result=applyNimbusPose(rig),[trail,lead]=result.armBalance
  for(const arm of result.armBalance){assert.ok(arm.handBelowShoulderM>.14*scale);assert.ok(arm.elbowAboveHandM>.08*scale);assert.ok(arm.shoulderWorld[1]>arm.elbowWorld[1]);assert.ok(arm.elbowFlexionDegrees>30&&arm.elbowFlexionDegrees<65);assert.ok(arm.palmDownDot>.8);assert.ok(arm.wristBendDegrees<.001);assert.ok(arm.wristBindDeviationDegrees<.001);assert.ok(arm.boneLengthErrorMm<.001)}
  const chestHeading=(result.bodyBalance.chestYawDegrees*Math.PI/180)+result.cloudHeading,chestForward=new Vector3(0,0,1).applyAxisAngle(new Vector3(0,1,0),chestHeading),leadOffset=new Vector3().fromArray(lead.handWorld).sub(new Vector3().fromArray(lead.shoulderWorld)),trailOffset=new Vector3().fromArray(trail.handWorld).sub(new Vector3().fromArray(trail.shoulderWorld))
  assert.ok(lead.handBelowShoulderM>trail.handBelowShoulderM+.08*scale);assert.ok(leadOffset.sub(trailOffset).dot(chestForward)>.15*scale);f.dispose()
 }
})
test('finger-root palm frames work without bone-name assumptions and remain consistent with reversed bind axes',()=>{
 for(const reversed of [false,true]){
  const f=createPoseFixture(),scene=new Scene();scene.add(f.mesh);if(reversed)f.mesh.rotation.y=Math.PI
  for(const [sign,side]of [[1,'left'],[-1,'right']])for(let index=0;index<5;index++){
   const finger=new Bone();finger.name='unnamed-digit-'+index;finger.position.set(sign*(.045+index*.004),0,(index-2)*.012);f.bones[side+'Hand'].add(finger);f.skeleton.bones.push(finger)
  }
  scene.updateMatrixWorld(true);f.skeleton.calculateInverses();const rig=prepareRig(inspectHumanoidRigs(scene)[0]);f.seated(.7)
  const result=applyNimbusPose(rig)
  for(const arm of result.armBalance){assert.equal(arm.palmReferenceSource,'finger-roots');assert.ok(arm.palmDownDot>.8);assert.ok(arm.wristBendDegrees<.001);assert.ok(arm.wristBindDeviationDegrees<.001);assert.ok(arm.boneLengthErrorMm<.001);assert.ok(arm.elbowAboveHandM>0)}
  assert.ok(result.headDriftMm<.001);f.dispose()
 }
})
test('fixed unreachable ankle plane reports error while preserving head and limb lengths',()=>{
 const {fixture:f,rig}=sample(),result=applyNimbusPose(rig,{supportHeight:-20})
 assert.equal(result.supportMode,'fixed-ankle-plane');assert.ok(result.footTargetErrorMm>10000);assert.ok(result.boneLengthErrorMm<.001);assert.ok(result.headDriftMm<.001);assert.equal(result.poseLimited,true);assert.ok(result.poseLimitReasons.includes('foot-target-out-of-reach'));f.dispose()
})
test('wide feet and deep crouch report incompatible requested knee angle even when ankle targets are reached',()=>{
 for(const scale of [.65,1,1.35]){
  const {fixture:f,rig}=sample(scale),result=applyNimbusPose(rig,{stanceWidth:1.4,crouch:1})
  assert.ok(result.footTargetErrorMm<.001);assert.equal(result.requestedKneeDegrees,100);assert.ok(result.knees.every(k=>k>76&&k<77));assert.ok(result.kneeTargetErrorDegrees>23&&result.kneeTargetErrorDegrees<24)
  assert.equal(result.poseLimited,true);assert.deepEqual(result.poseLimitReasons,['stance-exceeds-crouch-reach']);assert.ok(result.headDriftMm<.001);assert.ok(result.boneLengthErrorMm<.001);f.dispose()
 }
})
test('non-finite tuning uses finite defaults and pose snapshots restore exactly',()=>{
 const {fixture:f,rig}=sample(),snapshot=captureBones(f.skeleton),original=transforms(f.skeleton),result=applyNimbusPose(rig,{heading:NaN,stanceWidth:Infinity,crouch:NaN,pitch:Infinity,roll:NaN,supportHeight:Infinity})
 assert.ok(result.feetWorld.flat().every(Number.isFinite));assert.equal(result.stanceWidth,1);assert.equal(result.crouch,.45);assert.equal(result.cloudHeading,0)
 restoreBones(snapshot);assert.deepEqual(transforms(f.skeleton),original);f.dispose()
})
test('omitted knee parents, garment joints and changed proportions preserve their authored lengths and auxiliary transforms',()=>{
 for(const kind of ['leg-pivot','cloth','helper-alias','proportions']){
  const f=kind==='proportions'?createPoseFixture():createComplexFixture(kind),scene=new Scene();scene.add(f.mesh)
  if(kind==='proportions')for(const [role,bone]of Object.entries(f.bones)){if(/LowerLeg|Foot/.test(role))bone.position.multiplyScalar(.75);if(/LowerArm|Hand/.test(role))bone.position.multiplyScalar(1.2);if(['chest','neck'].includes(role))bone.position.multiplyScalar(1.2)}
  scene.updateMatrixWorld(true);f.skeleton.calculateInverses();const rig=prepareRig(inspectHumanoidRigs(scene)[0]);f.seated(.5)
  const extras=(f.cloth??[]).map(bone=>({bone,p:bone.position.clone(),q:bone.quaternion.clone()})),lengths=['left','right'].flatMap(side=>[point(f.bones[side+'UpperLeg']).distanceTo(point(f.bones[side+'LowerLeg'])),point(f.bones[side+'LowerLeg']).distanceTo(point(f.bones[side+'Foot']))]),result=applyNimbusPose(rig)
  const next=['left','right'].flatMap(side=>[point(f.bones[side+'UpperLeg']).distanceTo(point(f.bones[side+'LowerLeg'])),point(f.bones[side+'LowerLeg']).distanceTo(point(f.bones[side+'Foot']))])
  assert.ok(result.headDriftMm<.001);assert.ok(result.footTargetErrorMm<.001,kind+JSON.stringify(result));assert.ok(next.every((n,i)=>Math.abs(n-lengths[i])<1e-8),kind)
  for(const {bone,p,q}of extras){assert.ok(bone.position.equals(p));assert.ok(bone.quaternion.angleTo(q)<1e-7)}f.dispose()
 }
})
