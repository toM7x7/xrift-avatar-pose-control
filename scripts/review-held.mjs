// Review a held-prop clip (prop sockets + phase curves, see src/authoring/prop.mjs) on the built-in test body at
// three sizes: the scripted timeline at 60 fps, the upper body solved over the host's idle legs every frame,
// verdicts against the clip thresholds. No private assets needed.
// Usage: node scripts/review-held.mjs [specs/pump-gun.v1.json] [--poses]
//   --poses  also print the arm numbers of a few still poses (ready, pump back, on the lid, lid lifted)
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {Scene,Group} from 'three'
import {createDetailedPoseFixture} from '../src/vendor/detailed-fixture.mjs'
import {captureBones,inspectHumanoidRigs,prepareRig,restoreBones} from '../src/vendor/render-pose.mjs'
import {evaluateHeld} from '../src/authoring/quality.mjs'
import {HELD_REST,applyHeld} from '../src/authoring/prop.mjs'
const args=process.argv.slice(2),path=args.find(a=>!a.startsWith('--'))??'specs/pump-gun.v1.json',clip=JSON.parse(readFileSync(path,'utf8'))
const out={clip:{id:clip.id,version:clip.version},bodies:{}}
const STILLS={ready:{},'pump-back':{pump:1},'on-lid':{reach:1,stance:1},'lid-up':{reach:1,stance:1,lift:1,turn:1},'look-up':{pitch:40},'look-down':{pitch:-35},high:{high:1},'high-up':{high:1,pitch:40},'high-down':{high:1,pitch:-35}}
const f1=v=>v==null?'-':v.toFixed(0)
let failed=0
for(const [label,scale] of [['small-0.75',.75],['standard',1],['tall-1.3',1.3]]){
 const scene=new Scene(),f=createDetailedPoseFixture(),root=new Group();root.scale.setScalar(scale);root.add(f.mesh);scene.add(root);f.idle(0);scene.updateMatrixWorld(true)
 const rig=prepareRig(inspectHumanoidRigs(scene)[0]),t0=performance.now()
 const e=evaluateHeld(rig,clip,{hostPose:t=>f.idle(t)})
 const ms=(performance.now()-t0)/e.frames.length
 const notes=e.verdicts.filter(v=>v.status!=='pass'&&v.status!=='n/a')
 if(notes.some(v=>v.status==='fail'))failed++
 out.bodies[label]={score:e.score,msPerFrame:ms,frames:e.frames.length,verdicts:e.verdicts,maxSpeed:e.maxSpeed,maxJump:e.maxJump}
 console.log(label.padEnd(13),'score',e.score,'frames',e.frames.length,'ms/frame',ms.toFixed(2),'fastest',e.maxSpeed.value.toFixed(0)+'°/s',e.maxSpeed.bone,'@'+e.maxSpeed.t.toFixed(2),notes.map(v=>`${v.status}:${v.metric}=${v.value?.toFixed(1)}@${v.at?.toFixed(2)}`).join(' '))
 if(args.includes('--poses')){
  out.bodies[label].stills={}
  for(const [name,params] of Object.entries(STILLS)){
   f.idle(0);scene.updateMatrixWorld(true)
   const snap=captureBones(rig.skeleton),h=applyHeld(rig,clip,{...HELD_REST,...params}),m=h.metrics
   const row=Object.fromEntries(['left','right'].map(s=>{const a=m.arms[s];return [s,a&&{reachMm:a.reachErrorMm,elbow:a.elbowFlexDeg,wristFlex:a.wristFlexDeg,wristDev:a.wristDeviationDeg,pron:a.pronationDeg,shoulder:a.humeralRotationDeg,limited:a.wristLimitedDeg,clearMm:a.elbowClearanceMm,frameErr:m.handFrameErrorDeg[s]}]}))
   out.bodies[label].stills[name]={...row,shortfallMm:h.shortfallMm,fitBackMm:h.fit.back*1000,fitYawDeg:h.fit.yaw,propScale:h.fit.scale}
   console.log('  ',name.padEnd(10),['left','right'].map(s=>{const a=row[s];return `${s[0].toUpperCase()} reach ${a.reachMm.toFixed(1)}mm elbow ${f1(a.elbow)}° wrist ${f1(a.wristFlex)}/${f1(a.wristDev)}° pron ${f1(a.pron)}° sh ${f1(a.shoulder)}° lim ${f1(a.limited)}° err ${f1(a.frameErr)}° clear ${f1(a.clearMm)}mm`}).join(' | '),'shortfall',h.shortfallMm.toFixed(1),'fit',(h.fit.back*100).toFixed(1)+'cm',h.fit.yaw+'°','×'+h.fit.scale.toFixed(2))
   restoreBones(snap);rig.skeleton.update()
  }
 }
 f.dispose()
}
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/'+clip.id+'-review.json',JSON.stringify(out,null,1))
process.exitCode=failed?1:0
