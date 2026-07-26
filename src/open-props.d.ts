// open-props ships CSS-only subpaths (e.g. `open-props/sizes`, imported for their side effects in
// +layout.svelte). They resolve to `.css` files with no type declarations, which TypeScript 6 flags on
// side-effect imports — declare them as untyped ambient modules. This file must stay a script (no
// top-level import/export) so the declaration is global rather than a module augmentation.
declare module 'open-props/*';
