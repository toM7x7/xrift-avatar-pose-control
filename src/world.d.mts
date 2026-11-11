import type {Object3D,Quaternion,Skeleton,Vector3} from 'three'
import type {HumanoidRig} from './vendor/render-pose.mjs'
/** Tests only: true makes every helper a plain three call and `solving` a plain call. */
export function referenceWorldReads(on:boolean):void
/** Run a solver with the rig's hips subtree read lazily. Nested calls for the same rig share one solve. */
export function solving<T>(rig:Pick<HumanoidRig,'bones'>,fn:()=>T):T
export function worldPositionOf(node:Object3D,out?:Vector3):Vector3
export function worldQuaternionOf(node:Object3D,out?:Quaternion):Quaternion
export function intoLocal(node:Object3D,vector:Vector3):Vector3
export function intoWorld(node:Object3D,vector:Vector3):Vector3
export function settle(node:Object3D,parents?:boolean,children?:boolean):void
export function settleSolved():void
export function skinUpdate(skeleton:Skeleton):void
