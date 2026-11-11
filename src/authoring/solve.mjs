// Full-body authored pose. Solves a resolved pose frame (see clip.mjs) on any
// humanoid rig: pelvis height/rotation, torso twist distributed over the
// spine chain, clavicles, a host- or body-driven head, planted feet with
// automatic pelvis drop/raise, knees tracking the toes, swivel-searched arms
// reaching two-hand contact targets, and fingers. Mutates only the rig; the
// caller owns the restore transaction (attachPoseDriver does that).
// lowerBody:'host' keeps the host's pelvis and legs (walking, running, jumping
// go on) and poses only the spine, clavicles, arms and fingers over them.
import {Quaternion,Vector3} from 'three'
import {settle,skinUpdate,solving,worldQuaternionOf} from '../world.mjs'
import {authoringRig} from './rig.mjs'
import {solveArm,minClearance} from './arm.mjs'
import {poseFingers} from './hand.mjs'
import {DEG,UP,anatomicalToWorld,clamp,eulerYXZ,finite,frameToWorld,frameYZ,point,setWorldPosition,setWorldRotation,signedAngle} from './math.mjs'

export const REFERENCE_HIP_HEIGHT=.95 // body metres are authored for a 1.65 m figure with hips at 0.95 m
const SIDES=[['left',1],['right',-1]]
const v3=a=>Array.isArray(a)?new Vector3(finite(a[0]),finite(a[1]),finite(a[2])):a?.isVector3?a.clone():new Vector3()
const rot=a=>eulerYXZ(...(Array.isArray(a)?a.map(x=>finite(x)):[0,0,0]))

function hostHandFrame(rig,info,side){
 const bone=rig.bones[side+'Hand'],w=worldQuaternionOf(bone,new Quaternion())
 return w.multiply(rig.restRotations.get(bone).clone().invert()).multiply(rig.restBasis).multiply(info.hands[side].rest)
}
function collectPosed(rig,info,upperOnly=false){
 const b=rig.bones,set=new Set([upperOnly?null:b.hips,...info.torso,b.neck,b.head].filter(Boolean))
 for(const [s] of SIDES){
  for(const r of upperOnly?['UpperArm','LowerArm','Hand']:['UpperArm','LowerArm','Hand','UpperLeg','LowerLeg','Foot'])set.add(b[s+r])
  if(info.shoulders[s])set.add(info.shoulders[s]);if(info.toes[s]&&!upperOnly)set.add(info.toes[s])
  for(const f of info.hands[s].fingers)f.bones.forEach(x=>set.add(x))
 }
 const depth=bone=>{let n=0;for(let p=bone.parent;p;p=p.parent)n++;return n}
 return [...set].filter(Boolean).sort((p,q)=>depth(p)-depth(q))
}
/** Torso, thigh and pelvis skin volumes at their current world placement. */
export function buildColliders(rig,info,scale){
 const out=[]
 for(const [key,r] of Object.entries(info.radii)){
  const start=point(r.bone),end=point(r.end),axis=end.clone().sub(start),length=axis.length();if(length<1e-6)continue
  axis.divideScalar(length)
  const w=worldQuaternionOf(r.bone,new Quaternion()).multiply(rig.restRotations.get(r.bone).clone().invert()).multiply(rig.restBasis)
  const lateral=new Vector3(1,0,0).applyQuaternion(w),front=new Vector3(0,0,1).applyQuaternion(w)
  lateral.addScaledVector(axis,-lateral.dot(axis)).normalize();front.addScaledVector(axis,-front.dot(axis)).addScaledVector(lateral,-front.dot(lateral)).normalize()
  const s0=key==='pelvis'?start.clone().addScaledVector(axis,-length*1.1):start,len=key==='pelvis'?length*2.1:length
  out.push({key,start:s0,axis,length:len,lateral,front,a:r.lateral*scale,front_r:r.front*scale,back_r:r.back*scale})
 }
 return out
}

/** World metres per bind unit (`scale`) and per body metre (`k`) for this rig as it stands now. */
export function bodyScale(rig,info=authoringRig(rig)){
 const b=rig.bones,scale=point(b.leftUpperArm).distanceTo(point(b.leftLowerArm))/info.limbs.left.upperLength
 return {scale,k:info.hipHeight*scale/REFERENCE_HIP_HEIGHT}
}
/** The world rotation of a bone as an anatomical frame (X left, Y up, Z forward where the rest pose faced forward). */
const anatomicalWorld=(rig,bone)=>worldQuaternionOf(bone,new Quaternion()).multiply(rig.restRotations.get(bone).clone().invert()).multiply(rig.restBasis)

