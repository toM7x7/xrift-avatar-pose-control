import test from 'node:test'
import assert from 'node:assert/strict'
import {Bone,Group,Quaternion,Scene,Vector3} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {createComplexFixture} from '../src/repro/complex-fixture.mjs'
import {applyPronePose,captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {prepareHumanoidRig,attachPoseDriver} from '../src/index.mjs'

const point=bone=>bone.getWorldPosition(new Vector3()),sides=['left','right']
const local=bone=>[...bone.position.toArray(),...bone.quaternion.toArray(),...bone.scale.toArray()]
const limbSpans=bones=>sides.flatMap(side=>[[bones[side+'UpperLeg'],bones[side+'LowerLeg']],[bones[side+'LowerLeg'],bones[side+'Foot']],[bones[side+'UpperArm'],bones[side+'LowerArm']],[bones[side+'LowerArm'],bones[side+'Hand']]])
const distances=pairs=>pairs.map(([parent,bone])=>point(parent).distanceTo(point(bone)))
const maxErrorMm=(before,after)=>Math.max(0,...after.map((value,i)=>Math.abs(value-before[i])*1000))
function sample(kind='leg-pivot',scale=1){
 const fixture=kind==='plain'?createPoseFixture():createComplexFixture(kind),scene=new Scene(),root=new Group()
 root.position.set(2,3,-4);root.rotation.y=.6;root.scale.setScalar(scale);root.add(fixture.mesh);scene.add(root);scene.updateMatrixWorld(true)
 const rig=prepareHumanoidRig({mesh:fixture.mesh,bones:fixture.bones})
 fixture.seated(.3);root.updateWorldMatrix(true,true)
 const direct=[];root.traverse(bone=>{if(bone.isBone&&bone.parent?.isBone)direct.push([bone.parent,bone])})
 return {fixture,scene,root,rig,direct,spans:limbSpans(fixture.bones)}
}

test('prone preserves true parent-bone lengths and limb spans when rotated parents are absent from the palette',()=>{
 for(const scale of [.65,1,1.35]){
  const s=sample('leg-pivot',scale),beforeDirect=distances(s.direct),beforeSpans=distances(s.spans)
  const omitted=s.fixture.omitted.map(local),snapshot=captureBones(s.fixture.skeleton)
  const orientation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.6).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-.18))
  const r=applyPronePose(s.rig,{orientation,legs:{kneeBendDegrees:14,legSplayDegrees:4,anklePointDegrees:40}})
  assert.ok(maxErrorMm(beforeDirect,distances(s.direct))<.001)
  assert.ok(maxErrorMm(beforeSpans,distances(s.spans))<.001)
  assert.deepEqual(s.fixture.omitted.map(local),omitted)
  assert.ok(r.headDriftMm<.001);assert.ok(r.headRotationErrorDegrees<.001)
  assert.ok(Math.abs(r.leftKneeDegrees-14)<.001&&Math.abs(r.rightKneeDegrees-14)<.001)
  restoreBones(snapshot);assert.deepEqual(snapshot.map(({bone})=>local(bone)),snapshot.map(({position,quaternion,scale})=>[...position.toArray(),...quaternion.toArray(),...scale.toArray()]))
  s.fixture.dispose()
 }
})

test('prone leaves animated clothing, finger and face locals and scales under their original owners',()=>{
 const s=sample('cloth'),finger=new Bone(),face=new Bone();finger.position.set(.03,0,0);face.position.set(0,.04,.07)
 s.fixture.bones.leftHand.add(finger);s.fixture.bones.head.add(face);s.fixture.skeleton.bones.push(finger,face)
 s.root.updateWorldMatrix(true,true);s.fixture.skeleton.calculateInverses();s.rig=prepareHumanoidRig({mesh:s.fixture.mesh,bones:s.fixture.bones})
 const untouched=[...s.fixture.cloth,finger,face]
 untouched.forEach((bone,i)=>{bone.rotation.z+=.13*(i+1);bone.position.x+=.003*(i+1);bone.scale.set(.85+i*.02,1.1,.95)})
 s.root.updateWorldMatrix(true,true);const originals=untouched.map(local),headQ=s.fixture.bones.head.getWorldQuaternion(new Quaternion())
 const r=applyPronePose(s.rig,{heading:.6})
 assert.deepEqual(untouched.map(local),originals);assert.ok(r.headRotationErrorDegrees<.001)
 assert.ok(s.fixture.bones.head.getWorldQuaternion(new Quaternion()).angleTo(headQ)<1e-7)
 s.fixture.dispose()
})

test('tracked prone hands retain their input orientation without stretching missing-parent limbs',()=>{
 const s=sample(),b=s.fixture.bones,handQ=sides.map(side=>b[side+'Hand'].getWorldQuaternion(new Quaternion())),beforeDirect=distances(s.direct),beforeSpans=distances(s.spans)
 const r=applyPronePose(s.rig,{heading:.6,preserveHands:true})
 assert.ok(r.headRotationErrorDegrees<.001);assert.ok(r.headDriftMm<.001);assert.ok(Number.isFinite(r.handPositionErrorMm))
 sides.forEach((side,i)=>assert.ok(b[side+'Hand'].getWorldQuaternion(new Quaternion()).angleTo(handQ[i])<1e-7))
 assert.ok(maxErrorMm(beforeDirect,distances(s.direct))<.001);assert.ok(maxErrorMm(beforeSpans,distances(s.spans))<.001)
 s.fixture.dispose()
})

test('support-fit prone keeps missing-parent lengths, exact head input orientation and caller restoration',()=>{
 const s=sample(),b=s.fixture.bones,beforeDirect=distances(s.direct),beforeSpans=distances(s.spans),snapshot=captureBones(s.fixture.skeleton)
 const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.6).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-.15)),surface={point:point(b.hips),normal:new Vector3(0,1,0).applyQuaternion(q),lateral:new Vector3(1,0,0).applyQuaternion(q),forward:new Vector3(0,0,1).applyQuaternion(q),halfSize:[2,2],clearanceM:.008}
 const driver=attachPoseDriver({scene:s.scene,rig:s.rig,getOptions:()=>({preset:'glider',orientation:q,support:surface,preserveHands:true})})
 s.scene.onBeforeRender()
 assert.equal(driver.error,null);assert.ok(driver.last.headRotationErrorDegrees<.001)
 assert.equal(driver.last.torsoContact.source,'sampled-skin');assert.equal(driver.last.torsoContact.aligned,true)
 assert.ok(maxErrorMm(beforeDirect,distances(s.direct))<.001);assert.ok(maxErrorMm(beforeSpans,distances(s.spans))<.001)
 s.scene.onAfterRender();assert.equal(driver.restored,true)
 assert.deepEqual(snapshot.map(({bone})=>local(bone)),snapshot.map(({position,quaternion,scale})=>[...position.toArray(),...quaternion.toArray(),...scale.toArray()]))
 driver.dispose();s.fixture.dispose()
})
