import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {Group,Quaternion,Scene,Vector3} from 'three'
import {createDetailedPoseFixture} from '../src/vendor/detailed-fixture.mjs'
import {captureBones,inspectHumanoidRigs,prepareRig,restoreBones} from '../src/vendor/render-pose.mjs'
import {authoringRig} from '../src/authoring/rig.mjs'
import {applyAuthoredPose,bodyScale} from '../src/authoring/solve.mjs'
import {sampleKey} from '../src/authoring/clip.mjs'
import {evaluateHeld} from '../src/authoring/quality.mjs'
import {HELD_REST,applyHeld,curve,heldParams,holdFit,propWorld,sampleHeld,timelineDuration,timelineParams} from '../src/authoring/prop.mjs'
import {COMPAT_VARIANTS,deviationMm,stageVariant} from '../scripts/review-compat.mjs'

const clip=JSON.parse(readFileSync(new URL('../specs/pump-gun.v1.json',import.meta.url),'utf8'))
const wave=JSON.parse(readFileSync(new URL('../specs/charge-wave.v1.json',import.meta.url),'utf8'))
function stage(scale=1,options={}){
 const scene=new Scene(),f=createDetailedPoseFixture(options),root=new Group();root.scale.setScalar(scale);root.add(f.mesh);scene.add(root);f.idle(0);scene.updateMatrixWorld(true)
 return {scene,f,rig:prepareRig(inspectHumanoidRigs(scene)[0])}
}
const LOWER=['hips','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot']
const worldOf=bone=>({p:bone.getWorldPosition(new Vector3()),q:bone.getWorldQuaternion(new Quaternion())})

test('curves are piecewise linear and clamp at both ends',()=>{
 assert.equal(curve([[0,0],[.5,1],[1,0]],.25),.5)
 assert.equal(curve([[.2,3],[.8,5]],0),3)
 assert.equal(curve([[.2,3],[.8,5]],1),5)
 assert.equal(curve(.7,.3),.7)
 assert.equal(curve(undefined,.3,9),9)
})

test('phase curves turn a phase and its time into hold parameters',()=>{
 assert.deepEqual({...heldParams(clip,'ready',.4)},{...HELD_REST,phase:'ready'})
 const back=heldParams(clip,'pump',.35)
 assert.equal(back.pump,1)
 assert.equal(heldParams(clip,'pump',1).pump,0)
 const lid=heldParams(clip,'lid',.5)
 assert.deepEqual([lid.reach,lid.stance,lid.lift,lid.turn],[1,1,1,1])
 // auto fire: the hand follows only a share of the pump's travel, once per cycle
 const share=clip.phases.auto.cycle.follow
 assert.ok(Math.abs(heldParams(clip,'auto',0,{cycle:.45}).pump-share)<1e-9)
 assert.equal(heldParams(clip,'auto',0,{cycle:2}).pump,0)
 assert.equal(heldParams(clip,'auto',0,{cycle:.45}).trigger,1)
 assert.equal(heldParams(clip,'ready',0,{pitch:20}).pitch,20)
 assert.equal(heldParams(clip,'raise',0).weight,0)
 assert.equal(heldParams(clip,'raise',1).weight,1)
})

test('the scripted timeline starts and ends without weight and visits every phase',()=>{
 const total=timelineDuration(clip),seen=new Set()
 assert.ok(total>5&&total<10)
 for(let t=0;t<=total;t+=1/60)seen.add(timelineParams(clip,t).phase)
 for(const phase of ['raise','pump','ready','auto','empty','lid','regrip','lower'])assert.ok(seen.has(phase),phase)
 assert.equal(timelineParams(clip,0).weight,0)
 assert.ok(timelineParams(clip,total).weight<1e-9)
})

test('upper body over the host: pelvis and legs stay exactly where the host put them',()=>{
 const {f,rig,scene}=stage()
 f.idle(.7);scene.updateMatrixWorld(true)
 const before=Object.fromEntries(LOWER.map(role=>[role,worldOf(f.bones[role])]))
 const armBefore=worldOf(f.bones.rightLowerArm)
 const h=applyHeld(rig,clip,{...HELD_REST})
 for(const role of LOWER){
  const now=worldOf(f.bones[role])
  assert.ok(now.p.distanceTo(before[role].p)<1e-9,role+' moved')
  assert.ok(now.q.angleTo(before[role].q)<1e-9,role+' turned')
 }
 assert.ok(worldOf(f.bones.rightLowerArm).p.distanceTo(armBefore.p)>.05,'the arms are posed')
 assert.deepEqual(h.metrics.legs,{left:null,right:null})
 f.dispose()
})

