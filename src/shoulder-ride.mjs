import {Matrix4,Quaternion,Vector3} from 'three'
import {applyStandingPose} from './standing.mjs'

const sides=['left','right'],up=new Vector3(0,1,0),point=b=>b.getWorldPosition(new Vector3())
function coordinate(value,label){
 const result=value?.isVector3?value.clone():Array.isArray(value)&&value.length===3?new Vector3(...value):null
 if(!result||!result.toArray().every(Number.isFinite))throw new TypeError('Invalid carrier anchor: '+label)
 return result
}
const safe=(value,fallback,min,max)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback
function worldRotation(bone,q){const parent=bone.parent?.getWorldQuaternion(new Quaternion())??new Quaternion();bone.quaternion.copy(parent.invert().multiply(q));bone.updateWorldMatrix(true,true)}
function translate(bone,delta){const target=point(bone).add(delta);bone.position.copy(bone.parent?bone.parent.worldToLocal(target):target);bone.updateWorldMatrix(true,true)}
function aim(bone,child,target){const start=point(bone),from=point(child).sub(start).normalize(),to=target.clone().sub(start).normalize();worldRotation(bone,new Quaternion().setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(new Quaternion())))}
function segmentFrame(direction,lateral){const y=direction.clone().normalize(),x=lateral.clone().addScaledVector(y,-lateral.dot(y)).normalize();return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,new Vector3().crossVectors(x,y)))}
function alignLeg(rig,role,direction,lateral){const rest=rig.legFrames[role];worldRotation(rig.bones[role],segmentFrame(direction,lateral).multiply(rest.frame.clone().invert()).multiply(rest.rotation))}
function solveArm(upper,lower,hand,target,pole){
 const start=point(upper),l1=start.distanceTo(point(lower)),l2=point(lower).distanceTo(point(hand)),dir=target.clone().sub(start)
 const distance=Math.max(Math.abs(l1-l2)+1e-6,Math.min(dir.length(),l1+l2-1e-6));if(dir.lengthSq()<1e-12)dir.set(0,-1,0);else dir.normalize()
 const along=(l1*l1+distance*distance-l2*l2)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along)),bend=pole.clone().sub(start);bend.addScaledVector(dir,-bend.dot(dir))
 if(bend.lengthSq()<1e-10){bend.set(0,0,1);bend.addScaledVector(dir,-bend.dot(dir));if(bend.lengthSq()<1e-10)bend.set(1,0,0)}bend.normalize()
 aim(upper,lower,start.clone().addScaledVector(dir,along).addScaledVector(bend,height));aim(lower,hand,start.clone().addScaledVector(dir,distance))
}
function lengths(b){return sides.flatMap(s=>[[s+'UpperLeg',s+'LowerLeg'],[s+'LowerLeg',s+'Foot'],[s+'UpperArm',s+'LowerArm'],[s+'LowerArm',s+'Hand']]).map(([a,z])=>point(b[a]).distanceTo(point(b[z])))}
function distanceToSegment(p,a,z){const delta=z.clone().sub(a),t=Math.max(0,Math.min(1,p.clone().sub(a).dot(delta)/Math.max(1e-12,delta.lengthSq())));return p.distanceTo(a.clone().addScaledVector(delta,t))}
function headProxies(b,head,carrierScale,passengerScale,lateral,forward){
 // Authored-fixture-size proxies, not sampled avatar collision geometry.
 // A negative box separation signals a possible head/torso overlap.
 const center=head.clone().addScaledVector(up,.085*carrierScale),hip=point(b.hips),top=point(b.neck??b.head),relative=center.clone().sub(hip)
 const halfX=.17*passengerScale,halfZ=.105*passengerScale,minY=-.095*passengerScale,maxY=top.y-hip.y+.05*passengerScale
 const verticalSeparation=Math.max(center.y-.13*carrierScale-(hip.y+maxY),hip.y+minY-(center.y+.13*carrierScale))
 const separations=[Math.abs(relative.dot(lateral))-halfX-.11*carrierScale,verticalSeparation,Math.abs(relative.dot(forward))-halfZ-.12*carrierScale]
 const torso=Math.max(...separations)*1000,thigh=Math.min(...sides.map(s=>distanceToSegment(center,point(b[s+'UpperLeg']),point(b[s+'LowerLeg']))-.16*carrierScale-.075*passengerScale))*1000
 return {headTorsoProxyClearanceMm:torso,headThighProxyClearanceMm:thigh,proxyWarning:Math.min(torso,thigh)<0?'possible-head-body-overlap':null}
}
function legTorsoProxies(b,shoulderCenter,carrierScale,passengerScale,lateral,forward){
 // Conservative local boxes bound each calf segment and each foot. They can
 // warn on a false positive, and never establish sampled-mesh nonintersection.
 const local=p=>{const d=p.clone().sub(shoulderCenter);return [d.dot(lateral),d.y,d.dot(forward)]},torsoMin=[-.17*carrierScale,-.55*carrierScale,-.11*carrierScale],torsoMax=[.17*carrierScale,.08*carrierScale,.11*carrierScale]
 const separation=(min,max)=>Math.max(...min.map((v,i)=>Math.max(v-torsoMax[i],torsoMin[i]-max[i])))*1000
 const shin=s=>{const a=local(point(b[s+'LowerLeg'])),z=local(point(b[s+'Foot'])),r=.055*passengerScale;return separation(a.map((v,i)=>Math.min(v,z[i])-r),a.map((v,i)=>Math.max(v,z[i])+r))}
 const foot=s=>{const center=local(point(b[s+'Foot']).addScaledVector(forward,.075*passengerScale).addScaledVector(up,-.025*passengerScale)),half=[.06,.065,.135].map(v=>v*passengerScale);return separation(center.map((v,i)=>v-half[i]),center.map((v,i)=>v+half[i]))}
 return {shinTorsoProxyClearanceMm:Math.min(...sides.map(shin)),footTorsoProxyClearanceMm:Math.min(...sides.map(foot))}
}

