// Two-bone arm IK that chooses the elbow swivel instead of taking a fixed pole.
// For every candidate elbow on the reach circle it derives the anatomical
// forearm roll (pronation/supination) and the wrist flexion/deviation needed
// to show the requested hand frame, then scores joint limits, skin clearance,
// a soft elbow preference and continuity with the previous frame.
import {Quaternion,Vector3} from 'three'
import {DEG,UP,clamp,frameYZ,frameToWorld,point,setWorldRotation,signedAngle} from './math.mjs'

// externalRotation/internalRotation: the upper arm's roll about its own axis (shoulder rotation), see humeralRotation().
export const ARM_LIMITS=Object.freeze({flexion:75,extension:70,radial:22,ulnar:35,pronation:80,supination:85,elbowFlexion:150,externalRotation:90,internalRotation:75})
const Y=new Vector3(0,1,0)
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a))
const FORWARD=Object.freeze(new Vector3(0,0,1)),LEFT=Object.freeze(new Vector3(1,0,0))

/**
 * Shoulder (humeral) rotation of an arm, degrees, + = external (the folded forearm turns outward/up), - = internal.
 * d: upper-arm direction (shoulder → elbow), bend: the direction the forearm folds toward (front of the elbow),
 * thorax: {forward, left} of the upper torso. Neutral is where the forearm folds with the arm in its plain rotation:
 * forward when the arm hangs down or is raised sideways, toward the midline when the arm points forward.
 * An elbow that points across the body or up while the arm reaches forward reads as about ±180°: no shoulder does that.
 */
export function humeralRotation(d,bend,side,thorax){
 const fwd=thorax?.forward??FORWARD,medial=(thorax?.left??LEFT).clone().multiplyScalar(side==='left'?-1:1)
 const ref=fwd.clone().addScaledVector(medial,1.5*Math.max(0,d.dot(fwd)))
 ref.addScaledVector(d,-ref.dot(d))
 if(ref.lengthSq()<1e-8)ref.copy(medial).addScaledVector(d,-medial.dot(d))
 if(ref.lengthSq()<1e-8)return 0
 return (side==='left'?-1:1)*signedAngle(ref.normalize(),bend,d)/DEG
}

/**
 * The hand frame the wrist can actually show: no twist beyond the forearm's roll (pronation limits), flexion and
 * deviation within the wrist's range. Returns H itself when it is already reachable.
 */
function reachableHand(Ff,H,hand,pN,fN,tN,residual,flex,dev){
 const L=ARM_LIMITS,flexC=clamp(flex,-L.extension*DEG,L.flexion*DEG),devC=clamp(dev,-L.ulnar*DEG,L.radial*DEG)
 if(Math.abs(residual)<.5*DEG&&flexC===flex&&devC===dev)return H
 // Wrist rotation in the forearm frame; drop its twist about the forearm axis (the wrist cannot twist).
 const W=Ff.clone().invert().multiply(H).multiply(hand.toForearm.clone().invert())
 const fl=fN.clone().applyQuaternion(W)
 // Clamp the finger direction to the wrist's cone, keeping the side it bends to.
 const target=fN.clone().multiplyScalar(Math.cos(Math.hypot(flexC,devC)))
 const side=pN.clone().multiplyScalar(Math.tan(flexC)).addScaledVector(tN,Math.tan(devC))
 const fl2=flexC===flex&&devC===dev?fl:side.lengthSq()>1e-12?target.addScaledVector(side.normalize(),Math.sin(Math.hypot(flexC,devC))).normalize():fN.clone()
 const swing=new Quaternion().setFromUnitVectors(fN,fl2)
 return Ff.clone().multiply(swing).multiply(hand.toForearm)
}

/** Signed clearance (m) of p from an elliptic capsule; negative = inside the skin. */
export function clearance(p,c){
 const rel=p.clone().sub(c.start),t=clamp(rel.dot(c.axis),0,c.length),radial=rel.clone().addScaledVector(c.axis,-t)
 const along=rel.dot(c.axis),beyond=along<0?-along:along>c.length?along-c.length:0
 const x=radial.dot(c.lateral),z=radial.dot(c.front),r=Math.hypot(x,z)
 if(r<1e-9)return -Math.min(c.a,c.front_r)+beyond
 const b=z>=0?c.front_r:c.back_r,ellipse=1/Math.sqrt((x/r/c.a)**2+(z/r/b)**2)
 const radialGap=r-ellipse
 return beyond>0?Math.max(radialGap,beyond-ellipse*.35):radialGap
}
export function minClearance(p,colliders,skip){let best=Infinity,which=null;for(const c of colliders){if(skip&&skip(c))continue;const d=clearance(p,c);if(d<best){best=d;which=c.key}}return {distance:best,key:which}}

