import type {Vector3} from 'three'
import type {PreparedRig} from './vendor/render-pose.mjs'
import type {StandingMetrics} from './standing.mjs'
export type WorldPoint=Vector3|[number,number,number]|number[]
export interface CarrierAnchors {leftShoulder:WorldPoint;rightShoulder:WorldPoint;head:WorldPoint}
export interface ShoulderRideOptions {carrierAnchors?:CarrierAnchors;heading?:number;anchorMode?:'support'|'head';seatLift?:number;seatBack?:number;spread?:number;preserveHands?:boolean}
export interface ShoulderRideMetrics extends StandingMetrics {anchorMode:'support'|'head';supportTargetWorld:number[];hipsWorld:number[];kneesWorld:number[][];supportErrorMm:number;carrierHeadHipDistanceM:number;kneeLateralGapM:number;maxLimbLengthErrorMm:number;scale:number;carrierScale:number;heading:number;seatLift:number;seatBack:number;spread:number;automaticSpread:number;headTorsoProxyClearanceMm:number;headThighProxyClearanceMm:number;proxyWarning:'possible-head-body-overlap'|null;shinTorsoProxyClearanceMm:number;footTorsoProxyClearanceMm:number;bodyProxyClearanceMm:number;bodyProxyWarnings:string[]}
export function applyShoulderRidePose(rig:PreparedRig,options?:ShoulderRideOptions):ShoulderRideMetrics
export interface ShoulderCarrierOptions {heading?:number;shinTargets?:{left:WorldPoint;right:WorldPoint}}
export interface ShoulderCarrierMetrics extends StandingMetrics {handsWorld:number[][];handTargetErrorsMm:number[];handTargetErrorMm:number;maxLimbLengthErrorMm:number}
export function applyShoulderCarrierPose(rig:PreparedRig,options?:ShoulderCarrierOptions):ShoulderCarrierMetrics