/**
 * pose: resolved frame (body metres, degrees, anatomical X=left Y=up Z=forward).
 * options: {heading (rad, 0 = facing +Z), origin (world ground point), groundY,
 *   headMode ('host' keeps the host head rotation), state (mutable object for continuity),
 *   twistSplit, colliders (default true), preserveHands (VR: reach the host hands),
 *   lowerBody ('host' keeps the host's pelvis and legs and poses only the upper body over them)}
 */
export function applyAuthoredPose(rig,pose,options){return solving(rig,()=>authoredPose(rig,pose,options))}
function authoredPose(rig,pose,options={}){
 const info=authoringRig(rig),b=rig.bones,state=options.state??{}
 const weight=clamp(finite(pose.weight,1),0,1)
 const upperOnly=(options.lowerBody??pose.lowerBody)==='host'
 const posed=collectPosed(rig,info,upperOnly)
 const host=new Map(posed.map(bone=>[bone,{q:bone.quaternion.clone(),p:bone.position.clone()}]))
 const hostHead={p:point(b.head),q:worldQuaternionOf(b.head,new Quaternion())}
 const preserveHands=options.preserveHands||pose.hands?.mode==='host'
 const hostHands=preserveHands?Object.fromEntries(SIDES.map(([s])=>[s,{wrist:point(b[s+'Hand']),hand:hostHandFrame(rig,info,s)}])):null
 const {scale,k}=bodyScale(rig,info)
 const heading=new Quaternion().setFromAxisAngle(UP,finite(options.heading,0))
 const hostAnkle=Math.min(point(b.leftFoot).y,point(b.rightFoot).y)
 const groundY=Number.isFinite(options.groundY)?options.groundY:options.origin?v3(options.origin).y:hostAnkle-info.ankleHeight*scale
 const hipsNow=point(b.hips),origin=options.origin?v3(options.origin):new Vector3(hipsNow.x,groundY,hipsNow.z);origin.y=groundY
 const body=(v,out=new Vector3())=>out.copy(v).multiplyScalar(k).applyQuaternion(heading).add(origin)
 const bodyDir=v=>v.clone().applyQuaternion(heading)

 // Reset translations of posed bones to the bind layout (host may have moved them).
 for(const bone of posed)if(bone!==b.hips&&rig.restWorld.has(bone.parent))bone.position.copy(rig.restLocal.get(bone).position)

 // 1. Pelvis. Over a host lower body the pelvis stays where the host put it; the spine starts from its rotation.
 const pelvisA=upperOnly?heading.clone().invert().multiply(anatomicalWorld(rig,b.hips)):rot(pose.pelvis?.rot)
 if(!upperOnly){
  setWorldRotation(b.hips,anatomicalToWorld(rig,b.hips,heading,pelvisA))
  const pelvisOffset=v3(pose.pelvis?.offset)
  const pelvisTarget=body(pelvisOffset).add(new Vector3(0,info.hipHeight*scale,0))
  setWorldPosition(b.hips,pelvisTarget)
 }

 // 2. Torso chain: slerp from pelvis toward the authored chest rotation.
 const torsoA=rot(pose.torso?.rot),n=info.torso.length,weights=pose.torso?.weights
 let topA=pelvisA.clone()
 info.torso.forEach((bone,i)=>{const w=Array.isArray(weights)&&Number.isFinite(weights[i])?weights[i]:(i+1)/n;topA=pelvisA.clone().slerp(torsoA,clamp(w,0,1.2));setWorldRotation(bone,anatomicalToWorld(rig,bone,heading,topA))})

 // 3. Clavicles (protract forward, elevate up), in the upper torso frame.
 for(const [side,sign] of SIDES){
  const bone=info.shoulders[side];if(!bone)continue
  const [protract=0,elevate=0]=pose.clavicles?.[side]??[]
  const a=topA.clone().multiply(new Quaternion().setFromAxisAngle(UP,-sign*finite(protract)*DEG)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),sign*finite(elevate)*DEG))
  setWorldRotation(bone,anatomicalToWorld(rig,bone,heading,a))
 }

 // 4. Head: keep the host's look (desktop camera / VR headset) or an authored gaze.
 const headMode=options.headMode??pose.head?.mode??'host'
 let headWorld
 if(headMode==='host')headWorld=hostHead.q.clone()
 else headWorld=anatomicalToWorld(rig,b.head,heading,rot(pose.head?.rot))
 if(b.neck){
  const headA=heading.clone().invert().multiply(headWorld).multiply(rig.restRotations.get(b.head).clone().invert()).multiply(rig.restBasis)
  setWorldRotation(b.neck,anatomicalToWorld(rig,b.neck,heading,topA.clone().slerp(headA,clamp(finite(pose.head?.neck,.5),0,1))))
 }
 setWorldRotation(b.head,headWorld)

 // 5. Feet planted on the ground; pelvis drops if a foot is out of reach, rises if a knee folds too far.
 const maxExt=clamp(finite(pose.legs?.maxExtension,.985),.8,.9995),maxKnee=clamp(finite(pose.legs?.maxKnee,128),60,165)*DEG
 const feet={}
 // Host lower body: the feet are where the host animation has them (only measured, for balance and slide).
 if(upperOnly)for(const [side] of SIDES){
  const foot=b[side+'Foot'],ankle=point(foot),forward=new Vector3(0,0,1).applyQuaternion(anatomicalWorld(rig,foot)).setY(0)
  if(forward.lengthSq()<1e-8)forward.copy(bodyDir(new Vector3(0,0,1)));forward.normalize()
  const yawQ=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),forward),lateral=new Vector3(1,0,0).applyQuaternion(yawQ)
  const toeJoint=info.toes[side]?point(info.toes[side]):ankle.clone().add(info.legs[side].toeLocal.clone().multiplyScalar(scale).applyQuaternion(yawQ))
  feet[side]={ground:new Vector3(ankle.x,groundY,ankle.z),yawQ,heel:0,lift:Math.max(0,ankle.y-groundY-info.ankleHeight*scale*1.6),ankle,toeJoint,lateral,forward}
 }
 for(const [side,sign] of upperOnly?[]:SIDES){
  const spec=pose.feet?.[side]??{},pos=Array.isArray(spec.pos)?spec.pos:[sign*.11,0]
  const ground=body(new Vector3(finite(pos[0]),0,finite(pos[1])))
  let yawQ=heading.clone().multiply(new Quaternion().setFromAxisAngle(UP,sign*finite(spec.toeOut,8)*DEG))
  const heel=clamp(finite(spec.heel,0),0,70)*DEG,lift=Math.max(0,finite(spec.lift,0))*k
  const leg=info.legs[side],toeOffset=leg.toeLocal.clone().multiplyScalar(scale)
  const restAnkle=ground.clone().add(new Vector3(0,info.ankleHeight*scale+lift,0))
  // A back foot up on its ball pivots on the ball toward the hip, as in a lunge: the ball stays planted and the
  // heel swings out so the shin does not tip over the side of the foot. Grows with the heel lift (full at 25°);
  // feet.<side>.pivot 0..1 scales it (default 1), at most 50°.
  const pivot=clamp(finite(spec.pivot,1),0,1)*clamp(heel/(25*DEG),0,1)
  if(pivot>0){
   const ball=restAnkle.clone().add(toeOffset.clone().applyQuaternion(yawQ))
   settle(b.hips,false,true)
   const toHip=point(b[side+'UpperLeg']).sub(ball).setY(0),forward=new Vector3(0,0,1).applyQuaternion(yawQ).setY(0)
   // Only a back foot (the hip ahead of the ball), fading in over the first 12 cm so a stepping foot never pops.
   const ahead=clamp(toHip.dot(bodyDir(new Vector3(0,0,1)))/(.12*k),0,1)
   if(ahead>0&&toHip.lengthSq()>1e-8&&forward.lengthSq()>1e-8){
    const turn=new Quaternion().setFromAxisAngle(UP,clamp(signedAngle(forward,toHip,UP),-50*DEG,50*DEG)*pivot*ahead)
    yawQ=turn.clone().multiply(yawQ)
    for(const p of [restAnkle,ground])p.sub(ball).applyQuaternion(turn).add(ball)
   }
  }
  const toeJoint=restAnkle.clone().add(toeOffset.clone().applyQuaternion(yawQ))
  const lateral=new Vector3(1,0,0).applyQuaternion(yawQ)
  const ankle=toeJoint.clone().add(restAnkle.clone().sub(toeJoint).applyAxisAngle(lateral,heel))
  feet[side]={ground,yawQ,heel,lift,ankle,toeJoint,lateral,forward:new Vector3(0,0,1).applyQuaternion(yawQ)}
 }
 let pelvisDropM=0
 if(!upperOnly){
  let drop=0,raise=0
  for(const [side] of SIDES){
   const hip=point(b[side+'UpperLeg']),leg=info.legs[side],L1=leg.thighLength*scale,L2=leg.shinLength*scale
   const reach=(L1+L2)*maxExt,dmin=Math.sqrt(L1*L1+L2*L2-2*L1*L2*Math.cos(Math.PI-maxKnee))
   const d=hip.clone().sub(feet[side].ankle),dxz=Math.hypot(d.x,d.z),dy=d.y
   if(d.length()>reach)drop=Math.max(drop,reach>dxz?dy-Math.sqrt(reach*reach-dxz*dxz):dy)
   if(d.length()<dmin&&dmin>dxz)raise=Math.max(raise,Math.sqrt(dmin*dmin-dxz*dxz)-dy)
  }
  pelvisDropM=drop>0?drop:-raise
  if(pelvisDropM)setWorldPosition(b.hips,point(b.hips).add(new Vector3(0,-pelvisDropM,0)))
 }
 const legMetrics={left:null,right:null}
 const kneeOut=finite(pose.knees?.out,8)
 for(const [side,sign] of upperOnly?[]:SIDES){
  const f=feet[side],leg=info.legs[side],thigh=b[side+'UpperLeg'],shin=b[side+'LowerLeg'],foot=b[side+'Foot']
  const hip=point(thigh),L1=leg.thighLength*scale,L2=leg.shinLength*scale
  const dir=f.ankle.clone().sub(hip),dist=dir.length(),dc=clamp(dist,Math.abs(L1-L2)+1e-4,(L1+L2)*(1-1e-4));dir.normalize()
  const along=(L1*L1+dc*dc-L2*L2)/(2*dc),h=Math.sqrt(Math.max(0,L1*L1-along*along))
  // Knee tracks the toes (plus a little outward), never caves inward.
  const hint=f.forward.clone().applyAxisAngle(UP,sign*kneeOut*DEG)
  const o=hint.addScaledVector(dir,-hint.dot(dir));if(o.lengthSq()<1e-10)o.copy(bodyDir(new Vector3(0,0,1)));o.normalize()
  const knee=hip.clone().addScaledVector(dir,along).addScaledVector(o,h),ankle=hip.clone().addScaledVector(dir,dc)
  const thighFrame=frameYZ(knee.clone().sub(hip),o)
  const hinge=new Vector3(1,0,0).applyQuaternion(thighFrame),shinDir=ankle.clone().sub(knee).normalize()
  setWorldRotation(thigh,frameToWorld(rig,thigh,thighFrame,leg.thighRest))
  setWorldRotation(shin,frameToWorld(rig,shin,frameYZ(shinDir,new Vector3().crossVectors(hinge,shinDir)),leg.shinRest))
  setWorldRotation(foot,anatomicalToWorld(rig,foot,f.yawQ,new Quaternion().setFromAxisAngle(new Vector3(1,0,0),f.heel)))
  if(info.toes[side])setWorldRotation(info.toes[side],anatomicalToWorld(rig,info.toes[side],f.yawQ,new Quaternion()))
  // Ankle angles: shin "up" vector seen in the foot frame.
  const shinUp=knee.clone().sub(ankle).normalize(),footQ=f.yawQ.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),f.heel))
  const fy=new Vector3(0,1,0).applyQuaternion(footQ),fz=new Vector3(0,0,1).applyQuaternion(footQ),fx=new Vector3(1,0,0).applyQuaternion(footQ)
  const kneeFlex=Math.PI-Math.acos(clamp(hip.clone().sub(knee).normalize().dot(ankle.clone().sub(knee).normalize()),-1,1))
  const valgus=signedAngle(f.forward.clone().setY(0),o.clone().setY(0),UP)*-sign
  legMetrics[side]={kneeFlexDeg:kneeFlex/DEG,ankleDorsiflexionDeg:Math.atan2(shinUp.dot(fz),shinUp.dot(fy))/DEG,ankleLateralLeanDeg:Math.atan2(shinUp.dot(fx)*sign,shinUp.dot(fy))/DEG,kneeInwardDeg:valgus/DEG,footReachErrorMm:point(foot).distanceTo(f.ankle)*1000,heelLiftDeg:f.heel/DEG,liftMm:f.lift*1000}
 }

 // 6. Arms reach hand targets (authored contact points, or the host's tracked hands).
 const colliders=options.colliders===false?[]:buildColliders(rig,info,scale)
 const armMetrics={},handTargets={}
 const elbowWeight=finite(pose.elbows?.weight,.6)
 state.arms??={}
 for(const [side] of SIDES){
  let target=null
  if(hostHands)target=hostHands[side]
  else if(pose.hands?.[side]){
   const t=pose.hands[side],hand=info.hands[side]
   const q=heading.clone().multiply(Array.isArray(t.q)?new Quaternion().fromArray(t.q).normalize():new Quaternion())
   // pointMix (between keys with different contact points) blends the point offsets.
   const pt=t.pointMix?Object.entries(t.pointMix).reduce((acc,[name,w])=>hand.points[name]?acc.addScaledVector(hand.points[name],w):acc,new Vector3()):hand.points[t.point]??new Vector3()
   const at=body(v3(t.position))
   target={wrist:at.clone().sub(pt.clone().multiplyScalar(scale).applyQuaternion(q)),hand:q,point:at}
  }
  if(target)handTargets[side]=target
 }
 // Two-hand contact first: when either hand is out of reach, move BOTH targets
 // together toward the shoulders so the hands still meet (short-armed avatars).
 let pairShiftMm=0
 if(!hostHands&&pose.hands?.pair&&handTargets.left&&handTargets.right){
  const shift=new Vector3()
  for(let i=0;i<6;i++){
   // Retract along the excess-weighted mean of the out-of-reach arms, so a centred pair goes straight back
   // toward the chest instead of zigzagging between the two shoulders.
   let worst=0;const dir=new Vector3()
   for(const [side] of SIDES){
    const s=point(b[side+'UpperArm']),reach=(info.limbs[side].upperLength+info.limbs[side].foreLength)*scale*.975
    const d=handTargets[side].wrist.clone().sub(s),excess=d.length()-reach
    if(excess>0){dir.addScaledVector(d.normalize(),excess);worst=Math.max(worst,excess)}
   }
   if(worst<1e-4||dir.lengthSq()<1e-12)break
   const step=dir.normalize().multiplyScalar(-(worst+1e-4))
   shift.add(step);for(const [side] of SIDES){handTargets[side].wrist.add(step);handTargets[side].point.add(step)}
  }
  pairShiftMm=shift.length()*1000
 }
 // Upper-torso frame for the shoulder-rotation limit (the stance may turn the chest away from the feet).
 const thorax={forward:bodyDir(new Vector3(0,0,1).applyQuaternion(topA)),left:bodyDir(new Vector3(1,0,0).applyQuaternion(topA))}
 for(const [side,sign] of SIDES){
  const target=handTargets[side]
  if(!target){armMetrics[side]=null;continue}
  const hintA=pose.elbows?.[side]?v3(pose.elbows[side]).normalize():new Vector3(sign*.45,-.85,-.25).normalize()
  const prev=state.arms[side]
  armMetrics[side]=solveArm(rig,info,side,target,{elbowHint:bodyDir(hintA),elbowWeight,colliders,previousSwivel:prev?.swivel,previousPronation:pose.armPlan?.[side]?.pronation??prev?.pronation,plan:pose.armPlan?.[side],forward:bodyDir(new Vector3(0,0,1)),twistSplit:finite(options.twistSplit,1),elbowRaise:finite(pose.elbows?.raise,.25),trace:options.traceArms?.[side],thorax,clampWrist:options.clampWrist})
  state.arms[side]={swivel:armMetrics[side].swivel,pronation:armMetrics[side].requestedPronationDeg*DEG}
 }

 // 7. Fingers.
 const fingerMetrics={}
 for(const [side] of SIDES)fingerMetrics[side]=hostHands&&!pose.fingersOverHost?{posed:0,reason:'host-hands'}:poseFingers(rig,info,side,pose.fingers?.[side])

 // 8. Blend with the host pose (enter/exit). Local-space slerp, root to leaves.
 if(weight<1){
  for(const bone of posed){const h=host.get(bone);bone.quaternion.copy(h.q.clone().slerp(bone.quaternion,weight));bone.position.copy(h.p.clone().lerp(bone.position,weight))}
  ;settle(upperOnly?info.torso[0]??b.hips:b.hips,true,true)
 }
 skinUpdate(rig.skeleton)
 const metrics=measureAuthoredPose(rig,info,{scale,k,heading,origin,groundY,feet,colliders:options.colliders===false?[]:buildColliders(rig,info,scale),armMetrics,legMetrics,fingerMetrics,handTargets,hostHead,headMode,pelvisDropM,weight})
 metrics.pairShiftMm=pairShiftMm
 return metrics
}

