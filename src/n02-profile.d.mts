import type {RideDynamicsConfig} from './ride-dynamics.mjs'
export type DeepReadonly<T>=T extends readonly (infer U)[]?readonly DeepReadonly<U>[]:T extends object?{readonly [P in keyof T]:DeepReadonly<T[P]>}:T
export interface N02FlightControls {throttle:number;steer:number;lift:number;brake:number}
export interface N02NormalFlightProfile {
 id:'n02-normal-flight';version:string;status:string;adoptedOn:string;scope:string;
 coordinates:Record<string,string>;runtime:Record<string,string>;dynamics:RideDynamicsConfig;
 pose:{preset:'nimbus';anchorMode:'support';stanceWidth:number;crouch:number;maxKneeDegrees:number};
 calibration:{referenceLegLengthM:number;initialComHeightPerScaleM:number;initialSupportHalfLengthPerScaleM:number;initialSupportHalfWidthPerScaleM:number;supportLengthPaddingPerScaleM:number;supportWidthPaddingPerScaleM:number;minimumSupportHalfLengthM:number;minimumSupportHalfWidthM:number;soleSource:string;fixtureSoleOffsetM:number};
 replay:{stepSeconds:number;durationSeconds:number;settleSeconds:number;sampling:string};
 sequence:{until:number;label:string;controls:Partial<N02FlightControls>}[];
 acceptance:Record<string,number>;limits:Record<string,boolean>
}
export const N02_NORMAL_FLIGHT_PROFILE:DeepReadonly<N02NormalFlightProfile>
export function createN02RideOptions(options?:{rideScale?:number;attitudeEnabled?:boolean;initialHeading?:number}):RideDynamicsConfig&{initialHeading:number}
export function sampleN02FlightSequence(timeSeconds?:number):{controls:N02FlightControls;label:string;done:boolean}
