# VisionQA MVP External Review Checklist v0.2

This note is the handoff packet for the outside reviewer.

## Current MVP outcome

- Batch-first VisionQA workspace is live in the app.
- Local closed loop works end to end without external model calls.
- Live model intake is consent-gated and only sends one candidate image.
- The live path is disabled until explicit authorization and API key are present.
- Persistence, audit, and replay rules are covered by tests.

## What is already verified

- `npm test` passes.
- `npm run lint` passes.
- The production build succeeds.
- The UI clearly distinguishes local fixture replay from real-model canary mode.
- The live route rejects unauthorized use and oversized/invalid inputs.

## Review boundaries

The reviewer should confirm these are still true:

1. No feature expansion before customer validation.
2. Fixture replay is never presented as model inference.
3. Score gating cannot hide blocker conditions.
4. Traceability stays intact across candidate, review, and persistence records.
5. Customer-discovery output remains the source of truth for scope.
6. The live canary only runs with explicit consent, valid key, and approved budget.

## Files to inspect

- `/D:/VisionQA/web/app/workspace.tsx`
- `/D:/VisionQA/web/app/api/live-evaluate/route.ts`
- `/D:/VisionQA/web/lib/visionqa/providers/local-canary.ts`
- `/D:/VisionQA/web/lib/visionqa/api-client.ts`
- `/D:/VisionQA/web/tests/rendered-html.test.mjs`
- `/D:/VisionQA/web/tests/model-adapter.test.ts`
- `/D:/VisionQA/web/tests/platform-persistence.test.ts`
- `/D:/VisionQA/web/tests/postgres-persistence.test.ts`

## External review questions

1. Does the product still match the MVP contract: one closed loop, one live canary, no premature scope creep?
2. Is any local fixture or fallback copy likely to be mistaken for a real model result?
3. Are the live-model gates strict enough for a real customer demo?
4. Do the audit and persistence paths preserve enough evidence for a post-demo review?
5. Is the customer-discovery evidence strong enough to justify the current MVP scope?

## Remaining blocker

A real live-model call still needs:

- Alibaba DashScope / 百炼 API key or equivalent approved key
- explicit approval to spend up to the agreed canary budget

Without that, the canary remains safely closed and the app stays in local-verification mode.
