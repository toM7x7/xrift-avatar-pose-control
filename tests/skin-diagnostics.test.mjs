import test from 'node:test'
import assert from 'node:assert/strict'
import {Bone,Group,SkinnedMesh,BufferGeometry,Float32BufferAttribute,Uint16BufferAttribute,Skeleton,MeshBasicMaterial,Vector3,Quaternion,Euler} from 'three'
import {createPoseFixture} from '../src/vendor/fixture.mjs'
import {measureSkinDiagnostics} from '../demo/skin-diagnostics.mjs'

test('foot diagnostics use posed skin vertices, include foot descendants and deduplicate identical clones',()=>{
 const fixture=createPoseFixture(),root=new Group();root.position.set(1,2,3);root.scale.setScalar(.65);root.add(fixture.mesh)
 const toe=new Bone();toe.name='leftToe';toe.position.set(0,-.01,.18);fixture.bones.leftFoot.add(toe);root.updateWorldMatrix(true,true)
 fixture.skeleton.bones.push(toe);fixture.skeleton.boneInverses.push(toe.matrixWorld.clone().invert())
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([0,-.04,.1,0,-.08,.17,0,-.02,.2],3));geometry.setAttribute('skinIndex',new Uint16BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,0],4));geometry.setAttribute('skinWeight',new Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4))
 const material=new MeshBasicMaterial(),toeMesh=new SkinnedMesh(geometry,material),toeSkeleton=new Skeleton([toe]);toeMesh.bind(toeSkeleton);fixture.mesh.add(toeMesh)
 const duplicate=toeMesh.clone();duplicate.geometry=geometry;duplicate.skeleton=toeSkeleton;fixture.mesh.add(duplicate)
 fixture.seated(.4);root.updateWorldMatrix(true,true);fixture.skeleton.update();toeSkeleton.update()
 const diagnostics=measureSkinDiagnostics({root,bones:fixture.bones}),left=diagnostics.feet.find(f=>f.side==='left'),right=diagnostics.feet.find(f=>f.side==='right'),expected=new Vector3();toeMesh.getVertexPosition(1,expected);toeMesh.localToWorld(expected)
 assert.equal(diagnostics.meshCount,3);assert.equal(diagnostics.vertexCount,fixture.mesh.geometry.attributes.position.count+fixture.mesh.children.find(m=>m.isSkinnedMesh&&m!==toeMesh&&m!==duplicate).geometry.attributes.position.count+3)
 assert.ok(left.weightedVertexCount>right.weightedVertexCount);assert.ok(left.min[1]<=expected.y+1e-8);assert.ok(Math.abs(left.soleOffsetM-(left.ankleWorld[1]-left.min[1]))<1e-8)
 assert.ok(Math.abs(diagnostics.legLengthM-(.4+Math.hypot(.39,.02))*.65)<1e-8)
 geometry.dispose();material.dispose();toeSkeleton.dispose();fixture.dispose()
})
test('declared foot bones without foot-weighted visible geometry return null soles rather than inferred contacts',()=>{
 const fixture=createPoseFixture(),root=new Group();root.add(fixture.mesh)
 const hipIndex=fixture.skeleton.bones.indexOf(fixture.bones.hips)
 for(const mesh of [fixture.mesh,...fixture.mesh.children.filter(m=>m.isSkinnedMesh)]){const indices=mesh.geometry.getAttribute('skinIndex');for(let i=0;i<indices.count;i++)indices.setX(i,hipIndex)}
 root.updateWorldMatrix(true,true);fixture.skeleton.update();const result=measureSkinDiagnostics({root,bones:fixture.bones})
 assert.ok(result.vertexCount>0);for(const foot of result.feet){assert.equal(foot.weightedVertexCount,0);assert.equal(foot.min,null);assert.equal(foot.max,null);assert.equal(foot.soleOffsetM,null);assert.equal(foot.ankleWorld.length,3)}fixture.dispose()
})
test('foot weights must total more than one half and distinct transformed instances are retained',()=>{
 const fixture=createPoseFixture(),root=new Group();root.add(fixture.mesh)
 const indices=fixture.mesh.geometry.getAttribute('skinIndex'),weights=fixture.mesh.geometry.getAttribute('skinWeight'),footIndex=fixture.skeleton.bones.indexOf(fixture.bones.leftFoot),hipIndex=fixture.skeleton.bones.indexOf(fixture.bones.hips)
 for(let i=0;i<indices.count;i++){indices.setXYZW(i,footIndex,hipIndex,0,0);weights.setXYZW(i,.5,.5,0,0)}
 const other=fixture.mesh.clone(false);other.geometry=fixture.mesh.geometry;other.skeleton=fixture.skeleton;other.position.x=5;root.add(other);root.updateWorldMatrix(true,true);fixture.skeleton.update()
 const result=measureSkinDiagnostics({root,bones:fixture.bones});assert.equal(result.meshCount,3);assert.equal(result.feet[0].weightedVertexCount,0);assert.ok(result.bounds.max[0]>4);fixture.dispose()
})

test('visible sole distances use a tilted support normal and remain independent of world height',()=>{
 const f=createPoseFixture(),root=new Group();root.add(f.mesh);root.updateMatrixWorld(true);f.skeleton.update()
 const base=measureSkinDiagnostics({root,bones:f.bones},{supportFrame:{position:[0,0,0],quaternion:[0,0,0,1]}})
 const q=new Quaternion().setFromEuler(new Euler(.3,1.1,-.28));root.quaternion.copy(q);root.position.set(3,12,-4);root.updateMatrixWorld(true);f.skeleton.update()
 const tilted=measureSkinDiagnostics({root,bones:f.bones},{supportFrame:{position:root.position,quaternion:q}})
 for(let i=0;i<2;i++){
  assert.ok(Math.abs(tilted.feet[i].supportGapM-base.feet[i].supportGapM)<1e-6)
  assert.ok(Math.abs(tilted.feet[i].soleOffsetNormalM-base.feet[i].soleOffsetNormalM)<1e-6)
  assert.ok(Math.abs(tilted.feet[i].ankleSupportDistanceM-base.feet[i].ankleSupportDistanceM)<1e-6)
 }
 assert.ok(new Vector3().fromArray(tilted.supportPlane.normal).distanceTo(new Vector3(0,1,0).applyQuaternion(q))<1e-8)
 f.dispose()
})
