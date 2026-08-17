export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const TRACK_CONFIG = {
  centerX: GAME_WIDTH / 2,
  centerY: 350,
  halfStraight: 300,
  radius: 185,
  laneSpacing: 42,
  roadWidth: 138,
} as const;

export const CAR_PHYSICS = {
  acceleration: 230,
  coastDrag: 46,
  maxSpeed: 520,
  curveBaseLimit: 326,
  driftStartRatio: 0.76,
  offTrackRatio: 1.075,
  crashForwardRetention: 0.98,
  crashOutwardImpulse: 72,
  crashGroundDrag: 0.82,
  crashSpin: 2.1,
  respawnDelayMs: 1150,
  respawnBlinkMs: 2000,
  respawnSpeed: 165,
} as const;
