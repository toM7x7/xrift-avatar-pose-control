// Avatar compatibility review for an authored action: the built-in test body rebuilt the way other exporters
// make avatars (bone-name dialects, missing parts, twist bones, -Z bind, rolled bone axes), each found the way an
// XRift item finds it (selectActorRig: names first, then names + skeleton shape near the feet), then the whole
// press→hold→release timeline is evaluated. Naming-only variants must pose exactly like the reference body.
// A held-prop clip (clip.prop, see src/authoring/prop.mjs) is staged with its still poses and its scripted timeline.
// Usage: node scripts/review-compat.mjs [specs/charge-wave.v1.json | specs/pump-gun.v1.json] [--json artifacts/<id>-compat.json]
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {Scene,Group,Vector3} from 'three'
import {createDetailedPoseFixture} from '../src/vendor/detailed-fixture.mjs'
import {prepareRig} from '../src/vendor/render-pose.mjs'
import {selectActorRig} from '../src/adapters/xrift.mjs'
import {authoringRig} from '../src/authoring/rig.mjs'
import {applyAuthoredPose} from '../src/authoring/solve.mjs'
import {sampleAction} from '../src/authoring/clip.mjs'
import {evaluateAction,evaluateHeld} from '../src/authoring/quality.mjs'
import {HELD_REST,applyHeld} from '../src/authoring/prop.mjs'

export const COMPAT_VARIANTS=[
 // [id, fixture options, same skeleton as the reference (pose must match exactly)]
 ['vrm',{},true],['vroid',{naming:'vroid'},true],['blender',{naming:'blender'},true],['rigify',{naming:'rigify'},true],['mixamo',{naming:'mixamo'},true],
 ['unreal',{naming:'unreal'},true],['cats',{naming:'cats'},true],['mmd',{naming:'mmd'},true],['nameless',{naming:'nameless'},true],
 ['twist-chain',{twist:'chain'},true],['twist-side',{twist:'side'},true],['rigify-twist',{naming:'rigify',twist:'chain'},true],
 ['facing-z',{facing:-1},true],['rolled-axes',{roll:2.5},true],['mmd-rolled-facing-z',{naming:'mmd',roll:2.5,facing:-1},true],
 ['no-fingers',{fingers:false},false],['no-neck',{neck:false},false],['no-upper-chest',{upperChest:false},false],['no-clavicles',{clavicles:false},false],['no-toes',{toes:false},false],
 ['bare-nameless-rolled',{naming:'nameless',fingers:false,neck:false,upperChest:false,clavicles:false,toes:false,roll:2},false],
]
const ROLES=['hips','head','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot']
const SAMPLES=[[.3,null],[.65,null],[1.6,null],[3,null],[3,.1],[3,.6],[3,1.4]]
const HELD_SAMPLES=[{},{pump:1},{pump:.5,recoil:1,trigger:1},{reach:.5,stance:.5},{reach:1,stance:1},{reach:1,stance:1,lift:1,turn:1},{pitch:40},{pitch:-35}]

