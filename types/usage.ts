import {Scene,SkinnedMesh,Bone,Vector3} from 'three'
import {attachPoseDriver,prepareHumanoidRig,applyPose,createRideDynamics,stepRideDynamics} from '../src/index.mjs'
import {selectRiderRig,selectRiderRigWithInference} from '../src/adapters/xrift.mjs'
import {resolveRoles,inferHumanoidBones,inferHumanoidRigs,skeletonInputOf} from '../src/index.mjs'
const scene=new Scene(),mesh=new SkinnedMesh(),bones:Record<string,Bone>={},rig=prepareHumanoidRig({mesh,bones})
applyPose(rig,{preset:'hover',preserveHands:true})
applyPose(rig,{preset:'nimbus',stanceWidth:1,crouch:.45})
applyPose(rig,{preset:'chair',family:'chair',handMode:'grip',seatHeightRatio:.62})
applyPose(rig,{preset:'straddle',family:'straddle',widthRatio:.32,leanRadians:.1})
applyPose(rig,{preset:'side-sit',family:'side-sit',side:'left'})
const ride=stepRideDynamics(createRideDynamics(),{throttle:1},1/60)
const verticalRide=stepRideDynamics(createRideDynamics({liftForceUp:210,liftForceDown:210}),{lift:1,brake:0},1/60)
const tiltedRide=stepRideDynamics(createRideDynamics({attitudeEnabled:true}),{throttle:.5,lift:.5,steer:.4},1/60)
applyPose(rig,{preset:'nimbus',anchorMode:'support',supportFrame:{position:[0,1,0],quaternion:tiltedRide.supportQuaternion},balance:{forwardAcceleration:tiltedRide.pose.tangentForwardAcceleration,lateralAcceleration:tiltedRide.pose.tangentLateralAcceleration,effectiveGravityMps2:tiltedRide.pose.effectiveGravityMps2,normalLoadRatio:tiltedRide.pose.normalLoadRatio,centerOfMassOffset:tiltedRide.pose.centerOfMassOffset,loadRatio:tiltedRide.pose.loadRatio}})
applyPose(rig,{preset:'nimbus',anchorMode:'support',balance:{verticalAcceleration:verticalRide.pose.verticalAcceleration,normalLoadRatio:verticalRide.pose.normalLoadRatio,effectiveGravityMps2:verticalRide.pose.effectiveGravityMps2,supportState:verticalRide.pose.supportState,zmpValid:verticalRide.pose.zmpValid,zmpInvalidReason:verticalRide.pose.zmpInvalidReason,verticalCompression:verticalRide.pose.verticalCompression,loadRatio:verticalRide.pose.loadRatio}})
applyPose(rig,{preset:'nimbus',anchorMode:'support',supportSoleOffsetM:.05,footTargetsWorld:[[.25,.3,-.4],[-.25,.3,.4]],balance:{leanForward:ride.pose.balanceLeanForward,leanSide:ride.pose.balanceLeanSide,centerOfMassOffset:ride.pose.centerOfMassOffset,forwardAcceleration:ride.pose.forwardAcceleration,lateralAcceleration:ride.pose.lateralAcceleration}})
applyPose(rig,{preset:'shoulder',carrierAnchors:{leftShoulder:new Vector3(.2,1.38,0),rightShoulder:new Vector3(-.2,1.38,0),head:new Vector3(0,1.54,0)},anchorMode:'support'})
attachPoseDriver({scene,rig,getOptions:()=>({preset:'glider',enabled:true})}).dispose()
selectRiderRig({scene,rigs:[rig],occupantId:'me',localUserId:'me',seatPosition:new Vector3()})
const roles=resolveRoles(skeletonInputOf(mesh.skeleton,[mesh]))
if(roles.ok&&roles.roles.hips!==undefined)roles.roles.hips.toFixed()
const inferred=inferHumanoidBones({mesh})
if(inferred.ok&&inferred.bones)prepareHumanoidRig({mesh,bones:inferred.bones})
inferHumanoidRigs([rig],scene,{near:new Vector3(),maxDistance:3}).forEach(i=>i.rig?.bones.hips)
const chosen=selectRiderRigWithInference({scene,rigs:[rig],occupantId:'me',localUserId:'me',seatPosition:new Vector3(),exclude:r=>r.mesh===mesh})
chosen.inference?.result.method

// Authored action clip (charge-wave): sample the timeline and drive it through the same render transaction.
import {sampleAction,authoringRig,evaluateAction,fitPairAxes,type ActionClip} from '../src/index.mjs'
declare const clip:ActionClip
declare const authoredRig:import('../src/vendor/render-pose.mjs').PreparedRig
const authoredInfo=authoringRig(authoredRig)
const authoredFrame=sampleAction(clip,authoredInfo,{heldFor:1.2,releasedFor:null,charge:.5})
const authoredDriver=attachPoseDriver({scene:new Scene(),rig:authoredRig,getOptions:()=>({preset:'authored',frame:authoredFrame,heading:0,headMode:'host'})})
const authoredReview=evaluateAction(authoredRig,clip,{holdFor:2.6})
const fitted:[number,number,number]=fitPairAxes(authoredRig,clip.keys.gather).axes
void authoredDriver;void authoredReview.verdicts;void fitted
