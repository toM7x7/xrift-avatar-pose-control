import {Scene,SkinnedMesh,Bone,Vector3} from 'three'
import {attachPoseDriver,prepareHumanoidRig,applyPose,createRideDynamics,stepRideDynamics} from '../src/index.mjs'
import {selectRiderRig} from '../src/adapters/xrift.mjs'
const scene=new Scene(),mesh=new SkinnedMesh(),bones:Record<string,Bone>={},rig=prepareHumanoidRig({mesh,bones})
applyPose(rig,{preset:'hover',preserveHands:true})
applyPose(rig,{preset:'nimbus',stanceWidth:1,crouch:.45})
const ride=stepRideDynamics(createRideDynamics(),{throttle:1},1/60)
const verticalRide=stepRideDynamics(createRideDynamics({liftForceUp:210,liftForceDown:210}),{lift:1,brake:0},1/60)
const tiltedRide=stepRideDynamics(createRideDynamics({attitudeEnabled:true}),{throttle:.5,lift:.5,steer:.4},1/60)
applyPose(rig,{preset:'nimbus',anchorMode:'support',supportFrame:{position:[0,1,0],quaternion:tiltedRide.supportQuaternion},balance:{forwardAcceleration:tiltedRide.pose.tangentForwardAcceleration,lateralAcceleration:tiltedRide.pose.tangentLateralAcceleration,effectiveGravityMps2:tiltedRide.pose.effectiveGravityMps2,normalLoadRatio:tiltedRide.pose.normalLoadRatio,centerOfMassOffset:tiltedRide.pose.centerOfMassOffset,loadRatio:tiltedRide.pose.loadRatio}})
applyPose(rig,{preset:'nimbus',anchorMode:'support',balance:{verticalAcceleration:verticalRide.pose.verticalAcceleration,normalLoadRatio:verticalRide.pose.normalLoadRatio,effectiveGravityMps2:verticalRide.pose.effectiveGravityMps2,supportState:verticalRide.pose.supportState,zmpValid:verticalRide.pose.zmpValid,zmpInvalidReason:verticalRide.pose.zmpInvalidReason,verticalCompression:verticalRide.pose.verticalCompression,loadRatio:verticalRide.pose.loadRatio}})
applyPose(rig,{preset:'nimbus',anchorMode:'support',supportSoleOffsetM:.05,footTargetsWorld:[[.25,.3,-.4],[-.25,.3,.4]],balance:{leanForward:ride.pose.balanceLeanForward,leanSide:ride.pose.balanceLeanSide,centerOfMassOffset:ride.pose.centerOfMassOffset,forwardAcceleration:ride.pose.forwardAcceleration,lateralAcceleration:ride.pose.lateralAcceleration}})
applyPose(rig,{preset:'shoulder',carrierAnchors:{leftShoulder:new Vector3(.2,1.38,0),rightShoulder:new Vector3(-.2,1.38,0),head:new Vector3(0,1.54,0)},anchorMode:'support'})
attachPoseDriver({scene,rig,getOptions:()=>({preset:'glider',enabled:true})}).dispose()
selectRiderRig({scene,rigs:[rig],occupantId:'me',localUserId:'me',seatPosition:new Vector3()})