// de Leva (1996) segment masses (fractions of body mass).
const MASS={head:.0694,pelvis:.1117,abdomen:.1633,thorax:.1596,upperArm:.0271,forearm:.0162,hand:.0061,thigh:.1416,shank:.0433,foot:.0137}
function hull(points){
 const p=[...points].sort((a,c)=>a.x-c.x||a.y-c.y);if(p.length<3)return p
 const cross=(o,a,c)=>(a.x-o.x)*(c.y-o.y)-(a.y-o.y)*(c.x-o.x),lower=[],upper=[]
 for(const q of p){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),q)<=0)lower.pop();lower.push(q)}
 for(const q of [...p].reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),q)<=0)upper.pop();upper.push(q)}
 return lower.slice(0,-1).concat(upper.slice(0,-1))
}
function signedDistanceToPolygon(q,poly){
 let inside=true,best=Infinity
 for(let i=0;i<poly.length;i++){
  const a=poly[i],c=poly[(i+1)%poly.length],ex=c.x-a.x,ey=c.y-a.y,len=Math.hypot(ex,ey)||1
  const side=(ex*(q.y-a.y)-ey*(q.x-a.x))/len // >0 inside for CCW
  if(side<0)inside=false
  const t=clamp(((q.x-a.x)*ex+(q.y-a.y)*ey)/(len*len),0,1),d=Math.hypot(q.x-(a.x+ex*t),q.y-(a.y+ey*t))
  best=Math.min(best,d)
 }
 return inside?best:-best
}

