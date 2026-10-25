import source from '../specs/n02-normal-flight.v1.json' with {type:'json'}

function deepFreeze(value){
 if(value&&typeof value==='object'){
  for(const child of Object.values(value))deepFreeze(child)
  Object.freeze(value)
 }
 return value
}

/** The adopted N02 profile has its own version, independent of the package. */
export const N02_NORMAL_FLIGHT_PROFILE=deepFreeze(structuredClone(source))

/** Return fresh runtime options; only the documented actor calibration is varied. */
export function createN02RideOptions({rideScale=1,attitudeEnabled=true,initialHeading=0}={}){
 const scale=Number.isFinite(rideScale)&&rideScale>0?rideScale:1,calibration=N02_NORMAL_FLIGHT_PROFILE.calibration
 return {...structuredClone(N02_NORMAL_FLIGHT_PROFILE.dynamics),
  comHeightM:calibration.initialComHeightPerScaleM*scale,
  supportHalfLengthM:calibration.initialSupportHalfLengthPerScaleM*scale,
  supportHalfWidthM:calibration.initialSupportHalfWidthPerScaleM*scale,
  initialHeading:Number.isFinite(initialHeading)?initialHeading:0,
  attitudeEnabled:attitudeEnabled===true}
}

/** End-sampled replay: a boundary belongs to the following segment; done is strict > duration. */
export function sampleN02FlightSequence(timeSeconds){
 const time=Number.isFinite(timeSeconds)?Math.max(0,timeSeconds):0,profile=N02_NORMAL_FLIGHT_PROFILE,segment=profile.sequence.find(entry=>time<entry.until)??profile.sequence.at(-1)
 return {controls:{throttle:0,steer:0,lift:0,brake:0,...segment.controls},label:segment.label,done:time>profile.replay.durationSeconds}
}
