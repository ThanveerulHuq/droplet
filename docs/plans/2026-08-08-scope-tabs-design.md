# Droplet — scope-tab refinement

> **Status:** Approved. Follow-up: implementation plan.

## Goal

Make the popup's This chat, Today, Week, and Month controls easier to scan and
more deliberate, while keeping the interface calm, compact, and text-led.

## Decisions

1. Retain four equal-width buttons and their current labels, ordering, click
   behaviour, and `aria-pressed` semantics.
2. Add a small, custom inline SVG line icon before every label: conversation,
   current day, calendar week, and calendar month.
3. Keep text as the primary identifier. Icons reinforce the time scope rather
   than replacing labels or introducing additional data.
4. Give the selected scope a pale blue-green inset surface, a darker icon and
   semibold label, and a clear blue-green baseline.
5. Treat inactive scopes as a quieter, warm-transparent surface with muted
   mineral-gray text and icons.
6. Add restrained hover, press, and focus-visible treatments using existing
   palette tokens and motion conventions.

## Implementation boundaries

- Work within the existing WXT, TypeScript, direct-DOM, and vanilla-CSS stack.
- Use inline SVG; add no icon library, image asset, or network request.
- Keep all tracking, storage, estimation, and content-script behaviour intact.
- Preserve a compact layout at the popup's 340px width.

## Verification

- Extend the scope-render tests to cover icon labels and preserved button
  semantics.
- Extend popup-style tests to cover icon and active-control rules.
- Run `pnpm typecheck`, `pnpm test`, `pnpm assert-no-network`, and `pnpm build`.
