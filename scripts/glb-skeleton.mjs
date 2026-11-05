// Local-only skeleton reader for GLB/VRM files, without three. Used to check role inference against the VRM humanoid map.
// Returns per skin: joint names, parent within the skin, bind-time positions, summed skin weights and weighted centroids; plus the VRM humanoid map.
import { readFileSync } from 'node:fs'

const COMPONENTS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }
const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

export function readGlb(path) {
  const file = readFileSync(path)
  const jsonLength = file.readUInt32LE(12)
  const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8'))
  const binStart = 20 + jsonLength + 8
  const bin = file.subarray(binStart, binStart + file.readUInt32LE(20 + jsonLength))
  return { json, bin }
}

function accessor({ json, bin }, index) {
  const a = json.accessors[index]
  const view = json.bufferViews[a.bufferView]
  const Type = COMPONENTS[a.componentType]
  const size = SIZES[a.type]
  const stride = view.byteStride ? view.byteStride / Type.BYTES_PER_ELEMENT : size
  const start = bin.byteOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const raw = new Type(bin.buffer, start, stride * (a.count - 1) + size)
  const out = []
  for (let i = 0; i < a.count; i++) out.push(Array.from(raw.subarray(i * stride, i * stride + size)))
  if (a.normalized) {
    const max = { 5121: 255, 5123: 65535, 5120: 127, 5122: 32767 }[a.componentType]
    for (const v of out) for (let k = 0; k < v.length; k++) v[k] /= max
  }
  return out
}

// Translation of the inverse of a column-major 4x4 (inverse of the inverse bind = joint position at bind time).
function invertTranslation(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  // Elements 12, 13, 14 of the inverse.
  return [
    (-a10 * b09 + a11 * b07 - a12 * b06) / det,
    (a00 * b09 - a01 * b07 + a02 * b06) / det,
    (-a30 * b03 + a31 * b01 - a32 * b00) / det,
  ]
}

export function glbSkeletons(path) {
  const glb = readGlb(path)
  const { json } = glb
  const parentOf = new Map()
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)))
  // Skin weight and weighted vertex sum per joint node over every mesh (skinned vertices are in bind space).
  const weightOfNode = new Map()
  const sumOfNode = new Map()
  json.nodes.forEach((node) => {
    if (node.mesh === undefined || node.skin === undefined) return
    const joints = json.skins[node.skin].joints
    for (const p of json.meshes[node.mesh].primitives) {
      if (p.attributes.JOINTS_0 === undefined || p.attributes.WEIGHTS_0 === undefined) continue
      const j = accessor(glb, p.attributes.JOINTS_0)
      const w = accessor(glb, p.attributes.WEIGHTS_0)
      const v = accessor(glb, p.attributes.POSITION)
      for (let i = 0; i < j.length; i++) for (let k = 0; k < 4; k++) {
        if (w[i][k] <= 0) continue
        const n = joints[j[i][k]]
        weightOfNode.set(n, (weightOfNode.get(n) ?? 0) + w[i][k])
        const s = sumOfNode.get(n) ?? [0, 0, 0]
        for (let a = 0; a < 3; a++) s[a] += v[i][a] * w[i][k]
        sumOfNode.set(n, s)
      }
    }
  })
  const skins = (json.skins ?? []).map((skin, s) => {
    const ibm = accessor(glb, skin.inverseBindMatrices)
    const index = new Map(skin.joints.map((n, i) => [n, i]))
    const parent = skin.joints.map((n) => {
      for (let p = parentOf.get(n); p !== undefined; p = parentOf.get(p)) if (index.has(p)) return index.get(p)
      return -1
    })
    return {
      skin: s,
      nodes: skin.joints,
      names: skin.joints.map((n) => json.nodes[n].name ?? `node${n}`),
      parent,
      positions: ibm.map(invertTranslation),
      weights: skin.joints.map((n) => weightOfNode.get(n) ?? 0),
      centroids: skin.joints.map((n) => (weightOfNode.get(n) ? sumOfNode.get(n).map((x) => x / weightOfNode.get(n)) : null)),
    }
  })
  // VRM 0.x: extensions.VRM.humanoid.humanBones [{bone,node}]; VRM 1.0: extensions.VRMC_vrm.humanoid.humanBones {role:{node}}.
  const ext = json.extensions ?? {}
  let humanoid = null
  if (ext.VRM?.humanoid) humanoid = Object.fromEntries(ext.VRM.humanoid.humanBones.map((b) => [b.bone, b.node]))
  else if (ext.VRMC_vrm?.humanoid) humanoid = Object.fromEntries(Object.entries(ext.VRMC_vrm.humanoid.humanBones).map(([role, b]) => [role, b.node]))
  return { skins, humanoid, version: ext.VRM ? 'VRM0' : ext.VRMC_vrm ? 'VRM1' : null, nodeNames: json.nodes.map((n) => n.name) }
}
