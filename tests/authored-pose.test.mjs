import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {Scene,Group,Vector3,Quaternion} from 'three'
import {createDetailedPoseFixture} from '../src/vendor/detailed-fixture.mjs'
import {inspectHumanoidRigs,prepareRig,captureBones,restoreBones} from '../src/vendor/render-pose.mjs'
import {attachPoseDriver,authoringRig,applyAuthoredPose,sampleAction,sampleKey,evaluateAction,fitPairAxes,solveArm,handFrame,humeralRotation,ARM_LIMITS} from '../src/index.mjs'

const clip=JSON.parse(readFileSync(new URL('../specs/charge-wave.v1.json',import.meta.url),'utf8'))
function body({scale=1,rename=null,shortArms=false}={}){
 const scene=new Scene(),f=createDetailedPoseFixture(),root=new Group();root.scale.setScalar(scale);root.position.set(.4,0,-.7);root.add(f.mesh);scene.add(root)
 if(rename)for(const b of f.skeleton.bones)b.name=rename(b.name)
 if(shortArms){for(const s of ['left','right']){f.bones[s+'LowerArm'].position.multiplyScalar(.7);f.bones[s+'Hand'].position.multiplyScalar(.7)}f.mesh.updateWorldMatrix(true,true);f.skeleton.calculateInverses()}
 f.idle(0);scene.updateMatrixWorld(true)
 return {scene,f,root,rig:prepareRig(inspectHumanoidRigs(scene)[0])}
}
const P=b=>b.getWorldPosition(new Vector3())
// Body metres -> world scale of a rig (the solver's k).
const r0k=(rig,info)=>info.hipHeight*(P(rig.bones.leftUpperArm).distanceTo(P(rig.bones.leftLowerArm))/info.limbs.left.upperLength)/.95
const lengths=f=>f.skeleton.bones.filter(b=>b.parent?.isBone).map(b=>P(b).distanceTo(P(b.parent)))

test('detects torso chain, clavicles, toes and five fingers per hand (by name and by shape)',()=>{
 for(const rename of [null,n=>/Thumb|Index|Middle|Ring|Little/.test(n)?'bone_'+[...n].reduce((h,c)=>h*31+c.charCodeAt(0)>>>0,7).toString(36):n]){
  const {rig,f}=body({rename}),info=authoringRig(rig)
  assert.deepEqual(info.torso.map(b=>b.name),['spine','chest','upperChest'])
  assert.ok(info.shoulders.left&&info.shoulders.right&&info.toes.left&&info.toes.right)
  for(const s of ['left','right']){
   assert.deepEqual(info.hands[s].fingers.map(x=>x.name),['thumb','index','middle','ring','little'])
   assert.equal(info.hands[s].fingers[0].bones[0],f.bones[s+'ThumbProximal'],'thumb found '+(rename?'by shape':'by name'))
   assert.equal(info.hands[s].fingers[4].bones[0],f.bones[s+'LittleProximal'])
  }
  assert.ok(Object.values(info.radii).every(r=>r.source==='skin'))
  f.dispose()
 }
})

test('wrist and forearm angles read anatomically (palm forward, fingers up = ~90° extension)',()=>{
 const {rig,f}=body(),info=authoringRig(rig)
 for(const [side,sign] of [['left',1],['right',-1]]){
  // Straight arm pointing forward: the forearm is horizontal, so the wrist alone turns the hand.
  const reach=P(f.bones[side+'UpperArm']).add(new Vector3(0,0,.5296))
  const r=solveArm(rig,info,side,{wrist:reach,hand:handFrame(new Vector3(0,1,0),new Vector3(0,0,1))},{})
  assert.ok(Math.abs(r.wristFlexDeg+90)<6,JSON.stringify(r));assert.ok(r.reachErrorMm<.5);void sign
  const down=solveArm(rig,info,side,{wrist:reach,hand:handFrame(new Vector3(0,-1,0),new Vector3(0,0,-1))},{})
  assert.ok(Math.abs(down.wristFlexDeg-90)<6)
 }
 f.dispose()
})

test('keys reach both-hand contact exactly, keep bone lengths and plant the feet on the ground',()=>{
 for(const scale of [.75,1,1.3]){
  const {rig,f}=body({scale}),info=authoringRig(rig),before=lengths(f)
  for(const key of ['gather','charge','thrust']){
   f.idle(0);f.mesh.updateWorldMatrix(true,true)
   const snap=captureBones(f.skeleton),r=applyAuthoredPose(rig,sampleKey(clip,info,key),{heading:.4,headMode:'body'})
   for(const s of ['left','right']){assert.ok(r.arms[s].reachErrorMm<1,key+' '+s+' '+r.arms[s].reachErrorMm);assert.ok(r.handFrameErrorDeg[s]<.5)}
   assert.ok(Math.max(...lengths(f).map((l,i)=>Math.abs(l-before[i])))<1e-6*scale)
   for(const s of ['left','right'])assert.ok(r.legs[s].footReachErrorMm<1)
   const toes=['left','right'].map(s=>P(info.toes[s]).y)
   if(key!=='thrust')assert.ok(Math.max(...toes)-Math.min(...toes)<.01*scale,'both feet flat on the same ground')
   restoreBones(snap);f.skeleton.update()
  }
  f.dispose()
 }
})

