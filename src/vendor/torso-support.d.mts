import type {Vector3,Matrix4,Quaternion,Bone,SkinnedMesh,Object3D} from 'three'
import type {HumanoidRig,PreparedRig} from './render-pose.mjs'
export const GLIDER_SUPPORT:Readonly<{center:number[];size:number[];topY:number;headZ:number;clearanceM:number;grip:number[];elbowPole:number[]}>
export interface TorsoSurface {point:Vector3;normal:Vector3;forward:Vector3;lateral:Vector3;headProjection?:Vector3;halfSize?:[number,number];clearanceM?:number;fit?:boolean;neckExtension?:number;revision?:number;grips?:Record<string,Vector3>;elbowPoles?:Record<string,Vector3>}
export interface TorsoSamples {regions:Record<string,{mesh:SkinnedMesh;index:number;anterior:number}[]>;source:string}
export interface TorsoContact {source:string;fitted:boolean;aligned?:boolean;chestGapMm?:number;abdomenGapMm?:number;pitchDegrees?:number;withinBoard?:boolean;headWorldPosition?:number[];headDeltaLocal?:number[];revision?:number}
export function gliderSupportSurface(frame:Object3D,settings?:{trim?:number;revision?:number}):TorsoSurface
export function prepareTorsoSamples(rig:HumanoidRig,restWorld:Map<Bone,Matrix4>,restBasis:Quaternion):TorsoSamples
export function fitTorsoToSurface(rig:PreparedRig,surface:TorsoSurface):TorsoContact
export function measureTorsoSurface(rig:PreparedRig,surface:TorsoSurface):TorsoContact
