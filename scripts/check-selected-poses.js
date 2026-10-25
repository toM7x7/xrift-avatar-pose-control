async (page) => {
 const results=[],errors=[],writes=[]
 const onError=e=>errors.push(e.message),onRequest=r=>{if(r.method()!=='GET')writes.push({method:r.method(),url:r.url()})}
 page.on('pageerror',onError);page.on('request',onRequest)
 const assert=(condition,message)=>{if(!condition)throw Error(message)}
 const checked=async(id,value)=>{const el=page.locator('#'+id);if(await el.count())await el.setChecked(value)}
 const range=async(id,value)=>page.locator('#'+id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},value)
 const settle=async(preset)=>{
  await page.waitForFunction(p=>{const a=window.__avatarLab;return a?.preset===p&&a.connected&&!a.error&&a.frames>1},preset)
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  return page.evaluate(()=>structuredClone(window.__avatarLab))
 }
 const finite=(value,name)=>assert(typeof value==='number'&&Number.isFinite(value),'Missing/nonfinite '+name)
 const clean=a=>{
  assert(a.connected&&!a.error&&a.restored,JSON.stringify(a));assert(!a.carrier?.error,JSON.stringify(a.carrier))
  if(a.preset==='shoulder'){
   assert(a.carrier?.restored===true,'Carrier not restored')
   for(const key of ['handTargetErrorMm','maxLimbLengthErrorMm','headDriftMm'])finite(a.carrier.metrics?.[key],'carrier.metrics.'+key)
   assert(a.carrier.metrics.maxLimbLengthErrorMm<.01,'Carrier stretches bones')
   assert(a.carrier.metrics.headDriftMm<.01,'Carrier pose moves host head')
   if(a.profile==='standard'&&a.carrier.scale===1&&a.metrics.anchorMode==='support')assert(a.carrier.metrics.handTargetErrorMm<.01,'Standard carrier misses passenger shin targets')
  }
 }
 try {
  await page.setViewportSize({width:1440,height:1100})
  await page.locator('#preset option[value=nimbus]').waitFor({state:'attached'})
  // This regression retains the historical head-priority contract. The new
  // planted-feet physical drive is covered by check-ride-balance.js.
  await page.locator('#nimbusAnchorMode').selectOption('head')
  await checked('motion',false);await checked('carrierMotion',false);await checked('hands',false)
  await range('heading',0);await range('stanceWidth',1);await range('crouch',.45);await range('carrierScale',1)
  for(const preset of ['nimbus','shoulder'])for(const profile of ['standard','small','tall']){
   await page.locator('#profile').selectOption(profile)
   await page.locator('#preset').selectOption(preset)
   if(preset==='shoulder')await page.locator('#anchorMode').selectOption('support')
   const a=await settle(preset);clean(a)
   finite(a.metrics.headDriftMm,'headDriftMm')
   if(preset==='nimbus'){
    assert(a.metrics.headDriftMm<.01,'N02 moves host head')
    finite(a.metrics.footTargetErrorMm,'footTargetErrorMm');finite(a.metrics.boneLengthErrorMm,'boneLengthErrorMm')
    assert(a.metrics.boneLengthErrorMm<.01,'N02 stretches bones')
    assert(a.metrics.footTargetErrorMm<1,'Default N02 does not reach foot targets')
   }else{
    finite(a.metrics.supportErrorMm,'supportErrorMm')
    assert(a.metrics.supportErrorMm<.01,'U02 hip loses shoulder support')
    finite(a.metrics.maxLimbLengthErrorMm,'maxLimbLengthErrorMm')
    assert(a.metrics.maxLimbLengthErrorMm<.01,'U02 stretches bones')
   }
   results.push({case:'profile',profile,preset,metrics:a.metrics,carrier:a.carrier??null})
  }
  await page.locator('#profile').selectOption('standard')
  await page.locator('#preset').selectOption('nimbus')
  for(const heading of [-1.2,1.2]){
   await range('heading',heading);const a=await settle('nimbus');clean(a)
   assert(a.metrics.headDriftMm<.01,'N02 heading moves host head')
   assert(a.metrics.boneLengthErrorMm<.01,'N02 heading stretches bones')
   results.push({case:'nimbus-heading',heading,metrics:a.metrics})
  }
  await range('heading',0)
  for(const [stanceWidth,crouch] of [[.6,0],[1.4,1]]){
   await range('stanceWidth',stanceWidth);await range('crouch',crouch)
   const a=await settle('nimbus');clean(a)
   assert(a.metrics.headDriftMm<.01&&a.metrics.boneLengthErrorMm<.01,'N02 extreme breaks head/bone invariants')
   finite(a.metrics.footTargetErrorMm,'footTargetErrorMm')
   finite(a.metrics.kneeTargetErrorDegrees,'kneeTargetErrorDegrees')
   if(stanceWidth===1.4)assert(a.metrics.poseLimited===true&&a.metrics.kneeTargetErrorDegrees>10,'Wide/deep request hides the limited knee target')
   results.push({case:'nimbus-reach',stanceWidth,crouch,metrics:a.metrics})
  }
  await range('stanceWidth',1);await range('crouch',.45)
  for(const preset of ['nimbus','shoulder']){
   await page.locator('#preset').selectOption(preset)
   await checked('hands',true);const a=await settle(preset);clean(a)
   finite(a.metrics.handPositionErrorMm,'handPositionErrorMm')
   results.push({case:'tracked-hands',preset,metrics:a.metrics})
   // Reach error is evidence of conflicting constraints, not permission to stretch.
   if(a.metrics.boneLengthErrorMm!==undefined)assert(a.metrics.boneLengthErrorMm<.01,'Tracked hand constraint stretches bones')
   if(a.metrics.maxLimbLengthErrorMm!==undefined)assert(a.metrics.maxLimbLengthErrorMm<.01,'U02 tracked hands stretch bones')
   await checked('hands',false)
  }
  await page.locator('#preset').selectOption('shoulder')
  await page.locator('#anchorMode').selectOption('head')
  const headMode=await settle('shoulder');clean(headMode)
  assert(headMode.metrics.headDriftMm<.01,'U02 head mode moves tracked head')
  results.push({case:'shoulder-head-mode',metrics:headMode.metrics})
  await page.locator('#anchorMode').selectOption('support')
  for(const carrierScale of [.65,1.35]){
   await range('carrierScale',carrierScale);const a=await settle('shoulder');clean(a)
   assert(a.metrics.supportErrorMm<.01,'U02 carrier size loses support')
   results.push({case:'carrier-scale',carrierScale,metrics:a.metrics})
  }
  await page.locator('#profile').selectOption('small');await range('carrierScale',1.35)
  const mixed=await settle('shoulder');clean(mixed)
  assert(mixed.metrics.supportErrorMm<.01,'U02 small passenger / tall carrier loses support')
  results.push({case:'small-passenger-tall-carrier',profile:'small',carrierScale:1.35,metrics:mixed.metrics,carrier:mixed.carrier,visualAcceptance:'requires-independent-capture-review'})
  await page.locator('#profile').selectOption('standard')
  await range('carrierScale',1);await checked('carrierMotion',true)
  const start=await settle('shoulder')
  assert(Array.isArray(start.carrier?.position),'Missing carrier world position')
  await page.waitForFunction(position=>{const p=window.__avatarLab?.carrier?.position;return p&&p.some((v,i)=>Math.abs(v-position[i])>.02)},start.carrier.position)
  const moved=await settle('shoulder');clean(moved)
  assert(moved.metrics.supportErrorMm<.01,'U02 moving carrier loses support')
  results.push({case:'moving-carrier',from:start.carrier.position,to:moved.carrier.position,metrics:moved.metrics})
  await checked('carrierMotion',false)
  for(const view of ['front','side','back','orbit']){
   await page.locator('#view').selectOption(view);const a=await settle('shoulder');clean(a)
   results.push({case:'view',view,supportErrorMm:a.metrics.supportErrorMm})
  }
  await page.locator('#preset').selectOption('native')
  await page.waitForFunction(()=>window.__avatarLab?.preset==='native')
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const disabled=await page.evaluate(()=>structuredClone(window.__avatarLab))
  await page.evaluate(()=>new Promise(resolve=>{let n=10;const step=()=>--n?requestAnimationFrame(step):resolve();requestAnimationFrame(step)}))
  const after=await page.evaluate(()=>structuredClone(window.__avatarLab))
  assert(disabled.frames===after.frames,'Disabled passenger still poses')
  assert(after.restored,'Native does not restore passenger')
  results.push({case:'disabled',frames:after.frames,restored:after.restored})
  assert(errors.length===0,JSON.stringify(errors));assert(writes.length===0,JSON.stringify(writes))
  return {kind:'authored-fixture-only',results,pageErrors:errors,nonGetRequests:writes,unverified:['real VRM','XRift host','Quest','remote users','real tracking']}
 } finally {page.off('pageerror',onError);page.off('request',onRequest)}
}
