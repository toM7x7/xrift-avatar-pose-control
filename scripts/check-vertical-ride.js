async (page) => {
 const results=[],pageErrors=[],nonGetRequests=[]
 const onError=e=>pageErrors.push(e.message),onRequest=r=>{if(r.method()!=='GET')nonGetRequests.push({method:r.method(),url:r.url()})}
 page.on('pageerror',onError);page.on('request',onRequest)
 const assert=(ok,message)=>{if(!ok)throw Error(message)}
 const finite=(n,name)=>assert(typeof n==='number'&&Number.isFinite(n),'Missing/nonfinite '+name)
 const pause=async(value=true)=>page.locator('#drivePause').setChecked(value)
 const fresh=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return page.evaluate(()=>structuredClone(window.__avatarLab))}
 const vecClose=(a,b,tolerance=1e-7)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<tolerance)
 const sameAnchors=(a,b)=>{
  assert(a.ride.anchorGeneration===b.ride.anchorGeneration,'Vertical movement silently recalibrated the anchors')
  assert(a.ride.anchorsLocal.length===b.ride.anchorsLocal.length&&a.ride.anchorsLocal.every((p,i)=>vecClose(p,b.ride.anchorsLocal[i])),'Local foot anchors drift under vertical movement')
  const dy=b.ride.state.position[1]-a.ride.state.position[1]
  a.ride.anchorsWorld.forEach((p,i)=>assert(Math.abs((b.ride.anchorsWorld[i][1]-p[1])-dy)<1e-7,'World foot anchor height does not follow ride altitude'))
 }
 const clean=a=>{
  assert(a.connected&&!a.error&&a.restored,'Pose driver failed/restoration missing')
  finite(a.metrics.footTargetErrorMm,'footTargetErrorMm');finite(a.metrics.boneLengthErrorMm,'boneLengthErrorMm')
  assert(a.metrics.boneLengthErrorMm<.01,'Vertical response stretches limb bones')
  if(a.metrics.anchorMode==='support')assert(a.metrics.footTargetErrorMm<1,'Vertical response loses the fixed foot targets')
  assert(a.metrics.bodyBalance.neckYawDegrees<=20.01||a.metrics.bodyBalance.neckPolicyExceeded,'Neck conflict is hidden')
  assert(a.metrics.knees.every(k=>k<=a.metrics.bodyBalance.maxKneeDegrees+.1),'Ordinary vertical input exceeds knee policy')
  for(const key of ['pelvisPitchDegrees','chestPitchDegrees'])finite(a.metrics.bodyBalance[key],'bodyBalance.'+key)
  finite(a.metrics.verticalBody?.verticalCompression,'verticalBody.verticalCompression')
  finite(a.metrics.balanceProxy.comHeightM,'balanceProxy.comHeightM')
  assert(Math.abs(a.metrics.balanceProxy.comHeightM-(a.metrics.balanceProxy.centerOfMassWorld[1]-a.metrics.contactPlaneY))<1e-7,'Pose COM height is not support-relative')
  const s=a.ride.state,p=s.pose
  for(const key of ['verticalAcceleration','verticalSpeed','normalLoadRatio'])finite(p[key],key)
  assert(Math.abs(p.verticalSpeed-s.velocity[1])<1e-7,'Vertical speed telemetry differs from state velocity')
  assert(Math.abs(p.normalLoadRatio-(1+p.verticalAcceleration/s.config.gravity))<1e-6,'Normal load ratio does not follow vertical acceleration')
  assert(['supported','low-load','adhesion'].includes(p.supportState),'Unknown vertical support state')
  assert(typeof p.zmpValid==='boolean','Missing ZMP validity')
  if(!p.zmpValid)assert(p.zeroMomentPoint===null&&p.loadRatio===null,'Invalid ZMP/load ratio is still presented as a number')
  assert(s.position.every(Number.isFinite)&&s.velocity.every(Number.isFinite),'Nonfinite vertical transform')
 }
 const phase=async(button,seconds)=>{
  await pause();const before=await fresh();await page.locator('#'+button).click();await pause(false)
  await page.waitForFunction(time=>window.__avatarLab?.ride?.state?.time>=time,before.ride.state.time+seconds)
  await pause();const state=await fresh();clean(state);return state
 }
 try {
  await page.locator('#profile').selectOption('standard');await page.locator('#preset').selectOption('nimbus')
  await page.locator('#nimbusAnchorMode').selectOption('support');await page.locator('#hands').uncheck()
  await page.locator('#driveReset').click();await pause()
  const before=await fresh()
  if(!await page.locator('#driveUp').count()){
   assert(before.connected&&!before.error&&before.restored,'Baseline driver unavailable')
   results.push({case:'horizontal-only-baseline',state:before,relativeComHeightM:before.metrics.balanceProxy.centerOfMassWorld[1]-before.metrics.contactPlaneY})
   return {kind:'vertical-ride-before-implementation',results,pageErrors,nonGetRequests,limits:['Vertical controls absent; vertical behavior is not tested.']}
  }
  clean(before);assert(Math.abs(before.ride.state.pose.normalLoadRatio-1)<1e-5,'Hover baseline is not normal load')
  results.push({case:'hover-baseline',state:before})
  const up=await phase('driveUp',1);sameAnchors(before,up)
  assert(up.ride.state.position[1]>before.ride.state.position[1]+.1&&up.ride.state.pose.verticalSpeed>.1,'Up force does not lift the ride')
  assert(up.ride.state.pose.verticalAcceleration>0&&up.ride.state.pose.normalLoadRatio>1,'Up acceleration is not heavier')
  results.push({case:'ascending-accelerating-heavy',state:up})
  const upBrake=await phase('driveBrake',.18);sameAnchors(before,upBrake)
  assert(upBrake.ride.state.pose.verticalSpeed>0&&upBrake.ride.state.pose.verticalAcceleration<0&&upBrake.ride.state.pose.normalLoadRatio<1,'Ascending deceleration is not lighter')
  results.push({case:'ascending-braking-light',state:upBrake})
  const upStop=await phase('driveBrake',1.5);sameAnchors(before,upStop)
  assert(Math.abs(upStop.ride.state.pose.verticalSpeed)<.01&&Math.abs(upStop.ride.state.pose.normalLoadRatio-1)<.01,'Vertical brake does not recover hover load')
  results.push({case:'upper-stop-recovery',state:upStop})
  await page.locator('#driveReset').click();await pause();const downBase=await fresh();clean(downBase)
  const down=await phase('driveDown',1);sameAnchors(downBase,down)
  assert(down.ride.state.position[1]<downBase.ride.state.position[1]-.1&&down.ride.state.pose.verticalSpeed<-.1,'Down force does not lower the ride')
  assert(down.ride.state.pose.verticalAcceleration<0&&down.ride.state.pose.normalLoadRatio<1,'Down acceleration is not lighter')
  results.push({case:'descending-accelerating-light',state:down})
  const downBrake=await phase('driveBrake',.18);sameAnchors(downBase,downBrake)
  assert(downBrake.ride.state.pose.verticalSpeed<0&&downBrake.ride.state.pose.verticalAcceleration>0&&downBrake.ride.state.pose.normalLoadRatio>1,'Descending deceleration is not heavier')
  results.push({case:'descending-braking-heavy',state:downBrake})
  const downStop=await phase('driveBrake',1.5);sameAnchors(downBase,downStop)
  assert(Math.abs(downStop.ride.state.pose.verticalSpeed)<.01&&Math.abs(downStop.ride.state.pose.normalLoadRatio-1)<.01,'Descent brake does not recover hover load')
  results.push({case:'lower-stop-recovery',state:downStop})
  const stopped=await fresh();await page.evaluate(()=>new Promise(resolve=>{let n=12;const frame=()=>--n?requestAnimationFrame(frame):resolve();requestAnimationFrame(frame)}));const held=await fresh()
  assert(held.ride.state.time===stopped.ride.state.time&&vecClose(held.ride.state.position,stopped.ride.state.position),'Paused vertical movement keeps integrating')
  results.push({case:'pause-restoration',state:held})
  // Same motion at different world heights must not change local dynamics or COM height.
  const deterministic=await page.evaluate(async()=>{
   const {createRideDynamics,stepRideDynamics}=await import('/src/ride-dynamics.mjs')
   const run=(s,input,seconds)=>{for(let t=0;t<seconds-1e-8;t+=1/120)s=stepRideDynamics(s,input,Math.min(1/120,seconds-t));return s}
   const options={mass:70,liftForceUp:210,liftForceDown:210,verticalDrag:0,verticalQuadraticDrag:0}
   const low=run(createRideDynamics({...options,initialPosition:[0,0,0]}),{lift:1},.5),high=run(createRideDynamics({...options,initialPosition:[0,100,0]}),{lift:1},.5)
   const negative=run(createRideDynamics({...options,liftForceDown:1400}),{lift:-1},.1),recovered=run(negative,{},.5)
   const light=run(createRideDynamics({...options,liftForceDown:70*9.81*.9}),{lift:-1},.15)
   const {createPoseFixture}=await import('/src/vendor/fixture.mjs'),{prepareHumanoidRig}=await import('/src/index.mjs'),{captureBones,restoreBones}=await import('/src/vendor/render-pose.mjs'),{applyNimbusPose}=await import('/src/nimbus-pose.mjs')
   const heightSample=altitude=>{
    const f=createPoseFixture();f.mesh.position.y=altitude;f.mesh.updateWorldMatrix(true,true);const rig=prepareHumanoidRig({mesh:f.mesh,bones:f.bones});f.seated();const saved=captureBones(f.skeleton),cal=applyNimbusPose(rig);restoreBones(saved)
    const m=applyNimbusPose(rig,{anchorMode:'support',footTargetsWorld:cal.feetWorld,supportSoleOffsetM:.0625,balance:{normalLoadRatio:1,verticalAcceleration:0}});f.dispose()
    return {altitude,height:m.balanceProxy.centerOfMassWorld[1]-m.contactPlaneY,feet:m.feetWorld,COM:m.balanceProxy.centerOfMassWorld,metrics:m}
   }
   return {low,high,negative,recovered,light,heightLow:heightSample(0),heightHigh:heightSample(100)}
  })
  assert(Math.abs(deterministic.high.position[1]-deterministic.low.position[1]-100)<1e-7,'World altitude changes the vertical integration')
  assert(Math.abs(deterministic.low.pose.normalLoadRatio-deterministic.high.pose.normalLoadRatio)<1e-7,'Normal load depends on world altitude')
  assert(Math.abs(deterministic.heightLow.height-deterministic.heightHigh.height)<1e-6,'Measured COM height includes world altitude')
  assert(deterministic.negative.pose.normalLoadRatio<0&&deterministic.negative.pose.supportState==='adhesion'&&!deterministic.negative.pose.zmpValid,'Negative load does not expose adhesion / invalid ZMP')
  assert(deterministic.light.pose.supportState==='low-load'&&!deterministic.light.pose.zmpValid,'Low load is treated as ordinary support')
  for(const s of [deterministic.negative,deterministic.light])assert(s.pose.zeroMomentPoint===null&&s.pose.loadRatio===null,'Unsupported load still publishes ZMP/load ratios')
  assert(deterministic.recovered.pose.supportState==='supported'&&deterministic.recovered.pose.zmpValid,'Support hysteresis does not recover')
  results.push({case:'height-invariance-and-support-boundaries',deterministic})
  const heavyMean=up.metrics.knees.reduce((s,v)=>s+v,0)/2,lightMean=down.metrics.knees.reduce((s,v)=>s+v,0)/2
  assert(heavyMean>lightMean+.5,'Heavy/light inputs do not create a measurable knee response')
  assert(up.metrics.verticalBody.verticalCompression>down.metrics.verticalBody.verticalCompression,'Heavy/light body compression is not distinct')
  assert(Math.abs(up.metrics.bodyBalance.chestPitchDegrees-down.metrics.bodyBalance.chestPitchDegrees)>.5,'Chest does not follow heavy/light response')
  assert(Math.abs(up.metrics.bodyBalance.pelvisPitchDegrees-down.metrics.bodyBalance.pelvisPitchDegrees)>.25,'Pelvis does not follow heavy/light response')
  results.push({case:'heavy-light-body-coupling',heavyMeanKnee:heavyMean,lightMeanKnee:lightMean,heavy:up.metrics,light:down.metrics})
  await page.locator('#driveReset').click();await pause();const combinedBase=await fresh();clean(combinedBase)
  const horizontal=await phase('driveForward',.5),combined=await phase('driveUp',.7);sameAnchors(combinedBase,combined)
  assert(combined.ride.state.position[1]>horizontal.ride.state.position[1]+.1&&combined.ride.state.position[2]>horizontal.ride.state.position[2]+.1,'Forward then Up does not preserve combined Y/Z movement')
  assert(combined.ride.state.pose.input.throttle>0&&combined.ride.state.pose.input.lift>0,'Up input replaced the forward command')
  results.push({case:'combined-forward-and-up',before:horizontal,state:combined})
  await page.locator('#driveReset').click();await pause();await page.locator('#followRide').uncheck()
  await page.evaluate(()=>new Promise((resolve,reject)=>{
   let previous=null,stable=0,frames=0
   const check=()=>{const camera=window.__avatarLab?.camera;if(!camera)return reject(Error('Missing camera telemetry'))
    const sample=[...camera.position,...camera.quaternion]
    stable=previous&&sample.every((v,i)=>Math.abs(v-previous[i])<1e-10)?stable+1:0;previous=sample
    if(stable>=12)return resolve();if(++frames>360)return reject(Error('Orbit damping did not settle'));requestAnimationFrame(check)
   };requestAnimationFrame(check)
  }))
  const cameraBefore=await fresh(),unfollowed=await phase('driveUp',.7)
  assert(unfollowed.ride.state.position[1]>cameraBefore.ride.state.position[1]+.1,'Camera isolation test did not move the ride')
  assert(vecClose(cameraBefore.camera.position,unfollowed.camera.position,1e-8)&&vecClose(cameraBefore.camera.quaternion,unfollowed.camera.quaternion,1e-8),'Vertical movement changed camera with followRide disabled')
  results.push({case:'unfollowed-camera-isolation',cameraBefore:cameraBefore.camera,state:unfollowed})
  await page.locator('#followRide').check()
  await page.locator('#driveVerticalSequence').click();await pause();const sequenceInitial=await fresh();clean(sequenceInitial)
  assert(sequenceInitial.ride.phase==='vertical-sequence','Vertical sequence did not start')
  await page.evaluate(()=>new Promise(resolve=>{let n=12;const frame=()=>--n?requestAnimationFrame(frame):resolve();requestAnimationFrame(frame)}));const sequenceHeld=await fresh()
  assert(sequenceHeld.ride.state.time===sequenceInitial.ride.state.time&&sequenceHeld.ride.segment===sequenceInitial.ride.segment,'Pause does not stop the automatic sequence')
  await pause(false);await page.waitForFunction(()=>window.__avatarLab?.ride?.phase==='vertical-sequence'&&window.__avatarLab.ride.state.pose.verticalSpeed>.2)
  await pause();const sequenceAscending=await fresh();clean(sequenceAscending);sameAnchors(sequenceInitial,sequenceAscending)
  await pause(false);await page.waitForFunction(()=>window.__avatarLab?.ride?.phase==='vertical-sequence'&&window.__avatarLab.ride.state.pose.verticalSpeed<-.2)
  await pause();const sequenceDescending=await fresh();clean(sequenceDescending);sameAnchors(sequenceInitial,sequenceDescending)
  await pause(false);await page.waitForFunction(()=>window.__avatarLab?.ride?.phase==='stopped'&&window.__avatarLab.ride.state.time>=9)
  await pause();const sequenceStopped=await fresh();clean(sequenceStopped);sameAnchors(sequenceInitial,sequenceStopped)
  assert(Math.abs(sequenceStopped.ride.state.pose.verticalSpeed)<.01&&Math.abs(sequenceStopped.ride.state.pose.normalLoadRatio-1)<.01,'Vertical sequence does not recover stopped normal load after nine seconds')
  results.push({case:'vertical-automatic-sequence',initial:sequenceInitial,ascending:sequenceAscending,descending:sequenceDescending,state:sequenceStopped})
  await page.locator('#preset').selectOption('native');await page.waitForFunction(()=>window.__avatarLab?.preset==='native');const native=await fresh()
  await page.evaluate(()=>new Promise(resolve=>{let n=10;const frame=()=>--n?requestAnimationFrame(frame):resolve();requestAnimationFrame(frame)}));const disabled=await fresh()
  assert(disabled.restored&&disabled.frames===native.frames,'Native mode does not stop/restore the vertical pose')
  results.push({case:'native-release',frames:disabled.frames,restored:disabled.restored})
  assert(!pageErrors.length&&!nonGetRequests.length,JSON.stringify({pageErrors,nonGetRequests}))
  return {kind:'vertical-ride-authored-fixture',results,pageErrors,nonGetRequests,limits:['Horizontal support plane and yaw only.','COM/ZMP/load are reduced proxies, not full-body contact physics.','Real VRM images, VR camera tracking, bank and stunts require separate observation.']}
 }finally{page.off('pageerror',onError);page.off('request',onRequest)}
}
