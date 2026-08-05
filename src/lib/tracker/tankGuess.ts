// Place at: src/lib/tracker/tankGuess.ts
//
// Deterministic, no AI - the AI's only job is reading the litres figure
// off the receipt; deciding what that figure means is a plain formula,
// same "AI narrates, code decides" split used everywhere else this
// scan-receipt pipeline makes a judgement call.

// A fixed litre threshold (the original idea: "9.5L or more") only
// works for one specific tank size - on a 10L commuter tank that's
// basically the whole tank every time, on a 30L adventure tank it's
// barely a third. Using a RATIO of the bike's own tank capacity
// generalizes correctly across the whole fleet of bikes this app
// supports. 0.6 recovers almost exactly the original 9.5L suggestion
// for a 15L tank (9.5/15 ≈ 0.63) - the calibration instinct was right,
// this just makes it relative instead of fixed.
const FULL_TANK_RATIO = 0.6;

// Most naked/standard UK motorcycles sit in the 15-19L range - used only
// when a bike hasn't specified its own tank capacity, so the guess still
// has somewhere reasonable to start rather than blocking on a field
// nobody's filled in yet.
const DEFAULT_TANK_CAPACITY_LITRES = 16;

// Always just a starting suggestion - the review queue's existing
// "Filled the tank completely full" checkbox already reads this value
// and stays fully editable, same safety net as every other AI guess in
// this pipeline.
export function guessFilledToFull(litres: number, tankCapacityLitres?: number): boolean {
  const capacity = tankCapacityLitres && tankCapacityLitres > 0 ? tankCapacityLitres : DEFAULT_TANK_CAPACITY_LITRES;
  return litres >= capacity * FULL_TANK_RATIO;
}
