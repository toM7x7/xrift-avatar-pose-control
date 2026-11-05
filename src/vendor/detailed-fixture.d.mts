import type {Bone,SkinnedMesh,Skeleton} from 'three'
export function createDetailedPoseFixture():{mesh:SkinnedMesh;skeleton:Skeleton;bones:Record<string,Bone>;idle:(time?:number)=>void;dispose:()=>void}
