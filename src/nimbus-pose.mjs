import {Matrix4,Quaternion,Vector3} from 'three'
import {applyStandingPose} from './standing.mjs'
import {captureBones,restoreBones} from './vendor/render-pose.mjs'

const point=bone=>bone.getWorldPosition(new Vector3())
const safe=(value,fallback,min,max)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback
const sides=[[1,'left'],[-1,'right']]
function worldRotation(bone,q){const parent=bone.parent?.getWorldQuaternion(new Quaternion())??new Quaternion();bone.quaternion.copy(parent.invert().multiply(q));bone.updateWorldMatrix(true,true)}
function segmentFrame(direction,lateral){
 const y=direction.clone().normalize(),x=lateral.clone().addScaledVector(y,-lateral.dot(y))
 if(x.lengthSq()<1e-10){x.set(0,0,1);x.addScaledVector(y,-x.dot(y));if(x.lengthSq()<1e-10){x.set(1,0,0);x.addScaledVector(y,-x.dot(y))}}
 x.normalize();return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,new Vector3().crossVectors(x,y)))
}

function supportQuaternion(value){
 const q=value?.isQuaternion?value.clone():Array.isArray(value)&&value.length===4?new Quaternion(...value):null
 if(!q||!q.toArray().every(Number.isFinite)||q.lengthSq()<1e-12)throw new TypeError('Nimbus support quaternion must be finite and nonzero')
 return q.normalize()
}
function measureWorldSupport(rig,result,origin,q,source){
 const normal=up.clone().applyQuaternion(q),right=new Vector3(1,0,0).applyQuaternion(q),forward=new Vector3(0,0,1).applyQuaternion(q),headUp=up.clone().applyQuaternion(anatomical(rig,'head'))
 const bodyUp=point(rig.bones.head).sub(point(rig.bones.hips)).normalize();result.upright=bodyUp.dot(up);result.uprightSupport=bodyUp.dot(normal)
 result.supportFrame={source,originWorld:origin.toArray(),normalWorld:normal.toArray(),rightWorld:right.toArray(),forwardWorld:forward.toArray(),quaternion:q.toArray()}
 result.supportNormalWorld=normal.toArray();result.headAnatomicalUpWorld=headUp.toArray();result.headUpDotWorld=headUp.dot(up)
 result.feetSupport=sides.map(([,side])=>{
  const normalFoot=up.clone().applyQuaternion(anatomical(rig,side+'Foot')),height=point(rig.bones[side+'Foot']).sub(origin).dot(normal)
  return {side,source:'bind-foot-normal-proxy',soleNormalWorld:normalFoot.toArray(),soleNormalErrorDegrees:degrees(normalFoot.angleTo(normal)),ankleSignedHeightM:height,soleProxyGapM:height-result.supportSoleOffsetM}
 })
 result.footSoleNormalErrorDegrees=result.feetSupport.map(foot=>foot.soleNormalErrorDegrees)
 if(result.ankleNormalHeightSpreadMm===undefined)result.ankleNormalHeightSpreadMm=Math.abs(result.feetSupport[0].ankleSignedHeightM-result.feetSupport[1].ankleSignedHeightM)*1000
 result.bodyBalance.headNeckAngleDegrees=degrees(anatomical(rig,'head').angleTo(anatomical(rig,rig.bones.neck?'neck':rig.bones.chest?'chest':rig.bones.spine?'spine':'hips')))
 result.bodyBalance.pelvisWorldUpDot=up.clone().applyQuaternion(anatomical(rig,'hips')).dot(up);result.bodyBalance.chestWorldUpDot=up.clone().applyQuaternion(anatomical(rig,rig.bones.chest?'chest':rig.bones.spine?'spine':'hips')).dot(up)
 return result
}

