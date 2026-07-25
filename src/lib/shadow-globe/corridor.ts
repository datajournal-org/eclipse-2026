// The totality corridor (path of totality), precomputed at build time as the union of all umbra
// footprints. The heavy geometry lives in corridorCompute.ts and is run once by scripts/build-corridor.ts,
// which writes corridor.generated.ts — so nothing is recomputed in the browser. Rendered as a filled
// TRIANGLE_STRIP (pole-correct) by isoLinesLayer.
export type { CorridorEdges } from './corridorCompute';
export { corridorEdges } from './corridor.generated';
