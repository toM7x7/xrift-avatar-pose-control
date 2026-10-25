import type {Bone,Scene,SkinnedMesh,Skeleton} from 'three'
import type {PreparedRig,PoseOptions,PoseMetrics} from './vendor/render-pose.mjs'
import type {StandingOptions,StandingMetrics} from './standing.mjs'
export {inspectHumanoidRigs,prepareRig,applyPronePose} from './vendor/render-pose.mjs'
export {applyStandingPose} from './standing.mjs'
export {createFlightMotion,stepFlightMotion} from './flight-motion.mjs'
export {resolveRiderHeading} from './rider-heading.mjs'
export type Preset='upright'|'hover'|'board'|'glider'
export const POSE_PRESETS:Readonly<Record<Preset,object>>
export type ControlOptions=StandingOptions&PoseOptions&{preset?:Preset}
export function prepareHumanoidRig(source:{mesh:SkinnedMesh;bones:Record<string,Bone>}):PreparedRig
export function applyPose(rig:PreparedRig,options?:ControlOptions):StandingMetrics|PoseMetrics
export function attachPoseDriver(input:{scene:Scene;rig:PreparedRig;getOptions?:()=>ControlOptions;relatedSkeletons?:Skeleton[]}):{last:StandingMetrics|PoseMetrics|null;error:string|null;frames:number;restored:boolean;restore:()=>void;dispose:()=>void}
