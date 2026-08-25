// Place at: src/lib/tracker/confidenceLimits.ts
//
// Two separate labels, never one combined score - a single confidence
// number could falsely suggest the AI (or RoadVerdict) has inspected
// the motorcycle itself. Record confidence reuses the existing
// documentation verdict (see sellerReportVerdict.ts) rather than
// computing anything new - it was already being calculated to feed the
// AI's own read and the generated buyer questions, just never shown to
// the reader directly until now. Mechanical confidence is fixed, since
// this app has no inspection data source and never claims to.

export const MECHANICAL_CONFIDENCE_STATEMENT =
  "Not assessable from records alone - no digital record can verify a bike's mechanical condition. See \"Inspection-required risks\" above for what this specifically means.";