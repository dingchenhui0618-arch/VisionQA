# VisionQA Plugin Release Scope

## Canonical product

The public product in `main` is the Visual Review Plugin:

- Web preview and local runtime: `web/app/plugin`, `web/lib/visionqa/plugin-runtime.ts`
- VisualReview and Host contracts: `contracts/` and `web/lib/visionqa/`
- Chrome/MCP Host adapter: `web/host/chrome` and `web/app/api/visual-review/host`
- Desktop shell: `desktop/`
- Local evidence and acceptance records: `docs/`

The plugin accepts a host-provided visual artifact, DOM/context evidence and a revision identifier. It returns a structured review, evidence anchors and a bounded repair/review direction. The current default is offline fixture/Mock; a configured multimodal Provider is an explicit local capability, not a claim of production model quality.

## Removed from the public product snapshot

The following historical SaaS/e-commerce workbench material is removed from the current `main` snapshot:

- legacy Python/MVP source, deployment scripts, agent handoffs and business reports;
- customer/commercial datasets, synthetic repair corpora and old evaluation outputs;
- old login, project, screening, repair, credits and marketing workbench routes;
- old fashion demonstration images and generated repair libraries.

The pre-cleanup tree is retained in the remote archive branch `archive/pre-plugin-release-20261027` for recovery and historical audit. This does not by itself erase objects from Git hosting history; any historical exposure of restricted material must be handled separately through repository visibility/history-retention decisions.

## Public-repository safety

Never commit `.env`, `secrets/`, API keys, customer images, local material manifests, development logs, `node_modules`, `.next`, `dist` or portable bundles. Public evidence must be reproducible from source and must state whether it is engineering, model-quality or customer-adoption evidence.
