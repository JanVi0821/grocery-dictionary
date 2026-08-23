<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions

- Reuse compatible third-party components and libraries instead of rebuilding them.
- Use the project icon library (`lucide-react`) for UI icons; do not hand-author custom UI SVG icons.
- Maintain shared `hooks`, `components`, `utils`, and `styles` modules under `src/`; route chrome belongs in App Router segment layouts.
- Keep UI primitives in `src/components/ui/`, separate from business components.
- Give each page its own route folder and keep page-only components beside it. Preserve Next.js reserved filenames such as `page.tsx`.
- Prefer Tailwind CSS. Use module SCSS only when Tailwind cannot express the requirement cleanly.
- Keep tests and test-only scripts under the root `test/` directory, never beside business code.

## Next.js development

- Before any Next.js code task, read and apply `../.agents/skills/next-best-practices/SKILL.md`, relevant referenced files, and local `node_modules/next/dist/docs/` guides.
- Use strict App Router file conventions: routes, layouts, pages, loading, error, not-found, and API endpoints must be expressed with special files and directory nesting.
- JSX route layouts use `layout.tsx`; shared route UI belongs in segment `layout.tsx`, not custom layout abstractions.
- Route-local components live in `_components`; each React component lives in its own file.
- UI icons must come from `lucide-react`.
- Product- or brand-specific SVGs may be imported as React components through SVGR; keep standard UI icons in `lucide-react`.
- Locale-aware routes live under `src/app/[locale]`; use `next-intl` with the default `en` locale omitted from URLs.
- Put user-facing UI copy in `messages/*.json`, and use `@/i18n/navigation` for internal links and locale changes.
- Define cookie names only in `src/consts/cookies.ts`; do not duplicate cookie key strings in application code.

## Design constraints

- Before UI work, read `doc/design/README.md` and inspect `src/styles/theme.css`; treat the approved preview and design spec as authority.
- Use Tailwind utilities backed by theme tokens. Do not hardcode brand colors, radii, spacing, shadows, type scales, or motion values in JSX/TS/other CSS.
- Add or change reusable visual values only in `src/styles/theme.css`.
- Preserve scan-first hierarchy, mobile-first Operate mode, multilingual rules, accessibility rules, and semantic status tokens; never use brand coral for allergen danger.
- Every ordinary page shell must use `mx-auto w-full max-w-content px-page-x`; long-form reading content uses `max-w-reading`. Full-bleed requires an explicit immersive reason and keeps inner readable controls constrained.
- Avoid flags for language, glassmorphism, generic card grids, gradients, neon, fake health scores, decorative grocery art, excessive shadows, and excessive motion.
- Material UI changes require mobile and desktop visual verification.
