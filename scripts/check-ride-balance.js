async (page) => {
 const results=[],pageErrors=[],nonGetRequests=[]
 const onError=e=>pageErrors.push(e.message),onRequest=r=>{if(r.method()!=='GET')nonGetRequests.push({method:r.method(),url:r.url()})}
 page.on('pageerror',onError);page.on('request',onRequest)
 const assert=(condition,message)=>{if(!condition)throw Error(message)}
 const fresh=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return page.evaluate(()=>structuredClone(window.__avatarLab))}
 const pause=async(value=true)=>page.locator('#drivePause').setChecked(value)
 const finite=(n,name)=>assert(typeof n==='number'&&Number.isFinite(n),'Nonfinite '+name)
 const range=async(id,value)=>page.locator('#'+id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},value)
 const flatten=value=>Array.isArray(value)?value.flatMap(flatten):value&&typeof value==='object'?Object.keys(value).sort().flatMap(k=>flatten(value[k])):[value]
 const anchors=a=>flatten(a.ride.anchorsLocal)
 const sameAnchors=(a,b)=>{
  const av=anchors(a),bv=anchors(b)
  assert(av.length===bv.length&&av.every((v,i)=>typeof v==='number'?Math.abs(v-bv[i])<1e-7:v===bv[i]),'Calibrated ride-local foot anchors changed under motion')
  assert(a.ride.anchorGeneration===b.ride.anchorGeneration,'Drive silently recalibrated the foot anchors')
 }
 const clean=a=>{
  assert(a.connected&&!a.error&&a.restored,JSON.stringify({connected:a.connected,error:a.error,restored:a.restored}))
  assert(a.ride?.state&&a.metrics,'Missing integrated ride telemetry')
  finite(a.metrics.footTargetErrorMm,'footTargetErrorMm');finite(a.metrics.boneLengthErrorMm,'boneLengthErrorMm')
  assert(a.metrics.boneLengthErrorMm<.01,'Ride stretches limb bones')
  for(const key of ['neckYawDegrees','headChestYawDegrees','hipChestYawDegrees'])finite(a.metrics.bodyBalance?.[key],'bodyBalance.'+key)
  if(a.metrics.bodyBalance.neckPolicyExceeded)assert(a.metrics.poseLimitReasons.includes('head-torso-yaw-conflict'),'Neck conflict is not reported')
  else assert(a.metrics.bodyBalance.neckYawDegrees<=20.01,'Neck exceeds its stated policy')
  if(a.metrics.anchorMode==='support')assert(a.metrics.footTargetErrorMm<1,'Fixed-support foot miss during ordinary ride input')
  if(a.metrics.anchorMode==='support'){
   finite(a.metrics.bodyBalance.maxKneeDegrees,'maxKneeDegrees')
   assert(a.metrics.knees.every(k=>k<=a.metrics.bodyBalance.maxKneeDegrees+.1),'Ordinary input exceeds the displayed knee policy')
   if(a.metrics.bodyBalance.hipBalanceLimited)assert(a.metrics.poseLimitReasons.includes('balance-hip-range-limited'),'Limited hip balance is not reported')
   if(a.metrics.balanceProxy.centerOfMassErrorMm>10)assert(a.metrics.poseLimitReasons.includes('center-of-mass-target-unmet'),'Unmet COM target is not reported')
  }
  assert(a.ride.state.position.every(Number.isFinite)&&a.ride.state.velocity.every(Number.isFinite),'Nonfinite ride transform')
 }
 const phase=async(button,duration)=>{
  await pause();const before=await fresh();await page.locator('#'+button).click();await pause(false)
  await page.waitForFunction(t=>window.__avatarLab?.ride?.state?.time>=t,before.ride.state.time+duration)
  await pause();const after=await fresh();clean(after);return after
 }
 try {
  await page.locator('#preset').selectOption('nimbus')
  await page.locator('#profile').selectOption('standard')
  await page.locator('#nimbusAnchorMode').selectOption('support')
  await page.locator('#hands').uncheck();await page.locator('#motion').uncheck()
  await page.locator('#driveReset').click();await pause()
  const initial=await fresh();clean(initial)
  finite(initial.ride.state.pose.balanceLeanForward,'balanceLeanForward')
  assert(initial.metrics.footTargetErrorMm<1,'Static fixed-support foot miss')
  assert(initial.metrics.bodyBalance.headChestYawDegrees<30,'Static head/chest still carries a large yaw mismatch')
  assert(initial.metrics.bodyBalance.neckYawDegrees<15,'Static head/neck yaw is not distributed')
  assert(initial.metrics.bodyBalance.hipChestYawDegrees>10&&initial.metrics.bodyBalance.hipChestYawDegrees<=45.01,'Static hips/chest do not share the body turn')
  results.push({case:'static-support',state:initial})
  const torsoSamples=[]
  for(const headYaw of [-.3,0,.3]){
   await range('headYaw',headYaw);const a=await fresh();clean(a);sameAnchors(initial,a)
   assert(a.metrics.bodyBalance.headChestYawDegrees<35,'Ordinary look creates excessive head/chest yaw')
   torsoSamples.push({headYaw,body:a.metrics.bodyBalance})
  }
  for(let i=1;i<torsoSamples.length;i++)assert(Math.abs(torsoSamples[i].body.chestYawDegrees-torsoSamples[i-1].body.chestYawDegrees)<30,'Chest yaw changes discontinuously under a small look input')
  await range('headYaw',0);await fresh();results.push({case:'torso-look-continuity',samples:torsoSamples})
  const forward=await phase('driveForward',1)
  sameAnchors(initial,forward)
  assert(forward.ride.state.pose.speed>.5,'Forward input does not move the ride')
  assert(forward.ride.state.pose.forwardAcceleration>0,'Forward acceleration missing')
  assert(forward.ride.state.pose.balanceLeanForward>0,'Balance does not follow forward acceleration')
  results.push({case:'forward-force',state:forward})
  const brake=await phase('driveBrake',.18)
  sameAnchors(initial,brake)
  assert(brake.ride.state.pose.forwardAcceleration<0,'Brake does not decelerate')
  assert(brake.ride.state.pose.speed<forward.ride.state.pose.speed,'Brake fails to reduce speed')
  results.push({case:'braking-force',state:brake})
  const stop=await phase('driveBrake',1.5)
  sameAnchors(initial,stop)
  assert(stop.ride.state.pose.speed<.01,'Brake fails to stop')
  results.push({case:'stopped',state:stop})
  for(const button of ['driveLeft','driveRight']){
   await page.locator('#driveReset').click();await pause();const base=await fresh()
   await phase('driveForward',.8);const turn=await phase(button,.8);sameAnchors(base,turn)
   assert(Math.abs(turn.ride.state.heading)>.05,'Turn input does not rotate ride')
   results.push({case:button,state:turn})
  }
  await page.locator('#driveReset').click();await pause()
  const frozen=await fresh();await page.evaluate(()=>new Promise(resolve=>{let n=12;const frame=()=>--n?requestAnimationFrame(frame):resolve();requestAnimationFrame(frame)}));const held=await fresh()
  assert(held.ride.state.time===frozen.ride.state.time,'Pause keeps integrating')
  sameAnchors(frozen,held);results.push({case:'pause',state:held})
  await page.locator('#nimbusAnchorMode').selectOption('head');const headMode=await fresh();clean(headMode)
  assert(headMode.metrics.headDriftMm<.01,'Head mode moves host head')
  results.push({case:'head-priority',state:headMode})
  await page.locator('#nimbusAnchorMode').selectOption('support')
  // Deterministic force-level checks complement the frame-timed UI samples.
  const dynamics=await page.evaluate(async()=>{
   const {createRideDynamics,stepRideDynamics}=await import('/src/ride-dynamics.mjs')
   const run=(state,controls,seconds,dt=1/60)=>{for(let t=0;t<seconds-1e-8;t+=dt)state=stepRideDynamics(state,controls,Math.min(dt,seconds-t));return state}
   const free=createRideDynamics({linearDrag:0,quadraticDrag:0}),force=run(free,{throttle:1},1)
   const start=run(createRideDynamics(),{throttle:1},1),left=run(start,{throttle:1,steer:-1},1),right=run(start,{throttle:1,steer:1},1)
   const stop=run(run(start,{brake:1},2),{},5)
   const coasting=run(createRideDynamics({initialVelocity:[0,0,3],linearDrag:0,quadraticDrag:0}),{},5)
   const simulated=dt=>run(run(createRideDynamics(),{throttle:1},2,dt),{throttle:.5,steer:.4},1,dt)
   return {force,left,right,stop,coasting,dt30:simulated(1/30),dt120:simulated(1/120)}
  })
  assert(Math.abs(dynamics.force.velocity[2]-dynamics.force.config.driveForce/dynamics.force.config.mass)<1e-6,'Force/mass integration is inconsistent')
  assert(Math.abs(dynamics.left.position[0]+dynamics.right.position[0])<1e-6&&Math.abs(dynamics.left.position[2]-dynamics.right.position[2])<1e-6,'Turn mirror symmetry failed')
  assert(Math.abs(dynamics.left.pose.balanceLeanSide+dynamics.right.pose.balanceLeanSide)<1e-6,'Left/right balance is asymmetric')
  assert(dynamics.stop.pose.speed<1e-5&&Math.abs(dynamics.stop.pose.balanceLeanForward)<1e-4&&Math.abs(dynamics.stop.pose.balanceLeanSide)<1e-4,'Stopped balance fails to converge')
  assert(Math.abs(dynamics.coasting.pose.balanceLeanForward)<1e-7&&Math.abs(dynamics.coasting.pose.balanceLeanSide)<1e-7,'Uniform motion generates periodic fake balance')
  assert(Math.hypot(...dynamics.dt30.position.map((v,i)=>v-dynamics.dt120.position[i]))<.03,'Dynamics depends excessively on frame duration')
  results.push({case:'deterministic-physics-properties',dynamics})
  assert(pageErrors.length===0,JSON.stringify(pageErrors));assert(nonGetRequests.length===0,JSON.stringify(nonGetRequests))
  return {kind:'ride-balance-authored-fixture',results,pageErrors,nonGetRequests,limits:['Reduced vehicle dynamics and empirical pose control, not full-body contact physics.','Real VRM images require separate private observation.','Foot targets are ankle points; sole mesh contact needs separate measurement.']}
 }finally{page.off('pageerror',onError);page.off('request',onRequest)}
}