test('the full-body solver is untouched by the new option',()=>{
 const a=stage(),b=stage()
 const frame=info=>({...sampleKey(wave,info,'charge'),weight:1})
 const ma=applyAuthoredPose(a.rig,frame(authoringRig(a.rig)),{heading:0})
 const mb=applyAuthoredPose(b.rig,frame(authoringRig(b.rig)),{heading:0,lowerBody:'authored'})
 assert.deepEqual(ma.hipsWorld,mb.hipsWorld)
 assert.ok(ma.legs.left&&ma.legs.right)
 a.f.dispose();b.f.dispose()
})

for(const scale of [.75,1,1.3])test(`both hands reach their sockets on a ${scale}× body through pump, lid and look`,()=>{
 const {f,rig}=stage(scale)
 for(const params of [{},{pump:1},{reach:1,stance:1},{reach:1,stance:1,lift:1,turn:1},{pitch:40},{pitch:-35}]){
  const snap=captureBones(rig.skeleton),h=applyHeld(rig,clip,{...HELD_REST,...params})
  for(const side of ['left','right'])assert.ok(h.metrics.arms[side].reachErrorMm<.5,`${side} ${JSON.stringify(params)} ${h.metrics.arms[side].reachErrorMm}`)
  assert.ok(h.shortfallMm<.5)
  restoreBones(snap);rig.skeleton.update()
 }
 f.dispose()
})

test('a small body turns its chest and pulls the prop in; a tall one holds it as authored',()=>{
 const small=stage(.75),tall=stage(1.3)
 const fs=holdFit(small.rig,clip),ft=holdFit(tall.rig,clip)
 assert.ok(fs.reached&&ft.reached)
 assert.ok(fs.yaw>0||fs.back>0,'the small body needs a closer hold')
 assert.ok(fs.scale<1&&fs.scale>=clip.prop.fit.minScale,'and holds a smaller prop')
 assert.deepEqual([ft.back,ft.yaw,ft.scale],[0,0,1])
 assert.equal(holdFit(small.rig,clip),fs,'cached per rig and clip')
 small.f.dispose();tall.f.dispose()
})

test('a prop shrunk for a small body has its sockets that much closer together',()=>{
 const {f,rig}=stage(.6)
 const fit=holdFit(rig,clip),h=applyHeld(rig,clip,{...HELD_REST})
 assert.equal(h.scale,fit.scale)
 assert.ok(Math.abs(fit.scale-.6/clip.prop.fit.scaleBelow)<.02)
 const hands=f.bones.leftHand.getWorldPosition(new Vector3()).distanceTo(f.bones.rightHand.getWorldPosition(new Vector3()))
 f.idle(0)
 const full=applyHeld(rig,clip,{...HELD_REST},{fit:false})
 const apart=f.bones.leftHand.getWorldPosition(new Vector3()).distanceTo(f.bones.rightHand.getWorldPosition(new Vector3()))
 assert.equal(full.scale,1)
 assert.ok(hands<apart,`hands ${hands} m apart on the shrunk prop, ${apart} m on the full-size one`)
 const left=full.metrics.arms.left
 assert.ok(left.reachErrorMm>1||left.elbowFlexDeg<14,'at full size this body cannot hold it comfortably')
 for(const side of ['left','right'])assert.ok(h.metrics.arms[side].reachErrorMm<.5)
 f.dispose()
})

test('the support hand travels with the pump by exactly its stroke',()=>{
 const {f,rig}=stage()
 const at=params=>{const snap=captureBones(rig.skeleton);applyHeld(rig,clip,{...HELD_REST,...params});const p=f.bones.leftHand.getWorldPosition(new Vector3()),r=f.bones.rightHand.getWorldPosition(new Vector3());restoreBones(snap);rig.skeleton.update();return {p,r}}
 const a=at({}),b=at({pump:1})
 const stroke=new Vector3(...clip.prop.sockets.pump.travel).length()
 assert.ok(Math.abs(a.p.distanceTo(b.p)-stroke)<.004,`moved ${a.p.distanceTo(b.p)} for a stroke of ${stroke}`)
 assert.ok(a.r.distanceTo(b.r)<1e-6,'the holding hand stays on the grip')
 f.dispose()
})

