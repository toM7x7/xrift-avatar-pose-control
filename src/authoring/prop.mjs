// A prop held in the hands (a tool, a toy blaster): the prop is placed in the body frame and the hands go to
// sockets on it, so both hands stay on the prop on every avatar, whatever its proportions. The prop keeps its
// real size (world metres) while the hold position scales with the avatar; a small avatar reaches further along
// the same prop, a large one holds it closer to the chest. A clip may let the prop shrink in very small hands
// (prop.fit.scaleBelow): a toy as long as its holder is tall cannot be held with both hands at all.
//
// Unlike a press→hold→release action (clip.mjs) a held prop has no fixed timeline: the caller drives a handful of
// parameters (how far the pump has travelled, how far the support hand has gone to the lid, the look pitch...) from
// its own state machine, and the choreography of each phase lives in the clip as curves (clip.phases), so the item
// and the review play exactly the same motion.
//
// Coordinates. Body: anatomical X=left Y=up Z=forward, body metres (1.65 m reference figure) as in clip.mjs.
// Prop: its own X=left Y=up Z=forward (the working end), in real metres, origin wherever the model has it.
import {Matrix4,Quaternion,Vector3} from 'three'
import {DEG,clamp,eulerYXZ,finite,lerp} from './math.mjs'
import {handFrame} from './hand.mjs'
import {REFERENCE_HIP_HEIGHT,applyAuthoredPose,bodyScale} from './solve.mjs'
import {REFERENCE_ARM,lerpFrame,resolveKey} from './clip.mjs'
import {authoringRig} from './rig.mjs'
import {captureBones,restoreBones} from '../vendor/render-pose.mjs'
import {worldPositionOf} from '../world.mjs'

const SIDES=['left','right']
const FINGERS=['thumb','index','middle','ring','little']
const v3=(a,fallback=[0,0,0])=>new Vector3(finite(a?.[0],fallback[0]),finite(a?.[1],fallback[1]),finite(a?.[2],fallback[2]))
/** Piecewise-linear curve [[u, value], ...] sampled at u (clamped at both ends). A plain number is a constant. */
export function curve(points,u,fallback=0){
 if(typeof points==='number')return points
 if(!Array.isArray(points)||!points.length)return fallback
 if(u<=points[0][0])return points[0][1]
 for(let i=1;i<points.length;i++){const [u1,v1]=points[i];if(u<=u1){const [u0,v0]=points[i-1];return u1>u0?lerp(v0,v1,(u-u0)/(u1-u0)):v1}}
 return points.at(-1)[1]
}

/** The neutral parameter set of a held prop (everything at rest, full weight). */
export const HELD_REST=Object.freeze({weight:1,stance:0,high:0,pump:0,reach:0,lift:0,turn:0,trigger:0,recoil:0,pitch:0})

/**
 * Parameters of the hold at normalised time u (0..1) of a phase, from the clip's curves:
 * clip.phases[phase] = {weight, stance, pump, reach, lift, turn, trigger, recoil: curve | number,
 *   cycle: {rate (Hz, informative), pump: curve over one cycle, follow: share of the travel the hand follows}}.
 * extra: {cycle: 0..1 position inside a repeating cycle (auto fire), pitch: look pitch in degrees (+ up), recoil,
 *   high: 0..1 how far the hold is raised toward clip.keys.high (the holder looking through their own eyes)}.
 * Anything a phase does not mention keeps the rest value.
 */
export function heldParams(clip,phase,u=0,extra={}){
 const spec=clip.phases?.[phase]??{},out={...HELD_REST}
 for(const name of ['weight','stance','pump','reach','lift','turn','trigger','recoil'])if(spec[name]!=null)out[name]=curve(spec[name],clamp(u,0,1),HELD_REST[name])
 if(spec.cycle&&extra.cycle!=null){
  const c=((extra.cycle%1)+1)%1
  if(spec.cycle.pump!=null)out.pump=curve(spec.cycle.pump,c)*finite(spec.cycle.follow,1)
  if(spec.cycle.recoil!=null)out.recoil=curve(spec.cycle.recoil,c)
 }
 if(extra.recoil!=null)out.recoil=Math.max(out.recoil,finite(extra.recoil))
 out.pitch=finite(extra.pitch,0)
 out.high=clamp(finite(extra.high,0),0,1)
 if(extra.weight!=null)out.weight*=clamp(finite(extra.weight,1),0,1)
 out.phase=phase
 return out
}

