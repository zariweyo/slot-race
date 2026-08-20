export type StraightSegment = { type: 'straight'; length: number };
export type CurveSegment = { type: 'curve'; length: number; angle: number };
export type UpSegment = { type: 'up' };
export type DownSegment = { type: 'down' };

export type TrackSegment = StraightSegment | CurveSegment | UpSegment | DownSegment;

export type TrackDefinition = {
  version: 2;
  id: string;
  name: string;
  speedMultiplier?: number;
  closed: boolean;
  autoClose?: boolean;
  start: { x: number; y: number; heading: number; level?: number };
  road: { width: number; lanes: number; laneSpacing: number };
  levels: { height: number; rampLength: number };
  segments: TrackSegment[];
};

export type WorldPoint = {
  x: number;
  y: number;
  distance: number;
  segmentIndex: number;
  segmentType: TrackSegment['type'];
  curveSign: -1 | 0 | 1;
  level: number;
  elevation: number;
  renderLevel: number;
  rampDirection: -1 | 0 | 1;
};

export type Crossing = {
  x: number;
  y: number;
  distanceA: number;
  distanceB: number;
  segmentA: number;
  segmentB: number;
  levelA: number;
  levelB: number;
  elevationA: number;
  elevationB: number;
  mode: 'crossing' | 'overpass';
  above: 'a' | 'b' | null;
};

export type SegmentRange = {
  segmentIndex: number;
  type: TrackSegment['type'];
  start: number;
  end: number;
  startLevel: number;
  endLevel: number;
  renderLevel: number;
  curveSign: -1 | 0 | 1;
};

export type TrackValidation = {
  playable: boolean;
  reason: string | null;
  startLevel: number;
  finalLevel: number;
  hasAutoClose: boolean;
};

export type CompiledTrack = {
  definition: TrackDefinition;
  points: WorldPoint[];
  totalLength: number;
  crossings: Crossing[];
  segments: SegmentRange[];
  minLevel: number;
  maxLevel: number;
  validation: TrackValidation;
  autoCloseRange: SegmentRange | null;
};

const DEG = Math.PI / 180;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smootherstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function segmentLength(segment: TrackSegment, rampLength: number): number {
  return segment.type === 'up' || segment.type === 'down' ? rampLength : segment.length;
}

function segmentIntersection(
  a0: WorldPoint,
  a1: WorldPoint,
  b0: WorldPoint,
  b1: WorldPoint,
): { x: number; y: number; ta: number; tb: number } | null {
  const ax = a1.x - a0.x;
  const ay = a1.y - a0.y;
  const bx = b1.x - b0.x;
  const by = b1.y - b0.y;
  const det = ax * by - ay * bx;
  if (Math.abs(det) < 1e-8) return null;
  const dx = b0.x - a0.x;
  const dy = b0.y - a0.y;
  const ta = (dx * by - dy * bx) / det;
  const tb = (dx * ay - dy * ax) / det;
  if (ta <= 0.02 || ta >= 0.98 || tb <= 0.02 || tb >= 0.98) return null;
  return { x: a0.x + ax * ta, y: a0.y + ay * ta, ta, tb };
}

