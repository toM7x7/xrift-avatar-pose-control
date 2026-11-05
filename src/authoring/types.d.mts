import type {Bone,Quaternion,Vector3} from 'three'
export type Vec3=[number,number,number]
export type Side='left'|'right'
export type FingerName='thumb'|'index'|'middle'|'ring'|'little'
export interface FingerPose{curl?:number;spread?:number}
export type HandFingers=Partial<Record<FingerName|'all',FingerPose>>&{wrap?:boolean|number}
export interface PairPreset{type:'clam'|'push';anchor?:'body'|'pelvis'|'chest'|'shoulders';center?:Vec3;axes?:Vec3;authoredAxes?:Vec3;unit?:'body'|'arm';radius?:number;upper?:Side;open?:number;skin?:number;twist?:number;fan?:number;tilt?:number;gap?:number;fit?:{range?:Vec3;step?:Vec3;prior?:number}}
export interface HandTargetSpec{position:Vec3;fingers:Vec3;palm:Vec3;point?:'palmCenter'|'heel'|'pinkyHeel'|'thumbHeel'|'wrist'}
/** One authored key pose (body metres for a 1.65 m figure, degrees, anatomical X=left Y=up Z=forward). */
export interface PoseKey{
 pelvis?:{offset?:Vec3;rot?:Vec3};torso?:{rot?:Vec3;weights?:number[]};head?:{mode?:'host'|'body';rot?:Vec3;neck?:number}
 clavicles?:Partial<Record<Side,[number,number]>>
 feet?:Partial<Record<Side,{pos?:[number,number];toeOut?:number;heel?:number}>>
 knees?:{out?:number};legs?:{maxExtension?:number;maxKnee?:number}
 hands?:{mode?:'authored'|'host';pair?:PairPreset}&Partial<Record<Side,HandTargetSpec>>
 elbows?:Partial<Record<Side,Vec3>>&{weight?:number;raise?:number}
 fingers?:Partial<Record<Side|'both',HandFingers>>
}
export interface ReleaseStep{to?:string;duration?:number;ease?:string;phase?:string;weightOut?:boolean;hold?:'beam';fallback?:number;recoil?:{decay:number;pelvis:number;pitch:number;crouch:number};tremor?:{frequency:number;amplitude:number}}
export interface ActionClip{id:string;version:string;title?:string;keys:Record<string,PoseKey>;action:{enter:{from:string;to:string;duration:number;ease?:string;weightIn?:number};hold:{from:string;to:string;duration:number;ease?:string;breath?:{period:number;amplitude:number}};release:ReleaseStep[]};quality?:Record<string,unknown>}
type SideRecord<T>={left:T;right:T}
/** Resolved solver frame: numbers only, hand targets resolved in body metres. */
export interface PoseFrame{weight?:number;phase?:string;pelvis:{offset:number[];rot:number[]};torso:{rot:number[];weights?:number[]};head:{mode:'host'|'body';rot:number[];neck:number};clavicles:SideRecord<number[]>;feet:SideRecord<{pos:number[];toeOut:number;heel:number;lift?:number}>;knees:{out:number};legs:{maxExtension:number;maxKnee:number};elbows:SideRecord<number[]>&{weight:number;raise:number};hands:{mode:string;pair?:boolean;left?:{position:number[];point:string;q:number[]};right?:{position:number[];point:string;q:number[]}};fingers:SideRecord<Record<FingerName,{curl:number;spread:number}>>}
export interface ActionClock{heldFor:number;releasedFor:number|null;charge?:number;beamFor?:number}
export interface ArmMetrics{swivel:number;cost:number;planBlend:number;reachErrorMm:number;elbowFlexDeg:number;pronationDeg:number;requestedPronationDeg:number;residualTwistDeg:number;wristFlexDeg:number;wristDeviationDeg:number;elbowDirection:number[];elbowWorld:number[];elbowClearanceMm:number|null;elbowNearest:string|null}
export interface LegMetrics{kneeFlexDeg:number;ankleDorsiflexionDeg:number;ankleLateralLeanDeg:number;kneeInwardDeg:number;footReachErrorMm:number;heelLiftDeg:number;liftMm:number}
export interface AuthoredPoseMetrics{weight:number;scale:number;bodyUnit:number;headMode:string;hipsWorld:number[];headWorld:number[];pelvisHeightM:number;pelvisAutoDropMm:number;headRotationErrorDeg:number|null;neckTwistDeg:number;chestYawDeg:number;pelvisYawDeg:number;chestPitchDeg:number;com:number[];comMarginMm:number|null;groundY:number;supportPolygon:number[][];legs:SideRecord<LegMetrics>;arms:Partial<SideRecord<ArmMetrics|null>>;fingers:SideRecord<{posed:number;reason?:string}>;handClearance:Partial<SideRecord<Record<string,{mm:number|null;against:string|null}>|null>>;contact:Record<string,number>;handFrameErrorDeg:Partial<SideRecord<number>>;handTargets:Partial<SideRecord<{wrist:number[];point:number[]|null}>>;pairShiftMm:number}
export interface AuthoredPoseOptions{heading?:number;origin?:Vector3|Vec3;groundY?:number;headMode?:'host'|'body';state?:object;twistSplit?:number;colliders?:boolean;preserveHands?:boolean}
export interface AuthoringRig{torso:Bone[];shoulders:SideRecord<Bone|null>;toes:SideRecord<Bone|null>;hands:SideRecord<{fingers:Array<{name:FingerName;bones:Bone[];length:number}>;palmLength:number;palmWidth:number;thickness:number;points:Record<string,Vector3>;rest:Quaternion}>;radii:Record<string,{lateral:number;front:number;back:number;source:'skin'|'proportion'}>;soleY:number;ankleHeight:number;hipHeight:number;legLength:number;armLength:number;shoulderWidth:number;hipWidth:number;torsoLength:number}
