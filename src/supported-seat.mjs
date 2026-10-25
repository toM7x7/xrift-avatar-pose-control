import {Matrix4,Quaternion,Vector3} from 'three'
import {applyStandingPose} from './standing.mjs'

const up=new Vector3(0,1,0),sides=[[1,'left'],[-1,'right']],point=bone=>bone.getWorldPosition(new Vector3()),degrees=r=>r*180/Math.PI
const defaults={chair:{seatHeightRatio:.55,widthRatio:.13},straddle:{seatHeightRatio:.65,widthRatio:.32},'side-sit':{seatHeightRatio:.55,widthRatio:.10}}
const safe=(value,fallback,min,max)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback
function coordinate(value,label){const p=value?.isVector3?value.clone():Array.isArray(value)&&value.length===3?new Vector3(...value):null;if(!p||!p.toArray().every(Number.isFinite))throw new TypeError('Invalid seat '+label);return p}
function rotation(value){const q=value?.isQuaternion?value.clone():Array.isArray(value)&&value.length===4?new Quaternion(...value):null;if(!q||!q.toArray().every(Number.isFinite)||q.lengthSq()<1e-12)throw new TypeError('Invalid seat quaternion');return q.normalize()}
function worldRotation(bone,q){const parent=bone.parent?.getWorldQuaternion(new Quaternion())??new Quaternion();bone.quaternion.copy(parent.invert().multiply(q));bone.updateWorldMatrix(true,true)}
function worldPosition(bone,p){bone.position.copy(bone.parent?bone.parent.worldToLocal(p.clone()):p);bone.updateWorldMatrix(true,true)}
function frame(direction,hint){const y=direction.clone().normalize(),x=hint.clone().addScaledVector(y,-hint.dot(y));if(x.lengthSq()<1e-10){x.set(0,0,1);x.addScaledVector(y,-x.dot(y));if(x.lengthSq()<1e-10){x.set(1,0,0);x.addScaledVector(y,-x.dot(y))}}x.normalize();return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,new Vector3().crossVectors(x,y)))}
function aim(bone,child,target){const start=point(bone),from=point(child).sub(start),to=target.clone().sub(start);if(from.lengthSq()<1e-12||to.lengthSq()<1e-12)return;worldRotation(bone,new Quaternion().setFromUnitVectors(from.normalize(),to.normalize()).multiply(bone.getWorldQuaternion(new Quaternion())))}
function solve(upper,lower,end,target,pole,rotateUpper,rotateLower){
 const start=point(upper),l1=start.distanceTo(point(lower)),l2=point(lower).distanceTo(point(end)),direction=target.clone().sub(start)
 if(l1<1e-8||l2<1e-8)throw new Error('Supported seat needs nonzero limb lengths')
 const epsilon=Math.min(l1,l2)*1e-5,d=Math.max(Math.abs(l1-l2)+epsilon,Math.min(direction.length(),l1+l2-epsilon));if(direction.lengthSq()<1e-12)direction.set(0,-1,0);else direction.normalize()
 const along=(l1*l1+d*d-l2*l2)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along)),bend=pole.clone().sub(start);bend.addScaledVector(direction,-bend.dot(direction));if(bend.lengthSq()<1e-10){bend.set(0,0,1);bend.addScaledVector(direction,-bend.dot(direction));if(bend.lengthSq()<1e-10){bend.set(1,0,0);bend.addScaledVector(direction,-bend.dot(direction))}}bend.normalize()
 const middle=start.clone().addScaledVector(direction,along).addScaledVector(bend,height),endpoint=start.clone().addScaledVector(direction,d)
 rotateUpper?rotateUpper(middle.clone().sub(start)):aim(upper,lower,middle);rotateLower?rotateLower(endpoint.clone().sub(point(lower))):aim(lower,end,endpoint)
}
function anatomical(rig,role){return rig.bones[role].getWorldQuaternion(new Quaternion()).multiply(rig.restRotations.get(rig.bones[role]).clone().invert()).multiply(rig.restBasis)}
function setAnatomical(rig,role,q){const bone=rig.bones[role];if(bone&&rig.restRotations.has(bone))worldRotation(bone,q.clone().multiply(rig.restBasis.clone().invert()).multiply(rig.restRotations.get(bone)))}
function limbLengths(b){return sides.flatMap(([,s])=>[[s+'UpperLeg',s+'LowerLeg'],[s+'LowerLeg',s+'Foot'],[s+'UpperArm',s+'LowerArm'],[s+'LowerArm',s+'Hand']]).map(([a,z])=>point(b[a]).distanceTo(point(b[z])))}
function handReference(rig,side){
 const rest=bone=>new Vector3().setFromMatrixPosition(rig.restWorld.get(bone)),hand=rig.bones[side+'Hand'],origin=rest(hand),lower=rig.bones[side+'LowerArm'],forward=new Vector3(0,0,1).applyQuaternion(rig.restBasis),down=new Vector3(0,-1,0).applyQuaternion(rig.restBasis),fingers=hand.children.filter(b=>b.isBone&&rig.restWorld.has(b)).map(b=>rest(b).sub(origin)).filter(v=>v.lengthSq()>1e-10)
 let palm=down.clone(),finger=origin.clone().sub(rest(lower)).normalize(),largest=0
 for(let i=0;i<fingers.length;i++)for(let j=i+1;j<fingers.length;j++){const cross=new Vector3().crossVectors(fingers[i],fingers[j]),area=cross.lengthSq();if(area>largest){largest=area;palm.copy(cross.normalize())}}
 if(largest>1e-12){if(palm.dot(down)<0)palm.negate();finger=fingers.reduce((sum,p)=>sum.add(p),new Vector3()).normalize()}
 return {palm,finger,handFrame:frame(finger,palm),forearmFrame:frame(origin.clone().sub(rest(lower)),palm),upperFrame:frame(rest(lower).sub(rest(rig.bones[side+'UpperArm'])),forward),lowerToHand:rig.restRotations.get(lower).clone().invert().multiply(rig.restRotations.get(hand))}
}

