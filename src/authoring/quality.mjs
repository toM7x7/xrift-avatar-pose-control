// Quality review of an authored action: runs the whole press→hold→release
// timeline at a fixed dt on a rig (host pose restored every frame, exactly
// like the render-time driver) and reports per-frame metrics plus the worst
// values against the clip's thresholds. Numbers are a screen, not a visual pass.
import {Quaternion,Vector3} from 'three'
import {captureBones,restoreBones} from '../vendor/render-pose.mjs'
import {applyAuthoredPose} from './solve.mjs'
import {authoringRig} from './rig.mjs'
import {sampleAction,releaseDuration} from './clip.mjs'
import {DEG} from './math.mjs'

const SIDES=['left','right']
export const DEFAULT_THRESHOLDS=Object.freeze({wristExtensionDeg:75,wristFlexionDeg:75,wristDeviationDeg:30,pronationDeg:85,residualTwistDeg:10,externalRotationDeg:90,internalRotationDeg:75,wristLimitedDeg:15,handReachErrorMm:5,handFrameErrorDeg:3,skinClearanceMm:-5,kneeFlexDeg:125,ankleDorsiflexionDeg:38,ankleLateralLeanDeg:22,kneeInwardDeg:12,footSlideMm:2,comMarginMm:20,neckTwistDeg:75,jointSpeedDegPerS:1400,swivelJumpDeg:45})

/** Flatten one frame's solver result into scalar channels a reviewer can plot. */
export function frameChannels(result){
 const c={pelvisHeightM:result.pelvisHeightM,pelvisAutoDropMm:result.pelvisAutoDropMm,comMarginMm:result.comMarginMm,neckTwistDeg:result.neckTwistDeg,chestYawDeg:result.chestYawDeg,chestPitchDeg:result.chestPitchDeg,weight:result.weight}
 for(const s of SIDES){
  const a=result.arms?.[s],l=result.legs?.[s],h=result.handClearance?.[s]
  if(a){c[s+'ReachErrorMm']=a.reachErrorMm;c[s+'WristFlexDeg']=a.wristFlexDeg;c[s+'WristDeviationDeg']=a.wristDeviationDeg;c[s+'PronationDeg']=a.requestedPronationDeg;c[s+'ResidualTwistDeg']=a.residualTwistDeg;c[s+'ElbowFlexDeg']=a.elbowFlexDeg;c[s+'Swivel']=a.swivel;c[s+'WristLimitedDeg']=a.wristLimitedDeg
   if(Number.isFinite(a.humeralRotationDeg))c[s+'HumeralRotationDeg']=a.humeralRotationDeg}
  // Hand frame vs. key target only counts where the joint-space plan is not steering the hand.
  // The part the wrist's range took away is reported as WristLimitedDeg, not as a solver error.
  if(result.handFrameErrorDeg?.[s]!=null&&!(a?.planBlend>.05))c[s+'HandFrameErrorDeg']=Math.max(0,result.handFrameErrorDeg[s]-(a?.wristLimitedDeg??0))
  if(h)c[s+'SkinClearanceMm']=Math.min(...Object.values(h).map(v=>v.mm??Infinity))
  if(l){c[s+'KneeFlexDeg']=l.kneeFlexDeg;c[s+'AnkleDorsiflexionDeg']=l.ankleDorsiflexionDeg;c[s+'AnkleLateralLeanDeg']=l.ankleLateralLeanDeg;c[s+'KneeInwardDeg']=l.kneeInwardDeg}
 }
 return c
}

/**
 * Evaluate a clip on a prepared rig.
 * hostPose(t): sets the host animation for time t (idle, look-around...). Optional.
 * Returns {frames:[{t,phase,channels}], worst:{...}, verdicts:[{metric,value,limit,status,at}]}
 */