/** Metrics a reviewer needs to judge a frame: contact, joints, clearance, balance. */
export function measureAuthoredPose(rig,info,ctx){
 const b=rig.bones,P=bone=>point(bone),mid=(a,c)=>P(a).add(P(c)).multiplyScalar(.5)
 const top=b.neck??b.head
 const segs=[[MASS.head,P(b.head).add(new Vector3(0,.08*ctx.k,0))],[MASS.pelvis,P(b.hips)],[MASS.abdomen,mid(b.hips,info.torso[Math.floor(info.torso.length/2)]??top)],[MASS.thorax,mid(info.torso.at(-1)??b.hips,top)]]
 for(const [s] of SIDES){
  segs.push([MASS.upperArm,mid(b[s+'UpperArm'],b[s+'LowerArm'])],[MASS.forearm,mid(b[s+'LowerArm'],b[s+'Hand'])],[MASS.hand,P(b[s+'Hand'])],[MASS.thigh,mid(b[s+'UpperLeg'],b[s+'LowerLeg'])],[MASS.shank,mid(b[s+'LowerLeg'],b[s+'Foot'])],[MASS.foot,ctx.feet[s].toeJoint.clone().lerp(P(b[s+'Foot']),.5)])
 }
 const total=segs.reduce((s,[m])=>s+m,0),com=segs.reduce((s,[m,p])=>s.addScaledVector(p,m),new Vector3()).divideScalar(total)
 // Support polygon from both soles (only the forefoot when the heel is lifted).
 const pts=[]
 for(const [s] of SIDES){
  const f=ctx.feet[s];if(f.lift>.005)continue
  const half=.045*ctx.k,toeTip=f.toeJoint.clone().addScaledVector(f.forward,.06*ctx.k),heel=f.ground.clone().addScaledVector(f.forward,-.05*ctx.k)
  const back=f.heel>8*DEG?f.toeJoint.clone().addScaledVector(f.forward,-.02*ctx.k):heel
  for(const c of [toeTip,back])for(const sgn of [-1,1]){const p=c.clone().addScaledVector(f.lateral,sgn*half);pts.push({x:p.x,y:p.z})}
 }
 const poly=hull(pts),comMargin=poly.length>=3?signedDistanceToPolygon({x:com.x,y:com.z},poly):null
 // Hand clearance against torso/pelvis/thigh skin volumes (fingers excluded from contact).
 const handClearance={}
 for(const [s] of SIDES){
  if(!ctx.armMetrics[s]){handClearance[s]=null;continue}
  const hand=b[s+'Hand'],palm=info.hands[s].points.palmCenter.clone().multiplyScalar(ctx.scale).applyQuaternion(worldQuaternionOf(hand,new Quaternion()).multiply(rig.restRotations.get(hand).clone().invert()).multiply(rig.restBasis).multiply(info.hands[s].rest)).add(P(hand))
  const probes=[['wrist',P(hand)],['palm',palm],['forearm',mid(b[s+'LowerArm'],hand)],['elbow',P(b[s+'LowerArm'])]]
  handClearance[s]=Object.fromEntries(probes.map(([name,p])=>{const r=minClearance(p,ctx.colliders);return [name,{mm:Number.isFinite(r.distance)?r.distance*1000:null,against:r.key}]}))
 }
 // Two-hand contact: distance between the targeted contact points actually reached.
 const contact={}
 for(const [s] of SIDES){const t=ctx.handTargets[s];if(!t?.point)continue;const hand=b[s+'Hand'];contact[s+'TargetErrorMm']=P(hand).distanceTo(t.wrist)*1000}
 const handFrameErrorDeg={}
 for(const [s] of SIDES){const t=ctx.handTargets[s];if(!t)continue;const now=worldQuaternionOf(b[s+'Hand'],new Quaternion()).multiply(rig.restRotations.get(b[s+'Hand']).clone().invert()).multiply(rig.restBasis).multiply(info.hands[s].rest);handFrameErrorDeg[s]=now.angleTo(t.hand)/DEG}
 const headQ=worldQuaternionOf(b.head,new Quaternion())
 const chestQ=worldQuaternionOf(info.torso.at(-1)??b.hips,new Quaternion()).multiply(rig.restRotations.get(info.torso.at(-1)??b.hips).clone().invert()).multiply(rig.restBasis)
 const headA=headQ.clone().multiply(rig.restRotations.get(b.head).clone().invert()).multiply(rig.restBasis)
 const chestFwd=new Vector3(0,0,1).applyQuaternion(chestQ),headFwd=new Vector3(0,0,1).applyQuaternion(headA)
 const pelvisFwd=new Vector3(0,0,1).applyQuaternion(worldQuaternionOf(b.hips,new Quaternion()).multiply(rig.restRotations.get(b.hips).clone().invert()).multiply(rig.restBasis))
 const bodyFwd=new Vector3(0,0,1).applyQuaternion(ctx.heading)
 return {
  weight:ctx.weight,scale:ctx.scale,bodyUnit:ctx.k,headMode:ctx.headMode,
  hipsWorld:P(b.hips).toArray(),headWorld:P(b.head).toArray(),
  pelvisHeightM:P(b.hips).y-ctx.groundY,pelvisAutoDropMm:ctx.pelvisDropM*1000,
  headRotationErrorDeg:ctx.headMode==='host'?headQ.angleTo(ctx.hostHead.q)/DEG:null,
  neckTwistDeg:signedAngle(chestFwd.clone().setY(0),headFwd.clone().setY(0),UP)/DEG,
  chestYawDeg:signedAngle(bodyFwd,chestFwd.clone().setY(0),UP)/DEG,pelvisYawDeg:signedAngle(bodyFwd,pelvisFwd.clone().setY(0),UP)/DEG,
  chestPitchDeg:Math.asin(clamp(new Vector3(0,1,0).applyQuaternion(chestQ).dot(bodyFwd),-1,1))/DEG,
  com:com.toArray(),comMarginMm:comMargin==null?null:comMargin*1000,groundY:ctx.groundY,supportPolygon:poly.map(p=>[p.x,ctx.groundY,p.y]),
  legs:ctx.legMetrics,arms:ctx.armMetrics,fingers:ctx.fingerMetrics,handClearance,contact,handFrameErrorDeg,
  handTargets:Object.fromEntries(Object.entries(ctx.handTargets).map(([s,t])=>[s,{wrist:t.wrist.toArray(),point:t.point?.toArray()??null}])),
 }
}
