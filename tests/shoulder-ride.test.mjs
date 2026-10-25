import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,Scene,Vector3} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {createComplexFixture} from '../src/repro/complex-fixture.mjs'
import {prepareRig,inspectHumanoidRigs,captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {applyShoulderRidePose,applyShoulderCarrierPose} from '../src/shoulder-ride.mjs'

const anchors={leftShoulder:[.2,1.38,0],rightShoulder:[-.2,1.38,0],head:[0,1.54,0]},transforms=f=>f.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()])
function sample(scale=1,kind=null){const scene=new Scene(),root=new Group(),f=kind?createComplexFixture(kind):createPoseFixture();root.scale.setScalar(scale);root.add(f.mesh);scene.add(root);f.seated(.8);scene.updateMatrixWorld(true);return {scene,root,f,rig:prepareRig(inspectHumanoidRigs(scene)[0])}}

test('shoulder support seats the passenger with forward knees and hanging calves at three sizes',()=>{
 for(const size of [.65,1,1.35]){const {f,rig}=sample(size),m=applyShoulderRidePose(rig,{carrierAnchors:anchors});assert.ok(m.supportErrorMm<1e-7);assert.ok(m.headDriftMm>100);assert.ok(m.headRotationErrorDegrees<.001);assert.ok(m.knees.every(k=>k>60&&k<105));assert.ok(m.maxLimbLengthErrorMm<1e-6);assert.ok(m.kneeLateralGapM>.45*size);assert.ok(m.kneesWorld.every((p,i)=>p[2]>m.hipsWorld[2]&&m.feetWorld[i][1]<p[1]));f.dispose()}
})
test('head anchoring honestly reports the support error while support anchoring moves the rendered head',()=>{
 const {f,rig}=sample(),host=captureBones(f.skeleton);const support=applyShoulderRidePose(rig,{carrierAnchors:anchors});restoreBones(host);const head=applyShoulderRidePose(rig,{carrierAnchors:anchors,anchorMode:'head'});assert.ok(head.headDriftMm<1e-6);assert.ok(head.supportErrorMm>100);assert.ok(Math.abs(head.supportErrorMm-support.headDriftMm)<1e-6);f.dispose()
})
test('translated and rotated carrier anchors produce an equivariant pose without changing the carrier points',()=>{
 const a=sample(),b=sample(),m=applyShoulderRidePose(a.rig,{carrierAnchors:anchors}),yaw=.83,delta=new Vector3(2,.4,-3),up=new Vector3(0,1,0),moved=Object.fromEntries(Object.entries(anchors).map(([k,v])=>[k,new Vector3(...v).applyAxisAngle(up,yaw).add(delta)])),input=Object.fromEntries(Object.entries(moved).map(([k,v])=>[k,v.toArray()]));const n=applyShoulderRidePose(b.rig,{carrierAnchors:moved});for(const key of ['hipsWorld','headWorld'])assert.ok(new Vector3(...m[key]).applyAxisAngle(up,yaw).add(delta).distanceTo(new Vector3(...n[key]))<1e-7);for(let i=0;i<2;i++)assert.ok(new Vector3(...m.feetWorld[i]).applyAxisAngle(up,yaw).add(delta).distanceTo(new Vector3(...n.feetWorld[i]))<1e-7);assert.deepEqual(Object.fromEntries(Object.entries(moved).map(([k,v])=>[k,v.toArray()])),input);a.f.dispose();b.f.dispose()
})
test('unreachable tracked hands report error without stretching limbs or losing head rotation',()=>{
 const {f,rig}=sample();const m=applyShoulderRidePose(rig,{carrierAnchors:{...anchors,leftShoulder:[.2,3.38,0],rightShoulder:[-.2,3.38,0]},preserveHands:true});assert.ok(m.handPositionErrorMm>1000);assert.ok(m.handRotationErrorDegrees<.001);assert.ok(m.headRotationErrorDegrees<.001);assert.ok(m.maxLimbLengthErrorMm<1e-6);f.dispose()
})
test('omitted knee parents and clothing retain local transforms and all snapshots restore',()=>{
 for(const kind of ['leg-pivot','cloth']){const {f,rig}=sample(1,kind),host=transforms(f),snapshot=captureBones(f.skeleton),extra=[...f.omitted,...f.cloth].map(b=>({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()})),m=applyShoulderRidePose(rig,{carrierAnchors:anchors});assert.ok(m.maxLimbLengthErrorMm<1e-6);assert.ok(m.supportErrorMm<1e-6);for(const x of extra){assert.ok(x.b.position.distanceTo(x.p)<1e-8);assert.ok(x.b.quaternion.angleTo(x.q)<1e-7);assert.ok(x.b.scale.distanceTo(x.s)<1e-8)}restoreBones(snapshot);assert.deepEqual(transforms(f),host);f.dispose()}
})
test('invalid carrier anchors and anchor modes fail before modifying passenger bones',()=>{
 const {f,rig}=sample(),host=transforms(f);for(const options of [{},{carrierAnchors:{...anchors,head:[NaN,1,0]}},{carrierAnchors:{...anchors,leftShoulder:anchors.rightShoulder}},{carrierAnchors:anchors,anchorMode:'camera'}]){assert.throws(()=>applyShoulderRidePose(rig,options));assert.deepEqual(transforms(f),host)}f.dispose()
})
test('small passenger and tall carrier increase the back offset and expose conservative body proxies',()=>{
 const {f,rig}=sample(.65),host=captureBones(f.skeleton),large=Object.fromEntries(Object.entries(anchors).map(([k,v])=>[k,v.map(n=>n*1.35)])),before=applyShoulderRidePose(rig,{carrierAnchors:large,seatBack:.13});assert.ok(before.headTorsoProxyClearanceMm<0);restoreBones(host);const after=applyShoulderRidePose(rig,{carrierAnchors:large});assert.ok(Math.abs(after.carrierScale-1.35)<1e-9);assert.ok(Math.abs(after.seatBack-.27)<1e-9);assert.ok(after.headTorsoProxyClearanceMm>30);assert.ok(after.headThighProxyClearanceMm>0);assert.equal(after.proxyWarning,null);assert.ok(after.maxLimbLengthErrorMm<1e-6);assert.ok(after.supportErrorMm<1e-6);f.dispose()
})
test('automatic leg spread improves small/tall leg clearance but keeps unresolved body overlap visible',()=>{
 const {f,rig}=sample(.65),host=captureBones(f.skeleton),large=Object.fromEntries(Object.entries(anchors).map(([k,v])=>[k,v.map(n=>n*1.35)])),before=applyShoulderRidePose(rig,{carrierAnchors:large,spread:1});restoreBones(host);const after=applyShoulderRidePose(rig,{carrierAnchors:large});assert.equal(after.spread,1.8);assert.ok(after.shinTorsoProxyClearanceMm>before.shinTorsoProxyClearanceMm);assert.ok(after.footTorsoProxyClearanceMm>before.footTorsoProxyClearanceMm);assert.ok(after.shinTorsoProxyClearanceMm<0);assert.ok(after.bodyProxyWarnings.includes('possible-shin-torso-overlap'));assert.ok(after.bodyProxyClearanceMm<0);assert.ok(after.maxLimbLengthErrorMm<1e-6);f.dispose();const standard=sample(),m=applyShoulderRidePose(standard.rig,{carrierAnchors:anchors});assert.ok(Math.abs(m.spread-1)<1e-9);standard.f.dispose()
})
test('carrier hands reach reachable shin targets and report unreachable targets without stretching',()=>{
 const {f,rig}=sample(),host=captureBones(f.skeleton),reachable={left:[.28,1.13,.18],right:[-.28,1.13,.18]},before=structuredClone(reachable),m=applyShoulderCarrierPose(rig,{shinTargets:reachable});assert.ok(m.handTargetErrorMm<.01);assert.ok(m.headDriftMm<.001);assert.ok(m.maxLimbLengthErrorMm<1e-6);assert.deepEqual(reachable,before);restoreBones(host);const far=applyShoulderCarrierPose(rig,{shinTargets:{left:[.28,3,.18],right:[-.28,3,.18]}});assert.ok(far.handTargetErrorMm>1000);assert.ok(far.maxLimbLengthErrorMm<1e-6);restoreBones(host);assert.throws(()=>applyShoulderCarrierPose(rig,{}));assert.deepEqual(transforms(f),host.map(s=>[...s.position.toArray(),...s.quaternion.toArray(),...s.scale.toArray()]));f.dispose()
})