/** The ball of the foot: the toe joint, or without a toe bone the solver's estimated toe point carried by the foot. */
function ballOfFoot(rig,info,side,out){
 const toes=info.toes[side];if(toes)return toes.getWorldPosition(out)
 const foot=rig.bones[side+'Foot'],local=info.legs[side].toeLocal.clone().applyQuaternion(rig.restBasis).applyQuaternion(rig.restRotations.get(foot).clone().invert())
 foot.updateWorldMatrix(true,false);return foot.localToWorld(out.copy(local))
}
export function evaluateAction(rig,clip,{fps=60,holdFor=2.6,beamFor=1,heading=0,origin=null,hostPose=null,charge=1,options={}}={}){
 const info=authoringRig(rig),dt=1/fps,total=holdFor+releaseDuration(clip,beamFor)+.1
 const thresholds={...DEFAULT_THRESHOLDS,...(clip.quality??{})},state={}
 const frames=[],posedBones=new Set()
 let prevFeet=null,prevLocal=null,prevSwivel={},maxSlide=0,maxSpeed={value:0,bone:null,t:0},maxJump={value:0,side:null,t:0}
 for(let i=0;i*dt<=total;i++){
  const t=i*dt
  if(hostPose)hostPose(t)
  rig.mesh.updateWorldMatrix(true,true)
  const snapshot=captureBones(rig.skeleton)
  const clock=t<holdFor?{heldFor:t,releasedFor:null,charge}:{heldFor:holdFor,releasedFor:t-holdFor,charge,beamFor}
  const frame=sampleAction(clip,info,clock)
  const result=applyAuthoredPose(rig,frame,{heading,origin,state,...options})
  const channels=frameChannels(result)
  // Static balance is judged on double support only; single-support frames are reported apart.
  if(SIDES.some(s=>(result.legs?.[s]?.liftMm??0)>5)){channels.singleSupportComMarginMm=channels.comMarginMm;delete channels.comMarginMm}
  // Planted feet must not slide: measured at the ball of the foot (stable under heel lifts), skipping stepping frames.
  const feet=SIDES.map(s=>ballOfFoot(rig,info,s,new Vector3()))
  const lifted=SIDES.map(s=>(result.legs?.[s]?.liftMm??0)>.5)
  if(prevFeet&&frame.weight>=1&&frames.at(-1)?.weight>=1){
   const slides=feet.map((p,j)=>lifted[j]||prevFeet.lifted[j]?0:Math.hypot(p.x-prevFeet.p[j].x,p.z-prevFeet.p[j].z)*1000)
   channels.footSlideMm=Math.max(...slides);maxSlide=Math.max(maxSlide,channels.footSlideMm)
  }
  prevFeet={p:feet,lifted}
  // Joint angular speed (local rotations) between consecutive solved frames.
  const local=new Map(snapshot.map(s=>[s.bone,s.bone.quaternion.clone()]))
  if(prevLocal){let best=0,which=null;for(const [bone,q] of local){const p=prevLocal.get(bone);if(!p)continue;const speed=q.angleTo(p)/DEG/dt;if(speed>best){best=speed;which=bone.name}}channels.jointSpeedDegPerS=best;if(best>maxSpeed.value)maxSpeed={value:best,bone:which,t}}
  prevLocal=local
  for(const s of SIDES){const sw=channels[s+'Swivel'];if(Number.isFinite(sw)&&Number.isFinite(prevSwivel[s])){const d=Math.abs(Math.atan2(Math.sin(sw-prevSwivel[s]),Math.cos(sw-prevSwivel[s])))/DEG;channels[s+'SwivelJumpDeg']=d;if(d>maxJump.value)maxJump={value:d,side:s,t}}prevSwivel[s]=sw}
  frames.push({t,phase:frame.phase,weight:frame.weight,channels})
  restoreBones(snapshot);rig.skeleton.update()
 }
 return {frames,...summarize(frames,thresholds),maxSlide,maxSpeed,maxJump,thresholds,total}
}