function holdOf(key,info,unit){
 const h=key.hold??{},side=h.hand==='left'?'left':'right',sh=info.limbs[side].shoulderLocal
 const arm=h.unit==='arm'?info.armLength*unit/REFERENCE_ARM:1
 return {side,socket:h.socket??'grip',support:h.support??null,
  shoulder:new Vector3(sh.x*unit,REFERENCE_HIP_HEIGHT+sh.y*unit,sh.z*unit),offset:v3(h.position).multiplyScalar(arm),aim:[0,1,2].map(i=>finite(h.aim?.[i])),follow:finite(h.pitchFollow,1),swing:finite(h.pitchSwing,finite(h.pitchFollow,1)),lookDown:v3(h.lookDown).multiplyScalar(arm),lookUp:v3(h.lookUp).multiplyScalar(arm)}
}

const mixHold=(a,b,t)=>({...(t<.5?a:b),shoulder:a.shoulder.clone().lerp(b.shoulder,t),offset:a.offset.clone().lerp(b.offset,t),aim:a.aim.map((v,i)=>lerp(v,b.aim[i],t)),
 follow:lerp(a.follow,b.follow,t),swing:lerp(a.swing,b.swing,t),lookDown:a.lookDown.clone().lerp(b.lookDown,t),lookUp:a.lookUp.clone().lerp(b.lookUp,t)})
/** How much of the raised hold is in: none of it while the second stance (the reload) has the prop. */
const highShare=(clip,params)=>clip.keys[clip.highKey??'high']?clamp(finite(params.high),0,1)*(1-clamp(finite(params.stance),0,1)):0

/**
 * Place the prop for a blend of the two stance keys (params.stance) and, on top, of the raised hold
 * (params.high toward clip.keys.high: the same grip brought up into the holder's own view).
 * Returns {position (prop origin, body metres), quaternion (prop axes in the body frame), side, socket, support}.
 * The holding hand's socket sits at shoulder + offset; a look pitch swings the offset and the prop about the shoulder.
 */
export function placeProp(clip,info,k,params,fit=null){
 const unit=REFERENCE_HIP_HEIGHT/info.hipHeight,stance=clamp(finite(params.stance),0,1),high=highShare(clip,params)
 const names=clip.stances??['ready','reload']
 let a=mixHold(holdOf(clip.keys[names[0]],info,unit),holdOf(clip.keys[names[1]??names[0]],info,unit),stance)
 if(high>0)a=mixHold(a,holdOf(clip.keys[clip.highKey??'high'],info,unit),high)
 const b=a,aim=a.aim,offset=a.offset.clone()
 // Look pitch (+ up) is a negative pitch in the body convention (positive bends forward).
 const look=clamp(finite(params.pitch),-60,60)*a.follow
 // The prop turns by the whole look; the hand holding it swings about the shoulder by a share of it (pitchSwing),
 // so looking down tips the working end down without pressing the hand into the hips.
 const turn=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-look*DEG)
 const swing=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-clamp(finite(params.pitch),-60,60)*a.swing*DEG)
 const quaternion=turn.clone().multiply(eulerYXZ(aim[0],aim[1],aim[2]))
 const recoil=clamp(finite(params.recoil),0,1),kick=clip.prop?.recoil??{}
 if(recoil)quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-finite(kick.pitch,1.2)*recoil*DEG))
 // fit.back: this body holds the prop that much closer to the chest so the support hand reaches (holdFit).
 offset.z-=finite(fit?.back)
 // lookDown / lookUp: extra offset of the hold at a 35° look, so a hand swinging down does not end in the belly.
 const tilt=clamp(finite(params.pitch),-60,60)/35,extra=tilt<0?a.lookDown.clone().multiplyScalar(-tilt):a.lookUp.clone().multiplyScalar(tilt)
 const hold=a.shoulder.clone().add(offset.applyQuaternion(swing)).add(extra)
 if(recoil)hold.addScaledVector(new Vector3(0,0,1).applyQuaternion(quaternion),-finite(kick.back,.012)*recoil)
 // A prop shrunk for a small body (fit.scale) has all its sockets that much closer to its origin.
 const socket=clip.prop.sockets[a.socket],ks=k/finite(fit?.scale,1)
 const position=hold.sub(v3(socket.position).applyQuaternion(quaternion).divideScalar(ks))
 return {position,quaternion,side:b.side,socket:b.socket,support:b.support}
}

