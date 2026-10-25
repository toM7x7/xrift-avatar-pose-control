import type {Quaternion} from 'three'
import type {prepareRig} from './vendor/render-pose.mjs'
export interface RiderHeading {heading:number;source:'head'|'head-vertical-hold'|'seat-look'|'held'}
export function resolveRiderHeading(options?:{rig?:ReturnType<typeof prepareRig>|null;seatQuaternion?:Quaternion;lookYaw?:number;previous?:number}):RiderHeading