test('short arms: an out-of-reach pair retracts straight toward the chest so the hands still meet',()=>{
 const {rig,f}=body({shortArms:true}),info=authoringRig(rig)
 // Push the release pair beyond reach on purpose.
 const far=structuredClone(clip);far.keys.thrust.hands.pair.center=[0,.04,.85]
 const key=sampleKey(far,info,'thrust'),asked=(key.hands.left.position[0]+key.hands.right.position[0])/2*r0k(rig,info)+P(f.bones.hips).x
 const r=applyAuthoredPose(rig,key,{heading:0})
 assert.ok(r.pairShiftMm>10,'shifted '+r.pairShiftMm)
 for(const s of ['left','right'])assert.ok(r.arms[s].reachErrorMm<1)
 const heels=['left','right'].map(s=>new Vector3().fromArray(r.handTargets[s].point))
 assert.ok(heels[0].distanceTo(heels[1])<.06,'heels stay together')
 // A centred pair moves back, not sideways toward one shoulder (no zigzag).
 const sideways=Math.abs((heels[0].x+heels[1].x)/2-asked)*1000
 assert.ok(sideways<.25*r.pairShiftMm,`moved ${sideways.toFixed(0)} mm sideways of ${r.pairShiftMm.toFixed(0)} mm`)
 // The authored release itself is reachable on the reference body.
 const {rig:rig2,f:f2}=body(),reach=applyAuthoredPose(rig2,sampleKey(clip,authoringRig(rig2),'thrust'),{heading:0})
 assert.ok(reach.pairShiftMm<5,'release reachable: '+reach.pairShiftMm)
 f.dispose();f2.dispose()
})

test('timeline: steps never lift both feet, planted feet do not slide, sampling is deterministic',()=>{
 const {rig,f}=body(),info=authoringRig(rig)
 for(let t=0;t<.5;t+=1/60){const fr=sampleAction(clip,info,{heldFor:t,releasedFor:null});assert.ok(!(fr.feet.left.lift>.001&&fr.feet.right.lift>.001),'t='+t)}
 const a=sampleAction(clip,info,{heldFor:1.3,releasedFor:.2,charge:.6,beamFor:1}),b=sampleAction(clip,info,{heldFor:1.3,releasedFor:.2,charge:.6,beamFor:1})
 assert.deepEqual(a,b)
 const e=evaluateAction(rig,clip,{hostPose:t=>f.idle(t),holdFor:2.6,beamFor:1})
 const v=Object.fromEntries(e.verdicts.map(x=>[x.metric,x]))
 for(const m of ['footSlideMm','handReachErrorMm','handFrameErrorDeg','skinClearanceMm','comMarginMm','kneeFlexDeg','residualTwistDeg','swivelJumpDeg'])assert.equal(v[m].status,'pass',m+' '+v[m].value)
 assert.ok(e.frames.every(fr=>Object.values(fr.channels).every(x=>!Number.isNaN(x))))
 f.dispose()
})

test('render-time driver: authored frame applies inside the transaction and restores the host pose',()=>{
 const {scene,rig,f}=body(),info=authoringRig(rig),host=f.skeleton.bones.map(b=>b.quaternion.clone())
 let frame=sampleAction(clip,info,{heldFor:2,releasedFor:null})
 const driver=attachPoseDriver({scene,rig,getOptions:()=>({preset:'authored',frame,heading:0,headMode:'host'})})
 scene.onBeforeRender(null,scene,null);assert.ok(driver.last&&driver.last.arms.left.reachErrorMm<1,driver.error)
 assert.ok(f.skeleton.bones.some((b,i)=>b.quaternion.angleTo(host[i])>.01))
 scene.onAfterRender(null,scene,null)
 assert.ok(f.skeleton.bones.every((b,i)=>b.quaternion.angleTo(host[i])<1e-6))
 driver.dispose();f.dispose()
})

test('pair fitting lowers the anatomical cost of a hand pair key',()=>{
 const {rig,f}=body(),key=structuredClone(clip.keys.gather);key.hands.pair.axes=key.hands.pair.authoredAxes
 const fit=fitPairAxes(rig,key,{range:[60,30,30],step:[20,15,15]})
 assert.ok(fit.cost<fit.before*.2,JSON.stringify(fit))
 f.dispose()
})

