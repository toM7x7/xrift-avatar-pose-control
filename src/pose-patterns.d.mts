export type PosePatternFamily='nimbus'|'standing'|'prone'|'chair'|'straddle'|'side-sit'|'shoulder'
export interface PosePatternOptions {preset?:'nimbus'|'hover'|'upright'|'glider'|'shoulder';family?:'chair'|'straddle'|'side-sit';preserveHands?:boolean;anchorMode?:'head'|'support';stanceWidth?:number;crouch?:number;maxKneeDegrees?:number;kneeBend?:number;pitch?:number;roll?:number;legs?:{kneeBendDegrees?:number;legSplayDegrees?:number;anklePointDegrees?:number};seatHeightRatio?:number;widthRatio?:number;leanRadians?:number;handMode?:'relaxed'|'grip'|'tracked';gripReachRatio?:number;side?:'left'|'right';seatLift?:number;seatBack?:number;spread?:number}
export interface PosePattern {id:string;title:string;family:PosePatternFamily;description:string;options:PosePatternOptions}
export type DeepReadonly<T>=T extends object?{readonly [K in keyof T]:DeepReadonly<T[K]>}:T
export const POSE_PATTERN_CATALOG:DeepReadonly<PosePattern[]>
export const POSE_PATTERN_CATALOG_NOTES:Readonly<Record<string,string>>
export interface PosePatternCondition {intensity:'standard'|'stress';variantId:string;variantTitle:string;variantKind:'base'|'single-axis'|'combined'|'boundary';status:'candidate';stressOnly:boolean;supportPitchRadians:number;supportRollRadians:number;headYaw:number;headPitch:number;carrierScale?:number}
export interface PosePatternCase {id:string;patternId:string;title:string;family:PosePatternFamily;options:PosePatternOptions;condition:PosePatternCondition}
export function createPatternCases(options?:{intensity?:'standard'|'stress'}):PosePatternCase[]
