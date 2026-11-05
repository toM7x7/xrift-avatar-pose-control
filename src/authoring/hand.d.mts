import type {Quaternion,Vector3} from 'three'
import type {PreparedRig} from '../vendor/render-pose.mjs'
import type {HandFingers,PairPreset,Side,FingerName} from './types.d.mts'
export const FINGER_NAMES:FingerName[]
export function poseFingers(rig:PreparedRig,info:object,side:Side,fingers?:HandFingers|Record<string,{curl:number;spread:number}>):{posed:number;reason?:string}
export function handFrame(fingers:Vector3,palm:Vector3):Quaternion
export function pairTargets(preset:PairPreset,hands:object,unit?:number):Record<Side,{point:string;position:Vector3;fingers:Vector3;palm:Vector3;wrapRadius?:number}>
export function wrapCurl(length:number,radius:number,max?:number):number
