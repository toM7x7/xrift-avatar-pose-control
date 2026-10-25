async (page) => {
 const results=[],errors=[],writes=[]
 const onError=e=>errors.push(e.message),onRequest=r=>{if(r.method()!=='GET')writes.push(r.method())}
 page.on('pageerror',onError);page.on('request',onRequest)
 try{
  await page.setViewportSize({width:1440,height:1100})
  const models=await page.locator('#localModels option').evaluateAll(options=>options.map(o=>o.value))
  if(!models.length)throw Error('Select local VRM files first. This script never fetches models from a server.')
  for(let index=0;index<models.length;index++){
   const id='A'+String(index+1).padStart(2,'0')
   await page.locator('#resetPose').click()
   await page.locator('#localModels').selectOption(models[index])
   await page.waitForFunction(()=>document.querySelector('#message').textContent==='ローカルVRM読込済み')
   await page.waitForFunction(()=>window.__avatarLab?.profile==='local-vrm'&&window.__avatarLab.connected&&!window.__avatarLab.error&&window.__avatarLab.frames>3)
   for(const preset of ['native','nimbus','shoulder']){
    await page.locator('#preset').selectOption(preset)
    for(const view of preset==='native'?['front']:['front','side','back','orbit']){
     await page.locator('#view').selectOption(view)
     await page.evaluate(()=>new Promise(resolve=>{let n=8;const tick=()=>--n?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick)}))
     await page.locator('#controls').evaluate(el=>el.scrollTop=0)
     const state=await page.evaluate(()=>structuredClone(window.__avatarLab))
     if(!state.connected||state.error||!state.restored||!state.skinDiagnostics)throw Error('Invalid pose state '+id+' '+preset)
     if(preset==='native'&&state.metrics!==null)throw Error('Native has stale corrected metrics')
     if(preset==='nimbus'&&(state.metrics.anchorMode==='head'&&state.metrics.headDriftMm>.01||state.metrics.boneLengthErrorMm>.01))throw Error('N02 loses selected head policy or bone length')
     if(preset==='shoulder'&&(state.metrics.supportErrorMm>.01||state.metrics.maxLimbLengthErrorMm>.01||!state.carrier.restored))throw Error('U02 loses support or bone length')
     const visibleFeet=state.skinDiagnostics.feet.every(f=>f.weightedVertexCount>0)
     const soleGapsMm=preset==='nimbus'&&visibleFeet?state.skinDiagnostics.feet.map(f=>(f.min[1]-state.supportPlaneY)*1000):null
     const path='local-assets/real-vrm-corrected/'+id+'-'+preset+'-'+view+'.png'
     await page.screenshot({path})
     results.push({id,preset,view,path,visibleFeet,soleGapsMm,state})
    }
   }
  }
  await page.locator('#localModels').selectOption(models[0]);await page.waitForFunction(()=>document.querySelector('#message').textContent==='ローカルVRM読込済み')
  await page.locator('#preset').selectOption('nimbus');await page.locator('#view').selectOption('orbit')
  return {kind:'local-real-vrm-corrected',results,pageErrors:errors,nonGetRequests:writes}
 }finally{page.off('pageerror',onError);page.off('request',onRequest)}
}
