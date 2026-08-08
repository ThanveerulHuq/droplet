# Droplet — Editorial popup redesign

> **Status:** Approved. Follow-up: implementation plan.

## Goal

Redesign the existing extension popup as a calm, editorial reading of a user's
AI-chat water estimate. The interface should feel measured and credible rather
than like a generic dashboard, while preserving every tracking, estimation, and
privacy behaviour.

## Decisions

1. Use a quiet field-notebook visual direction: warm ivory, mineral-ink text,
   and one restrained blue-green accent.
2. Keep the main surface utilitarian. Do not add a privacy reassurance or other
   explanatory copy to the primary view.
3. Retain the header's tracking switch as the only persistent control.
4. Replace equal pill-shaped scope controls with a type-led tab row and a thin
   active indicator.
5. Centre visual attention on the comparison headline, with the measured volume
   and uncertainty range set beneath it in tabular figures.
6. Render the secondary comparison as an offset supporting note divided from the
   main reading by a fine rule, not as a card.
7. Treat empty, paused, degraded, and methodology states with the same editorial
   surface language. Preserve keyboard semantics and add consistent visible
   focus, hover, pressed, and reduced-motion states.
8. Remove the popup version label and demo seed control completely. The footer
   contains only the "How this works" link.
9. Move the existing model-version label into the estimate reading, where it is
   contextually useful, rather than the popup footer.

## Component treatment

- **Header:** Droplet wordmark and existing tracking switch.
- **Scopes:** Four text tabs with a thin active indicator. Existing button and
  `aria-pressed` semantics remain.
- **Reading:** Comparison headline; tabular volume/range; response and provider
  metadata; optional secondary comparison; model version.
- **Status states:** Calm inline notices and intentionally composed empty-state
  spacing, without generic boxed-dashboard presentation.
- **Methodology:** In-place editorial panel, compact back control, denser but
  readable coefficient table, and links styled consistently with the popup.

## Implementation boundaries

- Work in the existing WXT, TypeScript, and vanilla-CSS stack; add no dependency.
- Keep direct-DOM rendering and the existing data flow intact.
- Do not modify tracking, storage, estimation, or content-script behaviour.
- Do not introduce network calls, including remote font or image requests.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm assert-no-network`
- `pnpm build`
- Inspect the built popup to check the visual hierarchy and all state layouts.
