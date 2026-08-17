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
  acceleration: 520,
  coastDrag: 92,
  maxSpeed: 920,
  curveBaseLimit: 845,
  driftStartRatio: 0.56,
  offTrackRatio: 1.015,
  crashMinSpeedRatio: 0.94,
  crashForwardRetention: 1.02,
  crashOutwardImpulse: 105,
  crashGroundDrag: 0.88,
  crashSpin: 2.7,
  respawnDelayMs: 1250,
  respawnBlinkMs: 2000,
  respawnSpeed: 470,
} as const;
