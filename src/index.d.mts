import type {Bone,Scene,SkinnedMesh,Skeleton} from 'three'
import type {PreparedRig,PoseOptions,PoseMetrics} from './vendor/render-pose.mjs'
import type {StandingOptions,StandingMetrics} from './standing.mjs'
import type {NimbusOptions,NimbusMetrics} from './nimbus-pose.mjs'
import type {ShoulderRideOptions,ShoulderRideMetrics,ShoulderCarrierOptions,ShoulderCarrierMetrics} from './shoulder-ride.mjs'
export {applyNimbusPose} from './nimbus-pose.mjs'
export {applyShoulderRidePose,applyShoulderCarrierPose} from './shoulder-ride.mjs'
export {inspectHumanoidRigs,prepareRig,applyPronePose} from './vendor/render-pose.mjs'
export {applyStandingPose} from './standing.mjs'
export {createFlightMotion,stepFlightMotion} from './flight-motion.mjs'
export {createRideDynamics,stepRideDynamics} from './ride-dynamics.mjs'
export {N02_NORMAL_FLIGHT_PROFILE,createN02RideOptions,sampleN02FlightSequence} from './n02-profile.mjs'
export {resolveRiderHeading} from './rider-heading.mjs'
export type Preset='upright'|'hover'|'board'|'glider'|'nimbus'|'shoulder'|'carrierSupport'
export const POSE_PRESETS:Readonly<Record<Preset,object>>
export type ControlOptions=StandingOptions&PoseOptions&NimbusOptions&ShoulderRideOptions&ShoulderCarrierOptions&{preset?:Preset}
export function prepareHumanoidRig(source:{mesh:SkinnedMesh;bones:Record<string,Bone>}):PreparedRig
export type ControlMetrics=StandingMetrics|PoseMetrics|NimbusMetrics|ShoulderRideMetrics|ShoulderCarrierMetrics
export function applyPose(rig:PreparedRig,options?:ControlOptions):ControlMetrics
export function attachPoseDriver(input:{scene:Scene;rig:PreparedRig;getOptions?:()=>ControlOptions;relatedSkeletons?:Skeleton[]}):{last:ControlMetrics|null;error:string|null;frames:number;restored:boolean;restore:()=>void;dispose:()=>void}
