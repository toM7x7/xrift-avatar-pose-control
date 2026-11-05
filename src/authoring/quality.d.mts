import type {PreparedRig} from '../vendor/render-pose.mjs'
import type {ActionClip,AuthoredPoseMetrics,AuthoredPoseOptions} from './types.d.mts'
export interface Verdict{metric:string;value:number|null;limit:number|null;at:number|null;status:'pass'|'warn'|'fail'|'n/a'}
export interface EvaluatedFrame{t:number;phase:string;weight:number;channels:Record<string,number>}
export const DEFAULT_THRESHOLDS:Readonly<Record<string,number>>
export function frameChannels(result:AuthoredPoseMetrics):Record<string,number>
export function summarize(frames:EvaluatedFrame[],thresholds?:Record<string,unknown>):{verdicts:Verdict[];score:string}
export function evaluateAction(rig:PreparedRig,clip:ActionClip,options?:{fps?:number;holdFor?:number;beamFor?:number;heading?:number;origin?:unknown;hostPose?:((t:number)=>void)|null;charge?:number;options?:AuthoredPoseOptions}):{frames:EvaluatedFrame[];verdicts:Verdict[];score:string;maxSlide:number;maxSpeed:{value:number;bone:string|null;t:number};maxJump:{value:number;side:string|null;t:number};thresholds:Record<string,unknown>;total:number}
