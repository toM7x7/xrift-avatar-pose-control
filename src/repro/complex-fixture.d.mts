import type {Group,Bone,Skeleton,SkinnedMesh} from 'three'
import type {createPoseFixture} from '../vendor/fixture.mjs'
export function createComplexFixture(kind?:string):ReturnType<typeof createPoseFixture>&{neutral:()=>void;kind:string;cloth:Bone[];omitted:Bone[];accessories:{mesh:SkinnedMesh;skeleton:Skeleton;dispose:()=>void}[];measure:()=>{legs:{kneeDegrees:number;footRelativeHipY:number;thighLength:number;calfLength:number}[];panels:{tipRelativeRootY:number;tipRelativeHipY:number;localPosition:number[];localQuaternion:number[]}[]}}
