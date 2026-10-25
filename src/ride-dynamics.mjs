import {Quaternion,Vector3} from 'three'

/** Reduced local ride dynamics: planar/vertical F=ma plus damped COM response.
 * Coordinates: world +Y up, heading=0 points along +Z, positive steer turns
 * toward +X. Positions/COM dimensions are meters for a standard-height rider.
 * This is not a full-body rigid-body/contact simulation or an XRift adapter.
 */
const defaults=Object.freeze({mass:80,driveForce:260,brakeForce:520,linearDrag:48,quadraticDrag:2,lateralGrip:800,liftForceUp:240,liftForceDown:240,verticalDrag:20,verticalQuadraticDrag:1,verticalBrakeForce:520,verticalCompressionResponseSeconds:.18,verticalCompressionGain:.28,verticalCompressionMax:.22,verticalReleaseMax:.12,lowLoadEnterRatio:.15,lowLoadExitRatio:.25,supportRecoverySeconds:.08,attitudeEnabled:false,pitchLimitRadians:20*Math.PI/180,rollLimitRadians:25*Math.PI/180,attitudeMaxRate:.7,attitudeNaturalFrequency:6,attitudeDampingRatio:1,attitudePathSpeedFloor:.6,pitchPathGain:.35,pitchAccelerationGain:.25,rollAccelerationGain:1,maxTurnRate:.8,yawResponseSeconds:.22,turnSpeedScale:1.2,gravity:9.81,comHeightM:.9,comHeightResponseSeconds:.25,comNaturalFrequency:8,comDampingRatio:1,supportHalfLengthM:.45,supportHalfWidthM:.18,maxLeanRadians:.45,maxDeltaTime:2,integrationStep:1/240,stopSpeed:.0001})
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback,clamp=(n,a,z)=>Math.max(a,Math.min(z,n)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a))
const vector=(v,fallback=[0,0,0])=>Array.isArray(v)&&v.length===3?v.map((n,i)=>finite(n,fallback[i])):[...fallback]
function configuration(options){
 const positive=new Set(['mass','yawResponseSeconds','turnSpeedScale','gravity','comHeightM','comHeightResponseSeconds','comNaturalFrequency','supportHalfLengthM','supportHalfWidthM','maxLeanRadians','maxDeltaTime','integrationStep','verticalCompressionResponseSeconds','lowLoadEnterRatio','lowLoadExitRatio','supportRecoverySeconds','attitudeMaxRate','attitudeNaturalFrequency','attitudeDampingRatio','attitudePathSpeedFloor']),config={}
 for(const [key,fallback]of Object.entries(defaults)){const n=options[key];config[key]=Number.isFinite(n)&&n>=(positive.has(key)?1e-6:0)?n:fallback}
 const bounds={mass:[1,10000],driveForce:[0,100000],brakeForce:[0,100000],linearDrag:[0,100000],quadraticDrag:[0,100000],lateralGrip:[0,100000],liftForceUp:[0,100000],liftForceDown:[0,100000],verticalDrag:[0,100000],verticalQuadraticDrag:[0,100000],verticalBrakeForce:[0,100000],verticalCompressionResponseSeconds:[.05,2],verticalCompressionGain:[0,1],verticalCompressionMax:[0,.35],verticalReleaseMax:[0,.25],lowLoadEnterRatio:[.01,.5],lowLoadExitRatio:[.02,.8],supportRecoverySeconds:[.01,1],pitchLimitRadians:[0,Math.PI/3],rollLimitRadians:[0,Math.PI/3],attitudeMaxRate:[.01,2],attitudeNaturalFrequency:[.1,20],attitudeDampingRatio:[.1,2],attitudePathSpeedFloor:[.1,10],pitchPathGain:[0,1],pitchAccelerationGain:[0,1],rollAccelerationGain:[0,1.5],maxTurnRate:[0,4],yawResponseSeconds:[.02,10],turnSpeedScale:[.1,100],gravity:[1,30],comHeightM:[.2,2],comHeightResponseSeconds:[.05,2],comNaturalFrequency:[.1,20],comDampingRatio:[.1,2],supportHalfLengthM:[.02,3],supportHalfWidthM:[.02,3],stopSpeed:[0,.05]}
 for(const [key,[min,max]]of Object.entries(bounds))config[key]=clamp(config[key],min,max)
 config.attitudeEnabled=options.attitudeEnabled===true
 config.lowLoadExitRatio=Math.max(config.lowLoadEnterRatio+.01,config.lowLoadExitRatio)
 config.integrationStep=clamp(config.integrationStep,1/1000,1/60);config.maxDeltaTime=clamp(config.maxDeltaTime,config.integrationStep,5);config.maxLeanRadians=clamp(config.maxLeanRadians,.01,.8)
 return Object.freeze(config)
}
function supportFrame(heading,pitch=0,roll=0){
 // Public pitch is nose-up and public roll is right-bank. Local +Z is front.
 const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),heading).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-pitch)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-roll)).normalize()
 return {quaternion:q.toArray(),normal:new Vector3(0,1,0).applyQuaternion(q).toArray(),right:new Vector3(1,0,0).applyQuaternion(q).toArray(),forward:new Vector3(0,0,1).applyQuaternion(q).toArray()}
}
function advanceAttitude(state,dt){
 const c=state.config,previous=state.supportQuaternion,a=state.attitude,horizontalSpeed=Math.hypot(state.velocity[0],state.velocity[2]),yawSide=state.acceleration[0]*Math.cos(state.heading)-state.acceleration[2]*Math.sin(state.heading)
 const pathAngle=Math.atan2(state.velocity[1],Math.max(horizontalSpeed,c.attitudePathSpeedFloor))
 a.pathAngle=pathAngle;a.targetPitch=c.attitudeEnabled?clamp(pathAngle*c.pitchPathGain+Math.atan2(state.acceleration[1],c.gravity)*c.pitchAccelerationGain,-c.pitchLimitRadians,c.pitchLimitRadians):0;a.targetRoll=c.attitudeEnabled?clamp(Math.atan2(yawSide,c.gravity)*c.rollAccelerationGain,-c.rollLimitRadians,c.rollLimitRadians):0
 for(const [angle,rate,target,limit]of [['pitch','pitchRate','targetPitch',c.pitchLimitRadians],['roll','rollRate','targetRoll',c.rollLimitRadians]]){
  if(!c.attitudeEnabled){a[angle]=0;a[rate]=0;continue}
  const acceleration=c.attitudeNaturalFrequency*c.attitudeNaturalFrequency*(a[target]-a[angle])-2*c.attitudeDampingRatio*c.attitudeNaturalFrequency*a[rate]
  a[rate]=clamp(a[rate]+acceleration*dt,-c.attitudeMaxRate,c.attitudeMaxRate)
  const next=a[angle]+a[rate]*dt;a[angle]=clamp(next,-limit,limit);if(next!==a[angle])a[rate]=0
 }
 state.supportFrame=supportFrame(state.heading,a.pitch,a.roll);state.supportQuaternion=[...state.supportFrame.quaternion]
 const dot=Math.abs(previous.reduce((sum,v,i)=>sum+v*state.supportQuaternion[i],0));a.angularSpeed=dt>0?2*Math.acos(clamp(dot,0,1))/dt:0;a.angularSpeedLimit=c.maxTurnRate+2*c.attitudeMaxRate
}
function supportDemand(state,acceleration){
 const c=state.config,required=[acceleration[0],acceleration[1]+c.gravity,acceleration[2]],dot=axis=>required.reduce((sum,v,i)=>sum+v*axis[i],0),f=state.supportFrame
 return {requiredAccelerationWorld:required,effectiveGravityMps2:dot(f.normal),tangentForwardAcceleration:dot(f.forward),tangentLateralAcceleration:dot(f.right)}
}
function updateSupport(state,normalRatio,dt){
 const c=state.config
 if(normalRatio<0){state.supportState='adhesion';state.supportRecoveryTime=0;return}
 if(state.supportState==='supported'){
  if(normalRatio<c.lowLoadEnterRatio)state.supportState='low-load'
  state.supportRecoveryTime=0;return
 }
 state.supportState='low-load'
 if(normalRatio>c.lowLoadExitRatio){state.supportRecoveryTime+=dt;if(state.supportRecoveryTime+1e-12>=c.supportRecoverySeconds){state.supportState='supported';state.supportRecoveryTime=0}}
 else state.supportRecoveryTime=0
}
function poseFrom(state,acceleration,controls){
 const c=state.config,height=state.estimatedComHeightM,forward=[Math.sin(state.heading),Math.cos(state.heading)],right=[Math.cos(state.heading),-Math.sin(state.heading)],forwardAcceleration=acceleration[0]*forward[0]+acceleration[2]*forward[1],lateralAcceleration=acceleration[0]*right[0]+acceleration[2]*right[1],offset=state.com.offset
 const verticalAcceleration=acceleration[1],demand=supportDemand(state,acceleration),{effectiveGravityMps2,tangentForwardAcceleration,tangentLateralAcceleration}=demand,normalLoadRatio=effectiveGravityMps2/c.gravity,zmpValid=state.supportState==='supported'&&effectiveGravityMps2>0,zmpInvalidReason=zmpValid?null:normalLoadRatio<0?'negative-normal-load':normalLoadRatio>c.lowLoadExitRatio?'support-recovery-pending':'low-normal-load'
 let zmp=null,loadRatio=null,unclampedLoadRatio=null,supportMarginM=null
 if(zmpValid){
  zmp={forward:offset.forward-height/effectiveGravityMps2*tangentForwardAcceleration,side:offset.side-height/effectiveGravityMps2*tangentLateralAcceleration}
  const frontUnclamped=.5+zmp.forward/(2*c.supportHalfLengthM),rightUnclamped=.5+zmp.side/(2*c.supportHalfWidthM),front=clamp(frontUnclamped,0,1),rightLoad=clamp(rightUnclamped,0,1)
  loadRatio={front,rear:1-front,right:rightLoad,left:1-rightLoad};unclampedLoadRatio={front:frontUnclamped,rear:1-frontUnclamped,right:rightUnclamped,left:1-rightUnclamped};supportMarginM=Math.min(c.supportHalfLengthM-Math.abs(zmp.forward),c.supportHalfWidthM-Math.abs(zmp.side))
 }
 return {forwardAcceleration,lateralAcceleration,verticalAcceleration,...demand,verticalSpeed:state.velocity[1],speed:Math.hypot(state.velocity[0],state.velocity[2]),totalSpeed:Math.hypot(...state.velocity),turnRate:state.yawRate,normalLoadRatio,supportState:state.supportState,zmpValid,zmpInvalidReason,verticalCompression:state.verticalCompression,targetLeanForward:zmpValid?Math.atan2(tangentForwardAcceleration,effectiveGravityMps2):0,targetLeanSide:zmpValid?Math.atan2(tangentLateralAcceleration,effectiveGravityMps2):0,balanceLeanForward:Math.atan2(offset.forward,height),balanceLeanSide:Math.atan2(offset.side,height),crouch:.45+.35*Math.hypot(forwardAcceleration,lateralAcceleration)/(c.gravity+Math.hypot(forwardAcceleration,lateralAcceleration)),centerOfMassOffset:{...offset},centerOfMassVelocity:{...state.com.velocity},zeroMomentPoint:zmp,loadRatio,unclampedLoadRatio,supportMarginM,supportExceeded:supportMarginM===null?null:supportMarginM<0,supportHalfLengthM:c.supportHalfLengthM,supportHalfWidthM:c.supportHalfWidthM,comHeightM:height,heightObservationStatus:state.heightObservationStatus,observedComHeightM:state.observedComHeightM,supportQuaternion:[...state.supportQuaternion],supportFrame:state.supportFrame,supportAngularSpeed:state.attitude.angularSpeed,attitudeEnabled:c.attitudeEnabled,rotationalPointAccelerationIncluded:false,input:{...controls}}
}
export function createRideDynamics(options={}){
 const config=configuration(options),heading=wrap(finite(options.initialHeading??options.heading)),frame=supportFrame(heading),state={config,time:0,position:vector(options.initialPosition),velocity:vector(options.initialVelocity),heading,yawRate:clamp(finite(options.initialYawRate),-config.maxTurnRate,config.maxTurnRate),supportQuaternion:[...frame.quaternion],supportFrame:frame,attitude:{pitch:0,roll:0,pitchRate:0,rollRate:0,targetPitch:0,targetRoll:0,pathAngle:0,angularSpeed:0,angularSpeedLimit:config.maxTurnRate+2*config.attitudeMaxRate},acceleration:[0,0,0],com:{offset:{forward:0,side:0},velocity:{forward:0,side:0}},estimatedComHeightM:config.comHeightM,heightObservationStatus:'none',observedComHeightM:null,supportState:'supported',supportRecoveryTime:0,verticalCompression:0,integratedDt:0,discardedDt:0}
 state.pose=poseFrom(state,state.acceleration,{throttle:0,steer:0,brake:0,lift:0});return state
}
/** Return a new state; no input state, control object, or array is mutated.
 * dt is seconds. Catch-up beyond config.maxDeltaTime is explicitly reported.
 * The COM spring is local to the ride; it approximates active balance and does
 * not claim whole-body inertia, articulated contacts, or collision resolution.
 */
