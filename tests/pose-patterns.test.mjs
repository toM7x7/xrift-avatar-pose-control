import test from 'node:test'
import assert from 'node:assert/strict'
import {POSE_PATTERN_CATALOG,POSE_PATTERN_CATALOG_NOTES,createPatternCases} from '../src/pose-patterns.mjs'
const effect=c=>JSON.stringify({options:c.options,pitch:c.condition.supportPitchRadians,roll:c.condition.supportRollRadians,yaw:c.condition.headYaw,headPitch:c.condition.headPitch,carrier:c.condition.carrierScale}),frozenTree=o=>!o||typeof o!=='object'||Object.isFrozen(o)&&Object.values(o).every(frozenTree),finiteTree=o=>typeof o==='number'?Number.isFinite(o):o&&typeof o==='object'?Object.values(o).every(finiteTree):true

test('eighteen candidate intents cover the seven families and the entire base catalog is frozen',()=>{
 assert.equal(POSE_PATTERN_CATALOG.length,18);assert.equal(new Set(POSE_PATTERN_CATALOG.map(p=>p.id)).size,18);assert.deepEqual([...new Set(POSE_PATTERN_CATALOG.map(p=>p.family))].sort(),['chair','nimbus','prone','shoulder','side-sit','standing','straddle']);assert.ok(frozenTree(POSE_PATTERN_CATALOG));assert.ok(POSE_PATTERN_CATALOG.every(p=>p.description.startsWith('未採用候補。')));assert.equal(POSE_PATTERN_CATALOG_NOTES.status,'candidate');assert.throws(()=>POSE_PATTERN_CATALOG[0].options.crouch=1)
})
test('standard and stress are deterministic 324/540 cases with unique real input settings per pattern',()=>{
 const standard=createPatternCases(),stress=createPatternCases({intensity:'stress'});assert.equal(standard.length,324);assert.equal(stress.length,540);assert.deepEqual(standard,createPatternCases());assert.deepEqual(stress,createPatternCases({intensity:'stress'}));assert.equal(new Set(stress.map(c=>c.id)).size,stress.length)
 for(const p of POSE_PATTERN_CATALOG){for(const [suite,count]of [[standard,18],[stress,30]]){const cases=suite.filter(c=>c.patternId===p.id);assert.equal(cases.length,count);assert.equal(new Set(cases.map(effect)).size,count,p.id+' duplicates effective settings')}}assert.equal(stress.filter(c=>c.condition.stressOnly).length,216);assert.throws(()=>createPatternCases({intensity:'unbounded'}))
})
test('returned cases are independent deep merged copies and preserve unchanged base leg parameters',()=>{
 const cases=createPatternCases(),manta=cases.find(c=>c.id==='prone-manta__legs-together');assert.deepEqual(manta.options.legs,{kneeBendDegrees:5,legSplayDegrees:0,anklePointDegrees:35});manta.options.legs.kneeBendDegrees=99;assert.equal(POSE_PATTERN_CATALOG.find(p=>p.id==='prone-manta').options.legs.kneeBendDegrees,5);assert.equal(cases.find(c=>c.id==='prone-manta__base').options.legs.kneeBendDegrees,5);assert.equal(createPatternCases().find(c=>c.id===manta.id).options.legs.kneeBendDegrees,5)
})
test('host conditions stay out of solver options and never request scaling a real rider',()=>{
 for(const c of createPatternCases({intensity:'stress'})){assert.ok(finiteTree(c));assert.equal(c.condition.status,'candidate');for(const key of ['supportPitchRadians','supportRollRadians','headYaw','headPitch','fixtureScale','riderScale','carrierScale'])assert.ok(!(key in c.options));assert.ok(!('fixtureScale'in c.condition));assert.ok(!('riderScale'in c.condition));assert.equal('carrierScale'in c.condition,c.family==='shoulder')}
})
test('family-specific variations use implemented option contracts and tracked hands switch seated modes',()=>{
 for(const c of createPatternCases({intensity:'stress'})){
  if(c.family==='prone'){assert.ok(c.options.legs);for(const key of ['stanceWidth','seatHeightRatio','widthRatio','gripReachRatio','seatBack'])assert.ok(!(key in c.options))}
  if(['chair','straddle','side-sit'].includes(c.family)){assert.equal(c.options.family,c.family);assert.ok(c.options.seatHeightRatio>=.25&&c.options.seatHeightRatio<=1.05);assert.ok(c.options.widthRatio>=.04&&c.options.widthRatio<=.85);if(c.options.preserveHands)assert.equal(c.options.handMode,'tracked')}
  if(c.family==='shoulder'){assert.ok(!('handMode'in c.options));assert.ok(c.condition.carrierScale>=.65&&c.condition.carrierScale<=1.35)}
 }
 const base=createPatternCases().filter(c=>c.condition.variantKind==='base');assert.equal(base.length,18);for(const c of base)assert.deepEqual(c.options,POSE_PATTERN_CATALOG.find(p=>p.id===c.patternId).options)
})
