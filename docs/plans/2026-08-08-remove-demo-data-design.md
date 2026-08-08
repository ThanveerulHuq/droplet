# Remove demo data design

## Goal

Remove the popup's demo-data control and every runtime artifact that supports it.

## Scope

- Remove the `Seed demo data` button from the popup markup.
- Remove the associated DOM lookup, click handler, imports, and styles.
- Delete the demo-store generator and its dedicated test file.
- Preserve historical planning documents, which do not ship with the extension.

## Behavior

The popup footer ends after the existing build information and `How this works` link. Opening the popup no longer offers a path to overwrite extension storage with seeded values.

## Verification

- Confirm production source contains no `seedDemoStore` references.
- Run the repository test suite, typecheck, and build.
