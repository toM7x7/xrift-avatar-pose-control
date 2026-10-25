import type {Bone,Scene,SkinnedMesh,Skeleton,Vector3,Quaternion,Object3D,Matrix4} from 'three'
import type {TorsoSamples,TorsoSurface,TorsoContact} from './torso-support.mjs'
export interface HumanoidRig {mesh:SkinnedMesh;skeleton:Skeleton;bones:Record<string,Bone>;missing:string[];supported:boolean}
export interface PreparedRig extends HumanoidRig {restWorld:Map<Bone,Matrix4>;restRotations:Map<Bone,Quaternion>;restLocal:Map<Bone,{position:Vector3;quaternion:Quaternion;scale:Vector3}>;restBasis:Quaternion;hipsRest:Quaternion;headRest:Quaternion;legFrames:Record<string,{frame:Quaternion;rotation:Quaternion}>;footRotations:Record<string,Quaternion>;torsoSamples:TorsoSamples}
export interface ProneLegSettings {kneeBendDegrees:number;legSplayDegrees:number;anklePointDegrees:number}
export const PRONE_LEG_DEFAULTS:Readonly<ProneLegSettings>
export interface PoseMetrics {headDriftMm:number;headRotationErrorDegrees:number;leftKneeDegrees:number;rightKneeDegrees:number;ankleLateralGapM:number;kneeLateralGapM:number;handPositionErrorMm:number|null;supportGripErrorMm:number|null;torsoContact:TorsoContact|null;rotationOnly:boolean}
export interface PoseOptions {enabled?:boolean;heading?:number;orientation?:Quaternion|null;rotationOnly?:boolean;preserveHands?:boolean;legs?:Partial<ProneLegSettings>;support?:TorsoSurface|null}
export interface RenderPoseBridge {last:PoseMetrics|null;frames:number;restored:boolean;cameraPositionDriftMm:number;cameraRotationErrorDegrees:number;restore:()=>void;dispose:()=>void}
export function roleOf(name:string):string|null
export function inspectHumanoidRigs(scene:Object3D):HumanoidRig[]
export function captureBones(skeleton:Skeleton):{bone:Bone;position:Vector3;quaternion:Quaternion;scale:Vector3}[]
export function restoreBones(snapshot:ReturnType<typeof captureBones>):void
export function prepareRig(rig:HumanoidRig):PreparedRig
export function applyPronePose(rig:PreparedRig,options?:PoseOptions):PoseMetrics
export function installRenderPose(scene:Scene,rig:PreparedRig,getOptions:()=>PoseOptions&{enabled:boolean},onError?:(error:unknown)=>void,relatedSkeletons?:Skeleton[]):RenderPoseBridge
