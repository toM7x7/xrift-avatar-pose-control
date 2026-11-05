export type InferenceRequiredRole='hips'|'head'|'leftUpperArm'|'leftLowerArm'|'leftHand'|'rightUpperArm'|'rightLowerArm'|'rightHand'|'leftUpperLeg'|'leftLowerLeg'|'leftFoot'|'rightUpperLeg'|'rightLowerLeg'|'rightFoot'
export type InferenceRole=InferenceRequiredRole|'spine'|'chest'|'neck'
export const INFERENCE_REQUIRED_ROLES:readonly InferenceRequiredRole[]
export type Vec3Array=readonly [number,number,number]|readonly number[]
/** Bind-time skeleton: positions share one space, parent -1 = root, weights = geometry each bone moves (0 if unknown). */
export interface SkeletonInput {names:readonly string[];parent:readonly number[];positions:readonly Vec3Array[];weights:readonly number[];centroids?:readonly (Vec3Array|null)[]}
export interface RoleResult {
 ok:boolean
 method:'names'|'structure'|'names+structure'|null
 /** How "leg" was read: mixamo = shin, vrchat = thigh; null when no bone uses the word. */
 dialect:'mixamo'|'vrchat'|null
 /** Bone indices into SkeletonInput. Empty when refused. */
 roles:Partial<Record<InferenceRole,number>>
 /** Left/right evidence used: names, toes, feet. */
 side:string[]
 reason:string|null
 namesFound:number
 structureReason:string|null
 conflicts:string[]
}
export interface ParsedBoneName {side:-1|0|1;base:string;numbered:boolean;skip:boolean;mmd:boolean}
export function parseBoneName(name:string):ParsedBoneName
export function validateRoles(input:SkeletonInput,roles:Partial<Record<InferenceRole,number>>):string[]
export function resolveRoles(input:SkeletonInput):RoleResult