test('the prop sits in the holding hand and points where the body faces, turned by the look',()=>{
 const {f,rig}=stage(),info=authoringRig(rig),{k}=bodyScale(rig,info)
 const level=applyHeld(rig,clip,{...HELD_REST},{heading:0})
 const forward=new Vector3(0,0,-1).applyQuaternion(level.prop.quaternion) // the model looks down its -Z
 assert.ok(forward.z>.99,'level: along the heading (+Z)')
 const grip=new Vector3(...clip.prop.sockets.grip.position)
 // prop X=left, Z=forward → model axes are turned half round about Y
 const gripWorld=new Vector3(-grip.x,grip.y,-grip.z).applyQuaternion(level.prop.quaternion).add(level.prop.position)
 const hand=f.bones.rightHand.getWorldPosition(new Vector3())
 assert.ok(gripWorld.distanceTo(hand)<.12*k,`grip ${gripWorld.distanceTo(hand)} m from the wrist`)
 f.idle(0)
 const up=applyHeld(rig,clip,{...HELD_REST,pitch:30},{heading:0})
 const lifted=new Vector3(0,0,-1).applyQuaternion(up.prop.quaternion)
 assert.ok(Math.abs(Math.asin(lifted.y)*180/Math.PI-30)<.01,'the prop follows the look')
 // heading turns everything
 f.idle(0)
 const turned=applyHeld(rig,clip,{...HELD_REST},{heading:Math.PI/2,origin:[0,0,0]})
 assert.ok(new Vector3(0,0,-1).applyQuaternion(turned.prop.quaternion).x>.99)
 const frame=sampleHeld(clip,info,k,HELD_REST)
 assert.equal(propWorld(frame.prop,{modelForward:'z'}).quaternion.angleTo(frame.prop.quaternion),0)
 f.dispose()
})

test('weight 0 leaves the host pose alone, weight 1 poses, and the blend is continuous',()=>{
 const {f,rig}=stage()
 const hand=()=>f.bones.leftHand.getWorldPosition(new Vector3())
 f.idle(0);const host=hand()
 const snap=captureBones(rig.skeleton)
 applyHeld(rig,clip,{...HELD_REST,weight:0});const w0=hand();restoreBones(snap);rig.skeleton.update()
 applyHeld(rig,clip,{...HELD_REST,weight:.5});const w5=hand();restoreBones(snap);rig.skeleton.update()
 applyHeld(rig,clip,{...HELD_REST,weight:1});const w1=hand();restoreBones(snap);rig.skeleton.update()
 assert.ok(w0.distanceTo(host)<1e-6)
 assert.ok(w1.distanceTo(host)>.2)
 assert.ok(w5.distanceTo(host)>.05&&w5.distanceTo(w1)>.05)
 f.dispose()
})

test('the whole timeline stays within the joint ranges on three body sizes',()=>{
 for(const scale of [.75,1,1.3]){
  const {f,rig}=stage(scale),e=evaluateHeld(rig,clip,{hostPose:t=>f.idle(t)})
  const failed=e.verdicts.filter(v=>v.status==='fail').map(v=>`${v.metric}=${v.value}`)
  assert.deepEqual(failed,[],`${scale}×`)
  const reach=e.verdicts.find(v=>v.metric==='handReachErrorMm'),shortfall=e.verdicts.find(v=>v.metric==='propShortfallMm')
  assert.equal(reach.status,'pass');assert.equal(shortfall.status,'pass')
  assert.ok(e.maxJump.value<45,`elbow swivel jump ${e.maxJump.value}`)
  f.dispose()
 }
})

test('avatars built the way other exporters build them hold the prop the same way',()=>{
 const reference=stageVariant(clip,{})
 for(const [id,options,same] of COMPAT_VARIANTS.filter(([id])=>['blender','mmd','nameless','twist-chain','mmd-rolled-facing-z','no-fingers','bare-nameless-rolled'].includes(id))){
  const v=stageVariant(clip,options)
  assert.equal(v.selection.status,'ready',id)
  assert.ok(v.rolesCorrect,id+' roles')
  const reach=Math.max(...v.samples.flatMap(s=>Object.values(s.metrics.arms).map(a=>a?.reachErrorMm??0)))
  assert.ok(reach<1,`${id} reach ${reach}`)
  if(same)assert.ok(deviationMm(v,reference)<.01,`${id} differs from the reference by ${deviationMm(v,reference)} mm`)
  v.f.dispose()
 }
 reference.f.dispose()
})