/**
 * Hand target (a PoseFrame hands.<side> entry) on a socket of a placed prop; travel 0..1 along the socket's travel,
 * turn 0..1 of its turn. look (deg, + up): a socket with `slip` lets the hand roll on it by that share of the look,
 * against the prop's own tip, the way a hand shifts on a grip when the working end is pointed down or up.
 */
export function socketTarget(placed,socket,k,travel=0,turn=0,look=0){
 const at=v3(socket.position)
 if(socket.travel)at.addScaledVector(v3(socket.travel),travel)
 const spin=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),finite(socket.turn)*turn*DEG)
 if(socket.slip&&look)spin.premultiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),finite(socket.slip)*look*DEG))
 const fingers=v3(socket.fingers,[0,0,1]).applyQuaternion(spin).applyQuaternion(placed.quaternion),palm=v3(socket.palm,[0,-1,0]).applyQuaternion(spin).applyQuaternion(placed.quaternion)
 return {position:placed.position.clone().add(at.applyQuaternion(placed.quaternion).divideScalar(k)).toArray(),point:socket.point??'palmCenter',q:handFrame(fingers,palm).toArray()}
}

const fingerSet=(spec={})=>Object.fromEntries(FINGERS.map(name=>{const f={...(spec.all??{}),...(spec[name]??{})};return [name,{curl:finite(f.curl),spread:finite(f.spread)}]}))
const mixFingers=(a,b,t)=>Object.fromEntries(FINGERS.map(n=>[n,{curl:lerp(a[n].curl,b[n].curl,t),spread:lerp(a[n].spread,b[n].spread,t)}]))

/**
 * The pose frame of a held prop for one parameter set (see heldParams).
 * k: world metres per body metre for this rig (bodyScale(rig).k). The frame carries `prop` (the placed prop in the
 * body frame) so the caller can put the visible prop where the hands are (propWorld).
 */
