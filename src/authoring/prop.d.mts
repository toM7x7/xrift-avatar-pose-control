import type {Quaternion,Vector3} from 'three'
import type {PreparedRig} from '../vendor/render-pose.mjs'
import type {AuthoredPoseMetrics,AuthoredPoseOptions,AuthoringRig,HandFingers,PoseFrame,PoseKey,Side,Vec3} from './types.d.mts'
export type Curve=number|Array<[number,number]>
/** A place on the prop where a hand goes (prop coordinates: X=left Y=up Z=working end, real metres). */
export interface PropSocket{position:Vec3;fingers:Vec3;palm:Vec3;point?:'palmCenter'|'heel'|'pinkyHeel'|'thumbHeel'|'wrist';/** The socket slides by this vector at travel 1. */travel?:Vec3;/** The hand turns about the prop's up axis by this many degrees at turn 1. */turn?:number;/** Share of the look pitch the hand rolls on the socket against the prop's tip (a grip). */slip?:number}
/** How a stance key holds the prop: the holding hand's socket at shoulder + position (body metres, unit 'arm' scales with the arm). */
export interface PropHold{hand?:Side;socket?:string;position:Vec3;unit?:'body'|'arm';/** [yaw, pitch, roll] of the prop in the body frame (deg). */aim?:Vec3;/** Share of the look pitch the prop follows. */pitchFollow?:number;/** Share of the look pitch the holding hand swings about the shoulder (default pitchFollow). */pitchSwing?:number;/** Extra offset of the hold (body metres, scaled like position) at a 35° look down / up. */lookDown?:Vec3;lookUp?:Vec3}
export interface HeldPhase{weight?:Curve;stance?:Curve;pump?:Curve;reach?:Curve;lift?:Curve;turn?:Curve;trigger?:Curve;recoil?:Curve;cycle?:{rate?:number;pump?:Curve;recoil?:Curve;follow?:number}}
export interface HeldClip{
 id:string;version:string;title?:string
 prop:{sockets:Record<string,PropSocket>;fit?:{probes?:Partial<HeldParams>[];minElbowDeg?:number;step?:number;max?:number;yawStep?:number;yawMax?:number;/** Below this body unit (world metres per body metre) the prop shrinks with the body. */scaleBelow?:number;minScale?:number};support?:{rest?:string;reach?:string;arc?:Vec3};fingers?:Record<string,HandFingers>;recoil?:{back?:number;pitch?:number};torsoPitchShare?:number}
 /** The two stance keys blended by `stance` (default ['ready','reload']). */
 stances?:[string,string]
 /** The key whose hold is blended in by `high` (default 'high'; optional). */
 highKey?:string
 keys:Record<string,PoseKey&{hold?:PropHold}>
 phases:Record<string,HeldPhase>
 /** Scripted run for reviews: the item's state machine in miniature. */
 timeline?:Array<{phase:string;duration:number;pitch?:Curve;high?:Curve}>
 quality?:Record<string,unknown>
}
export interface HeldParams{weight:number;stance:number;/** 0..1 toward clip.keys.high, the hold raised into the holder's own view. */high:number;pump:number;reach:number;lift:number;turn:number;trigger:number;recoil:number;pitch:number;phase?:string}
export interface PlacedProp{position:Vector3;quaternion:Quaternion;side:Side;socket:string;support:string|null}
export const HELD_REST:Readonly<HeldParams>
export function curve(points:Curve|undefined,u:number,fallback?:number):number
export function heldParams(clip:HeldClip,phase:string,u?:number,extra?:{cycle?:number;pitch?:number;recoil?:number;weight?:number;high?:number}):HeldParams
/** How much closer to the chest (body metres) this body holds the prop so the support hand reaches. */
export interface HoldFit{back:number;/** Extra chest turn (deg) bringing the support shoulder forward. */yaw:number;/** Size of the prop in this body's hands (1 = real size). */scale:number;reached:boolean}
export function holdFit(rig:PreparedRig,clip:HeldClip,options?:AuthoredPoseOptions):HoldFit
export function placeProp(clip:HeldClip,info:AuthoringRig,k:number,params:Partial<HeldParams>,fit?:{back?:number;yaw?:number;scale?:number}|null):PlacedProp
export function socketTarget(placed:PlacedProp,socket:PropSocket,k:number,travel?:number,turn?:number,look?:number):{position:number[];point:string;q:number[]}
export function sampleHeld(clip:HeldClip,info:AuthoringRig,k:number,params?:Partial<HeldParams>,fit?:{back?:number;yaw?:number;scale?:number}|null):PoseFrame&{weight:number;phase:string;prop:PlacedProp;propScale:number;lowerBody:'host'}
export function propWorld(placed:PlacedProp,frame?:{heading?:number;origin?:Vector3|Vec3;k?:number;modelForward?:'z'|'-z'},out?:{position:Vector3;quaternion:Quaternion}):{position:Vector3;quaternion:Quaternion}
export function applyHeld(rig:PreparedRig,clip:HeldClip,params:Partial<HeldParams>,options?:AuthoredPoseOptions&{modelForward?:'z'|'-z';/** false: do not adapt the hold to this body. */fit?:false}):{metrics:AuthoredPoseMetrics;frame:ReturnType<typeof sampleHeld>;prop:{position:Vector3;quaternion:Quaternion};shortfallMm:number;k:number;fit:HoldFit|null;/** Size to draw the prop at (1 = real size). */scale:number}
export function timelineDuration(clip:HeldClip):number
export function timelineParams(clip:HeldClip,t:number):HeldParams
