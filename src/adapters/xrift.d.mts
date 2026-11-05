import type {Object3D,Skeleton,Vector3} from 'three'
import type {HumanoidRig} from '../vendor/render-pose.mjs'
import type {InferredRig} from '../humanoid-inference.mjs'
export function within(object:Object3D,ancestor:Object3D):boolean
export function rigScope(rig:HumanoidRig):Object3D
export function remotePlayerScopes(scene:Object3D):{playerId:string;scope:Object3D}[]
export function selectRiderRig(input:{scene:Object3D;rigs:HumanoidRig[];occupantId:string|null;localUserId:string|null;seatPosition:Vector3|null}):{status:string;rig:HumanoidRig|null;source:string|null;relatedSkeletons:Skeleton[]}
export function selectRiderRigWithInference(input:{scene:Object3D;rigs:HumanoidRig[];occupantId:string|null;localUserId:string|null;seatPosition:Vector3|null;exclude?:(rig:HumanoidRig)=>boolean;inferRadius?:number}):{status:string;rig:HumanoidRig|null;source:string|null;relatedSkeletons:Skeleton[];inference:InferredRig|null;attempts:InferredRig[]}
export interface ActorRigDiagnosis {reason:string;conflicts?:string[];mesh?:string;bones?:number;missingByName?:string[];inferred?:Record<string,string>;boneNames?:string[];skeletons?:number}
export interface ActorRigSelection {
  status:'ready'|'waiting-for-avatar'|'ambiguous-owner'|'no-avatar-near'|'unsupported'
  source:'local-unclaimed'|'remote-player-marker'
  rig:HumanoidRig|null
  relatedSkeletons:Skeleton[]
  /** How the roles were decided: by the name table, or inferred ('names'|'structure'|'names+structure' from resolveRoles). */
  roles:{method:string;dialect?:string|null;side?:string[]}|null
  inference:InferredRig|null
  diagnosis:ActorRigDiagnosis|null
}
/** The avatar rig of one user for a standing action: names first, then role inference near the feet; refusals carry a diagnosis. */
export function selectActorRig(input:{scene:Object3D;userId:string;isLocal:boolean;feet:Vector3;rigs?:HumanoidRig[];exclude?:(rig:HumanoidRig)=>boolean;radius?:number;hipsAbove?:[number,number];infer?:boolean}):ActorRigSelection