test('shoulder rotation reads anatomically: plain = 0, forearm turned out/up = external, elbow across the body = ±180°',()=>{
 const V=(x,y,z)=>new Vector3(x,y,z).normalize()
 // Arm hanging, forearm folded forward: plain rotation. Folded outward: external.
 assert.ok(Math.abs(humeralRotation(V(0,-1,0),V(0,0,1),'right'))<1)
 assert.ok(Math.abs(humeralRotation(V(0,-1,0),V(-1,0,0),'right')-90)<1,'right forearm out = external')
 assert.ok(Math.abs(humeralRotation(V(0,-1,0),V(1,0,0),'left')-90)<1,'left forearm out = external (mirrored)')
 // Arm reaching forward: forearm toward the midline is plain, up is external, down is internal, outward is impossible.
 assert.ok(Math.abs(humeralRotation(V(0,0,1),V(1,0,0),'right'))<1)
 assert.ok(Math.abs(humeralRotation(V(0,0,1),V(0,1,0),'right')-90)<1)
 assert.ok(Math.abs(humeralRotation(V(0,0,1),V(0,-1,0),'right')+90)<1)
 assert.ok(Math.abs(humeralRotation(V(0,0,1),V(-1,0,0),'right'))>170)
})

test('arms stay within the shoulder, forearm and wrist ranges in every key; the hand never twists at the wrist',()=>{
 const {rig,f}=body(),info=authoringRig(rig)
 for(const key of ['ready','join','gather','charge','thrust','follow']){
  f.idle(0);f.mesh.updateWorldMatrix(true,true)
  const snap=captureBones(f.skeleton),r=applyAuthoredPose(rig,sampleKey(clip,info,key),{heading:.4,headMode:'body'})
  for(const s of ['left','right']){
   const a=r.arms[s]
   assert.ok(a.humeralRotationDeg<=ARM_LIMITS.externalRotation+1&&a.humeralRotationDeg>=-ARM_LIMITS.internalRotation-1,`${key} ${s} shoulder ${a.humeralRotationDeg}`)
   assert.ok(a.requestedPronationDeg<=ARM_LIMITS.pronation+1&&a.requestedPronationDeg>=-ARM_LIMITS.supination-1,`${key} ${s} forearm ${a.requestedPronationDeg}`)
   assert.ok(Math.abs(a.residualTwistDeg)<1,`${key} ${s} wrist twist ${a.residualTwistDeg}`)
   // Wrist twist measured on the bones: hand vs forearm about the forearm axis, against the bind pose.
   const lower=rig.bones[s+'LowerArm'],hand=rig.bones[s+'Hand'],axis=P(hand).sub(P(lower)).normalize()
   const rel=lower.getWorldQuaternion(new Quaternion()).invert().multiply(hand.getWorldQuaternion(new Quaternion()))
   const bind=rig.restRotations.get(lower).clone().invert().multiply(rig.restRotations.get(hand))
   const d=rel.multiply(bind.invert()),ax=axis.clone().applyQuaternion(lower.getWorldQuaternion(new Quaternion()).invert())
   const twist=Math.abs(2*Math.atan2(d.x*ax.x+d.y*ax.y+d.z*ax.z,d.w))*180/Math.PI
   assert.ok(Math.min(twist,360-twist)<2,`${key} ${s} bone wrist twist ${twist}`)
  }
  // Release: both elbows point down, none across the body or up.
  if(key==='thrust'||key==='follow')for(const s of ['left','right'])assert.ok(r.arms[s].elbowDirection[1]<-.5,`${key} ${s} elbow ${r.arms[s].elbowDirection}`)
  restoreBones(snap);f.skeleton.update()
 }
 f.dispose()
})

test('an unreachable hand frame bends the wrist only as far as it goes, instead of wringing the arm',()=>{
 const {rig,f}=body(),info=authoringRig(rig)
 const sh=P(rig.bones.rightUpperArm),mid=sh.clone().add(P(rig.bones.leftUpperArm)).multiplyScalar(.5)
 // Right hand at the chest, palm forward, fingers straight down: no arm can show this within its ranges.
 const r=solveArm(rig,info,'right',{wrist:mid.clone().add(new Vector3(-.02,-.15,.42)),hand:handFrame(new Vector3(0,-1,0),new Vector3(0,0,1))},{elbowHint:new Vector3(-.45,-.85,-.25).normalize()})
 // The limits are soft costs: an impossible request may lean a few degrees past one, never round the far side.
 assert.ok(r.humeralRotationDeg<=ARM_LIMITS.externalRotation+5&&r.humeralRotationDeg>=-ARM_LIMITS.internalRotation-5,'shoulder '+r.humeralRotationDeg)
 assert.ok(r.wristLimitedDeg>1,'the shown hand gave way '+r.wristLimitedDeg)
 const lower=rig.bones.rightLowerArm,hand=rig.bones.rightHand
 const fore=P(hand).sub(P(lower)).normalize(),fingers=P(info.hands.right.fingers[2].bones[0]).sub(P(hand)).normalize()
 assert.ok(Math.acos(fore.dot(fingers))*180/Math.PI<ARM_LIMITS.extension+15,'wrist bend within its cone')
 f.dispose()
})

test('the rest key keeps its own plain arms (not the return trip from the release)',()=>{
 const {rig,f}=body(),info=authoringRig(rig),plan=sampleKey(clip,info,'ready').armPlan
 for(const s of ['left','right'])assert.ok(Math.abs(plan[s].pronation*180/Math.PI)<30,`${s} ready forearm ${plan[s].pronation*180/Math.PI}`)
 f.dispose()
})
