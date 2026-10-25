import test from 'node:test'
import assert from 'node:assert/strict'
import source from '../specs/n02-normal-flight.v1.json' with {type:'json'}
import {N02_NORMAL_FLIGHT_PROFILE as profile,createN02RideOptions,sampleN02FlightSequence} from '../src/n02-profile.mjs'
import {createRideDynamics} from '../src/ride-dynamics.mjs'

test('adopted profile matches the canonical JSON and is deeply immutable, including nested sequence controls',()=>{
 assert.deepEqual(profile,source);assert.equal(profile.id,'n02-normal-flight');assert.equal(profile.version,'1.0.0');assert.equal(profile.replay.durationSeconds,14)
 for(const value of [profile,profile.dynamics,profile.calibration,profile.sequence,profile.sequence[1],profile.sequence[1].controls])assert.ok(Object.isFrozen(value))
 assert.throws(()=>{profile.dynamics.mass=1},TypeError);assert.throws(()=>profile.sequence.push({until:100}),TypeError);assert.throws(()=>{profile.sequence[1].controls.lift=-1},TypeError)
 assert.equal(profile.dynamics.mass,70);assert.equal(profile.sequence[1].controls.lift,.7)
})
test('ride options copy all adopted dynamics and vary only the three calibrations, attitude toggle and initial heading',()=>{
 for(const scale of [.65,1,1.35]){
  const options=createN02RideOptions({rideScale:scale,initialHeading:.7,attitudeEnabled:false}),expected={...source.dynamics,comHeightM:.9*scale,supportHalfLengthM:.42*scale,supportHalfWidthM:.24*scale,initialHeading:.7,attitudeEnabled:false}
  assert.deepEqual(options,expected);assert.equal(createRideDynamics(options).config.mass,70);assert.equal(createRideDynamics(options).config.attitudeEnabled,false)
 }
 const defaults=createN02RideOptions();assert.equal(defaults.attitudeEnabled,true);assert.equal(defaults.initialHeading,0);assert.equal(defaults.comHeightM,.9)
})
test('caller edits or extra fields cannot alter the adopted configuration or another options result',()=>{
 const input={rideScale:.65,attitudeEnabled:true,initialHeading:.3,mass:999,driveForce:999},before=structuredClone(input),a=createN02RideOptions(input),b=createN02RideOptions(input)
 a.mass=1;a.comHeightM=100;a.initialHeading=2;assert.deepEqual(input,before);assert.equal(b.mass,70);assert.equal(b.comHeightM,.9*.65);assert.equal(profile.dynamics.mass,70);assert.equal(profile.dynamics.comHeightM,.9);assert.equal(b.driveForce,source.dynamics.driveForce)
 for(const rideScale of [0,-1,NaN,Infinity])assert.equal(createN02RideOptions({rideScale}).comHeightM,.9)
 assert.equal(createN02RideOptions({initialHeading:NaN}).initialHeading,0)
})
test('the fourteen-second sequence preserves every adopted control and boundary without inherited controls',()=>{
 const cases=[
  [0,{throttle:0,steer:0,lift:0,brake:1},'ホバー'],
  [1,{throttle:.8,steer:0,lift:.7,brake:0},'斜め上へ発進'],
  [3,{throttle:.4,steer:-.65,lift:.35,brake:0},'上昇しながら左旋回'],
  [5,{throttle:.4,steer:.65,lift:-.35,brake:0},'右へ切り返し'],
  [7,{throttle:.2,steer:0,lift:-.7,brake:0},'下降'],
  [9,{throttle:0,steer:0,lift:0,brake:1},'制動・構えが戻る']
 ]
 for(let index=0;index<cases.length;index++){
  const [time,controls,label]=cases[index],at=sampleN02FlightSequence(time);assert.deepEqual(at,{controls,label,done:false})
  const end=index+1<cases.length?cases[index+1][0]:14;assert.deepEqual(sampleN02FlightSequence(end-1e-9),{controls,label,done:false})
 }
 const at14=sampleN02FlightSequence(14),after14=sampleN02FlightSequence(14+1e-9),late=sampleN02FlightSequence(100)
 assert.equal(at14.done,false);assert.equal(after14.done,true);assert.equal(late.done,true);assert.deepEqual(after14.controls,{throttle:0,steer:0,lift:0,brake:1});assert.equal(after14.label,'制動・構えが戻る');assert.deepEqual(late.controls,at14.controls)
})
test('sequence results are independent snapshots and missing or invalid time starts with the hover hold',()=>{
 const a=sampleN02FlightSequence(3),b=sampleN02FlightSequence(3);a.controls.steer=1;a.controls.brake=1;assert.equal(b.controls.steer,-.65);assert.equal(b.controls.brake,0);assert.equal(profile.sequence[2].controls.steer,-.65)
 for(const time of [undefined,-1,NaN,Infinity,-Infinity])assert.deepEqual(sampleN02FlightSequence(time),{controls:{throttle:0,steer:0,lift:0,brake:1},label:'ホバー',done:false})
})
