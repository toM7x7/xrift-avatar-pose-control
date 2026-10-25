import test from 'node:test'
import assert from 'node:assert/strict'
import {Scene,Group,Bone,Quaternion,Vector3} from 'three'
import {createComplexFixture} from '../src/repro/complex-fixture.mjs'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import * as baseline from '../src/repro/baseline-rig.mjs'
import {applyStandingPose as oldPose} from '../src/repro/baseline-standing.mjs'
import {inspectHumanoidRigs,prepareRig} from '../src/vendor/render-pose.mjs'
import {applyStandingPose,installStandingPose} from '../src/standing.mjs'
function run(kind,old=false){const scene=new Scene(),f=createComplexFixture(kind);scene.add(f.mesh);scene.updateMatrixWorld(true);const rest=f.measure();f.seated();const api=old?baseline:{inspectHumanoidRigs,prepareRig},rig=api.prepareRig(api.inspectHumanoidRigs(scene).find(r=>r.mesh===f.mesh)),metrics=(old?oldPose:applyStandingPose)(rig,{preserveHands:false});return {f,scene,rig,rest,metrics,after:f.measure()}}
test('v2 deterministically flips a garment with a missing non-deforming parent, despite good knee metrics',()=>{
 const r=run('cloth',true);assert.ok(r.rest.panels.every(p=>p.tipRelativeRootY<0));assert.ok(r.after.panels.every(p=>p.tipRelativeRootY>1));assert.ok(r.metrics.knees.every(k=>k<4));r.f.dispose()
})
test('v2 deterministically folds a leg with an unweighted parent omitted from the joint palette',()=>{
 const r=run('leg-pivot',true);assert.ok(r.after.legs.every(l=>l.kneeDegrees>160));assert.ok(Math.abs(r.after.legs[0].thighLength-r.rest.legs[0].thighLength)>.06);r.f.dispose()
})
test('candidate keeps garment transforms and hanging direction while extending the human legs',()=>{
 const r=run('cloth');assert.deepEqual(r.after.panels.map(p=>p.localPosition),r.rest.panels.map(p=>p.localPosition));assert.deepEqual(r.after.panels.map(p=>p.localQuaternion),r.rest.panels.map(p=>p.localQuaternion));assert.ok(r.after.panels.every(p=>p.tipRelativeRootY< -1));assert.ok(r.after.legs.every(l=>l.kneeDegrees<4));assert.ok(r.metrics.headDriftMm<.001);r.f.dispose()
})
test('candidate extends the omitted-parent knee without changing limb length or helper transforms',()=>{
 const scene=new Scene(),f=createComplexFixture('leg-pivot');scene.add(f.mesh);const original=f.measure();f.seated();const local=f.omitted.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]);const rig=prepareRig(inspectHumanoidRigs(scene)[0]);applyStandingPose(rig);const result=f.measure();assert.ok(result.legs.every(l=>l.kneeDegrees<4));result.legs.forEach((l,i)=>{assert.ok(Math.abs(l.thighLength-original.legs[i].thighLength)<1e-8);assert.ok(Math.abs(l.calfLength-original.legs[i].calfLength)<1e-8)});assert.deepEqual(f.omitted.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]),local);f.dispose()
})
test('primary human joint wins over appended _sub helper, and equally ranked duplicates fail closed',()=>{
 const r=run('helper-alias');assert.equal(r.rig.bones.leftUpperLeg.name,'leftUpperLeg');r.f.dispose()
 const f=createPoseFixture(),scene=new Scene(),duplicate=new Bone();duplicate.name='leftUpperLeg';f.bones.hips.add(duplicate);f.skeleton.bones.push(duplicate);f.mesh.updateWorldMatrix(true,true);f.skeleton.calculateInverses();scene.add(f.mesh);const raw=inspectHumanoidRigs(scene)[0];assert.equal(raw.supported,false);assert.ok(raw.missing.includes('leftUpperLeg'));f.dispose()
})
test('garment and knee regression stays corrected under scaled/rotated roots and restores every frame',()=>{
 for(const kind of ['cloth','leg-pivot'])for(const scale of [.7,1.3]){
  const scene=new Scene(),f=createComplexFixture(kind),root=new Group();root.position.set(3,4,-2);root.rotation.y=.7;root.scale.setScalar(scale);root.add(f.mesh);scene.add(root);scene.updateMatrixWorld(true)
  const rig=prepareRig(inspectHumanoidRigs(scene).find(r=>r.mesh===f.mesh)),bridge=installStandingPose(scene,rig,()=>({enabled:true,heading:.7}),f.accessories.map(a=>a.skeleton))
  for(let frame=0;frame<90;frame++){f.seated(frame/60);const pose=f.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]);scene.onBeforeRender();assert.ok(f.measure().legs.every(l=>l.kneeDegrees<4));if(kind==='cloth')assert.ok(f.measure().panels.every(p=>p.tipRelativeRootY<-.7));scene.onAfterRender();assert.deepEqual(f.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]),pose)}
  bridge.dispose();f.dispose()
 }
})
