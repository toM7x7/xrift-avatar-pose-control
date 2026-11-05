import type {Bone,Object3D,Skeleton,SkinnedMesh,Vector3} from 'three'
import type {HumanoidRig} from './vendor/render-pose.mjs'
import type {InferenceRole,RoleResult,SkeletonInput} from './role-inference.mjs'
export function skeletonInputOf(skeleton:Skeleton,meshes?:SkinnedMesh[]):SkeletonInput
export interface InferredHumanoidBones {ok:boolean;bones:Record<string,Bone>|null;names:Partial<Record<InferenceRole,string>>;result:RoleResult}
export function inferHumanoidBones(input:{mesh:SkinnedMesh;meshes?:SkinnedMesh[]}):InferredHumanoidBones
export interface InferredRig {rig:HumanoidRig|null;result:RoleResult;names:Partial<Record<InferenceRole,string>>;source:HumanoidRig}
export function inferHumanoidRigs(rigs:readonly HumanoidRig[],scene:Object3D,options?:{exclude?:(rig:HumanoidRig)=>boolean;near?:Vector3|null;maxDistance?:number}):InferredRig[]
