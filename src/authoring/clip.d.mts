import type {ActionClip,ActionClock,PoseFrame,PoseKey,AuthoringRig} from './types.d.mts'
export const REFERENCE_ARM:number
export function resolveKey(key:PoseKey,info:AuthoringRig):PoseFrame
export function lerpFrame(a:PoseFrame,b:PoseFrame,t:number):PoseFrame
export function sampleAction(clip:ActionClip,info:AuthoringRig,clock:ActionClock):PoseFrame&{weight:number;phase:string}
export function resolvedKeys(clip:ActionClip,info:AuthoringRig):Record<string,PoseFrame>
export function releaseDuration(clip:ActionClip,beamFor:number):number
export function sampleKey(clip:ActionClip,info:AuthoringRig,name:string):PoseFrame&{weight:number;phase:string}