function analyze(info,side,s,wc,L1,L2,n,e1,e2,h,along,phi,H,opts){
 const o=e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2,Math.sin(phi))
 const c=s.clone().addScaledVector(n,along),elbow=c.clone().addScaledVector(o,h)
 const u=elbow.clone().sub(s).divideScalar(L1),a=wc.clone().sub(elbow).divideScalar(L2)
 const zU=o.clone().negate().addScaledVector(u,o.dot(u));if(zU.lengthSq()<1e-12)zU.copy(opts.forward??new Vector3(0,0,1)).addScaledVector(u,-(opts.forward??new Vector3(0,0,1)).dot(u))
 const Fu=frameYZ(u,zU),hinge=new Vector3(1,0,0).applyQuaternion(Fu)
 const Ff0=frameYZ(a,new Vector3().crossVectors(hinge,a))
 const hand=info.hands[side],limb=info.limbs[side]
 // Pronation sign: rotating the thumb side toward the palm about the distal axis.
 const pN=new Vector3(0,0,1).applyQuaternion(hand.toForearm),fN=new Vector3(0,1,0).applyQuaternion(hand.toForearm)
 const tN=hand.thumbSide.clone().applyQuaternion(limb.foreRest.clone().invert())
 const pronSign=Math.sign(new Vector3().crossVectors(Y,tN).dot(pN))||1
 // Between keys the hand may follow the joint-space plan (forearm roll + wrist angles)
 // instead of the world-space slerp, which can demand a twist the forearm cannot make.
 if(opts.plan?.blend>1e-3&&Number.isFinite(opts.plan.flex)){
  const p=opts.plan,Fp=Ff0.clone().multiply(new Quaternion().setFromAxisAngle(Y,clamp(p.pronation,-ARM_LIMITS.supination*DEG,ARM_LIMITS.pronation*DEG)*pronSign))
  const wrist=new Quaternion().setFromAxisAngle(new Vector3().crossVectors(fN,pN).normalize(),p.flex).multiply(new Quaternion().setFromAxisAngle(new Vector3().crossVectors(fN,tN).normalize(),p.dev))
  H=H.clone().slerp(Fp.multiply(wrist).multiply(hand.toForearm),clamp(p.blend,0,1))
 }
 // Wrist relative rotation with the forearm at its rest roll.
 const R0=Ff0.clone().invert().multiply(H).multiply(hand.toForearm.clone().invert())
 const tau0=wrapAngle(2*Math.atan2(R0.y,R0.w))
 // Unwrap against the previous frame so a hand turning past ±180° keeps rolling the same way.
 let pron0=pronSign*tau0
 if(Number.isFinite(opts.previousPronation)){while(pron0-opts.previousPronation>Math.PI)pron0-=2*Math.PI;while(pron0-opts.previousPronation<-Math.PI)pron0+=2*Math.PI}
 const pron=clamp(pron0,-ARM_LIMITS.supination*DEG,ARM_LIMITS.pronation*DEG),rho=pron*pronSign
 const Ff=Ff0.clone().multiply(new Quaternion().setFromAxisAngle(Y,rho))
 const Hl=Ff.clone().invert().multiply(H),fl=new Vector3(0,1,0).applyQuaternion(Hl)
 const flex=Math.atan2(fl.dot(pN),fl.dot(fN)),dev=Math.atan2(fl.dot(tN),fl.dot(fN))
 const elbowFlex=Math.acos(clamp(u.dot(a),-1,1))
 // Shoulder roll: the front of the elbow (where the forearm folds) relative to the arm's plain rotation.
 const humeral=humeralRotation(u,new Vector3(0,0,1).applyQuaternion(Fu),side,opts.thorax)
 return {phi,o,elbow,u,a,Fu,Ff0,Ff,rho,pron,pron0,residual:pron0-pron,flex,dev,elbowFlex,humeral,H,pN,fN,tN}
}

