import type {Object3D,Skeleton,Vector3} from 'three'
import type {HumanoidRig} from './render-pose.mjs'
export function within(object:Object3D,ancestor:Object3D):boolean
export function rigScope(rig:HumanoidRig):Object3D
export function remotePlayerScopes(scene:Object3D):{playerId:string;scope:Object3D}[]
export function selectRiderRig(input:{scene:Object3D;rigs:HumanoidRig[];occupantId:string|null;localUserId:string|null;seatPosition:Vector3|null}):{status:string;rig:HumanoidRig|null;source:string|null;relatedSkeletons:Skeleton[]}