/** Experimental waist-supported poses. Mutates only the supplied rig; caller owns restore/render transactions. */
export function applySupportedSeatPose(rig,options={}){
 const {family='chair',handMode='relaxed',side='right'}=options
 if(!Object.hasOwn(defaults,family))throw new TypeError('Unknown supported seat family')
 if(!['relaxed','grip','tracked'].includes(handMode))throw new TypeError('Unknown supported seat hand mode')
 if(!['left','right'].includes(side))throw new TypeError('Unknown supported seat side')
 const heading=safe(options.heading,0,-Math.PI*100,Math.PI*100),q=options.supportFrame?rotation(options.supportFrame.quaternion):new Quaternion().setFromAxisAngle(up,heading),explicitPosition=options.supportFrame?coordinate(options.supportFrame.position,'position'):null
 const heightRatio=safe(options.seatHeightRatio,defaults[family].seatHeightRatio,.25,1.05),widthRatio=safe(options.widthRatio,defaults[family].widthRatio,.04,.85),lean=safe(options.leanRadians,0,-.55,.65),gripReach=safe(options.gripReachRatio,.65,.25,1.4),sideSign=side==='right'?1:-1,b=rig.bones,originalHead=point(b.head),originalHeadQ=b.head.getWorldQuaternion(new Quaternion()),originalHip=point(b.hips),handInputs=handMode==='tracked'?Object.fromEntries(sides.map(([,s])=>[s,{p:point(b[s+'Hand']),q:b[s+'Hand'].getWorldQuaternion(new Quaternion()),pole:point(b[s+'LowerArm'])}])):null
 applyStandingPose(rig,{heading,preserveHands:false})
 const beforeLengths=limbLengths(b),legLength=(beforeLengths[0]+beforeLengths[1]+beforeLengths[4]+beforeLengths[5])*.5,seat=explicitPosition??new Vector3(originalHip.x,legLength*heightRatio,originalHip.z),normal=up.clone().applyQuaternion(q),right=new Vector3(1,0,0).applyQuaternion(q),forward=new Vector3(0,0,1).applyQuaternion(q)
 const headForward=new Vector3(0,0,1).applyQuaternion(anatomical(rig,'head')).applyQuaternion(q.clone().invert()),headYaw=Math.atan2(headForward.x,headForward.z),chestYaw=safe(headYaw*.65,0,-Math.PI/4,Math.PI/4),neckYaw=safe(headYaw*.85,0,-Math.PI/3,Math.PI/3),platformCorrection=new Quaternion().setFromUnitVectors(normal,up),platformAngle=new Quaternion().angleTo(platformCorrection)
 function bodyOrientation(yaw,factor,blend){
  const roll=family==='side-sit'?sideSign*.07*factor:0,result=q.clone().multiply(new Quaternion().setFromAxisAngle(up,yaw)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),roll)).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),lean*factor)),bodyUp=up.clone().applyQuaternion(result),correction=new Quaternion().setFromUnitVectors(bodyUp,up),angle=new Quaternion().angleTo(correction),a=new Vector3(correction.x,correction.y,correction.z).normalize(),z=new Vector3(platformCorrection.x,platformCorrection.y,platformCorrection.z).normalize(),amount=angle>1e-8?Math.min(blend,platformAngle*blend*Math.max(0,a.dot(z))/angle):0
  return result.premultiply(new Quaternion().slerp(correction,amount))
 }
 setAnatomical(rig,'hips',bodyOrientation(0,.25,.25));setAnatomical(rig,'spine',bodyOrientation(chestYaw*.5,.60,.45));setAnatomical(rig,'chest',bodyOrientation(chestYaw,1,.65));setAnatomical(rig,'neck',bodyOrientation(neckYaw,.35,.85));worldRotation(b.head,originalHeadQ);worldPosition(b.hips,seat)
 const footTargets=sides.map(([sign])=>{
  const x=family==='side-sit'?sideSign*(.45+widthRatio)*legLength+sign*widthRatio*legLength:sign*widthRatio*legLength,z=legLength*(family==='chair'?.48:family==='straddle'?.20:.12)
  return new Vector3(x,-heightRatio*legLength,z).applyQuaternion(q).add(seat)
 })
 const footQ=family==='side-sit'?q.clone().multiply(new Quaternion().setFromAxisAngle(up,sideSign*Math.PI/2)):q
 for(const [i,[sign,s]]of sides.entries()){
  const pole=family==='side-sit'?point(b[s+'UpperLeg']).addScaledVector(right,sideSign*legLength*.8).addScaledVector(forward,legLength*.2):point(b[s+'UpperLeg']).addScaledVector(forward,legLength*.8).addScaledVector(right,sign*legLength*(family==='straddle'?.35:.15))
  const rotate=(role,direction)=>{const rest=rig.legFrames[role];worldRotation(b[role],frame(direction,right).multiply(rest.frame.clone().invert()).multiply(rest.rotation))}
  solve(b[s+'UpperLeg'],b[s+'LowerLeg'],b[s+'Foot'],footTargets[i],pole,d=>rotate(s+'UpperLeg',d),d=>rotate(s+'LowerLeg',d));worldRotation(b[s+'Foot'],footQ.clone().multiply(rig.restBasis.clone().invert()).multiply(rig.footRotations[s]))
 }
 const chestQ=anatomical(rig,b.chest?'chest':b.spine?'spine':'hips'),chestRight=new Vector3(1,0,0).applyQuaternion(chestQ),chestForward=new Vector3(0,0,1).applyQuaternion(chestQ),handTargets=[],armMetrics=[]
 for(const [sign,s]of sides){
  const upper=b[s+'UpperArm'],lower=b[s+'LowerArm'],hand=b[s+'Hand'],shoulder=point(upper),length=shoulder.distanceTo(point(lower))+point(lower).distanceTo(point(hand)),reference=handReference(rig,s)
  let target,pole
  if(handInputs){target=handInputs[s].p;pole=handInputs[s].pole}
  else if(handMode==='grip'){target=shoulder.clone().addScaledVector(forward,length*gripReach).addScaledVector(normal,-length*.35).addScaledVector(right,-sign*length*.08);pole=shoulder.clone().addScaledVector(chestRight,sign*length*.45).addScaledVector(chestForward,-length*.20).addScaledVector(up,-length*.10)}
  else if(family==='side-sit'){
   const lap=sign===sideSign;target=shoulder.clone().addScaledVector(right,lap?sideSign*length*.18:sign*length*.16).addScaledVector(forward,length*(lap?.12:-.24)).addScaledVector(normal,-length*(lap?.78:.85));pole=shoulder.clone().addScaledVector(chestRight,sign*length*.4).addScaledVector(up,-length*.20)
  }else{target=shoulder.clone().addScaledVector(chestForward,length*.25).addScaledVector(chestRight,sign*length*.06).addScaledVector(up,-length*.78);pole=shoulder.clone().addScaledVector(chestRight,sign*length*.4).addScaledVector(chestForward,length*.12).addScaledVector(up,-length*.20)}
  handTargets.push(target.clone());let bendNormal=chestForward.clone()
  solve(upper,lower,hand,target,pole,d=>{bendNormal.crossVectors(d,target.clone().sub(shoulder).sub(d)).multiplyScalar(-sign).normalize();worldRotation(upper,frame(d,bendNormal).multiply(reference.upperFrame.clone().invert()).multiply(rig.restRotations.get(upper)))},d=>{const palm=handMode==='grip'?normal.clone().negate().addScaledVector(right,-sign*.35).normalize():normal.clone().negate();worldRotation(lower,frame(d,palm).multiply(reference.forearmFrame.clone().invert()).multiply(rig.restRotations.get(lower)))})
  if(handInputs)worldRotation(hand,handInputs[s].q)
  else{const finger=point(hand).sub(point(lower)).normalize(),palm=handMode==='grip'?normal.clone().negate().addScaledVector(right,-sign*.35).normalize():normal.clone().negate();worldRotation(hand,frame(finger,palm).multiply(reference.handFrame.clone().invert()).multiply(rig.restRotations.get(hand)))}
  const elbow=point(lower),wrist=point(hand),neutralHand=lower.getWorldQuaternion(new Quaternion()).multiply(reference.lowerToHand)
  armMetrics.push({side:s,elbowAboveHandM:elbow.y-wrist.y,handBelowShoulderM:shoulder.y-wrist.y,elbowFlexionDegrees:180-degrees(shoulder.clone().sub(elbow).angleTo(wrist.clone().sub(elbow))),wristBindDeviationDegrees:degrees(hand.getWorldQuaternion(new Quaternion()).angleTo(neutralHand))})
 }
 rig.skeleton.update()
 const feet=sides.map(([,s])=>point(b[s+'Foot'])),hands=sides.map(([,s])=>point(b[s+'Hand'])),kneesWorld=sides.map(([,s])=>point(b[s+'LowerLeg']).toArray()),knees=sides.map(([,s])=>180-degrees(point(b[s+'UpperLeg']).sub(point(b[s+'LowerLeg'])).angleTo(point(b[s+'Foot']).sub(point(b[s+'LowerLeg']))))),afterLengths=limbLengths(b),footErrors=feet.map((p,i)=>p.distanceTo(footTargets[i])*1000),handErrors=hands.map((p,i)=>p.distanceTo(handTargets[i])*1000),boneLengthErrorMm=Math.max(...afterLengths.map((length,i)=>Math.abs(length-beforeLengths[i])))*1000,footTargetErrorMm=Math.max(...footErrors),handTargetErrorMm=Math.max(...handErrors),headNeckAngleDegrees=degrees(anatomical(rig,'head').angleTo(anatomical(rig,b.neck?'neck':b.chest?'chest':b.spine?'spine':'hips'))),warnings=[]
 if(footTargetErrorMm>1)warnings.push('foot-target-unreachable');if(handTargetErrorMm>1)warnings.push('hand-target-unreachable');if(headNeckAngleDegrees>45)warnings.push('head-neck-orientation-limit');if(knees.some(k=>k>150))warnings.push('deep-knee-flexion');if(handMode==='grip')warnings.push('grip-finger-closure-not-simulated')
 return {family,handMode,headWorld:point(b.head).toArray(),hipsWorld:point(b.hips).toArray(),feetWorld:feet.map(p=>p.toArray()),kneesWorld,handsWorld:hands.map(p=>p.toArray()),headRotationErrorDegrees:degrees(b.head.getWorldQuaternion(new Quaternion()).angleTo(originalHeadQ)),headDriftMm:point(b.head).distanceTo(originalHead)*1000,boneLengthErrorMm,supportErrorMm:point(b.hips).distanceTo(seat)*1000,footTargetErrorMm,handTargetErrorMm,footTargetErrorsMm:footErrors,handTargetErrorsMm:handErrors,handRotationErrorDegrees:handInputs?Math.max(...sides.map(([,s])=>degrees(b[s+'Hand'].getWorldQuaternion(new Quaternion()).angleTo(handInputs[s].q)))):null,knees,warnings,supportFrame:{position:seat.toArray(),quaternion:q.toArray(),normal:normal.toArray(),right:right.toArray(),forward:forward.toArray(),source:explicitPosition?'explicit':'neutral-derived'},footTargetsWorld:footTargets.map(p=>p.toArray()),handTargetsWorld:handTargets.map(p=>p.toArray()),armMetrics,headNeckAngleDegrees,headUpDotWorld:up.clone().applyQuaternion(anatomical(rig,'head')).dot(up),parameters:{seatHeightRatio:heightRatio,widthRatio,leanRadians:lean,gripReachRatio:gripReach,side},experimental:true}
}