export function stepRideDynamics(state,input={},dt=0){
 const c=state.config,hasHeight=input.observedComHeightM!==undefined,observedHeight=Number.isFinite(input.observedComHeightM)?clamp(input.observedComHeightM,.2,2):null,heightObservationStatus=!hasHeight?'none':observedHeight===null?'ignored-nonfinite':observedHeight===input.observedComHeightM?'accepted':'clamped',controls={throttle:clamp(finite(input.throttle),-1,1),steer:clamp(finite(input.steer),-1,1),brake:clamp(finite(input.brake),0,1),lift:clamp(finite(input.lift),-1,1)},requestedDt=Math.max(0,finite(dt)),elapsed=Math.min(requestedDt,c.maxDeltaTime),next={...state,position:vector(state.position),velocity:vector(state.velocity),acceleration:vector(state.acceleration),com:{offset:{...state.com.offset},velocity:{...state.com.velocity}},supportQuaternion:[...state.supportQuaternion],supportFrame:{...state.supportFrame,quaternion:[...state.supportFrame.quaternion],normal:[...state.supportFrame.normal],right:[...state.supportFrame.right],forward:[...state.supportFrame.forward]},attitude:{...state.attitude},estimatedComHeightM:clamp(finite(state.estimatedComHeightM,c.comHeightM),.2,2),heightObservationStatus,observedComHeightM:observedHeight,supportState:state.supportState??'supported',supportRecoveryTime:finite(state.supportRecoveryTime),verticalCompression:finite(state.verticalCompression),integratedDt:elapsed,discardedDt:requestedDt-elapsed}
 if(!elapsed){next.pose=poseFrom(next,next.acceleration,controls);return next}
 const count=Math.ceil(elapsed/c.integrationStep),h=elapsed/count
 for(let i=0;i<count;i++){
  if(observedHeight!==null)next.estimatedComHeightM+=(observedHeight-next.estimatedComHeightM)*(1-Math.exp(-h/(c.comHeightResponseSeconds??.25)))
  const oldVx=next.velocity[0],oldVy=next.velocity[1],oldVz=next.velocity[2],oldSpeed=Math.hypot(oldVx,oldVz),targetYaw=controls.steer*c.maxTurnRate*Math.tanh(oldSpeed/c.turnSpeedScale)
  next.yawRate+=(targetYaw-next.yawRate)*(1-Math.exp(-h/c.yawResponseSeconds));next.heading=wrap(next.heading+next.yawRate*h)
  const fx=Math.sin(next.heading),fz=Math.cos(next.heading),rx=fz,rz=-fx,lateralSpeed=oldVx*rx+oldVz*rz,driveAcceleration=controls.throttle*c.driveForce*(1-controls.brake)/c.mass,gripLimit=Math.abs(lateralSpeed)/h,gripAcceleration=clamp(-lateralSpeed*c.lateralGrip/c.mass,-gripLimit,gripLimit)
  let vx=oldVx+(fx*driveAcceleration+rx*gripAcceleration)*h,vz=oldVz+(fz*driveAcceleration+rz*gripAcceleration)*h,speed=Math.hypot(vx,vz)
  // Resistance acts opposite velocity and is capped at complete stop, so a
  // brake cannot reverse the ride or inject kinetic energy in a long frame.
  if(speed){const resistance=(c.linearDrag*speed+c.quadraticDrag*speed*speed+c.brakeForce*controls.brake)/c.mass,factor=Math.max(0,1-resistance*h/speed);vx*=factor;vz*=factor}
  speed=Math.hypot(vx,vz);if(!controls.throttle&&speed<c.stopSpeed){vx=0;vz=0}
  // A constant hover force m*g compensates gravity exactly. The signed lift
  // force adds net acceleration; drag/brake reduce vertical speed, not height.
  const liftForce=controls.lift*(controls.lift>=0?c.liftForceUp:c.liftForceDown)*(1-controls.brake),hoverForce=c.mass*c.gravity,gravityForce=-c.mass*c.gravity
  let vy=oldVy+(hoverForce+gravityForce+liftForce)/c.mass*h
  const verticalSpeed=Math.abs(vy)
  if(verticalSpeed){const resistance=(c.verticalDrag*verticalSpeed+c.verticalQuadraticDrag*verticalSpeed*verticalSpeed+c.verticalBrakeForce*controls.brake)/c.mass;vy*=Math.max(0,1-resistance*h/verticalSpeed)}
  if(!controls.lift&&Math.abs(vy)<c.stopSpeed)vy=0
  next.velocity=[vx,vy,vz];next.position[0]+=vx*h;next.position[1]+=vy*h;next.position[2]+=vz*h;next.acceleration=[(vx-oldVx)/h,(vy-oldVy)/h,(vz-oldVz)/h]
  advanceAttitude(next,h)
  const demand=supportDemand(next,next.acceleration),effectiveGravity=demand.effectiveGravityMps2,normalRatio=effectiveGravity/c.gravity
  updateSupport(next,normalRatio,h)
  const compressionTarget=clamp(c.verticalCompressionGain*(normalRatio-1),-c.verticalReleaseMax,c.verticalCompressionMax)
  next.verticalCompression+=(compressionTarget-next.verticalCompression)*(1-Math.exp(-h/c.verticalCompressionResponseSeconds))
  const aForward=demand.tangentForwardAcceleration,aSide=demand.tangentLateralAcceleration,height=next.estimatedComHeightM,limit=height*Math.tan(c.maxLeanRadians)
  for(const [key,a]of [['forward',aForward],['side',aSide]]){
   const target=next.supportState==='supported'&&effectiveGravity>0?clamp(height*a/effectiveGravity,-limit,limit):0,x=next.com.offset[key],v=next.com.velocity[key],springAcceleration=c.comNaturalFrequency*c.comNaturalFrequency*(target-x)-2*c.comDampingRatio*c.comNaturalFrequency*v
   next.com.velocity[key]+=springAcceleration*h;next.com.offset[key]+=next.com.velocity[key]*h
  }
 }
 next.time=finite(state.time)+elapsed;next.pose=poseFrom(next,next.acceleration,controls);return next
}
