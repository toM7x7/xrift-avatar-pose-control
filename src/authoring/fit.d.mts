import type {PreparedRig} from '../vendor/render-pose.mjs'
import type {AuthoredPoseMetrics,PoseKey,Vec3} from './types.d.mts'
export function keyCost(rig:PreparedRig,key:PoseKey,options?:{heading?:number;hostPose?:(()=>void)|null}):{cost:number;result:AuthoredPoseMetrics}
export function fitPairAxes(rig:PreparedRig,key:PoseKey,options?:{range?:Vec3;step?:Vec3;prior?:number;heading?:number;hostPose?:(()=>void)|null}):{axes:Vec3;cost:number;before:number;evaluated:number}
