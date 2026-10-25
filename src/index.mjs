import {captureBones,restoreBones,prepareRig,applyPronePose} from './vendor/render-pose.mjs'
import {applyStandingPose} from './standing.mjs'
import {applyNimbusPose} from './nimbus-pose.mjs'
import {applyShoulderRidePose,applyShoulderCarrierPose} from './shoulder-ride.mjs'
import {applySupportedSeatPose} from './supported-seat.mjs'
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
export const POSE_PRESETS=Object.freeze({upright:Object.freeze({mode:'standing',kneeBend:0}),hover:Object.freeze({mode:'standing',kneeBend:.09}),board:Object.freeze({mode:'standing',kneeBend:.22,pitch:.12}),glider:Object.freeze({mode:'prone'}),nimbus:Object.freeze({mode:'nimbus'}),shoulder:Object.freeze({mode:'shoulder'}),carrierSupport:Object.freeze({mode:'carrierSupport'}),chair:Object.freeze({mode:'supportedSeat',family:'chair'}),straddle:Object.freeze({mode:'supportedSeat',family:'straddle'}),'side-sit':Object.freeze({mode:'supportedSeat',family:'side-sit'})})
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
 let snapshot=null,disposed=false
 const api={hips:rig.bones.hips,last:null,error:null,frames:0,restored:true,
  restore(){if(snapshot){restoreBones(snapshot);rig.skeleton.update();relatedSkeletons.forEach(s=>s.update());snapshot=null}api.restored=true},
  apply(){const config=getOptions();if(disposed||config.enabled===false||api.error)return false;snapshot=captureBones(rig.skeleton);api.restored=false;try{api.last=applyPose(rig,config);rig.skeleton.update();relatedSkeletons.forEach(s=>s.update());api.frames++;return true}catch(error){api.error=String(error);api.restore();return false}},
  dispose(){if(disposed)return;api.restore();disposed=true;manager.entries.delete(api);if(!manager.entries.size)manager.dispose()}}
 manager.entries.add(api);return api
}
