export type StraightSegment = {
  type: 'straight';
  length: number;
};

export type CurveSegment = {
  type: 'curve';
  length: number;
  angle: number;
};

export type TrackSegment = StraightSegment | CurveSegment;

export type TrackDefinition = {
  version: 1;
  id: string;
  name: string;
  closed: boolean;
  autoClose?: boolean;
  start: { x: number; y: number; heading: number };
  road: { width: number; lanes: number; laneSpacing: number };
  bridge: { height: number; rampLength: number; plateauLength: number; opacity: number };
  crossings: { policy: 'auto' | 'flat' | 'bridge' };
  segments: TrackSegment[];
};

export type WorldPoint = {
  x: number;
  y: number;
  distance: number;
  segmentIndex: number;
  segmentType: TrackSegment['type'];
  curveSign: -1 | 0 | 1;
};

export type Crossing = {
  x: number;
  y: number;
  distanceA: number;
  distanceB: number;
  segmentA: number;
  segmentB: number;
  mode: 'flat' | 'bridge';
  above: 'a' | 'b';
};

export type CompiledTrack = {
  definition: TrackDefinition;
  points: WorldPoint[];
  totalLength: number;
  crossings: Crossing[];
};

const DEG = Math.PI / 180;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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

export function compileTrack(definition: TrackDefinition, sampleStep = 6): CompiledTrack {
  const points: WorldPoint[] = [];
  let x = definition.start.x;
  let y = definition.start.y;
  let heading = definition.start.heading * DEG;
  let distance = 0;

  const push = (segmentIndex: number, segmentType: TrackSegment['type'], curveSign: -1 | 0 | 1): void => {
    points.push({ x, y, distance, segmentIndex, segmentType, curveSign });
  };

  push(0, definition.segments[0]?.type ?? 'straight', 0);

  definition.segments.forEach((segment, segmentIndex) => {
    const steps = Math.max(2, Math.ceil(segment.length / sampleStep));
    if (segment.type === 'straight') {
      const step = segment.length / steps;
      for (let i = 0; i < steps; i += 1) {
        x += Math.cos(heading) * step;
        y += Math.sin(heading) * step;
        distance += step;
        push(segmentIndex, 'straight', 0);
      }
      return;
    }

    const totalAngle = segment.angle * DEG;
    const radius = segment.length / Math.abs(totalAngle);
    const sign: -1 | 1 = segment.angle >= 0 ? 1 : -1;
    const cx = x - Math.sin(heading) * radius * sign;
    const cy = y + Math.cos(heading) * radius * sign;
    const startRadiusAngle = Math.atan2(y - cy, x - cx);
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const radiusAngle = startRadiusAngle + totalAngle * t;
      x = cx + Math.cos(radiusAngle) * radius;
      y = cy + Math.sin(radiusAngle) * radius;
      distance += segment.length / steps;
      push(segmentIndex, 'curve', sign);
    }
    heading += totalAngle;
  });

  if (definition.closed && definition.autoClose !== false) {
    const first = points[0];
    const last = points[points.length - 1];
    const closeLength = Math.hypot(first.x - last.x, first.y - last.y);
    if (closeLength > sampleStep) {
      const steps = Math.max(2, Math.ceil(closeLength / sampleStep));
      const startX = last.x;
      const startY = last.y;
      const startDistance = distance;
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        x = lerp(startX, first.x, t);
        y = lerp(startY, first.y, t);
        distance = startDistance + closeLength * t;
        points.push({ x, y, distance, segmentIndex: definition.segments.length, segmentType: 'straight', curveSign: 0 });
      }
    }
  }

  const totalLength = points[points.length - 1]?.distance ?? 0;
  const crossings: Crossing[] = [];
  const minSeparation = Math.max(80, definition.road.width * 0.8);

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
      const duplicate = crossings.some((crossing) => Math.hypot(crossing.x - hit.x, crossing.y - hit.y) < 20);
      if (duplicate) continue;
      const mode = definition.crossings.policy === 'flat' ? 'flat' : 'bridge';
      crossings.push({
        x: hit.x,
        y: hit.y,
        distanceA,
        distanceB,
        segmentA: a0.segmentIndex,
        segmentB: b0.segmentIndex,
        mode,
        above: 'b',
      });
    }
  }

  return { definition, points, totalLength, crossings };
}
