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
  acceleration: 285,
  coastDrag: 68,
  maxSpeed: 920,
  curveBaseLimit: 865,
  offTrackRatio: 1.035,
  crashMinSpeedRatio: 0.985,
  crashForwardRetention: 1.015,
  crashOutwardImpulse: 78,
  crashGroundDrag: 0.89,
  crashSpin: 1.6,
  respawnDelayMs: 1150,
  respawnBlinkMs: 1800,
  respawnSpeed: 560,
} as const;
