// Pose clips: named key poses + an action timeline (press → hold → release).
// Keys are authored in body metres for a 1.65 m reference figure and degrees,
// anatomical axes X=left Y=up Z=forward relative to the body heading.
// Hand pairs are resolved per key into hand targets, then interpolated in a
// cylinder around the pelvis axis so a hand travelling from the hip to the
// front arcs around the body instead of cutting through it.
import {Quaternion,Vector3} from 'three'
import {DEG,clamp,ease,eulerYXZ,finite,lerp} from './math.mjs'
import {handFrame,pairTargets,wrapCurl} from './hand.mjs'
import {REFERENCE_HIP_HEIGHT,applyAuthoredPose} from './solve.mjs'
import {captureBones,restoreBones} from '../vendor/render-pose.mjs'

const SIDES=['left','right']
export const REFERENCE_ARM=.53 // upper+fore arm of the reference figure
const BULGE=.16 // body metres of outward bulge for a half-turn sweep
const FINGERS=['thumb','index','middle','ring','little']
const arr=(a,n=3)=>Array.from({length:n},(_,i)=>finite(a?.[i]))

/** Approximate body-frame anchors of a key (without solving the rig). */
function anchorFrame(key,anchor,info){
 const unit=REFERENCE_HIP_HEIGHT/info.hipHeight
 const pelvisPos=new Vector3(...arr(key.pelvis?.offset)).add(new Vector3(0,REFERENCE_HIP_HEIGHT,0))
 const pelvisQ=eulerYXZ(...arr(key.pelvis?.rot)),torsoQ=eulerYXZ(...arr(key.torso?.rot))
 if(anchor==='pelvis')return {position:pelvisPos,quaternion:pelvisQ}
 if(anchor==='chest'){const chest=pelvisPos.clone().add(new Vector3(0,info.torsoLength*unit*.78,0).applyQuaternion(pelvisQ.clone().slerp(torsoQ,.5)));return {position:chest,quaternion:torsoQ}}
 if(anchor==='shoulders'){const p=pelvisPos.clone().add(new Vector3(0,info.limbs.left.shoulderLocal.y*unit,info.limbs.left.shoulderLocal.z*unit).applyQuaternion(pelvisQ.clone().slerp(torsoQ,.7)));return {position:p,quaternion:torsoQ}}
 return {position:new Vector3(),quaternion:new Quaternion()}
}

/** Resolve one authored key into a solver frame (hand targets in body metres). */
export function resolveKey(key,info){
 const out={pelvis:{offset:arr(key.pelvis?.offset),rot:arr(key.pelvis?.rot)},torso:{rot:arr(key.torso?.rot)},head:{mode:key.head?.mode??'host',rot:arr(key.head?.rot),neck:finite(key.head?.neck,.5)},
  clavicles:Object.fromEntries(SIDES.map(s=>[s,arr(key.clavicles?.[s],2)])),
  feet:Object.fromEntries(SIDES.map((s,i)=>{const f=key.feet?.[s]??{};return [s,{pos:arr(f.pos??[i?-.11:.11,0],2),toeOut:finite(f.toeOut,8),heel:finite(f.heel,0),pivot:finite(f.pivot,1)}]})),
  knees:{out:finite(key.knees?.out,8)},legs:{maxExtension:finite(key.legs?.maxExtension,.985),maxKnee:finite(key.legs?.maxKnee,128)},
  elbows:{weight:finite(key.elbows?.weight,.6),raise:finite(key.elbows?.raise,.25),...Object.fromEntries(SIDES.map((s,i)=>[s,key.elbows?.[s]?arr(key.elbows[s]):[i?-.45:.45,-.85,-.25]]))},
  hands:{mode:key.hands?.mode??'authored'},fingers:{}}
 const unit=REFERENCE_HIP_HEIGHT/info.hipHeight
 let wrap=null
 if(key.hands?.pair){
  const p=key.hands.pair,a=anchorFrame(key,p.anchor??'body',info)
  const q=a.quaternion.clone().multiply(eulerYXZ(...arr(p.axes)))
  const F=new Vector3(0,0,1).applyQuaternion(q),U=new Vector3(0,1,0).applyQuaternion(q),L=new Vector3(1,0,0).applyQuaternion(q)
  const toAnat=v=>F.clone().multiplyScalar(v.x).addScaledVector(U,v.y).addScaledVector(L,v.z)
  // unit 'arm': offsets scale with the avatar's arm length (reference arm 0.53 m), so short arms still meet.
  const armScale=p.unit==='arm'?info.armLength*unit/REFERENCE_ARM:1
  const center=a.position.clone().add(new Vector3(...arr(p.center)).multiplyScalar(armScale).applyQuaternion(a.quaternion))
  out.hands.pair=true
  const targets=pairTargets(p,info.hands,unit)
  for(const s of SIDES){const t=targets[s];out.hands[s]={position:center.clone().add(toAnat(t.position)).toArray(),point:t.point,q:handFrame(toAnat(t.fingers),toAnat(t.palm)).toArray()};if(t.wrapRadius)wrap=t.wrapRadius}
 }
 for(const s of SIDES){
  const h=key.hands?.[s]
  if(h?.position&&h?.fingers&&h?.palm)out.hands[s]={position:arr(h.position),point:h.point??'palmCenter',q:handFrame(new Vector3(...arr(h.fingers)),new Vector3(...arr(h.palm))).toArray()}
  const spec=key.fingers?.[s]??key.fingers?.both??{}
  const fingers={}
  for(const name of FINGERS){
   const f={...(spec.all??{}),...(spec[name]??{})}
   let curl=finite(f.curl,0)
   if(spec.wrap&&wrap){const finger=info.hands[s].fingers.find(x=>x.name===name);if(finger)curl=wrapCurl(finger.length*unit,wrap)*finite(spec.wrap===true?1:spec.wrap,1)+finite(f.curl,0)}
   fingers[name]={curl,spread:finite(f.spread,0)}
  }
  out.fingers[s]=fingers
 }
 return out
}

