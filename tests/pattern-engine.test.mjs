import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,Quaternion,Scene,Vector3} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {applyDemoHostPose} from '../demo/host-input.mjs'
import {createPatternEngine} from '../demo/pattern-engine.mjs'
import {createPatternCases} from '../src/pose-patterns.mjs'

const up=new Vector3(0,1,0),point=bone=>bone.getWorldPosition(new Vector3())
const cases=createPatternCases(),find=id=>structuredClone(cases.find(c=>c.id===id))
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`)
const vectorClose=(a,b,tolerance=1e-7)=>assert.ok(a.distanceTo(b)<tolerance,`${a.toArray()} != ${b.toArray()}`)
function sample({authoredCulling=false}={}){
 const scene=new Scene(),fixture=createPoseFixture(),root=new Group()
 fixture.mesh.frustumCulled=authoredCulling
 root.add(fixture.mesh);scene.add(root)
 const neutral=captureBones(fixture.skeleton)
 const actor={root,bones:fixture.bones,animate(_time,options){
  restoreBones(neutral);root.updateWorldMatrix(true,true);applyDemoHostPose(fixture.bones,options)
  root.updateWorldMatrix(true,true);root.traverse(mesh=>{if(mesh.isSkinnedMesh)mesh.skeleton.update()})
 }}
 const carrier=createPoseFixture(),carrierRoot=new Group();carrierRoot.add(carrier.mesh);scene.add(carrierRoot)
 const engine=createPatternEngine({actor,scene,carrier,carrierRoot})
 return {scene,fixture,root,carrier,carrierRoot,engine,dispose(){fixture.dispose();carrier.dispose()}}
}
function anatomical(rig,role){
 const bone=rig.bones[role]
 return bone.getWorldQuaternion(new Quaternion()).multiply(rig.restRotations.get(bone).clone().invert()).multiply(rig.restBasis)
}

test('standing support nose-up and right-bank signs agree with the reported surface',()=>{
 const s=sample()
 try{
  for(const id of ['standing-hover__support-up','standing-hover__support-down','standing-hover__support-left','standing-hover__support-right']){
   const result=s.engine.solve(find(id),0),normal=up.clone().applyQuaternion(new Quaternion().fromArray(result.frame.quaternion))
   const bodyUp=up.clone().applyQuaternion(anatomical(s.engine.rig,'chest'))
   vectorClose(bodyUp,normal)
   assert.ok(result.metrics.headRotationErrorDegrees<.001);assert.ok(result.metrics.boneLengthErrorMm<.001)
   assert.ok(result.assessment.reasons.includes('support-contact-not-constrained'))
  }
 }finally{s.dispose()}
})

test('body pitch stays an independent legacy control rather than becoming a support angle',()=>{
 const s=sample()
 try{
  const c=find('standing-hover__base');c.options.pitch=.12
  const result=s.engine.solve(c,0),bodyUp=up.clone().applyQuaternion(anatomical(s.engine.rig,'chest'))
  assert.ok(bodyUp.z>.11);vectorClose(up.clone().applyQuaternion(new Quaternion().fromArray(result.frame.quaternion)),up)
  assert.ok(result.metrics.headRotationErrorDegrees<.001)
 }finally{s.dispose()}
})

test('shoulder support targets match the final carrier shoulders after its arm solve',()=>{
 const s=sample()
 try{
  for(const id of ['shoulder-upright__base','shoulder-upright__support-up','shoulder-upright__support-right','shoulder-upright__combined-down-left']){
   const c=find(id),result=s.engine.solve(c,0),m=result.metrics
   const finalShoulders=point(s.carrier.bones.leftUpperArm).add(point(s.carrier.bones.rightUpperArm)).multiplyScalar(.5)
   const forward=new Vector3(0,0,1).applyAxisAngle(up,m.heading)
   const target=finalShoulders.addScaledVector(up,m.seatLift).addScaledVector(forward,-m.seatBack)
   vectorClose(new Vector3().fromArray(m.supportTargetWorld),target)
   close(m.supportErrorMm,point(s.fixture.bones.hips).distanceTo(target)*1000)
   assert.ok(m.supportErrorMm<.001);assert.ok(m.headRotationErrorDegrees<.001);assert.ok(m.boneLengthErrorMm<.001)
   if(id!=='shoulder-upright__base')assert.ok(m.warnings.includes('carrier-tilt-proxy-only'))
  }
 }finally{s.dispose()}
})

test('Nimbus calibration leaves heading to the support frame exactly once',()=>{
 const s=sample()
 try{
  const results=[0,.7].map(heading=>{
   const c=find('nimbus-surf__base');c.id+='-'+heading;c.options.heading=heading
   const result=s.engine.solve(c,0),inverse=new Quaternion().fromArray(result.frame.quaternion).invert()
   return {result,localTargets:result.metrics.footTargetsWorld.map(p=>new Vector3().fromArray(p).applyQuaternion(inverse))}
  })
  results[0].localTargets.forEach((p,i)=>vectorClose(p,results[1].localTargets[i]))
  assert.ok(results.every(({result})=>result.metrics.footTargetErrorMm<.001&&result.metrics.headRotationErrorDegrees<.001))
 }finally{s.dispose()}
})

test('head-neck and head-chest angles measure their own anatomical joints',()=>{
 const s=sample()
 try{
  const c=find('prone-glider__look-right'),result=s.engine.solve(c,0),head=anatomical(s.engine.rig,'head')
  const neckAngle=head.angleTo(anatomical(s.engine.rig,'neck'))*180/Math.PI
  const chestAngle=head.angleTo(anatomical(s.engine.rig,'chest'))*180/Math.PI
  close(result.metrics.neckAngleDegrees,neckAngle,1e-5);close(result.metrics.headChestAngleDegrees,chestAngle,1e-5)
  assert.ok(chestAngle-neckAngle>20,'prone neck extension must not be reported as the complete chest-head bend')
  assert.ok(result.metrics.headRotationErrorDegrees<.001)
 }finally{s.dispose()}
})

test('repeated family samples restore both skeletons and carrier transforms exactly',()=>{
 const s=sample()
 try{
  for(const id of ['nimbus-surf__combined-up-right','standing-hover__support-right','prone-glider__support-up','chair-car__support-up','straddle-horse__support-right','side-broom__look-right','shoulder-upright__combined-down-left']){
   const c=find(id);s.engine.reset(c);const snapshot=s.engine.capture()
   for(const time of [0,11/60,23/60]){const result=s.engine.solve(c,time);assert.equal(result.metrics.finite,true);assert.ok(result.metrics.headRotationErrorDegrees<.001);assert.ok(result.metrics.boneLengthErrorMm<.001)}
   s.engine.restore(snapshot);assert.equal(s.engine.isRestored(snapshot),true,id)
  }
 }finally{s.dispose()}
})
test('lab skin culling policy changes visibility ownership without changing solved bone metrics',()=>{
 const s=sample({authoredCulling:true})
 try{
  assert.equal(s.fixture.mesh.frustumCulled,false)
  const c=find('straddle-horse__base'),before=s.engine.solve(c,23/60).metrics
  s.engine.useAuthoredSkinCulling(true);assert.equal(s.fixture.mesh.frustumCulled,true)
  const after=s.engine.solve(c,23/60).metrics
  assert.deepEqual(after,before)
  s.engine.useAuthoredSkinCulling(false);assert.equal(s.fixture.mesh.frustumCulled,false)
  assert.ok(s.engine.measureBodyBounds().min.every(Number.isFinite))
 }finally{s.dispose()}
})