/** With a support frame, solve in its orthonormal coordinates then restore every world output. */
export function applyNimbusPose(rig,options={}){
 if(!options.supportFrame){
  const result=applyNimbusPoseInFrame(rig,options),origin=new Vector3(0,result.contactPlaneY,0),q=new Quaternion().setFromAxisAngle(up,result.cloudHeading)
  return measureWorldSupport(rig,result,origin,q,'legacy-horizontal-world-projection')
 }
 const origin=coordinate(options.supportFrame.position),q=supportQuaternion(options.supportFrame.quaternion),inverse=q.clone().invert(),localPoint=value=>coordinate(value).sub(origin).applyQuaternion(inverse),worldPoint=value=>new Vector3().fromArray(value).applyQuaternion(q).add(origin).toArray(),worldDirection=value=>new Vector3().fromArray(value).applyQuaternion(q).toArray()
 const snapshot=captureBones(rig.skeleton),originalHead=point(rig.bones.head),originalHeadQ=rig.bones.head.getWorldQuaternion(new Quaternion())
 try{
  const hipPosition=point(rig.bones.hips).sub(origin).applyQuaternion(inverse),hipRotation=rig.bones.hips.getWorldQuaternion(new Quaternion()).premultiply(inverse)
  worldRotation(rig.bones.hips,hipRotation);translate(rig.bones.hips,hipPosition.sub(point(rig.bones.hips)))
  const localTargets=options.footTargetsWorld?.map(localPoint),result=applyNimbusPoseInFrame(rig,{...options,heading:0,footTargetsWorld:localTargets,supportHeight:Number.isFinite(options.supportHeight)?options.supportHeight:options.supportSoleOffsetM??0,_supportWorldUp:up.clone().applyQuaternion(inverse),_contactPlaneY:0})
  const hip=point(rig.bones.hips).applyQuaternion(q).add(origin),rotation=rig.bones.hips.getWorldQuaternion(new Quaternion()).premultiply(q)
  worldRotation(rig.bones.hips,rotation);translate(rig.bones.hips,hip.sub(point(rig.bones.hips)));rig.skeleton.update()
  result.headWorld=worldPoint(result.headWorld);result.feetWorld=result.feetWorld.map(worldPoint);result.footTargetsWorld=result.footTargetsWorld.map(worldPoint);result.bodyBalance.hipsWorld=worldPoint(result.bodyBalance.hipsWorld)
  result.headDriftMm=point(rig.bones.head).distanceTo(originalHead)*1000;result.headRotationErrorDegrees=degrees(rig.bones.head.getWorldQuaternion(new Quaternion()).angleTo(originalHeadQ))
  result.ankleNormalHeightSpreadMm=result.ankleHeightSpreadMm;result.ankleHeightSpreadMm=Math.abs(result.feetWorld[0][1]-result.feetWorld[1][1])*1000
  result.supportHeight=(result.footTargetsWorld[0][1]+result.footTargetsWorld[1][1])*.5;result.contactPlaneY=origin.y
  result.cloudHeading=yawOf(q);result.bodyHeading=yawOf(anatomical(rig,'hips'));result.bodyBalance.coordinateSpace='support-frame';result.bodyBalance.uprightBlendPolicy={pelvis:.30,chest:.65,neck:.85}
  if(result.armBalance)for(const arm of result.armBalance){
   for(const key of ['shoulderWorld','elbowWorld','handWorld'])arm[key]=worldPoint(arm[key])
   for(const key of ['palmNormalWorld','fingerDirectionWorld'])arm[key]=worldDirection(arm[key])
   arm.palmSupportDownDot=arm.palmDownDot;arm.palmDownDot=-arm.palmNormalWorld[1];arm.handBelowShoulderM=arm.shoulderWorld[1]-arm.handWorld[1];arm.elbowAboveHandM=arm.elbowWorld[1]-arm.handWorld[1]
  }
  const proxy=result.balanceProxy
  for(const key of ['centerOfMassWorld','targetCenterOfMassWorld'])proxy[key]=worldPoint(proxy[key])
  if(proxy.zeroMomentPointWorld)proxy.zeroMomentPointWorld=worldPoint(proxy.zeroMomentPointWorld)
  proxy.footHullWorld=proxy.footHull2D.map(([x,z])=>worldPoint([x,0,z]));proxy.coordinateSpace='support-frame';proxy.contactPlaneY=origin.y
  return measureWorldSupport(rig,result,origin,q,'explicit-support-frame')
 }catch(error){restoreBones(snapshot);rig.skeleton.update();throw error}
}
function alignSegment(rig,role,direction,lateral){const rest=rig.legFrames[role];worldRotation(rig.bones[role],segmentFrame(direction,lateral).multiply(rest.frame.clone().invert()).multiply(rest.rotation))}
const armReferences=new WeakMap()
function armReference(rig,side){
 let references=armReferences.get(rig);if(!references){references={};armReferences.set(rig,references)}
 if(references[side])return references[side]
 const restPoint=bone=>new Vector3().setFromMatrixPosition(rig.restWorld.get(bone)),forward=new Vector3(0,0,1).applyQuaternion(rig.restBasis),down=new Vector3(0,-1,0).applyQuaternion(rig.restBasis),hand=rig.bones[side+'Hand'],origin=restPoint(hand)
 const fingers=hand.children.filter(bone=>bone.isBone&&rig.restWorld.has(bone)).map(bone=>restPoint(bone).sub(origin)).filter(v=>v.lengthSq()>1e-10)
 let palm=down.clone(),finger=origin.clone().sub(restPoint(rig.bones[side+'LowerArm'])).normalize(),palmReferenceSource='body-bind-fallback',largest=0
 for(let a=0;a<fingers.length;a++)for(let z=a+1;z<fingers.length;z++){
  const candidate=new Vector3().crossVectors(fingers[a],fingers[z]),area=candidate.lengthSq()
  if(area>largest){largest=area;palm.copy(candidate.normalize())}
 }
 if(largest>1e-12){
  if(palm.dot(down)<0)palm.negate()
  finger=fingers.reduce((sum,p)=>sum.add(p),new Vector3()).normalize();palmReferenceSource='finger-roots'
 }
 const frames={}
 for(const [role,child]of [[side+'UpperArm',side+'LowerArm'],[side+'LowerArm',side+'Hand']])frames[role]=segmentFrame(restPoint(rig.bones[child]).sub(restPoint(rig.bones[role])),forward)
 return references[side]={frames,palm,finger,handFrame:segmentFrame(finger,palm),forearmFrame:segmentFrame(origin.clone().sub(restPoint(rig.bones[side+'LowerArm'])),palm),lowerToHand:rig.restRotations.get(rig.bones[side+'LowerArm']).clone().invert().multiply(rig.restRotations.get(hand)),palmReferenceSource}
}
function alignArm(rig,role,direction,normal,reference){worldRotation(rig.bones[role],segmentFrame(direction,normal).multiply(reference.frames[role].clone().invert()).multiply(rig.restRotations.get(rig.bones[role])))}
function aim(bone,child,target){const start=point(bone),from=point(child).sub(start),to=target.clone().sub(start);if(from.lengthSq()<1e-12||to.lengthSq()<1e-12)return;worldRotation(bone,new Quaternion().setFromUnitVectors(from.normalize(),to.normalize()).multiply(bone.getWorldQuaternion(new Quaternion())))}
function solve(upper,lower,end,target,pole,applyUpper,applyLower){
 const start=point(upper),l1=start.distanceTo(point(lower)),l2=point(lower).distanceTo(point(end)),direction=target.clone().sub(start),epsilon=Math.min(l1,l2)*1e-5
 if(l1<1e-8||l2<1e-8)throw new Error('Nimbus requires nonzero limb lengths')
 const distance=Math.max(Math.abs(l1-l2)+epsilon,Math.min(direction.length(),l1+l2-epsilon))
 if(direction.lengthSq()<1e-12)direction.set(0,-1,0);else direction.normalize()
 const along=(l1*l1+distance*distance-l2*l2)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along)),side=pole.clone().sub(start)
 side.addScaledVector(direction,-side.dot(direction));if(side.lengthSq()<1e-10){side.set(0,0,1);side.addScaledVector(direction,-side.dot(direction));if(side.lengthSq()<1e-10){side.set(1,0,0);side.addScaledVector(direction,-side.dot(direction))}}side.normalize()
 const middle=start.clone().addScaledVector(direction,along).addScaledVector(side,height),endpoint=start.clone().addScaledVector(direction,distance)
 applyUpper?applyUpper(middle.clone().sub(start)):aim(upper,lower,middle)
 applyLower?applyLower(endpoint.clone().sub(point(lower))):aim(lower,end,endpoint)
 return [l1,l2]
}
const up=new Vector3(0,1,0)
const rad=degrees=>degrees*Math.PI/180
const degrees=radians=>radians*180/Math.PI
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle))
function translate(bone,delta){const p=point(bone).add(delta);bone.position.copy(bone.parent?bone.parent.worldToLocal(p):p);bone.updateWorldMatrix(true,true)}
function coordinate(value){const v=value?.isVector3?value.clone():Array.isArray(value)&&value.length===3?new Vector3(...value):null;if(!v||!v.toArray().every(Number.isFinite))throw new TypeError('Nimbus foot targets must be finite world points');return v}
function anatomical(rig,role){const bone=rig.bones[role];return bone.getWorldQuaternion(new Quaternion()).multiply(rig.restRotations.get(bone).clone().invert()).multiply(rig.restBasis)}
function setAnatomical(rig,role,q){const bone=rig.bones[role];if(bone&&rig.restRotations.has(bone))worldRotation(bone,q.clone().multiply(rig.restBasis.clone().invert()).multiply(rig.restRotations.get(bone)))}
function yawOf(q,fallback=0){const forward=new Vector3(0,0,1).applyQuaternion(q);return Math.hypot(forward.x,forward.z)>1e-6?Math.atan2(forward.x,forward.z):fallback}
function pitchOf(q){const bodyUp=up.clone().applyQuaternion(q),forward=new Vector3(0,0,1).applyAxisAngle(up,yawOf(q));return Math.atan2(bodyUp.dot(forward),bodyUp.y)}
function poseArms(rig,{preserveHands,hands,lateral,forward}){
 const b=rig.bones,armBalance=preserveHands?null:[]
 for(const [sign,side]of sides){
  const upper=b[side+'UpperArm'],lower=b[side+'LowerArm'],hand=b[side+'Hand'],shoulder=point(upper),length=shoulder.distanceTo(point(lower))+point(lower).distanceTo(point(hand))
  if(preserveHands){solve(upper,lower,hand,hands[side].p,hands[side].pole);worldRotation(hand,hands[side].q);continue}
  const trailing=side==='left',target=shoulder.clone().addScaledVector(lateral,sign*length*.80).addScaledVector(forward,length*(trailing?-.18:.14)).addScaledVector(up,-length*(trailing?.30:.48))
  const pole=shoulder.clone().addScaledVector(lateral,sign*length*.45).addScaledVector(forward,-length*.5).addScaledVector(up,-length*(trailing?.10:.16)),reference=armReference(rig,side)
  let normal=forward.clone()
  const before=solve(upper,lower,hand,target,pole,d=>{const lowerDirection=target.clone().sub(shoulder).sub(d);normal.crossVectors(d,lowerDirection).multiplyScalar(-sign).normalize();alignArm(rig,side+'UpperArm',d,normal,reference)},d=>worldRotation(lower,segmentFrame(d,new Vector3(0,-1,0)).multiply(reference.forearmFrame.clone().invert()).multiply(rig.restRotations.get(lower))))
  const elbow=point(lower),wrist=point(hand),finger=wrist.clone().sub(elbow).normalize(),handRotation=segmentFrame(finger,new Vector3(0,-1,0)).multiply(reference.handFrame.clone().invert()).multiply(rig.restRotations.get(hand))
  worldRotation(hand,handRotation)
  const delta=handRotation.clone().multiply(rig.restRotations.get(hand).clone().invert()),actualPalm=reference.palm.clone().applyQuaternion(delta),actualFinger=reference.finger.clone().applyQuaternion(delta),armError=Math.max(Math.abs(shoulder.distanceTo(elbow)-before[0]),Math.abs(elbow.distanceTo(wrist)-before[1])),neutralHand=lower.getWorldQuaternion(new Quaternion()).multiply(reference.lowerToHand)
  armBalance.push({side,shoulderWorld:shoulder.toArray(),elbowWorld:elbow.toArray(),handWorld:wrist.toArray(),palmNormalWorld:actualPalm.toArray(),fingerDirectionWorld:actualFinger.toArray(),elbowFlexionDegrees:180-degrees(shoulder.clone().sub(elbow).angleTo(wrist.clone().sub(elbow))),palmDownDot:actualPalm.dot(up.clone().negate()),wristBendDegrees:degrees(actualFinger.angleTo(finger)),wristBindDeviationDegrees:degrees(handRotation.angleTo(neutralHand)),handBelowShoulderM:shoulder.y-wrist.y,elbowAboveHandM:elbow.y-wrist.y,boneLengthErrorMm:armError*1000,palmReferenceSource:reference.palmReferenceSource})
 }
 return armBalance
}
function centerOfMassProxy(b){
 const sum=new Vector3(),mid=(a,z)=>point(b[a]).add(point(b[z])).multiplyScalar(.5),add=(p,m)=>sum.addScaledVector(p,m)
 add(point(b.hips),.20);add(mid('hips',b.neck?'neck':'head'),.30);add(point(b.head),.08)
 for(const [,side]of sides){add(mid(side+'UpperArm',side+'LowerArm'),.03);add(mid(side+'LowerArm',side+'Hand'),.02);add(mid(side+'UpperLeg',side+'LowerLeg'),.09);add(mid(side+'LowerLeg',side+'Foot'),.06);add(point(b[side+'Foot']),.01)}
 return sum
}
function supportHull(targets,footForward,footLateral,legLength,travelForward,travelRight){
 const points=[]
 for(const target of targets)for(const x of [-1,1])for(const z of [-1,1]){const p=target.clone().addScaledVector(footLateral,x*legLength*.065).addScaledVector(footForward,z*legLength*.14);points.push([p.dot(travelRight),p.dot(travelForward)])}
 points.sort((a,z)=>a[0]-z[0]||a[1]-z[1]);const cross=(a,z,c)=>(z[0]-a[0])*(c[1]-a[1])-(z[1]-a[1])*(c[0]-a[0]),lower=[],upper=[]
 for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p)}
 for(const p of [...points].reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p)}
 return lower.slice(0,-1).concat(upper.slice(0,-1))
}
function hullMargin(hull,p){return Math.min(...hull.map((a,i)=>{const z=hull[(i+1)%hull.length],dx=z[0]-a[0],dy=z[1]-a[1];return (dx*(p[1]-a[1])-dy*(p[0]-a[0]))/Math.max(1e-9,Math.hypot(dx,dy))}))}