// --- interpolation -------------------------------------------------------
function lerpArray(a,b,t){return a.map((v,i)=>lerp(v,b[i],t))}
function lerpTree(a,b,t){
 if(Array.isArray(a)&&Array.isArray(b))return lerpArray(a,b,t)
 if(typeof a==='number'&&typeof b==='number')return lerp(a,b,t)
 if(a&&b&&typeof a==='object'&&typeof b==='object'){const o={};for(const k of new Set([...Object.keys(a),...Object.keys(b)]))o[k]=k in a&&k in b?lerpTree(a[k],b[k],t):t<.5?(a[k]??b[k]):(b[k]??a[k]);return o}
 return t<.5?a:b
}
/** Hand target travelling around the pelvis axis (cylindrical lerp) + slerped hand frame. */
function lerpHand(a,b,t,axisA,axisB){
 if(!a||!b)return t<.5?a:b
 const axis=new Vector3().lerpVectors(axisA,axisB,t)
 const pa=new Vector3(...a.position).sub(axisA),pb=new Vector3(...b.position).sub(axisB)
 const ra=Math.hypot(pa.x,pa.z),rb=Math.hypot(pb.x,pb.z),aa=Math.atan2(pa.x,pa.z),ab=Math.atan2(pb.x,pb.z)
 let d=ab-aa;d=Math.atan2(Math.sin(d),Math.cos(d))
 // Sweeping across the body, bulge outward in proportion to the swept angle so forearms clear the torso.
 const bulge=Math.sin(Math.PI*t)*BULGE*Math.min(1,Math.abs(d)/Math.PI)
 const r=lerp(ra,rb,t)+bulge,ang=aa+d*t,y=lerp(pa.y,pb.y,t)
 const pos=new Vector3(Math.sin(ang)*r,y,Math.cos(ang)*r).add(axis)
 const q=new Quaternion().fromArray(a.q).slerp(new Quaternion().fromArray(b.q),t)
 const out={position:pos.toArray(),point:t<.5?a.point:b.point,q:q.toArray()}
 const mixA=a.pointMix??{[a.point]:1},mixB=b.pointMix??{[b.point]:1}
 if(Object.keys(mixA).length>1||Object.keys(mixB).length>1||a.point!==b.point){
  const mix={};for(const [k,w] of Object.entries(mixA))mix[k]=(mix[k]??0)+w*(1-t);for(const [k,w] of Object.entries(mixB))mix[k]=(mix[k]??0)+w*t
  out.pointMix=mix
 }
 return out
}
export function lerpFrame(a,b,t){
 const out=lerpTree({...a,hands:undefined},{...b,hands:undefined},t)
 const axisA=new Vector3(a.pelvis.offset[0],0,a.pelvis.offset[2]),axisB=new Vector3(b.pelvis.offset[0],0,b.pelvis.offset[2])
 out.hands={mode:t<.5?a.hands.mode:b.hands.mode,pair:!!(a.hands.pair||b.hands.pair)}
 // A foot that changes place is stepped (lifted on an arc), never slid; when both feet
 // move, the one travelling farther steps first and the other follows (never both airborne).
 const moves=SIDES.map(s=>{const fa=a.feet?.[s],fb=b.feet?.[s];return fa&&fb?Math.hypot(fb.pos[0]-fa.pos[0],fb.pos[1]-fa.pos[1]):0})
 const order=moves[0]>=moves[1]?[0,1]:[1,0],both=moves[0]>.02&&moves[1]>.02
 SIDES.forEach((s,i)=>{
  const fa=a.feet?.[s],fb=b.feet?.[s];if(!fa||!fb)return
  if(moves[i]<=.02){out.feet[s].lift=0;return}
  const [w0,w1]=!both?[0,1]:order[0]===i?[0,.5]:[.5,1],u=clamp((t-w0)/(w1-w0),0,1),sm=u*u*(3-2*u)
  out.feet[s].pos=[lerp(fa.pos[0],fb.pos[0],sm),lerp(fa.pos[1],fb.pos[1],sm)];out.feet[s].toeOut=lerp(fa.toeOut,fb.toeOut,sm)
  out.feet[s].lift=Math.sin(Math.PI*u)*Math.min(.07,.45*moves[i])
  // Weight shift: before the swing foot leaves the ground the pelvis travels over the stance foot.
  const other=SIDES[1-i],stance=out.feet[other]?.pos
  if(stance){const w=.55*Math.sin(Math.PI*clamp(u*1.15,0,1));out.pelvis.offset[0]=lerp(out.pelvis.offset[0],stance[0],w);out.pelvis.offset[2]=lerp(out.pelvis.offset[2],stance[1],w*.6)}
 })
 for(const s of SIDES){
  // Different contact points (e.g. palm heel → palm centre) blend their offsets (pointMix), so the wrist never jumps.
  out.hands[s]=lerpHand(a.hands[s],b.hands[s],t,axisA,axisB)
 }
 out.head.mode=t<.5?a.head.mode:b.head.mode
 // Joint-space plan: forearm roll and elbow swivel move smoothly from key to key.
 if(a.armPlan&&b.armPlan){out.armPlan={};for(const s of SIDES){const pa=a.armPlan[s],pb=b.armPlan[s];if(!pa||!pb)continue;let d=pb.swivel-pa.swivel;d=Math.atan2(Math.sin(d),Math.cos(d));out.armPlan[s]={pronation:lerp(pa.pronation,pb.pronation,t),swivel:pa.swivel+d*t,flex:lerp(pa.flex,pb.flex,t),dev:lerp(pa.dev,pb.dev,t),blend:Math.sin(Math.PI*clamp(t,0,1))}}}
 else out.armPlan=undefined
 return out
}