export function compileTrack(definition: TrackDefinition, sampleStep = 6, strict = true): CompiledTrack {
  if (definition.version !== 2) throw new Error(`Unsupported track version: ${definition.version}`);
  if (strict && !definition.closed) throw new Error('Tracks must be cyclic/closed');
  if ((definition.speedMultiplier ?? 1) <= 0) throw new Error('speedMultiplier must be > 0');
  if (definition.levels.height <= 0 || definition.levels.rampLength <= 0) {
    throw new Error('levels.height and levels.rampLength must be > 0');
  }

  const points: WorldPoint[] = [];
  const ranges: SegmentRange[] = [];
  let x = definition.start.x;
  let y = definition.start.y;
  let heading = definition.start.heading * DEG;
  let distance = 0;
  let level = definition.start.level ?? 0;
  const startLevel = level;
  let minLevel = level;
  let maxLevel = level;

  if (level < 0) throw new Error('Track start level cannot be negative');

  const push = (
    segmentIndex: number,
    segmentType: TrackSegment['type'],
    curveSign: -1 | 0 | 1,
    pointLevel: number,
    elevation: number,
    renderLevel: number,
    rampDirection: -1 | 0 | 1,
  ): void => {
    points.push({ x, y, distance, segmentIndex, segmentType, curveSign, level: pointLevel, elevation, renderLevel, rampDirection });
  };

  const firstType = definition.segments[0]?.type ?? 'straight';
  push(0, firstType, 0, level, level * definition.levels.height, level, 0);

  definition.segments.forEach((segment, segmentIndex) => {
    const length = segmentLength(segment, definition.levels.rampLength);
    const steps = Math.max(2, Math.ceil(length / sampleStep));
    const startDistance = distance;
    const segmentStartLevel = level;
    let endLevel = level;
    let curveSign: -1 | 0 | 1 = 0;

    if (segment.type === 'down' && level <= 0) {
      throw new Error(`Segment ${segmentIndex}: cannot go down below level 0`);
    }

    if (segment.type === 'up' || segment.type === 'down') {
      const direction: -1 | 1 = segment.type === 'up' ? 1 : -1;
      endLevel = level + direction;
      const renderLevel = Math.max(segmentStartLevel, endLevel);
      const step = length / steps;
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        x += Math.cos(heading) * step;
        y += Math.sin(heading) * step;
        distance += step;
        const elevation = lerp(segmentStartLevel, endLevel, smootherstep(t)) * definition.levels.height;
        const pointLevel = t < 0.5 ? segmentStartLevel : endLevel;
        push(segmentIndex, segment.type, 0, pointLevel, elevation, renderLevel, direction);
      }
      level = endLevel;
    } else if (segment.type === 'straight') {
      const step = segment.length / steps;
      for (let i = 0; i < steps; i += 1) {
        x += Math.cos(heading) * step;
        y += Math.sin(heading) * step;
        distance += step;
        push(segmentIndex, 'straight', 0, level, level * definition.levels.height, level, 0);
      }
    } else {
      const totalAngle = segment.angle * DEG;
      if (Math.abs(totalAngle) < 1e-6) throw new Error(`Segment ${segmentIndex}: curve angle cannot be 0`);
      const radius = segment.length / Math.abs(totalAngle);
      const sign: -1 | 1 = segment.angle >= 0 ? 1 : -1;
      curveSign = sign;
      const cx = x - Math.sin(heading) * radius * sign;
      const cy = y + Math.cos(heading) * radius * sign;
      const startRadiusAngle = Math.atan2(y - cy, x - cx);
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const radiusAngle = startRadiusAngle + totalAngle * t;
        x = cx + Math.cos(radiusAngle) * radius;
        y = cy + Math.sin(radiusAngle) * radius;
        distance += segment.length / steps;
        push(segmentIndex, 'curve', sign, level, level * definition.levels.height, level, 0);
      }
      heading += totalAngle;
    }

    minLevel = Math.min(minLevel, segmentStartLevel, endLevel);
    maxLevel = Math.max(maxLevel, segmentStartLevel, endLevel);
    ranges.push({
      segmentIndex,
      type: segment.type,
      start: startDistance,
      end: distance,
      startLevel: segmentStartLevel,
      endLevel,
      renderLevel: Math.max(segmentStartLevel, endLevel),
      curveSign,
    });
  });

  const levelsMatch = level === startLevel;
  let validationReason: string | null = null;
  if (!definition.closed) validationReason = 'La pista está abierta';
  else if (!levelsMatch) validationReason = `La pista termina en Z${level * 2 + 1} y empieza en Z${startLevel * 2 + 1}`;

  if (strict && validationReason) throw new Error(validationReason);

  let autoCloseRange: SegmentRange | null = null;
  if (definition.closed && levelsMatch && definition.autoClose !== false) {
    const first = points[0];
    const last = points[points.length - 1];
    const closeLength = Math.hypot(first.x - last.x, first.y - last.y);
    if (closeLength > sampleStep) {
      const steps = Math.max(2, Math.ceil(closeLength / sampleStep));
      const startX = last.x;
      const startY = last.y;
      const startDistance = distance;
      const closeSegmentIndex = definition.segments.length;
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        x = lerp(startX, first.x, t);
        y = lerp(startY, first.y, t);
        distance = startDistance + closeLength * t;
        points.push({
          x,
          y,
          distance,
          segmentIndex: closeSegmentIndex,
          segmentType: 'straight',
          curveSign: 0,
          level,
          elevation: level * definition.levels.height,
          renderLevel: level,
          rampDirection: 0,
        });
      }
      autoCloseRange = {
        segmentIndex: closeSegmentIndex,
        type: 'straight',
        start: startDistance,
        end: distance,
        startLevel: level,
        endLevel: level,
        renderLevel: level,
        curveSign: 0,
      };
      ranges.push(autoCloseRange);
    }
  }

  const totalLength = points[points.length - 1]?.distance ?? 0;
  const crossings: Crossing[] = [];
  const minSeparation = Math.max(80, definition.road.width * 0.8);
  const sameLevelTolerance = definition.levels.height * 0.35;

  for (let i = 0; i < points.length - 1; i += 1) {
    const a0 = points[i];
    const a1 = points[i + 1];
    for (let j = i + 3; j < points.length - 1; j += 1) {
      const b0 = points[j];
      const b1 = points[j + 1];
      if (Math.abs(a0.distance - b0.distance) < minSeparation) continue;
      const hit = segmentIntersection(a0, a1, b0, b1);
      if (!hit) continue;
      const distanceA = lerp(a0.distance, a1.distance, hit.ta);
      const distanceB = lerp(b0.distance, b1.distance, hit.tb);
      if (Math.abs(distanceA - distanceB) < minSeparation) continue;
      if (crossings.some((crossing) => Math.hypot(crossing.x - hit.x, crossing.y - hit.y) < 20)) continue;

      const elevationA = lerp(a0.elevation, a1.elevation, hit.ta);
      const elevationB = lerp(b0.elevation, b1.elevation, hit.tb);
      const levelA = hit.ta < 0.5 ? a0.level : a1.level;
      const levelB = hit.tb < 0.5 ? b0.level : b1.level;
      const sameLevel = Math.abs(elevationA - elevationB) <= sameLevelTolerance;
      crossings.push({
        x: hit.x,
        y: hit.y,
        distanceA,
        distanceB,
        segmentA: a0.segmentIndex,
        segmentB: b0.segmentIndex,
        levelA,
        levelB,
        elevationA,
        elevationB,
        mode: sameLevel ? 'crossing' : 'overpass',
        above: sameLevel ? null : elevationA > elevationB ? 'a' : 'b',
      });
    }
  }

  return {
    definition,
    points,
    totalLength,
    crossings,
    segments: ranges,
    minLevel,
    maxLevel,
    validation: {
      playable: validationReason === null,
      reason: validationReason,
      startLevel,
      finalLevel: level,
      hasAutoClose: autoCloseRange !== null,
    },
    autoCloseRange,
  };
}
