import type {Scene,Skeleton} from 'three'
import type {PreparedRig} from './vendor/render-pose.mjs'
export interface StandingOptions {heading?:number;preserveHands?:boolean;enabled?:boolean;pitch?:number;roll?:number;kneeBend?:number;armSwing?:number}
export interface StandingMetrics {headWorld:number[];feetWorld:number[][];headDriftMm:number;headRotationErrorDegrees:number;handPositionErrorMm:number|null;handRotationErrorDegrees:number|null;knees:number[];upright:number}
export function applyStandingPose(rig:PreparedRig,options?:StandingOptions):StandingMetrics
export function installStandingPose(scene:Scene,rig:PreparedRig,getOptions:()=>StandingOptions,related?:Skeleton[]):{last:StandingMetrics|null;frames:number;restored:boolean;error:string|null;restore:()=>void;dispose:()=>void}