// --- action timeline -----------------------------------------------------
/**
 * clock: {heldFor: seconds since the press, releasedFor: seconds since the release
 * (null while holding), charge: 0..1 at release (or now), beamFor: seconds the beam lasts}
 * Returns a solver frame with `weight` and the active `phase`.
 */
export function sampleAction(clip,info,clock){
 const keys=resolvedKeys(clip,info),A=clip.action
 const held=Math.max(0,finite(clock.heldFor,0)),released=clock.releasedFor==null?null:Math.max(0,finite(clock.releasedFor,0))
 const enter=A.enter,hold=A.hold
 // enter may pass through via keys: {from, to, duration, via:[{to, at}]} where `at` (0..1) is when each via key is reached.
 const enterAt=u=>{
  const stops=[{to:enter.from,at:0},...(enter.via??[]),{to:enter.to,at:1}]
  let i=0;while(i<stops.length-2&&u>stops[i+1].at)i++
  const a=stops[i],b=stops[i+1],v=clamp((u-a.at)/Math.max(1e-6,b.at-a.at),0,1)
  return lerpFrame(keys[a.to],keys[b.to],ease(b.ease??enter.ease,v))
 }
 // Pose at the moment of release (or now, while holding).
 const holdPose=t=>{
  if(t<enter.duration){const u=t/enter.duration;return {frame:enterAt(u),phase:'gather',weight:ease('inOutSine',t/Math.max(1e-3,enter.weightIn??.12))}}
  const u=clamp((t-enter.duration)/hold.duration,0,1)
  let frame=lerpFrame(keys[hold.from],keys[hold.to],ease(hold.ease,u))
  const br=hold.breath
  if(br){const s=Math.sin((t-enter.duration)/br.period*2*Math.PI)*br.amplitude*(.4+.6*u);frame=lerpFrame(frame,keys[hold.to],0);frame.pelvis.offset[1]+=s*.01;frame.torso.rot[1]+=s*1.5}
  return {frame,phase:u>=1?'charged':'charge',weight:1}
 }
 if(released==null){const h=holdPose(held);return {...h.frame,weight:h.weight,phase:h.phase}}
 const start=holdPose(held)
 let t=released,from=start.frame,weight=start.weight
 const charge=clamp(finite(clock.charge,1),0,1)
 for(const step of A.release){
  if(step.hold==='beam'){
   const dur=Math.max(0,finite(clock.beamFor,step.fallback??.8))
   if(t<dur){
    // Recoil: the beam pushes back on the body, strongest at its start.
    // It builds over ~25 ms instead of kicking the pelvis in a single frame.
    const r=step.recoil?(1-Math.exp(-t/.025))*Math.exp(-t*step.recoil.decay)*charge:0,f=lerpFrame(from,from,0)
    if(r){f.pelvis.offset[2]-=step.recoil.pelvis*r;f.torso.rot[1]-=step.recoil.pitch*r;f.pelvis.offset[1]-=step.recoil.crouch*r}
    const wobble=step.tremor?Math.sin(t*step.tremor.frequency*2*Math.PI)*step.tremor.amplitude*charge:0
    if(wobble){for(const s of SIDES)if(f.hands[s])f.hands[s].position[1]+=wobble}
    return {...f,weight:1,phase:'beam'}
   }
   t-=dur;continue
  }
  const target=keys[step.to],dur=step.duration
  if(t<dur){
   const u=ease(step.ease,t/dur)
   const f=lerpFrame(from,target,u)
   // weightOut: true fades over the whole step; a number fades only after that fraction of it, once the
   // recovering pose is close to the host's (a long blend between far-apart rotations is ambiguous).
   const fadeFrom=typeof step.weightOut==='number'?clamp(step.weightOut,0,.95):null
   const w=step.weightOut==null?lerp(weight,1,clamp(t/dur*4,0,1)):fadeFrom==null?lerp(1,0,clamp(t/dur,0,1)**1.2):1-ease('inOutSine',clamp((t/dur-fadeFrom)/(1-fadeFrom),0,1))
   return {...f,weight:step.weightOut!=null?w:Math.max(w,weight),phase:step.phase??step.to}
  }
  t-=dur;from=target;weight=step.weightOut!=null?0:1
 }
 return {...keys[A.release.at(-1).to],weight:0,phase:'idle'}
}
const resolvedCache=new WeakMap()
export function resolvedKeys(clip,info){
 let byInfo=resolvedCache.get(clip);if(!byInfo){byInfo=new WeakMap();resolvedCache.set(clip,byInfo)}
 let keys=byInfo.get(info)
 if(!keys){keys=Object.fromEntries(Object.entries(clip.keys).map(([name,key])=>[name,resolveKey(key,info)]));if(info.rig)planArms(info,keys,visitOrder(clip));byInfo.set(info,keys)}
 return keys
}
/** Total duration of the release tail for a given beam duration. */
export function releaseDuration(clip,beamFor){return clip.action.release.reduce((s,step)=>s+(step.hold==='beam'?beamFor:step.duration),0)}
/** Static sample of one key (for editors/thumbnails). */
export function sampleKey(clip,info,name){return {...resolvedKeys(clip,info)[name],weight:1,phase:name}}