/** Worst value per metric and a pass/warn/fail verdict. Only frames with full weight count for contact metrics. */
export function summarize(frames,thresholdsIn=DEFAULT_THRESHOLDS){
 const thresholds={...thresholdsIn}
 const full=frames.filter(f=>f.weight>=.999)
 const worst=(key,pick=Math.max,set=full)=>{let v=null,at=null;for(const f of set){const x=f.channels[key];if(!Number.isFinite(x))continue;if(v==null||pick(x,v)===x&&x!==v){v=x;at=f.t}}return {value:v,at}}
 const both=(stem,pick,set=full)=>{const a=worst('left'+stem,pick,set),b=worst('right'+stem,pick,set);if(a.value==null)return b;if(b.value==null)return a;return pick(a.value,b.value)===a.value?{...a,side:'left'}:{...b,side:'right'}}
 const absMax=stem=>{const a=worst('left'+stem,Math.max),b=worst('left'+stem,Math.min),c=worst('right'+stem,Math.max),d=worst('right'+stem,Math.min);return [a,b,c,d].filter(x=>x.value!=null).reduce((m,x)=>m.value==null||Math.abs(x.value)>Math.abs(m.value)?x:m,{value:null})}
 const fast=new Set(Object.keys(thresholds.fastPhases??{})),slow=frames.filter(f=>!fast.has(f.phase))
 const neck=[worst('neckTwistDeg',Math.max),worst('neckTwistDeg',Math.min)].filter(x=>x.value!=null).reduce((m,x)=>Math.abs(x.value)>Math.abs(m.value??0)?x:m,{value:null,at:null})
 const ext=both('WristFlexDeg',Math.min),flex=both('WristFlexDeg',Math.max)
 const rows=[
  ['wristExtensionDeg',ext.value==null?null:-ext.value,ext.at,'max'],
  ['wristFlexionDeg',flex.value,flex.at,'max'],
  ['wristDeviationDeg',absMax('WristDeviationDeg').value==null?null:Math.abs(absMax('WristDeviationDeg').value),absMax('WristDeviationDeg').at,'max'],
  ['pronationDeg',absMax('PronationDeg').value==null?null:Math.abs(absMax('PronationDeg').value),absMax('PronationDeg').at,'max'],
  ['residualTwistDeg',absMax('ResidualTwistDeg').value==null?null:Math.abs(absMax('ResidualTwistDeg').value),absMax('ResidualTwistDeg').at,'max'],
  ['externalRotationDeg',both('HumeralRotationDeg',Math.max).value,both('HumeralRotationDeg',Math.max).at,'max'],
  ['internalRotationDeg',both('HumeralRotationDeg',Math.min).value==null?null:-both('HumeralRotationDeg',Math.min).value,both('HumeralRotationDeg',Math.min).at,'max'],
  ['wristLimitedDeg',both('WristLimitedDeg',Math.max).value,both('WristLimitedDeg',Math.max).at,'max'],
  ['handReachErrorMm',both('ReachErrorMm',Math.max).value,both('ReachErrorMm',Math.max).at,'max'],
  ['handFrameErrorDeg',both('HandFrameErrorDeg',Math.max).value,both('HandFrameErrorDeg',Math.max).at,'max'],
  ['skinClearanceMm',both('SkinClearanceMm',Math.min).value,both('SkinClearanceMm',Math.min).at,'min'],
  ['kneeFlexDeg',both('KneeFlexDeg',Math.max).value,both('KneeFlexDeg',Math.max).at,'max'],
  ['ankleDorsiflexionDeg',both('AnkleDorsiflexionDeg',Math.max).value,both('AnkleDorsiflexionDeg',Math.max).at,'max'],
  ['ankleLateralLeanDeg',absMax('AnkleLateralLeanDeg').value==null?null:Math.abs(absMax('AnkleLateralLeanDeg').value),absMax('AnkleLateralLeanDeg').at,'max'],
  ['kneeInwardDeg',both('KneeInwardDeg',Math.max).value,both('KneeInwardDeg',Math.max).at,'max'],
  ['footSlideMm',worst('footSlideMm').value,worst('footSlideMm').at,'max'],
  ['comMarginMm',worst('comMarginMm',Math.min).value,worst('comMarginMm',Math.min).at,'min'],
  ['neckTwistDeg',neck.value==null?null:Math.abs(neck.value),neck.at,'max'],
  ['jointSpeedDegPerS',worst('jointSpeedDegPerS',Math.max,slow).value,worst('jointSpeedDegPerS',Math.max,slow).at,'max'],
  ...Object.entries(thresholds.fastPhases??{}).map(([phase,limits])=>{const set=frames.filter(f=>f.phase===phase),w=worst('jointSpeedDegPerS',Math.max,set);thresholds['jointSpeedDegPerS@'+phase]=limits.jointSpeedDegPerS;return ['jointSpeedDegPerS@'+phase,w.value,w.at,'max']}),
  // An intentional snap (fastPhases) turns the elbow fast too; it gets its own limit there.
  ['swivelJumpDeg',both('SwivelJumpDeg',Math.max,slow.filter(f=>f.weight>=.999)).value,both('SwivelJumpDeg',Math.max,slow.filter(f=>f.weight>=.999)).at,'max'],
  ...Object.entries(thresholds.fastPhases??{}).filter(([,limits])=>limits.swivelJumpDeg!=null).map(([phase,limits])=>{const set=full.filter(f=>f.phase===phase),w=both('SwivelJumpDeg',Math.max,set);thresholds['swivelJumpDeg@'+phase]=limits.swivelJumpDeg;return ['swivelJumpDeg@'+phase,w.value,w.at,'max']}),
 ]
 const verdicts=rows.map(([metric,value,at,kind])=>{
  const limit=thresholds[metric];if(value==null||limit==null)return {metric,value,limit,at,status:'n/a'}
  const ok=kind==='max'?value<=limit:value>=limit,near=kind==='max'?value<=limit*1.2:value>=limit-Math.abs(limit)*.5-5
  return {metric,value,limit,at,status:ok?'pass':near?'warn':'fail'}
 })
 return {verdicts,score:verdicts.filter(v=>v.status==='pass').length+'/'+verdicts.filter(v=>v.status!=='n/a').length}
}
