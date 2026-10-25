export interface FlightMotion {heading:number;pitch:number;roll:number;kneeBend:number;armSwing:number;ready:boolean}
export function createFlightMotion():FlightMotion
export function stepFlightMotion(state:FlightMotion,options:{heading?:number;velocity?:{x:number;y:number;z:number};acceleration?:{x:number;y:number;z:number}|null;time?:number;airborne?:boolean},delta?:number):FlightMotion
