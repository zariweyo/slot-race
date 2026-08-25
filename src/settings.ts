export const SETTINGS = {
  raceScript: {
    timelineDurationMs: 10_000,
    defaultNodePositions: [0.3, 0.6],
    maxLaps: 30,

    // Limits how close a node can get to either end of the timeline.
    edgePaddingRatio: 0.02,

    // A newly created node is shifted when another node is closer than this.
    minNodeGapMs: 300,

    // Minimum horizontal distance from an existing node to create a new one.
    newNodeMinDistancePx: 24,

    dragStartDistancePx: 14,
    longPressDurationMs: 520,
  },
} as const;