/** Stage one variant at a feet point, select it like an item does, and sample a few clock points. */
export function stageVariant(clip,options,{feet=new Vector3(.4,0,-.7),scale=1}={}){
 const scene=new Scene(),f=createDetailedPoseFixture(options),root=new Group()
 root.position.copy(feet);root.scale.setScalar(scale);if(options.facing<0)root.rotation.y=Math.PI
 root.add(f.mesh);scene.add(root);f.idle(0);scene.updateMatrixWorld(true)
 const selection=selectActorRig({scene,userId:'me',isLocal:true,feet})
 if(selection.status!=='ready')return {f,scene,selection}
 const rolesCorrect=ROLES.every(role=>selection.rig.bones[role]===f.bones[role]),rig=prepareRig(selection.rig),info=authoringRig(rig),state={}
 const pose=clip.prop
  // A held prop is posed over the host's own legs, so it faces the way the host stands (+Z here), not a heading of its own.
  ?params=>applyHeld(rig,clip,{...HELD_REST,...params},{heading:0,origin:feet,groundY:feet.y,state}).metrics
  :([heldFor,releasedFor])=>applyAuthoredPose(rig,sampleAction(clip,info,{heldFor,releasedFor,charge:1,beamFor:1.2}),{heading:Math.PI,origin:feet,groundY:feet.y,headMode:'host',state})
 const samples=(clip.prop?HELD_SAMPLES:SAMPLES).map(sample=>{
  f.idle(0);scene.updateMatrixWorld(true)
  const metrics=pose(sample)
  return {joints:Object.fromEntries(ROLES.map(role=>[role,f.bones[role].getWorldPosition(new Vector3())])),metrics}
 })
 return {f,scene,selection,rolesCorrect,rig,info,samples}
}
export function deviationMm(a,b){let d=0;a.samples.forEach((s,i)=>{for(const role of ROLES)d=Math.max(d,s.joints[role].distanceTo(b.samples[i].joints[role]))});return d*1000}

if(import.meta.url===`file:///${process.argv[1].replace(/\\/g,'/').replace(/^\//,'')}`){
 const args=process.argv.slice(2),jsonAt=args.indexOf('--json'),path=args.find((a,i)=>!a.startsWith('--')&&(jsonAt<0||i!==jsonAt+1))??'specs/charge-wave.v1.json'
 const clip=JSON.parse(readFileSync(path,'utf8')),reference=stageVariant(clip,{}),rows=[]
 let failed=0
 for(const [id,options,same] of COMPAT_VARIANTS){
  const v=stageVariant(clip,options)
  if(v.selection.status!=='ready'){failed++;rows.push({id,status:v.selection.status,diagnosis:v.selection.diagnosis});console.log(id.padEnd(22),'NOT POSED',v.selection.status,v.selection.diagnosis?.reason??'');v.f.dispose();continue}
  const e=clip.prop?evaluateHeld(v.rig,clip,{hostPose:t=>v.f.idle(t),heading:0,origin:new Vector3(.4,0,-.7)}):evaluateAction(v.rig,clip,{hostPose:t=>v.f.idle(t),holdFor:2.6,beamFor:1,charge:.91})
  const dev=deviationMm(v,reference),reach=Math.max(...v.samples.flatMap(s=>Object.values(s.metrics.arms).map(a=>a?.reachErrorMm??0)))
  const ok=v.rolesCorrect&&reach<1&&(!same||dev<.01)
  if(!ok)failed++
  const notes=e.verdicts.filter(x=>x.status!=='pass'&&x.status!=='n/a').map(x=>`${x.status}:${x.metric}=${x.value?.toFixed(1)}`).join(' ')
  rows.push({id,status:'ready',method:v.selection.roles.method,rolesCorrect:v.rolesCorrect,fingers:v.info.hands.left.fingers.length,torso:v.info.torso.length,clavicles:!!v.info.shoulders.left,toes:!!v.info.toes.left,deviationMm:dev,reachErrorMm:reach,score:e.score,verdicts:e.verdicts})
  console.log(id.padEnd(22),(ok?'ok  ':'FAIL'),v.selection.roles.method.padEnd(16),'fingers',String(v.info.hands.left.fingers.length),'torso',String(v.info.torso.length),'vs reference',(same?dev.toFixed(3):dev.toFixed(1)).padStart(6)+'mm','reach',reach.toFixed(1)+'mm','score',e.score,notes)
  v.f.dispose()
 }
 reference.f.dispose()
 if(jsonAt>=0){const to=args[jsonAt+1]??`artifacts/${clip.id}-compat.json`;mkdirSync('artifacts',{recursive:true});writeFileSync(to,JSON.stringify({clip:{id:clip.id,version:clip.version},rows},null,1));console.log('→',to)}
 console.log(failed?`${failed} variant(s) not posed correctly`:`all ${COMPAT_VARIANTS.length} variants posed`);process.exitCode=failed?1:0
}
