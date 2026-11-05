import type {Bone,SkinnedMesh,Skeleton} from 'three'
export type FixtureNaming=(role:string,index:number)=>string
/** Exporter naming conventions (role -> bone name before GLTFLoader sanitizing). */
export const FIXTURE_NAMINGS:Readonly<Record<'vrm'|'vroid'|'blender'|'rigify'|'mixamo'|'unreal'|'cats'|'mmd'|'nameless',FixtureNaming>>
export interface DetailedFixtureOptions{
  naming?:keyof typeof FIXTURE_NAMINGS|FixtureNaming|null
  fingers?:boolean;clavicles?:boolean;upperChest?:boolean;neck?:boolean;toes?:boolean
  /** 'chain': twist bones between upper arm/forearm/hand; 'side': beside the chain. */
  twist?:'chain'|'side'|null
  /** 1 = faces +Z (default), -1 = faces -Z. */
  facing?:1|-1
  /** Rolls every bone's rest axes by up to this many radians (0 = identity rest). */
  roll?:number
}
/** bones are keyed by role (leftUpperArm, leftIndexProximal, ...) whatever the bone names are. */
export function createDetailedPoseFixture(options?:DetailedFixtureOptions):{mesh:SkinnedMesh;skeleton:Skeleton;bones:Record<string,Bone>;idle:(time?:number)=>void;dispose:()=>void}
