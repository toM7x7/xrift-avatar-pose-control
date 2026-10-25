/** Numerical screening only. A pass never certifies clothing, contact physics or VR comfort. */
export function assessPatternSample({family, metrics, model, restored=true, error=null}) {
 const failures=[],limits=[],unsupported=[]
 if(error) failures.push('solver-error')
 if(!restored) failures.push('restore-mismatch')
 if(!metrics || metrics.finite===false) failures.push('nonfinite-pose')
 const nonfinite=value=>typeof value==='number'?!Number.isFinite(value):Array.isArray(value)?value.some(nonfinite):value&&typeof value==='object'?Object.values(value).some(nonfinite):false
 if(metrics&&nonfinite(metrics))failures.push('nonfinite-metric')
 if((metrics?.boneLengthErrorMm??0)>.01) failures.push('bone-length-changed')
 if((metrics?.headRotationErrorDegrees??0)>.001) failures.push('head-input-rotation-changed')
 if((metrics?.supportErrorMm??0)>2) limits.push('support-target-unreachable')
 if((metrics?.footTargetErrorMm??0)>2) limits.push('foot-target-unreachable')
 if((metrics?.handTargetErrorMm??metrics?.handPositionErrorMm??0)>20) limits.push('hand-target-unreachable')
 if((metrics?.carrierHandTargetErrorMm??0)>20) limits.push('carrier-hand-target-unreachable')
 if((metrics?.maxKneeDegrees??0)>135) limits.push('deep-knee-flexion')
 if((metrics?.neckAngleDegrees??0)>55) limits.push('head-neck-angle-large')
 if((metrics?.headChestAngleDegrees??0)>110) limits.push('head-chest-angle-large')
 for(const warning of metrics?.warnings??[]) limits.push(warning)
 if(model?.visibleFeet===false) unsupported.push('no-visible-foot-skin')
 if(['standing','prone'].includes(family) && !metrics?.supportContactMeasured) limits.push('support-contact-not-constrained')
 if(family==='prone'&&metrics?.torsoContact?.withinBoard===false)limits.push('torso-outside-support')
 if(family==='prone'&&metrics?.torsoContact?.fitted===false)limits.push('torso-fit-not-achieved')
 if(metrics?.soleGapProxyMm!=null && Math.abs(metrics.soleGapProxyMm)>10) limits.push('sole-proxy-gap-over-10mm')
 if(metrics?.visibleSupport?.feet.some(foot=>foot.gapM!=null&&Math.abs(foot.gapM)>.01)) limits.push('visible-sole-gap-over-10mm')
 const reasons=[...new Set([...failures,...unsupported,...limits])]
 return {status:failures.length?'fail':unsupported.length?'unsupported':limits.length?'limited':'pass', reasons, scope:'numerical-screen-only',visualReview:'pending'}
}