function cost(r,opts,colliders){
 const L=ARM_LIMITS,deg=v=>v/DEG
 const flex=deg(r.flex),dev=deg(r.dev),pron=deg(r.pron0)
 const lim=(v,pos,neg)=>v>=0?v/pos:-v/neg,over=(v,pos,neg)=>Math.max(0,v-pos,-v-neg)
 let c=lim(flex,L.flexion,L.extension)**2+lim(dev,L.radial,L.ulnar)**2+.6*lim(pron,L.pronation,L.supination)**2
 c+=4*(over(flex,L.flexion,L.extension)/10)**2+4*(over(dev,L.radial,L.ulnar)/10)**2+4*(over(pron,L.pronation,L.supination)/10)**2
 // Shoulder rotation has a range too: without this an elbow may turn across the body or up to save the wrist, or a
 // nearly straight arm may roll the whole upper arm round and undo it with the forearm (a wrung-out arm).
 const hum=r.humeral
 c+=.6*lim(hum,L.externalRotation,L.internalRotation)**2+4*(over(hum,L.externalRotation,L.internalRotation)/10)**2
 if(opts.elbowHint)c+=(opts.elbowWeight??.6)*(1-r.o.dot(opts.elbowHint))
 const high=r.o.dot(UP);if(high>(opts.elbowRaise??.25))c+=2.5*(high-(opts.elbowRaise??.25))**2
 if(colliders?.length){
  // Comfort gap (margin) costs a little; real penetration (past `sink`, default 2 cm into the measured skin, which
  // includes loose clothing such as a hoodie hem) costs a lot, up to a cap. An arm resting against the body is normal; twisting
  // the whole arm to keep a sleeve off the clothes is not.
  const margin=opts.margin??.015,sink=opts.sink??.02
  for(const p of [r.elbow,r.elbow.clone().lerp(opts.shoulder,.5),r.elbow.clone().lerp(opts.wrist,.5)]){
   const d=minClearance(p,colliders,opts.skipCollider).distance
   if(d<margin)c+=.8*Math.min(1,(margin-d)/(margin+sink))**2
   // Saturates (at 8) so that a penetration no elbow direction can avoid (a hanging arm against a body whose width
   // is only estimated) cannot pick the swivel by millimetres and wring the arm.
   if(d<-sink)c+=8*(1-Math.exp(-(((-sink-d)/.015)**2)))
  }
 }
 if(Number.isFinite(opts.previousSwivel)){const d=wrapAngle(r.phi-opts.previousSwivel)/(30*DEG);c+=(opts.continuity??.8)*d*d}
 // Joint-space plan between keys: stay near the planned elbow swivel and forearm roll.
 // Mid-transition (blend near 1) the plan pulls harder, so the solver follows the planned path instead of lagging in
 // its old valley and catching up in one frame.
 if(opts.plan){const ds=wrapAngle(r.phi-opts.plan.swivel)/(40*DEG),dp=(r.pron0-opts.plan.pronation)/(35*DEG);c+=(opts.planWeight??1.2)*(1+2*clamp(opts.plan.blend??0,0,1))*(ds*ds+dp*dp)}
 return c
}

/**
 * Solve one arm. target.wrist (world) and target.hand (world quaternion whose
 * columns are x=y×z, y=finger direction, z=palm normal).
 * opts: {elbowHint (world unit vector, the side the elbow should point to),
 *  colliders, previousSwivel, twistSplit (share of pronation on the forearm bone), samples}
 */