/** Oblique surf stance. Head keeps its world orientation; support mode moves its position. */
function applyNimbusPoseInFrame(rig,{heading=0,stanceWidth=1,crouch=.45,preserveHands=false,pitch=0,roll=0,supportHeight,supportSoleOffsetM=0,maxKneeDegrees=100,anchorMode='head',footTargetsWorld,balance={},_supportWorldUp=null,_contactPlaneY=null}={}){
 if(!['head','support'].includes(anchorMode))throw new TypeError('Unknown Nimbus anchor mode')
 if(footTargetsWorld&&(!Array.isArray(footTargetsWorld)||footTargetsWorld.length!==2))throw new TypeError('Nimbus needs exactly two foot targets')
 const explicit=footTargetsWorld?footTargetsWorld.map(coordinate):null,b=rig.bones,originalHead=point(b.head),originalHeadQ=b.head.getWorldQuaternion(new Quaternion()),hands=preserveHands?Object.fromEntries(sides.map(([,side])=>[side,{p:point(b[side+'Hand']),q:b[side+'Hand'].getWorldQuaternion(new Quaternion()),pole:point(b[side+'LowerArm'])}])):null
 const verticalAcceleration=Number.isFinite(balance.verticalAcceleration)?balance.verticalAcceleration:0,effectiveGravityMps2=Number.isFinite(balance.effectiveGravityMps2)?balance.effectiveGravityMps2:9.81+verticalAcceleration,normalLoadRatio=Number.isFinite(balance.normalLoadRatio)?balance.normalLoadRatio:effectiveGravityMps2/9.81
 const supportState=['supported','low-load','adhesion'].includes(balance.supportState)?balance.supportState:normalLoadRatio<0?'adhesion':normalLoadRatio<.15?'low-load':'supported'
 const zmpValid=supportState==='supported'&&effectiveGravityMps2>1e-4&&normalLoadRatio>0&&balance.zmpValid!==false,zmpInvalidReason=zmpValid?null:typeof balance.zmpInvalidReason==='string'&&balance.zmpInvalidReason?balance.zmpInvalidReason:supportState==='adhesion'?'adhesion-support-mode':supportState==='low-load'?'low-normal-load':effectiveGravityMps2<=1e-4||normalLoadRatio<=0?'nonpositive-effective-gravity':'caller-invalidated-zmp'
 const baseCrouch=safe(balance.crouch,safe(crouch,.45,0,1),0,1),verticalCompression=safe(balance.verticalCompression,0,-.20,.25)
 const cloudHeading=safe(heading,0,-Math.PI*1e4,Math.PI*1e4),width=safe(stanceWidth,1,.6,1.4),depth=safe(baseCrouch+verticalCompression,.45,0,1),requestedKneeDegrees=40+depth*60,footHeading=cloudHeading+rad(62),pelvisHeading=cloudHeading+rad(50),bodyHeading=pelvisHeading
 const headYaw=yawOf(anatomical(rig,'head'),cloudHeading),desiredChest=headYaw+safe(wrap(cloudHeading+rad(20)-headYaw),0,-rad(20),rad(20)),chestHeading=pelvisHeading+safe(wrap(desiredChest-pelvisHeading),0,-rad(45),rad(45)),spineHeading=pelvisHeading+wrap(chestHeading-pelvisHeading)*.55,neckHeading=chestHeading+wrap(headYaw-chestHeading)*.6
 const leanForward=safe(balance.leanForward,0,-.45,.45)+safe(pitch,0,-.3,.3),leanSide=safe(balance.leanSide,0,-.35,.35)-safe(roll,0,-.25,.25),yaw=new Quaternion().setFromAxisAngle(up,cloudHeading),travelForward=new Vector3(0,0,1).applyQuaternion(yaw),travelRight=new Vector3(1,0,0).applyQuaternion(yaw),footQ=new Quaternion().setFromAxisAngle(up,footHeading),footLateral=new Vector3(1,0,0).applyQuaternion(footQ),footForward=new Vector3(0,0,1).applyQuaternion(footQ)
 const orientation=(worldYaw,factor,flex=0,uprightBlend=0)=>{
  const result=yaw.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-leanSide*factor)).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),leanForward*factor)).multiply(new Quaternion().setFromAxisAngle(up,wrap(worldYaw-cloudHeading))).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),flex))
  if(_supportWorldUp){
   const currentUp=up.clone().applyQuaternion(result),correction=new Quaternion().setFromUnitVectors(currentUp,_supportWorldUp),platformCorrection=new Quaternion().setFromUnitVectors(up,_supportWorldUp),identity=new Quaternion(),platformAngle=identity.angleTo(platformCorrection),angle=identity.angleTo(correction)
   const platformAxis=new Vector3(platformCorrection.x,platformCorrection.y,platformCorrection.z).normalize(),axis=new Vector3(correction.x,correction.y,correction.z).normalize(),alignment=Math.max(0,platformAxis.dot(axis)),amount=angle>1e-8?Math.min(uprightBlend,platformAngle*uprightBlend*alignment/angle):0
   // Counter only the platform tilt component: a level support frame must
   // not remove the existing acceleration-driven body lean.
   result.premultiply(identity.slerp(correction,amount))
  }
  return result
 }
 applyStandingPose(rig,{heading:pelvisHeading,preserveHands:false})
 setAnatomical(rig,'hips',orientation(pelvisHeading,.45,-verticalCompression*.14,.30));setAnatomical(rig,'spine',orientation(b.chest?spineHeading:chestHeading,.7,verticalCompression*.30,.50));setAnatomical(rig,'chest',orientation(chestHeading,1,verticalCompression*.55,.65));setAnatomical(rig,'neck',orientation(neckHeading,.4,verticalCompression*.12,.85));worldRotation(b.head,originalHeadQ)
 if(anchorMode==='head')translate(b.hips,originalHead.clone().sub(point(b.head)))
 const lengths=sides.map(([,side])=>[point(b[side+'UpperLeg']).distanceTo(point(b[side+'LowerLeg'])),point(b[side+'LowerLeg']).distanceTo(point(b[side+'Foot']))]),legLength=lengths.reduce((sum,pair)=>sum+pair[0]+pair[1],0)/2,halfWidth=legLength*.65*width,bend=rad(requestedKneeDegrees),hips=point(b.hips)
 const generated=sides.map(([sign,side],index)=>{
  const start=point(b[side+'UpperLeg']),[l1,l2]=lengths[index],target=hips.clone().addScaledVector(footLateral,sign*halfWidth).addScaledVector(footForward,sign*legLength*.04),horizontal=target.clone().sub(start);horizontal.y=0
  const reach=Math.sqrt(l1*l1+l2*l2+2*l1*l2*Math.cos(bend)),drop=Math.sqrt(Math.max(0,reach*reach-horizontal.lengthSq()))
  return {target,naturalHeight:start.y-drop,crouchReachLimited:horizontal.length()>reach+1e-8}
 })
 const initialPlane=Number.isFinite(supportHeight)?supportHeight:Math.min(...generated.map(t=>t.naturalHeight)),targets=explicit??generated.map(({target})=>{target.y=initialPlane;return target}),anklePlane=(targets[0].y+targets[1].y)*.5,footCenter=targets[0].clone().add(targets[1]).multiplyScalar(.5),frontIndex=targets[0].dot(travelForward)>targets[1].dot(travelForward)?0:1
 const comOffset={forward:Number.isFinite(balance.centerOfMassOffset?.forward)?balance.centerOfMassOffset.forward:0,side:Number.isFinite(balance.centerOfMassOffset?.side)?balance.centerOfMassOffset.side:0},comTarget=footCenter.clone().addScaledVector(travelForward,comOffset.forward).addScaledVector(travelRight,comOffset.side)
 const loadFront=zmpValid?safe(balance.loadRatio?.front,.5,0,1):.5,requestedKnees=sides.map((_,i)=>safe(requestedKneeDegrees+(i===frontIndex?1:-1)*(loadFront-.5)*20,requestedKneeDegrees,25,115))
 const kneePolicyMax=safe(maxKneeDegrees,100,75,125)
 let armBalance=null,maxLegLengthError=0,hipBalanceLimited=false,hipPolicyConflict=false
 function hipHeightRange(){
  const hip=point(b.hips),ranges=sides.map(([,side],i)=>{
   const start=point(b[side+'UpperLeg']),[l1,l2]=lengths[i],horizontal=targets[i].clone().sub(start);horizontal.y=0
   const reach=angle=>Math.sqrt(l1*l1+l2*l2+2*l1*l2*Math.cos(rad(angle))),heightAt=distance=>targets[i].y+Math.sqrt(Math.max(0,distance*distance-horizontal.lengthSq()))-(start.y-hip.y)
   const longest=reach(8)
   return {desired:heightAt(reach(requestedKnees[i])),lower:heightAt(reach(kneePolicyMax)),upper:horizontal.length()>longest?-Infinity:heightAt(longest)}
  })
  const lower=Math.max(...ranges.map(r=>r.lower)),upper=Math.min(...ranges.map(r=>r.upper))
  return {lower,upper,desired:ranges.reduce((sum,r)=>sum+r.desired,0)/2,feasible:Number.isFinite(upper)&&lower<=upper+1e-8}
 }
 function solveBody(){
  if(anchorMode==='support'){
   const hip=point(b.hips),range=hipHeightRange();hipPolicyConflict ||= !range.feasible
   // Share the crouch between both legs. When a requested COM shift would
   // require sitting below the pose policy, keep the feet and report the miss.
   const height=range.feasible?Math.max(range.lower,Math.min(range.upper,range.desired)):Number.isFinite(range.upper)?Math.min(range.upper,range.desired):range.desired
   translate(b.hips,new Vector3(0,height-hip.y,0))
  }
  for(const [index,[sign,side]]of sides.entries()){
   const upper=b[side+'UpperLeg'],lower=b[side+'LowerLeg'],foot=b[side+'Foot'],pole=point(upper).addScaledVector(footForward,legLength).addScaledVector(footLateral,sign*legLength*.15)
   const before=solve(upper,lower,foot,targets[index],pole,d=>alignSegment(rig,side+'UpperLeg',d,footLateral),d=>alignSegment(rig,side+'LowerLeg',d,footLateral))
   const toeQ=new Quaternion().setFromAxisAngle(up,footHeading+sign*.15);worldRotation(foot,toeQ.multiply(rig.restBasis.clone().invert()).multiply(rig.footRotations[side]))
   maxLegLengthError=Math.max(maxLegLengthError,Math.abs(point(upper).distanceTo(point(lower))-before[0]),Math.abs(point(lower).distanceTo(point(foot))-before[1]))
  }
  const chestQ=anatomical(rig,b.chest?'chest':b.spine?'spine':'hips');armBalance=poseArms(rig,{preserveHands,hands,lateral:new Vector3(1,0,0).applyQuaternion(chestQ),forward:new Vector3(0,0,1).applyQuaternion(chestQ)})
 }
 if(anchorMode==='support'){
  const current=point(b.hips),desired=footCenter.clone();desired.y=current.y;translate(b.hips,desired.sub(current))
  for(let pass=0;pass<5;pass++){
   solveBody();if(pass===4)break
   const com=centerOfMassProxy(b),correction=comTarget.clone().sub(com);correction.y=0;correction.clampLength(0,legLength*.15);correction.multiplyScalar(1.1)
   const originalHip=point(b.hips);let accepted=0
   for(const amount of [1,.5,.25,.125,.0625,.03125,0]){
    const candidate=originalHip.clone().addScaledVector(correction,amount);translate(b.hips,candidate.sub(point(b.hips)))
    if(hipHeightRange().feasible||amount===0){accepted=amount;break}
   }
   hipBalanceLimited ||= accepted<1
  }
 }else solveBody()
 rig.skeleton.update()
 const knee=side=>180-degrees(point(b[side+'UpperLeg']).sub(point(b[side+'LowerLeg'])).angleTo(point(b[side+'Foot']).sub(point(b[side+'LowerLeg'])))),feet=sides.map(([,side])=>point(b[side+'Foot'])),knees=sides.map(([,side])=>knee(side)),errors=feet.map((p,i)=>p.distanceTo(targets[i])*1000),kneeTargetErrorDegrees=Math.max(...knees.map((actual,i)=>Math.abs(actual-requestedKnees[i]))),footTargetErrorMm=Math.max(...errors),poseLimitReasons=[]
 const chestYaw=yawOf(anatomical(rig,b.chest?'chest':b.spine?'spine':'hips'),chestHeading),hipYaw=yawOf(anatomical(rig,'hips'),pelvisHeading),neckYaw=yawOf(anatomical(rig,b.neck?'neck':b.chest?'chest':b.spine?'spine':'hips'),neckHeading),neckYawDegrees=Math.abs(degrees(wrap(headYaw-neckYaw))),headChestYawDegrees=Math.abs(degrees(wrap(headYaw-chestYaw))),hipChestYawDegrees=Math.abs(degrees(wrap(hipYaw-chestYaw)))
 if(!explicit&&generated.some(t=>t.crouchReachLimited))poseLimitReasons.push('stance-exceeds-crouch-reach')
 if(footTargetErrorMm>.1)poseLimitReasons.push('foot-target-out-of-reach')
 if(kneeTargetErrorDegrees>.25&&!poseLimitReasons.length)poseLimitReasons.push(explicit||Number.isFinite(supportHeight)?'fixed-support-changes-crouch':'shared-plane-changes-crouch')
 if(neckYawDegrees>20.01)poseLimitReasons.push('head-torso-yaw-conflict')
 if(anchorMode==='support'&&(hipPolicyConflict||knees.some(k=>k>kneePolicyMax+.1)))poseLimitReasons.push('knee-policy-conflict')
 if(hipBalanceLimited)poseLimitReasons.push('balance-hip-range-limited')
 const soleOffset=safe(supportSoleOffsetM,0,0,legLength*.35),contactPlaneY=Number.isFinite(_contactPlaneY)?_contactPlaneY:anklePlane-soleOffset,contactPlaneSource=Number.isFinite(_contactPlaneY)?'explicit-support-frame':soleOffset>0?'ankle-minus-measured-sole-offset':'ankle-plane-fallback'
 const com=centerOfMassProxy(b),height=Math.max(.01,com.y-contactPlaneY),aForward=safe(balance.forwardAcceleration,0,-30,30),aSide=safe(balance.lateralAcceleration,0,-30,30)
 const rear=targets[1-frontIndex],front=targets[frontIndex],axis=front.clone().sub(rear);axis.y=0
 const hull=supportHull(targets,footForward,footLateral,legLength,travelForward,travelRight),comError=com.clone().sub(comTarget);comError.y=0
 let zmp=null,rawFront=null,actualFront=null,margin=null
 if(zmpValid){
  zmp=com.clone().addScaledVector(travelForward,-height/effectiveGravityMps2*aForward).addScaledVector(travelRight,-height/effectiveGravityMps2*aSide);zmp.y=contactPlaneY
  rawFront=axis.lengthSq()>1e-12?zmp.clone().sub(rear).dot(axis)/axis.lengthSq():.5;actualFront=Math.max(0,Math.min(1,rawFront));margin=hullMargin(hull,[zmp.dot(travelRight),zmp.dot(travelForward)])
 }
 if(anchorMode==='support'&&comError.length()>.01)poseLimitReasons.push('center-of-mass-target-unmet')
 if(margin!==null&&margin<0)poseLimitReasons.push('zero-moment-point-outside-support')
 const pelvisPitchDegrees=degrees(pitchOf(anatomical(rig,'hips'))),chestPitchDegrees=degrees(pitchOf(anatomical(rig,b.chest?'chest':b.spine?'spine':'hips')))
 return {headWorld:point(b.head).toArray(),feetWorld:feet.map(p=>p.toArray()),headDriftMm:point(b.head).distanceTo(originalHead)*1000,headRotationErrorDegrees:degrees(b.head.getWorldQuaternion(new Quaternion()).angleTo(originalHeadQ)),handPositionErrorMm:hands?Math.max(...sides.map(([,side])=>point(b[side+'Hand']).distanceTo(hands[side].p)*1000)):null,handRotationErrorDegrees:hands?Math.max(...sides.map(([,side])=>degrees(b[side+'Hand'].getWorldQuaternion(new Quaternion()).angleTo(hands[side].q)))):null,knees,upright:point(b.head).sub(point(b.hips)).normalize().dot(up),supportHeight:anklePlane,contactPlaneY,contactPlaneSource,supportSoleOffsetM:soleOffset,supportMode:anchorMode==='support'?'fixed-foot-targets':explicit||Number.isFinite(supportHeight)?'fixed-ankle-plane':'head-relative-ankle-plane',anchorMode,footTargetsWorld:targets.map(target=>target.toArray()),footTargetErrorMm,footTargetErrorsMm:errors,ankleHeightSpreadMm:Math.abs(feet[0].y-feet[1].y)*1000,contactPlaneErrorMm:Math.max(...feet.map((p,i)=>Math.abs(p.y-targets[i].y)*1000)),targetPlaneHeightSpreadMm:Math.abs(targets[0].y-targets[1].y)*1000,stanceWorldM:feet[0].distanceTo(feet[1]),boneLengthErrorMm:maxLegLengthError*1000,bodyHeading,cloudHeading,stanceWidth:width,crouch:depth,requestedKneeDegrees,requestedKneesDegrees:requestedKnees,kneeTargetErrorDegrees,poseLimited:poseLimitReasons.length>0,poseLimitReasons,armBalance,bodyBalance:{source:'bind-anatomical-frames',pelvisPitchDegrees,chestPitchDegrees,hipChestPitchDegrees:chestPitchDegrees-pelvisPitchDegrees,hipHeightPolicy:'mean-requested-height-with-knee-policy',maxKneeDegrees:kneePolicyMax,kneePolicyExceeded:hipPolicyConflict||knees.some(k=>k>kneePolicyMax+.1),hipBalanceLimited,pelvisYawDegrees:degrees(wrap(hipYaw-cloudHeading)),chestYawDegrees:degrees(wrap(chestYaw-cloudHeading)),footYawDegrees:62,neckYawDegrees,headChestYawDegrees,hipChestYawDegrees,neckPolicyExceeded:neckYawDegrees>20.01,chestPolicyLimited:Math.abs(wrap(desiredChest-chestHeading))>.001,leanForward,leanSide,hipsWorld:point(b.hips).toArray()},verticalBody:{verticalAcceleration,normalLoadRatio,effectiveGravityMps2,supportState,baseCrouch,verticalCompression,combinedCrouch:depth,compressionLimited:verticalCompression!==(balance.verticalCompression??0)||depth!==baseCrouch+verticalCompression,footConstraintMode:supportState==='supported'?'ordinary-support-proxy':supportState==='adhesion'?'magical-adhesion':'low-load-anchored-proxy'},balanceProxy:{source:'weighted-bone-points-and-foot-rect-proxies',zmpValid,zmpInvalidReason,supportState,normalLoadRatio,effectiveGravityMps2,comHeightM:height,contactPlaneY,contactPlaneSource,centerOfMassWorld:com.toArray(),targetCenterOfMassWorld:[comTarget.x,com.y,comTarget.z],centerOfMassOffset:{forward:com.clone().sub(footCenter).dot(travelForward),side:com.clone().sub(footCenter).dot(travelRight)},centerOfMassErrorMm:comError.length()*1000,zeroMomentPointWorld:zmp?.toArray()??null,loadRatio:zmpValid?{front:actualFront,rear:1-actualFront}:null,requestedLoadRatio:zmpValid?{front:loadFront,rear:1-loadFront}:null,loadRatioError:zmpValid?Math.abs(actualFront-loadFront):null,unclampedFrontLoadRatio:rawFront,supportMarginM:margin,supportExceeded:margin===null?null:margin<0,footHull2D:hull}}
}