export function sampleHeld(clip,info,k,params=HELD_REST,fit=null){
 const names=clip.stances??['ready','reload'],stance=clamp(finite(params.stance),0,1)
 const ka=resolveKey(clip.keys[names[0]],info),kb=resolveKey(clip.keys[names[1]??names[0]],info),high=highShare(clip,params)
 let frame=lerpFrame(ka,kb,stance)
 if(high>0)frame=lerpFrame(frame,resolveKey(clip.keys[clip.highKey??'high'],info),high)
 const placed=placeProp(clip,info,k,params,fit),S=clip.prop.sockets,main=placed.side,other=main==='left'?'right':'left'
 const kWorld=k
 k=k/finite(fit?.scale,1) // socket offsets of a shrunk prop, in body metres
 // A look pitch leans the chest with the prop (a share of it), so the shoulders stay behind the stock.
 const lean=finite(clip.prop?.torsoPitchShare,.35)*clamp(finite(params.pitch),-60,60)
 // fit.yaw: a small body turns its chest further (support shoulder forward) before it pulls the prop in.
 frame.torso.rot=[frame.torso.rot[0]+finite(fit?.yaw)*(main==='right'?-1:1),frame.torso.rot[1]-lean,frame.torso.rot[2]]
 frame.hands={mode:'authored',pair:false}
 frame.hands[main]=socketTarget(placed,S[placed.socket],k,0,0,clamp(finite(params.pitch),-60,60))
 // Support hand: on its socket (travelling with the pump), or on its way to / on the second socket (the lid).
 const sup=clip.prop.support??{},from=S[sup.rest??'pump'],to=S[sup.reach??'lid'],reach=clamp(finite(params.reach),0,1)
 const onRest=socketTarget(placed,from,k,clamp(finite(params.pump),0,1)),onReach=to?socketTarget(placed,to,k,clamp(finite(params.lift),0,1),clamp(finite(params.turn),0,1)):onRest
 if(reach<=0)frame.hands[other]=onRest
 else if(reach>=1)frame.hands[other]=onReach
 else{
  // Travel between the two sockets on an arc that lifts the hand off the prop (outward and up), never through it.
  const e=reach*reach*(3-2*reach),p=new Vector3(...onRest.position).lerp(new Vector3(...onReach.position),e)
  const out=v3(sup.arc,[other==='left'?.05:-.05,.035,0]).applyQuaternion(placed.quaternion)
  p.addScaledVector(out,Math.sin(Math.PI*reach))
  frame.hands[other]={position:p.toArray(),point:e<.5?onRest.point:onReach.point,q:new Quaternion().fromArray(onRest.q).slerp(new Quaternion().fromArray(onReach.q),e).toArray()}
  if(onRest.point!==onReach.point)frame.hands[other].pointMix={[onRest.point]:1-e,[onReach.point]:e}
 }
 // Fingers: the holding hand wraps the grip and squeezes the trigger finger; the support hand wraps its socket.
 const g=clip.prop.fingers??{},trigger=clamp(finite(params.trigger),0,1)
 frame.fingers[main]=mixFingers(fingerSet(g.grip),fingerSet({...g.grip,...g.trigger}),trigger)
 frame.fingers[other]=mixFingers(fingerSet(g[sup.rest??'pump']),fingerSet(g[sup.reach??'lid']),reach)
 frame.armPlan=undefined
 frame.lowerBody='host'
 frame.weight=clamp(finite(params.weight,1),0,1)
 frame.phase=params.phase??'held'
 frame.prop=placed
 frame.propScale=finite(fit?.scale,1)
 frame.bodyUnit=kWorld
 return frame
}

/**
 * World pose of the prop's own axes for a solved frame: origin + heading × (body × k).
 * modelForward: 'z' = the model's working end points along its +Z like the prop frame; '-z' (three.js / glTF
 * convention: looking down -Z, +X to the model's right) turns it half round about Y.
 */
export function propWorld(placed,{heading=0,origin=[0,0,0],k=1,modelForward='-z'}={},out={position:new Vector3(),quaternion:new Quaternion()}){
 const h=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),finite(heading)),o=origin?.isVector3?origin:v3(origin)
 out.position.copy(placed.position).multiplyScalar(k).applyQuaternion(h).add(o)
 out.quaternion.copy(h).multiply(placed.quaternion)
 if(modelForward==='-z')out.quaternion.multiply(HALF_TURN)
 return out
}
const HALF_TURN=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI)

const fits=new WeakMap()
/**
 * The prop keeps its real size, so on a small body the support hand may not reach its sockets with the hold a
 * standard body uses. holdFit finds, once per rig and clip, the smallest change that lets both arms reach every
 * probe pose with the elbow still bent (clip.prop.fit.probes: parameter sets; default the ready pose, looking up
 * and down, and the lifted lid): first the chest turns further, bringing the support shoulder forward (yaw, in
 * 6° steps up to 18°), then the hold comes back toward the chest (back, body metres, in 1.5 cm steps up to 18 cm).
 * Before that, if the clip allows it (prop.fit.scaleBelow: the body unit below which the prop shrinks, minScale),
 * the prop itself is scaled with the body: scale = k / scaleBelow, never below minScale and never above 1.
 */
