import type {Bone,SkinnedMesh,Skeleton} from 'three'
export function createPoseFixture():{mesh:SkinnedMesh;skeleton:Skeleton;bones:Record<string,Bone>;seated:(time?:number)=>void;dispose:()=>void}
