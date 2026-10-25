async (page) => {
 const results=[],pageErrors=[],nonGetRequests=[]
 const onError=e=>pageErrors.push(e.message),onRequest=r=>{if(r.method()!=='GET')nonGetRequests.push({method:r.method(),url:r.url()})}
 page.on('pageerror',onError);page.on('request',onRequest)
 const assert=(ok,message)=>{if(!ok)throw Error(message)}
 const finite=(n,name)=>assert(typeof n==='number'&&Number.isFinite(n),'Missing/nonfinite '+name)
 const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],scale=(a,k)=>a.map(v=>v*k)
 const rotate=(v,q)=>{const u=q.slice(0,3),uv=cross(u,v);return add(v,add(scale(uv,2*q[3]),scale(cross(u,uv),2)))}
 const close=(a,b,e=1e-7)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<e)
 const fresh=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return page.evaluate(()=>structuredClone(window.__avatarLab))}
 const pause=async(value=true)=>page.locator('#drivePause').setChecked(value)
 const range=async(id,value)=>page.locator('#'+id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},value)
 const frameCheck=a=>{
  const s=a.ride.state,q=s.supportQuaternion,f=s.supportFrame
  assert(Array.isArray(q)&&q.length===4&&Math.abs(dot(q,q)-1)<1e-6,'Support quaternion is not normalized')
  for(const [key,axis]of [['normal',[0,1,0]],['right',[1,0,0]],['forward',[0,0,1]]]){
   assert(close(f[key],rotate(axis,q)),'Support '+key+' is inconsistent with quaternion')
   assert(Math.abs(dot(f[key],f[key])-1)<1e-6,'Support '+key+' is not unit length')
  }
  assert(Math.abs(dot(f.normal,f.right))<1e-6&&Math.abs(dot(f.normal,f.forward))<1e-6&&Math.abs(dot(f.right,f.forward))<1e-6,'Support frame is not orthogonal')
  const origin=a.ride.supportOriginLocal
  const originBase=a.ride.supportOriginWorldBase
  assert(Array.isArray(origin)&&origin.length===3,'Missing stable support pivot')
  assert(Array.isArray(originBase)&&originBase.length===3,'Missing initial-yaw support pivot base')
  a.ride.anchorsLocal.forEach((anchor,i)=>assert(close(a.ride.anchorsWorld[i],add(add(rotate(sub(anchor,origin),q),originBase),s.position)),'Foot world anchor does not follow the support pivot transform'))
  assert(Math.abs(s.attitude.pitch)<=s.config.pitchLimitRadians+1e-7&&Math.abs(s.attitude.roll)<=s.config.rollLimitRadians+1e-7,'Support attitude exceeds configured angle limits')
  assert(Math.abs(s.attitude.pitchRate)<=s.config.attitudeMaxRate+1e-7&&Math.abs(s.attitude.rollRate)<=s.config.attitudeMaxRate+1e-7,'Support attitude exceeds configured angular rate limit')
  finite(s.pose.normalLoadRatio,'normalLoadRatio')
  assert(Math.abs(s.pose.normalLoadRatio-dot(add(s.acceleration,[0,s.config.gravity,0]),f.normal)/s.config.gravity)<1e-6,'Normal load is not projected onto the tilted support normal')
 }
 const clean=a=>{
  assert(a.connected&&!a.error&&a.restored,'Tilt pose failed or did not restore')
  frameCheck(a)
  finite(a.metrics.footTargetErrorMm,'footTargetErrorMm');finite(a.metrics.boneLengthErrorMm,'boneLengthErrorMm')
  assert(a.metrics.footTargetErrorMm<1,'Tilt loses fixed foot anchors');assert(a.metrics.boneLengthErrorMm<.01,'Tilt stretches limb bones')
  assert(a.metrics.headRotationErrorDegrees<.01,'Tilt overwrites the input head world quaternion')
  finite(a.metrics.headUpDotWorld,'headUpDotWorld');assert(a.metrics.headUpDotWorld>.9999,'Ordinary tilt rolls/pitches the neutral-look head away from world up')
  assert(a.metrics.footSoleNormalErrorDegrees?.length===2&&a.metrics.footSoleNormalErrorDegrees.every(v=>Number.isFinite(v)&&v<.5),'Foot sole normal proxies do not align with the support normal')
  finite(a.metrics.ankleNormalHeightSpreadMm,'ankleNormalHeightSpreadMm');assert(a.metrics.ankleNormalHeightSpreadMm<1,'Ankle targets do not share the tilted support plane')
  assert(close(a.metrics.supportFrame.normalWorld,a.ride.state.supportFrame.normal),'Pose and dynamics use different support normals')
  assert(a.metrics.knees.every(k=>k<=a.metrics.bodyBalance.maxKneeDegrees+.1),'Ordinary tilt input exceeds knee policy')
  const plane=a.skinDiagnostics?.supportPlane
  assert(plane?.position&&plane?.normal,'Missing posed-skin support plane diagnostics')
  const measuredHeight=dot(sub(a.metrics.balanceProxy.centerOfMassWorld,plane.position),plane.normal)
  assert(Math.abs(measuredHeight-a.metrics.balanceProxy.comHeightM)<1e-6,'COM height is not the support-normal distance')
  for(const foot of a.skinDiagnostics.feet){finite(foot.supportGapM,'foot.supportGapM');assert(Math.abs(foot.supportGapM)<.002,'Authored sole vertices miss the tilted plane')}
 }
 const sameAnchors=(a,b)=>{
  assert(a.ride.anchorGeneration===b.ride.anchorGeneration,'Tilt movement silently recalibrated foot anchors')
  assert(a.ride.anchorsLocal.every((p,i)=>close(p,b.ride.anchorsLocal[i])),'Tilt changes foot local targets')
  assert(close(a.ride.supportOriginLocal,b.ride.supportOriginLocal),'Tilt changes the support pivot')
  assert(close(a.ride.supportOriginWorldBase,b.ride.supportOriginWorldBase),'Tilt changes the initial-yaw support pivot base')
 }
 const phase=async(button,seconds)=>{
  await pause();const before=await fresh();await page.locator('#'+button).click();await pause(false)
  await page.waitForFunction(t=>window.__avatarLab?.ride?.state?.time>=t,before.ride.state.time+seconds)
  await pause();const state=await fresh();clean(state);return state
 }
 const reset=async()=>{await page.locator('#driveReset').click();await pause();const a=await fresh();clean(a);return a}
 try {
  await page.locator('#profile').selectOption('standard');await page.locator('#preset').selectOption('nimbus')
  await page.locator('#nimbusAnchorMode').selectOption('support');await page.locator('#hands').uncheck();await page.locator('#motion').uncheck()
  await range('headYaw',0);await range('headPitch',0);await range('heading',0);await page.locator('#cloudTilt').check()
  const neutral=await reset();results.push({case:'tilt-neutral',state:neutral})
  const up=await phase('driveUp',1);sameAnchors(neutral,up)
  assert(up.ride.state.attitude.pitch>.01,'Ascent does not pitch the cloud nose up')
  results.push({case:'ascending-pitch',state:up})
  const upBrake=await phase('driveBrake',.18);sameAnchors(neutral,upBrake);results.push({case:'ascending-brake',state:upBrake})
  const upStop=await phase('driveBrake',2.5);sameAnchors(neutral,upStop)
  assert(Math.abs(upStop.ride.state.attitude.pitch)<.01&&Math.abs(upStop.ride.state.attitude.roll)<.01,'Stopped cloud attitude does not settle')
  results.push({case:'upper-stop-attitude-recovery',state:upStop})
  const downBase=await reset(),down=await phase('driveDown',1);sameAnchors(downBase,down)
  assert(down.ride.state.attitude.pitch<-.01,'Descent does not pitch the cloud nose down')
  results.push({case:'descending-pitch',state:down})
  const downBrake=await phase('driveBrake',.18);sameAnchors(downBase,downBrake);results.push({case:'descending-brake',state:downBrake})
  for(const [button,sign]of [['driveLeft',-1],['driveRight',1]]){
   const base=await reset();await phase('driveForward',.8);const turn=await phase(button,1);sameAnchors(base,turn)
   assert(sign*turn.ride.state.attitude.roll>.005,'Bank sign does not match the turn')
   results.push({case:button+'-bank',state:turn})
  }
  await range('heading',1.1);const headingBase=await reset();await phase('driveForward',.6);const headingTurn=await phase('driveRight',.8);sameAnchors(headingBase,headingTurn)
  assert(headingTurn.ride.state.attitude.roll>.005,'Bank is lost at a nonzero initial heading')
  results.push({case:'nonzero-heading-pivot',initial:headingBase,state:headingTurn})
  const paused=await fresh();await page.evaluate(()=>new Promise(resolve=>{let n=12;const frame=()=>--n?requestAnimationFrame(frame):resolve();requestAnimationFrame(frame)}));const held=await fresh()
  assert(Math.abs(paused.ride.state.attitude.roll)>.005,'Pause case did not retain an actual banked attitude')
  assert(held.ride.state.time===paused.ride.state.time&&close(held.ride.state.supportQuaternion,paused.ride.state.supportQuaternion),'Paused tilt keeps integrating')
  results.push({case:'pause-attitude-and-restoration',state:held})
  await range('heading',0);await reset();await page.locator('#followRide').uncheck()
  await page.evaluate(()=>new Promise((resolve,reject)=>{let previous=null,stable=0,frames=0;const tick=()=>{const c=window.__avatarLab?.camera;if(!c)return reject(Error('Missing camera telemetry'));const sample=[...c.position,...c.quaternion];stable=previous&&sample.every((v,i)=>Math.abs(v-previous[i])<1e-10)?stable+1:0;previous=sample;if(stable>=12)return resolve();if(++frames>360)return reject(Error('Orbit damping did not settle'));requestAnimationFrame(tick)};requestAnimationFrame(tick)}))
  const cameraBefore=await fresh(),cameraMove=await phase('driveUp',.8)
  assert(cameraMove.ride.state.attitude.pitch>.01,'Camera isolation case did not tilt the cloud')
  assert(close(cameraBefore.camera.position,cameraMove.camera.position,1e-8)&&close(cameraBefore.camera.quaternion,cameraMove.camera.quaternion,1e-8),'Cloud tilt changes the observation camera with follow off')
  results.push({case:'tilt-camera-isolation',cameraBefore:cameraBefore.camera,state:cameraMove})
  await page.locator('#followRide').check()
  await page.locator('#driveTiltSequence').click();await pause();const sequenceInitial=await fresh();clean(sequenceInitial)
  assert(sequenceInitial.ride.phase==='tilt-sequence','Tilt sequence did not start')
  const sequenceSamples=[]
  for(const time of [2.75,4.75,6.75,8.75,14.1]){
   await pause(false);await page.waitForFunction(t=>window.__avatarLab?.ride?.state?.time>=t,time)
   await pause();const a=await fresh();clean(a);sameAnchors(sequenceInitial,a);sequenceSamples.push({at:time,state:a})
  }
  assert(sequenceSamples[0].state.ride.state.attitude.pitch>.02,'Combined sequence does not pitch upward')
  assert(sequenceSamples[1].state.ride.state.attitude.roll<-.005&&sequenceSamples[2].state.ride.state.attitude.roll>.005,'Combined sequence does not reverse its left/right bank')
  assert(sequenceSamples[3].state.ride.state.pose.verticalSpeed<-.1&&sequenceSamples[3].state.ride.state.attitude.pitch<-.01,'Combined sequence does not descend nose-down')
  const sequenceEnd=sequenceSamples[4].state
  assert(sequenceEnd.ride.phase==='stopped'&&sequenceEnd.ride.state.pose.totalSpeed<.01,'Combined sequence does not finish stopped')
  await pause(false);await page.waitForFunction(t=>window.__avatarLab?.ride?.state?.time>=t,sequenceEnd.ride.state.time+.4)
  await pause();const sequenceSettled=await fresh();clean(sequenceSettled);sameAnchors(sequenceInitial,sequenceSettled)
  assert(close(sequenceEnd.ride.state.position,sequenceSettled.ride.state.position,1e-6),'Stopped combined sequence keeps drifting')
  assert(Math.abs(sequenceSettled.ride.state.attitude.pitch)<.01&&Math.abs(sequenceSettled.ride.state.attitude.roll)<.01,'Combined sequence does not recover neutral attitude')
  results.push({case:'combined-tilt-sequence',initial:sequenceInitial,samples:sequenceSamples,state:sequenceSettled})
  const deterministic=await page.evaluate(async()=>{
   const {createRideDynamics,stepRideDynamics}=await import('/src/ride-dynamics.mjs')
   const run=(state,input,seconds,dt=1/120)=>{for(let t=0;t<seconds-1e-8;t+=dt)state=stepRideDynamics(state,input,Math.min(dt,seconds-t));return state}
   const options={attitudeEnabled:true,mass:70,liftForceUp:210,liftForceDown:210,driveForce:154,brakeForce:210,verticalBrakeForce:210}
   const initial=run(createRideDynamics(options),{throttle:1},1),left=run(initial,{throttle:.35,steer:-.75},1),right=run(initial,{throttle:.35,steer:.75},1)
   const up=run(createRideDynamics(options),{lift:1},1),down=run(createRideDynamics(options),{lift:-1},1),settled=run(run(up,{brake:1},2),{},2)
   const disabled=run(run(createRideDynamics({...options,attitudeEnabled:false}),{throttle:1,lift:1},1),{throttle:.35,steer:.75,lift:1},1)
   const enabledSameMotion=run(run(createRideDynamics(options),{throttle:1,lift:1},1),{throttle:.35,steer:.75,lift:1},1)
   const high=run(createRideDynamics({...options,initialPosition:[0,100,0]}),{lift:1},1)
   const {createPoseFixture}=await import('/src/vendor/fixture.mjs'),{prepareHumanoidRig}=await import('/src/index.mjs'),{captureBones,restoreBones}=await import('/src/vendor/render-pose.mjs'),{applyNimbusPose}=await import('/src/nimbus-pose.mjs')
   const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
   const rotated=(v,q)=>{const uv=cross(q.slice(0,3),v),uuv=cross(q.slice(0,3),uv);return v.map((x,i)=>x+2*q[3]*uv[i]+2*uuv[i])}
   const poseAtHeight=altitude=>{
    const f=createPoseFixture();f.mesh.position.y=altitude;f.mesh.updateWorldMatrix(true,true);const rig=prepareHumanoidRig({mesh:f.mesh,bones:f.bones});f.seated();const saved=captureBones(f.skeleton),cal=applyNimbusPose(rig),origin=cal.feetWorld[0].map((v,i)=>(v+cal.feetWorld[1][i])/2-(i===1?.0625:0)),q=up.supportQuaternion
    const targets=cal.feetWorld.map(p=>rotated(p.map((v,i)=>v-origin[i]),q).map((v,i)=>v+origin[i]));restoreBones(saved)
    const m=applyNimbusPose(rig,{anchorMode:'support',footTargetsWorld:targets,supportFrame:{position:origin,quaternion:q},supportSoleOffsetM:.0625,balance:{normalLoadRatio:1,effectiveGravityMps2:9.81}});f.dispose()
    return {altitude,comHeightM:m.balanceProxy.comHeightM,headUpDotWorld:m.headUpDotWorld,footErrorMm:m.footTargetErrorMm,supportFrame:m.supportFrame}
   }
   return {left,right,up,down,settled,disabled,enabledSameMotion,high,poseLow:poseAtHeight(0),poseHigh:poseAtHeight(100)}
  })
  assert(Math.abs(deterministic.left.attitude.roll+deterministic.right.attitude.roll)<1e-6,'Pure left/right bank is asymmetric')
  assert(Math.abs(deterministic.up.attitude.pitch+deterministic.down.attitude.pitch)<1e-6,'Pure ascent/descent pitch is asymmetric')
  assert(Math.abs(deterministic.settled.attitude.pitch)<.001&&Math.abs(deterministic.settled.attitude.roll)<.001,'Pure stopped attitude does not converge')
  assert(close(deterministic.disabled.supportFrame.normal,[0,1,0])&&Math.abs(deterministic.disabled.attitude.pitch)<1e-8&&Math.abs(deterministic.disabled.attitude.roll)<1e-8,'Disabled attitude breaks the yaw-only behavior')
  assert(close(deterministic.disabled.position,deterministic.enabledSameMotion.position)&&close(deterministic.disabled.velocity,deterministic.enabledSameMotion.velocity)&&Math.abs(deterministic.disabled.heading-deterministic.enabledSameMotion.heading)<1e-8,'Enabling attitude changes the reduced vehicle motion')
  assert(close(deterministic.up.supportQuaternion,deterministic.high.supportQuaternion)&&Math.abs(deterministic.high.position[1]-deterministic.up.position[1]-100)<1e-6,'Absolute altitude changes attitude dynamics')
  assert(Math.abs(deterministic.poseLow.comHeightM-deterministic.poseHigh.comHeightM)<1e-6,'Tilted pose COM normal height depends on absolute altitude')
  assert(deterministic.poseLow.footErrorMm<1&&deterministic.poseHigh.footErrorMm<1,'Height invariance case does not preserve fixed feet')
  results.push({case:'deterministic-attitude-properties',deterministic})
  await page.locator('#preset').selectOption('native');await page.waitForFunction(()=>window.__avatarLab?.preset==='native');const beforeRelease=await fresh()
  await page.evaluate(()=>new Promise(resolve=>{let n=12;const frame=()=>--n?requestAnimationFrame(frame):resolve();requestAnimationFrame(frame)}));const released=await fresh()
  assert(released.restored&&released.frames===beforeRelease.frames,'Native release keeps applying the tilted pose')
  results.push({case:'tilt-native-release',frames:released.frames,restored:released.restored})
  assert(!pageErrors.length&&!nonGetRequests.length,JSON.stringify({pageErrors,nonGetRequests}))
  return {kind:'tilted-support-authored-fixture',results,pageErrors,nonGetRequests,limits:['Support attitude and foot IK are reduced controls, not full-body contact physics.','Angular point acceleration and real VR camera tracking are separate verification targets.','Private real VRM captures need model-identity checks and independent visual review.']}
 }finally{page.off('pageerror',onError);page.off('request',onRequest)}
}