/** Local render experiment only. Carrier input is read-only world points.
 * support moves the rendered head, never a camera. head preserves the host head
 * and reports the support miss rather than claiming both constraints are met.
 */
export function applyShoulderRidePose(rig,options={}){
 const {carrierAnchors,preserveHands=false,anchorMode='support'}=options
 if(!['support','head'].includes(anchorMode))throw new TypeError('Unknown shoulder anchor mode')
 const anchors=Object.fromEntries(['leftShoulder','rightShoulder','head'].map(k=>[k,coordinate(carrierAnchors?.[k],k)]))
 const shoulderCenter=anchors.leftShoulder.clone().add(anchors.rightShoulder).multiplyScalar(.5),carrierWidth=anchors.leftShoulder.distanceTo(anchors.rightShoulder),carrierScale=Math.max(.1,carrierWidth/.4,Math.abs(anchors.head.y-shoulderCenter.y)/.16)
 const carrierLateral=anchors.leftShoulder.clone().sub(anchors.rightShoulder);carrierLateral.y=0
 if(carrierLateral.lengthSq()<1e-10)throw new TypeError('Carrier shoulders must be distinct horizontally')
 carrierLateral.normalize();const carrierForward=new Vector3().crossVectors(carrierLateral,up).normalize(),inferred=Math.atan2(carrierForward.x,carrierForward.z)
 const heading=safe(options.heading,inferred,-Math.PI*100,Math.PI*100),yaw=new Quaternion().setFromAxisAngle(up,heading),lateral=new Vector3(1,0,0).applyQuaternion(yaw),forward=new Vector3(0,0,1).applyQuaternion(yaw)
 const b=rig.bones,originalHead=point(b.head),originalHeadQ=b.head.getWorldQuaternion(new Quaternion()),beforeLengths=lengths(b)
 const hands=preserveHands?Object.fromEntries(sides.map(s=>[s,{p:point(b[s+'Hand']),q:b[s+'Hand'].getWorldQuaternion(new Quaternion()),pole:point(b[s+'LowerArm'])}])):null
 applyStandingPose(rig,{heading,preserveHands:false})
 const scale=point(b.head).distanceTo(point(b.hips))/.64,automaticSpread=Math.max(1,Math.min(1.8,carrierScale/scale)),spread=safe(options.spread,automaticSpread,.45,1.8),seatLift=safe(options.seatLift,.10*scale,-.10*scale,.35*scale),seatBack=safe(options.seatBack,.20*Math.max(scale,carrierScale),0,.45*Math.max(scale,carrierScale))
 const supportTarget=shoulderCenter.clone().addScaledVector(up,seatLift).addScaledVector(forward,-seatBack)
 translate(b.hips,supportTarget.clone().sub(point(b.hips)))
 for(const [sign,s]of [[1,'left'],[-1,'right']]){
  // Straddle the neck with thighs forward/outward and calves below knees.
  // Direction targets retain exact limb lengths instead of stretching to fit.
  const thigh=forward.clone().multiplyScalar(.88).addScaledVector(lateral,sign*.42*spread).addScaledVector(up,-.20).normalize(),calf=up.clone().negate().addScaledVector(forward,.12).addScaledVector(lateral,sign*.08*spread).normalize()
  alignLeg(rig,s+'UpperLeg',thigh,lateral);alignLeg(rig,s+'LowerLeg',calf,lateral)
  worldRotation(b[s+'Foot'],yaw.clone().multiply(rig.restBasis.clone().invert()).multiply(rig.footRotations[s]))
 }
 if(anchorMode==='head')translate(b.hips,originalHead.clone().sub(point(b.head)))
 worldRotation(b.head,originalHeadQ)
 for(const [sign,s]of [[1,'left'],[-1,'right']]){
  const shoulder=point(b[s+'UpperArm']),armLength=shoulder.distanceTo(point(b[s+'LowerArm']))+point(b[s+'LowerArm']).distanceTo(point(b[s+'Hand']))
  const target=hands?.[s].p??shoulder.clone().addScaledVector(up,-armLength*.82).addScaledVector(lateral,sign*.06*scale).addScaledVector(forward,.12*scale),pole=hands?.[s].pole??shoulder.clone().addScaledVector(lateral,sign*.30*scale).addScaledVector(forward,.15*scale).addScaledVector(up,-.15*scale)
  solveArm(b[s+'UpperArm'],b[s+'LowerArm'],b[s+'Hand'],target,pole)
  if(hands)worldRotation(b[s+'Hand'],hands[s].q)
 }
 rig.skeleton.update()
 const afterLengths=lengths(b),knee=s=>180-point(b[s+'UpperLeg']).sub(point(b[s+'LowerLeg'])).angleTo(point(b[s+'Foot']).sub(point(b[s+'LowerLeg'])))*180/Math.PI
 const headProxy=headProxies(b,anchors.head,carrierScale,scale,lateral,forward),legProxy=legTorsoProxies(b,shoulderCenter,carrierScale,scale,lateral,forward),bodyProxyWarnings=[]
 if(headProxy.proxyWarning)bodyProxyWarnings.push(headProxy.proxyWarning)
 if(legProxy.shinTorsoProxyClearanceMm<0)bodyProxyWarnings.push('possible-shin-torso-overlap')
 if(legProxy.footTorsoProxyClearanceMm<0)bodyProxyWarnings.push('possible-foot-torso-overlap')
 const bodyProxyClearanceMm=Math.min(headProxy.headTorsoProxyClearanceMm,headProxy.headThighProxyClearanceMm,legProxy.shinTorsoProxyClearanceMm,legProxy.footTorsoProxyClearanceMm)
 return {headWorld:point(b.head).toArray(),feetWorld:sides.map(s=>point(b[s+'Foot']).toArray()),headDriftMm:point(b.head).distanceTo(originalHead)*1000,headRotationErrorDegrees:b.head.getWorldQuaternion(new Quaternion()).angleTo(originalHeadQ)*180/Math.PI,handPositionErrorMm:hands?Math.max(...sides.map(s=>point(b[s+'Hand']).distanceTo(hands[s].p)*1000)):null,handRotationErrorDegrees:hands?Math.max(...sides.map(s=>b[s+'Hand'].getWorldQuaternion(new Quaternion()).angleTo(hands[s].q)*180/Math.PI)):null,knees:sides.map(knee),upright:point(b.head).sub(point(b.hips)).normalize().dot(up),anchorMode,supportTargetWorld:supportTarget.toArray(),hipsWorld:point(b.hips).toArray(),kneesWorld:sides.map(s=>point(b[s+'LowerLeg']).toArray()),supportErrorMm:point(b.hips).distanceTo(supportTarget)*1000,carrierHeadHipDistanceM:point(b.hips).distanceTo(anchors.head),kneeLateralGapM:point(b.leftLowerLeg).sub(point(b.rightLowerLeg)).dot(lateral),maxLimbLengthErrorMm:Math.max(...afterLengths.map((v,i)=>Math.abs(v-beforeLengths[i])*1000)),scale,carrierScale,heading,seatLift,seatBack,spread,automaticSpread,...headProxy,...legProxy,bodyProxyClearanceMm,bodyProxyWarnings}
}

