import {captureBones,restoreBones,prepareRig,applyPronePose} from './vendor/render-pose.mjs'
import {applyStandingPose} from './standing.mjs'
import {applyNimbusPose} from './nimbus-pose.mjs'
import {applyShoulderRidePose,applyShoulderCarrierPose} from './shoulder-ride.mjs'
import {applySupportedSeatPose} from './supported-seat.mjs'
import {applyAuthoredPose} from './authoring/solve.mjs'
export {applyAuthoredPose,buildColliders,REFERENCE_HIP_HEIGHT} from './authoring/solve.mjs'
export {authoringRig} from './authoring/rig.mjs'
export {resolveKey,sampleAction,sampleKey,lerpFrame,releaseDuration} from './authoring/clip.mjs'
export {evaluateAction,summarize,frameChannels,DEFAULT_THRESHOLDS} from './authoring/quality.mjs'
export {fitPairAxes,keyCost} from './authoring/fit.mjs'
export {solveArm,ARM_LIMITS,humeralRotation} from './authoring/arm.mjs'
export {pairTargets,poseFingers,handFrame} from './authoring/hand.mjs'
export {applySupportedSeatPose} from './supported-seat.mjs'
export {POSE_PATTERN_CATALOG,POSE_PATTERN_CATALOG_NOTES,createPatternCases} from './pose-patterns.mjs'
export {applyNimbusPose} from './nimbus-pose.mjs'
export {applyShoulderRidePose,applyShoulderCarrierPose} from './shoulder-ride.mjs'
export {inspectHumanoidRigs,prepareRig,applyPronePose} from './vendor/render-pose.mjs'
export {applyStandingPose} from './standing.mjs'
export {createFlightMotion,stepFlightMotion} from './flight-motion.mjs'
export {createRideDynamics,stepRideDynamics} from './ride-dynamics.mjs'
export {N02_NORMAL_FLIGHT_PROFILE,createN02RideOptions,sampleN02FlightSequence} from './n02-profile.mjs'
export {resolveRiderHeading} from './rider-heading.mjs'
export {INFERENCE_REQUIRED_ROLES,parseBoneName,resolveRoles,validateRoles} from './role-inference.mjs'
export {skeletonInputOf,inferHumanoidBones,inferHumanoidRigs} from './humanoid-inference.mjs'
export const POSE_PRESETS=Object.freeze({upright:Object.freeze({mode:'standing',kneeBend:0}),hover:Object.freeze({mode:'standing',kneeBend:.09}),board:Object.freeze({mode:'standing',kneeBend:.22,pitch:.12}),glider:Object.freeze({mode:'prone'}),nimbus:Object.freeze({mode:'nimbus'}),shoulder:Object.freeze({mode:'shoulder'}),carrierSupport:Object.freeze({mode:'carrierSupport'}),chair:Object.freeze({mode:'supportedSeat',family:'chair'}),straddle:Object.freeze({mode:'supportedSeat',family:'straddle'}),'side-sit':Object.freeze({mode:'supportedSeat',family:'side-sit'}),authored:Object.freeze({mode:'authored'})})
const required=['hips','head','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot']
/** Explicit humanoid maps avoid guessing from exporter-dependent bone names. */
export function prepareHumanoidRig({mesh,bones}){
 if(!mesh?.isSkinnedMesh)throw new TypeError('mesh must be a SkinnedMesh')
 const missing=required.filter(role=>!bones?.[role]?.isBone||!mesh.skeleton.bones.includes(bones[role]))
 if(missing.length)throw new Error('Missing mapped joints in the selected skin palette: '+missing.join(', '))
 return prepareRig({mesh,skeleton:mesh.skeleton,bones,missing:[],supported:true})
}
export function applyPose(rig,{preset='upright',...options}={}){
 if(!Object.hasOwn(POSE_PRESETS,preset))throw new TypeError('Unknown pose preset')
 const config={...POSE_PRESETS[preset],...options}
 if(config.mode==='authored'){if(!config.frame)throw new TypeError('Authored pose needs a resolved frame (sampleAction/sampleKey)');return applyAuthoredPose(rig,config.frame,config)}
 if(config.mode==='supportedSeat')return applySupportedSeatPose(rig,config)
 if(config.mode==='nimbus')return applyNimbusPose(rig,config)
 if(config.mode==='shoulder')return applyShoulderRidePose(rig,config)
 if(config.mode==='carrierSupport')return applyShoulderCarrierPose(rig,config)
 return config.mode==='prone'?applyPronePose(rig,config):applyStandingPose(rig,config)
}
const managers=new WeakMap()
/** One transaction until the outermost render completes, including mirrors. */
export function attachPoseDriver({scene,rig,getOptions=()=>({}),relatedSkeletons=[]}){
 let manager=managers.get(scene)
 if(!manager){
  const entries=new Set(),before=scene.onBeforeRender,after=scene.onAfterRender;let depth=0
  const restore=()=>[...entries].reverse().forEach(e=>e.restore())
  function onBefore(...args){if(!depth)restore();depth++;try{before.call(this,...args);if(depth===1){const hips=new Set();for(const e of entries){if(hips.has(e.hips))continue;if(e.apply())hips.add(e.hips)}}}catch(error){depth--;if(!depth)restore();throw error}}
  function onAfter(...args){try{after.call(this,...args)}finally{depth=Math.max(0,depth-1);if(!depth)restore()}}
  manager={entries,dispose(){restore();if(scene.onBeforeRender===onBefore)scene.onBeforeRender=before;if(scene.onAfterRender===onAfter)scene.onAfterRender=after;managers.delete(scene)}}
  scene.onBeforeRender=onBefore;scene.onAfterRender=onAfter;managers.set(scene,manager)
 }
 // The rig's own skeleton is usually among the related ones: each is updated once.
 const skins=[...new Set([rig.skeleton,...relatedSkeletons])]
 let snapshot=null,buffer=null,disposed=false
 const api={hips:rig.bones.hips,last:null,error:null,frames:0,restored:true,
  restore(){if(snapshot){restoreBones(snapshot);skins.forEach(s=>s.update());snapshot=null}api.restored=true},
  apply(){const config=getOptions();if(disposed||config.enabled===false||api.error)return false;snapshot=buffer=captureBones(rig.skeleton,buffer);api.restored=false;try{api.last=applyPose(rig,config);skins.forEach(s=>s.update());api.frames++;return true}catch(error){api.error=String(error);api.restore();return false}},
  dispose(){if(disposed)return;api.restore();disposed=true;manager.entries.delete(api);if(!manager.entries.size)manager.dispose()}}
 manager.entries.add(api);return api
}
