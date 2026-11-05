import type {PreparedRig} from '../vendor/render-pose.mjs'
import type {AuthoredPoseMetrics,AuthoredPoseOptions,PoseFrame} from './types.d.mts'
export const REFERENCE_HIP_HEIGHT:number
export function applyAuthoredPose(rig:PreparedRig,pose:PoseFrame,options?:AuthoredPoseOptions):AuthoredPoseMetrics
export function buildColliders(rig:PreparedRig,info:object,scale:number):Array<{key:string;length:number;a:number;front_r:number;back_r:number}>
export function measureAuthoredPose(rig:PreparedRig,info:object,ctx:object):AuthoredPoseMetrics