/**
 * Solve every key once on this rig and remember each arm's forearm roll and elbow swivel. Keys are solved in the
 * order the action visits them, each seeded with the previous key's arms, so a nearly straight arm (where swivel
 * and roll trade off freely) takes the solution next to its neighbour instead of an arbitrary one. A key visited
 * twice (the rest key at both ends) keeps its last, return-trip solution.
 */
function planArms(info,keys,order=Object.keys(keys)){
 const rig=info.rig,snap=captureBones(rig.skeleton)
 let previous=null
 try{
  for(const name of order){
   const frame=keys[name];if(!frame||(!frame.hands?.left&&!frame.hands?.right))continue
   const state={arms:previous??undefined}
   const r=applyAuthoredPose(rig,{...frame,armPlan:undefined,weight:1},{heading:0,headMode:'body',state})
   frame.armPlan={}
   for(const s of SIDES){const a=r.arms?.[s];if(a)frame.armPlan[s]={pronation:a.requestedPronationDeg*Math.PI/180,swivel:a.swivel,flex:a.wristFlexDeg*Math.PI/180,dev:a.wristDeviationDeg*Math.PI/180,blend:0}}
   previous=state.arms
   restoreBones(snap);rig.skeleton.update()
  }
 }finally{restoreBones(snap);rig.skeleton.update()}
}
/** The keys in the order an action visits them (enter, hold, release), then any others. */
function visitOrder(clip){
 const A=clip.action??{},seq=[A.enter?.from,...(A.enter?.via??[]).map(v=>v.to),A.enter?.to,A.hold?.from,A.hold?.to,...(A.release??[]).map(s=>s.to)].filter(Boolean)
 return [...seq,...Object.keys(clip.keys).filter(k=>!seq.includes(k))]
}
