// World layout constants (metres). +x east, +z south (towards camera default), +y up.
// The avenue runs along the x axis at z=0, the cross street along z at x=0.
// The player's tower (Meridian Tower) is the south-west block; the apartment window faces -z (north),
// looking over the avenue towards downtown.
export const P = 120;              // street grid pitch
export const STREET_W = 24;        // kerb-to-kerb + sidewalks
export const ROAD_W = 14;          // asphalt width
export const WALK_W = 5;           // sidewalk width
export const CURB_H = 0.15;

export const FLOOR_H = 3.5;
export const APT_FLOOR = 47;                     // 0-based -> the 48th floor
export const APT_Y = APT_FLOOR * FLOOR_H;        // apartment floor level = 164.5
export const CEIL_H = 3.6;

// Tower footprint
export const TOWER = { x0: -60, x1: -20, z0: 20, z1: 60 };
export const TOWER_TOP = APT_Y + 4.6;            // roof slab top

// Apartment unit interior bounds (inside faces)
export const UNIT = { x0: -49, x1: -31, z0: 20.45, z1: 32.4 };
export const HALL = { x0: -34, x1: -22, z0: 32.4, z1: 36.4 };
// Elevator core (shaft door plane at z = SHAFT.z0, opening towards -z)
export const SHAFT = { x0: -28, x1: -24, z0: 36.4, z1: 40.4 };
export const LOBBY_H = 7.0;