export function holdFit(rig,clip,options={}){
 let byClip=fits.get(rig);if(!byClip){byClip=new WeakMap();fits.set(rig,byClip)}
 const known=byClip.get(clip);if(known)return known
 const info=authoringRig(rig),{k}=bodyScale(rig,info),snap=captureBones(rig.skeleton)
 const spec=clip.prop?.fit??{},probes=spec.probes??[{},{pitch:40},{pitch:-35},{reach:1,stance:1,lift:1},...(clip.keys[clip.highKey??'high']?[{high:1},{high:1,pitch:40},{high:1,pitch:-35}]:[])],minElbow=finite(spec.minElbowDeg,14),step=finite(spec.step,.015),limit=finite(spec.max,.18)
 const yawStep=finite(spec.yawStep,6),yawMax=finite(spec.yawMax,18)
 const scale=spec.scaleBelow>0?clamp(k/spec.scaleBelow,finite(spec.minScale,.5),1):1
 let back=0,yaw=0,worst=Infinity
 try{
  for(;;yaw<yawMax-1e-9?yaw+=yawStep:back+=step){
   worst=0
   for(const probe of probes){
    const frame=sampleHeld(clip,info,k,{...HELD_REST,...probe},{back,yaw,scale})
    const m=applyAuthoredPose(rig,frame,{lowerBody:'host',headMode:'host',heading:options.heading,origin:options.origin,groundY:options.groundY,colliders:false})
    for(const s of SIDES){const a=m.arms[s];if(a)worst=Math.max(worst,a.reachErrorMm,(minElbow-a.elbowFlexDeg)*2)}
    restoreBones(snap);rig.skeleton.update()
   }
   if(worst<=.5||back+step>limit+1e-9)break
  }
 }finally{restoreBones(snap);rig.skeleton.update()}
 const fit={back,yaw,scale,reached:worst<=.5}
 byClip.set(clip,fit);return fit
}

/**
 * Solve one held frame on a rig (upper body over the host's legs) and report where the prop ended up.
 * The prop follows the holding hand: if that arm could not reach its socket, the prop moves by the shortfall, so
 * the hand never floats off the grip (the support hand then carries the same shortfall as a reach error).
 * Returns {metrics, prop:{position, quaternion} in world space, shortfallMm}.
 */
export function applyHeld(rig,clip,params,options={}){
 const info=authoringRig(rig),{k}=bodyScale(rig,info)
 const fit=options.fit===false?null:holdFit(rig,clip,options)
 const frame=sampleHeld(clip,info,k,params,fit)
 const metrics=applyAuthoredPose(rig,frame,{lowerBody:'host',headMode:'host',...options})
 const origin=options.origin?(options.origin.isVector3?options.origin.clone():v3(options.origin)):new Vector3(metrics.hipsWorld[0],metrics.groundY,metrics.hipsWorld[2])
 origin.y=metrics.groundY
 const prop=propWorld(frame.prop,{heading:options.heading,origin,k,modelForward:options.modelForward})
 const side=frame.prop.side,target=metrics.handTargets[side],hand=worldPositionOf(rig.bones[side+'Hand'],new Vector3())
 let shortfallMm=0
 if(target&&frame.weight>=.999){const d=hand.clone().sub(new Vector3(...target.wrist));shortfallMm=d.length()*1000;if(shortfallMm>.5)prop.position.add(d)}
 return {metrics,frame,prop,shortfallMm,k,fit,scale:frame.propScale}
}

/** One row of a scripted timeline: [{phase, duration, pitch?: curve (deg), cycles?: number}] → total seconds. */
export function timelineDuration(clip){return (clip.timeline??[]).reduce((s,step)=>s+finite(step.duration),0)}
/** Parameters at time t of the clip's scripted timeline (the review's stand-in for the item's state machine). */
export function timelineParams(clip,t){
 let at=0
 const steps=clip.timeline??[]
 for(const step of steps){
  const d=finite(step.duration)
  if(t<at+d||step===steps.at(-1)){
   const u=d>0?clamp((t-at)/d,0,1):1,rate=clip.phases?.[step.phase]?.cycle?.rate
   return heldParams(clip,step.phase,u,{cycle:rate?(t-at)*rate:undefined,pitch:step.pitch!=null?curve(step.pitch,u):0,high:step.high!=null?curve(step.high,u):0})
  }
  at+=d
 }
 return {...HELD_REST,weight:0,phase:'idle'}
}
export {SIDES as HELD_SIDES}
