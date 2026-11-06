import type {Quaternion,Vector3} from 'three'
import type {PreparedRig} from '../vendor/render-pose.mjs'
import type {ArmMetrics,Side} from './types.d.mts'
export const ARM_LIMITS:Readonly<{flexion:number;extension:number;radial:number;ulnar:number;pronation:number;supination:number;elbowFlexion:number;externalRotation:number;internalRotation:number}>
export function clearance(p:Vector3,collider:object):number
export function minClearance(p:Vector3,colliders:object[],skip?:(c:object)=>boolean):{distance:number;key:string|null}
export function solveArm(rig:PreparedRig,info:object,side:Side,target:{wrist:Vector3;hand:Quaternion},options?:{elbowHint?:Vector3;elbowWeight?:number;colliders?:object[];previousSwivel?:number;previousPronation?:number;twistSplit?:number;samples?:number;forward?:Vector3;elbowRaise?:number;swivelWindow?:number;continuity?:number;margin?:number;/** Upper-torso frame for the shoulder-rotation limit. */thorax?:{forward:Vector3;left:Vector3};/** false: show the requested hand frame even past the wrist's range (twist included). */clampWrist?:boolean;trace?:object[]}):ArmMetrics
/** Shoulder rotation in degrees, + external / - internal. */
export function humeralRotation(d:Vector3,bend:Vector3,side:Side,thorax?:{forward:Vector3;left:Vector3}):number
