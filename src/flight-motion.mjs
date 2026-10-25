const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0))
const radians=d=>d*Math.PI/180
export function createFlightMotion(){return {heading:0,pitch:0,roll:0,kneeBend:0,armSwing:0,ready:false}}
/** The camera stays host-owned. Only the rendered body trails its head. */
export function stepFlightMotion(state,{heading=0,velocity={x:0,y:0,z:0},acceleration=null,time=0,airborne=true}={},delta=0){
 const dt=clamp(delta,0,.05),a=1-Math.exp(-dt*6)
 if(!state.ready){state.heading=heading;state.ready=true}
 const turn=Math.atan2(Math.sin(heading-state.heading),Math.cos(heading-state.heading))
 state.heading+=turn*a
 const forward=velocity.x*Math.sin(state.heading)+velocity.z*Math.cos(state.heading)
 const left=velocity.x*Math.cos(state.heading)-velocity.z*Math.sin(state.heading)
 const speed=Math.min(1,Math.hypot(velocity.x,velocity.z)/2)
 const forwardA=acceleration?acceleration.x*Math.sin(state.heading)+acceleration.z*Math.cos(state.heading):0,leftA=acceleration?acceleration.x*Math.cos(state.heading)-acceleration.z*Math.sin(state.heading):0
 const drivePitch=acceleration?radians(9)*forward/2+radians(11)*forwardA/4.5:radians(12)*clamp(forward/2,-1,1)
 const driveRoll=acceleration?-radians(6)*left/2-radians(8)*leftA/4.5:-radians(9)*clamp(left/2,-1,1)
 const pitch=airborne?clamp(drivePitch,-radians(12),radians(12))+radians(.7)*Math.sin(time*1.7)*(1-speed):0
 const roll=airborne?clamp(driveRoll,-radians(9),radians(9))+radians(.5)*Math.sin(time*1.3)*(1-speed):0
 state.pitch+=(pitch-state.pitch)*a;state.roll+=(roll-state.roll)*a
 state.kneeBend+=((airborne?radians(5+speed*3+Math.sin(time*2.1)*.8):0)-state.kneeBend)*a
 state.armSwing=airborne?Math.sin(time*1.8)*.012*(1-speed*.5):0
 return state
}
