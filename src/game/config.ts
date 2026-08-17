export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const TRACK_CONFIG = {
  centerX: GAME_WIDTH / 2,
  centerY: 350,
  halfStraight: 300,
  radius: 185,
  laneSpacing: 42,
  roadWidth: 132,
} as const;

export const CAR_PHYSICS = {
  acceleration: 255,
  coastDrag: 72,
  maxSpeed: 520,
  curveBaseLimit: 330,
  driftStartRatio: 0.78,
  offTrackRatio: 1.08,
  respawnDelayMs: 650,
  respawnBlinkMs: 2000,
  respawnSpeed: 185,
} as const;
