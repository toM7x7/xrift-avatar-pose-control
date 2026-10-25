import test from 'node:test'
import assert from 'node:assert/strict'
import {assessPatternSample} from '../demo/pattern-assessment.mjs'
const sample={family:'chair',model:{visibleFeet:true},metrics:{finite:true,boneLengthErrorMm:0,headRotationErrorDegrees:0,maxKneeDegrees:90,warnings:[]}}
test('numerical success explicitly leaves visual review pending',()=>{
 const result=assessPatternSample(sample)
 assert.equal(result.status,'pass');assert.equal(result.scope,'numerical-screen-only');assert.equal(result.visualReview,'pending')
})
test('invisible feet cannot pass a numerical foot-support screen',()=>{
 const result=assessPatternSample({...sample,model:{visibleFeet:false}})
 assert.equal(result.status,'unsupported');assert.ok(result.reasons.includes('no-visible-foot-skin'))
})
test('restoration and nonfinite failures dominate unsupported geometry',()=>{
 const result=assessPatternSample({...sample,model:{visibleFeet:false},restored:false,metrics:{...sample.metrics,finite:false}})
 assert.equal(result.status,'fail');assert.ok(result.reasons.includes('restore-mismatch'));assert.ok(result.reasons.includes('nonfinite-pose'))
})
test('unreachable targets and unconstrained support stay limited',()=>{
 const result=assessPatternSample({...sample,family:'prone',metrics:{...sample.metrics,handTargetErrorMm:50,supportContactMeasured:false}})
 assert.equal(result.status,'limited');assert.ok(result.reasons.includes('hand-target-unreachable'));assert.ok(result.reasons.includes('support-contact-not-constrained'))
})
test('nonfinite nested metrics fail even when the solver finite flag is true',()=>{
 const result=assessPatternSample({...sample,metrics:{...sample.metrics,torsoContact:{chestGapMm:NaN}}})
 assert.equal(result.status,'fail');assert.ok(result.reasons.includes('nonfinite-metric'))
})
test('a torso outside a finite support never passes an aligned-only contact screen',()=>{
 const result=assessPatternSample({...sample,family:'prone',metrics:{...sample.metrics,supportContactMeasured:true,torsoContact:{aligned:true,withinBoard:false,fitted:false}}})
 assert.equal(result.status,'limited');assert.ok(result.reasons.includes('torso-outside-support'));assert.ok(result.reasons.includes('torso-fit-not-achieved'))
})
