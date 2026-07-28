# Weather Map Follow-up Plan

- [ ] Split provider-specific logic into two adapters with a shared orchestrator.
- [ ] Keep overlays on a shared service where only the base URL changes.
- [ ] Move forecast loading into separate adapter-specific services.
- [ ] Keep controllers, views, UI model, and actions shared where possible.
- [ ] Introduce a shared base domain model if provider-specific domain data diverges.
- [ ] Route app activation through the lifecycle controller.
- [ ] Add cold-start handling that behaves differently on first activation vs. later switches.
- [ ] Decide whether the model needs a "has been activated before" flag or equivalent state.
- [ ] Validate the refactor with existing tests and add coverage for switch/cold-start behavior if needed.