/** Explicit carrier pose for the local two-avatar experiment. Hands target the
 * passenger's shins; unreachable targets remain errors without bone stretching.
 */
export function applyShoulderCarrierPose(rig,{heading=0,shinTargets}={}){
 const targets=Object.fromEntries(sides.map(s=>[s,coordinate(shinTargets?.[s],s+' shin')])),b=rig.bones,before=lengths(b),yaw=new Quaternion().setFromAxisAngle(up,safe(heading,0,-Math.PI*100,Math.PI*100)),lateral=new Vector3(1,0,0).applyQuaternion(yaw),forward=new Vector3(0,0,1).applyQuaternion(yaw)
 const metrics=applyStandingPose(rig,{heading:safe(heading,0,-Math.PI*100,Math.PI*100),preserveHands:false}),scale=point(b.head).distanceTo(point(b.hips))/.64
 for(const [sign,s]of [[1,'left'],[-1,'right']]){const shoulder=point(b[s+'UpperArm']),pole=shoulder.clone().addScaledVector(lateral,sign*.35*scale).addScaledVector(forward,.30*scale).addScaledVector(up,-.10*scale);solveArm(b[s+'UpperArm'],b[s+'LowerArm'],b[s+'Hand'],targets[s],pole)}
 rig.skeleton.update();const after=lengths(b),handTargetErrorsMm=sides.map(s=>point(b[s+'Hand']).distanceTo(targets[s])*1000)
 return {...metrics,handsWorld:sides.map(s=>point(b[s+'Hand']).toArray()),handTargetErrorsMm,handTargetErrorMm:Math.max(...handTargetErrorsMm),maxLimbLengthErrorMm:Math.max(...after.map((v,i)=>Math.abs(v-before[i])*1000))}
}