export function solveArm(rig,info,side,target,opts={}){
 const b=rig.bones,upper=b[side+'UpperArm'],lower=b[side+'LowerArm'],handBone=b[side+'Hand']
 const s=point(upper),L1=s.distanceTo(point(lower)),L2=point(lower).distanceTo(point(handBone))
 const dir=target.wrist.clone().sub(s),dist=dir.length()
 const dc=clamp(dist,Math.abs(L1-L2)+1e-4,(L1+L2)*(1-1e-4))
 const n=dist>1e-9?dir.divideScalar(dist):new Vector3(0,-1,0)
 const along=(L1*L1+dc*dc-L2*L2)/(2*dc),h=Math.sqrt(Math.max(0,L1*L1-along*along)),wc=s.clone().addScaledVector(n,dc)
 const e1=new Vector3(0,-1,0).addScaledVector(n,n.y);if(e1.lengthSq()<1e-8)e1.copy(opts.forward??new Vector3(0,0,1)).addScaledVector(n,-(opts.forward??new Vector3(0,0,1)).dot(n));e1.normalize()
 const e2=new Vector3().crossVectors(n,e1)
 const H=target.hand,local={...opts,shoulder:s,wrist:wc}
 const samples=opts.samples??36
 let best=null,bestCost=Infinity
 const consider=phi=>{const r=analyze(info,side,s,wc,L1,L2,n,e1,e2,h,along,phi,H,local),c=cost(r,local,opts.colliders);opts.trace?.push({phi,cost:c,r,clearance:opts.trace&&opts.colliders?.length?minClearance(r.elbow,opts.colliders,opts.skipCollider):null});if(c<bestCost){bestCost=c;best=r}return c}
 // Continuity first: with a previous swivel, follow the nearest valley (±window) instead
 // of jumping to a distant global minimum; first frames search the whole circle.
 // If the local valley turns bad (a joint limit is being crossed), switch to the
 // global optimum early, with hysteresis, rather than twisting through the limit.
 if(Number.isFinite(opts.plan?.swivel))consider(opts.plan.swivel)
 if(Number.isFinite(opts.previousSwivel)){
  const win=(opts.swivelWindow??70)*DEG;for(let i=0;i<=24;i++)consider(opts.previousSwivel-win+2*win*i/24)
  const local=best,localCost=bestCost;best=null;bestCost=Infinity
  for(let i=0;i<samples;i++)consider(i/samples*2*Math.PI)
  if(!(bestCost<localCost-(opts.switchMargin??1.5))){best=local;bestCost=localCost}
 }
 else for(let i=0;i<samples;i++)consider(i/samples*2*Math.PI)
 // Golden-section refinement around the best sample.
 let lo=best.phi-Math.PI*2/samples,hi=best.phi+Math.PI*2/samples
 const g=(Math.sqrt(5)-1)/2
 let x1=hi-g*(hi-lo),x2=lo+g*(hi-lo),f1=consider(x1),f2=consider(x2)
 for(let i=0;i<14;i++){if(f1<f2){hi=x2;x2=x1;f2=f1;x1=hi-g*(hi-lo);f1=consider(x1)}else{lo=x1;x1=x2;f1=f2;x2=lo+g*(hi-lo);f2=consider(x2)}}
 const r=best,limb=info.limbs[side],hand=info.hands[side],split=clamp(opts.twistSplit??1,0,1)
 setWorldRotation(upper,frameToWorld(rig,upper,r.Fu,limb.upperRest))
 setWorldRotation(lower,frameToWorld(rig,lower,r.Ff0.clone().multiply(new Quaternion().setFromAxisAngle(Y,r.rho*split)),limb.foreRest))
 // The hand shows what the wrist can do (opts.clampWrist === false keeps the requested frame, twist included).
 const shown=opts.clampWrist===false?r.H:reachableHand(r.Ff,r.H,hand,r.pN,r.fN,r.tN,r.residual,r.flex,r.dev)
 setWorldRotation(handBone,frameToWorld(rig,handBone,shown,hand.rest))
 const reached=point(handBone)
 const clearanceElbow=opts.colliders?.length?minClearance(r.elbow,opts.colliders,opts.skipCollider):{distance:null,key:null}
 return {
  swivel:wrapAngle(r.phi),cost:bestCost,planBlend:opts.plan?.blend??0,
  reachErrorMm:reached.distanceTo(target.wrist)*1000,
  elbowFlexDeg:r.elbowFlex/DEG,
  pronationDeg:r.pron/DEG,requestedPronationDeg:r.pron0/DEG,residualTwistDeg:r.residual/DEG,
  wristFlexDeg:r.flex/DEG,wristDeviationDeg:r.dev/DEG,humeralRotationDeg:r.humeral,
  // How far the shown hand turned away from the requested one to stay within the wrist's range.
  wristLimitedDeg:shown===r.H?0:2*Math.acos(clamp(Math.abs(shown.dot(r.H)),0,1))/DEG,
  elbowDirection:r.o.toArray(),elbowWorld:r.elbow.toArray(),
  elbowClearanceMm:clearanceElbow.distance==null?null:clearanceElbow.distance*1000,elbowNearest:clearanceElbow.key,
 }
}
