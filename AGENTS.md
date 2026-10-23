# Monorepo conventions

- Applications live in apps/web and apps/data-pipeline; reusable contracts and server infrastructure live in packages/.
- Preserve the existing frontend framework and route conventions. Read apps/web/AGENTS.md before frontend changes.
- Do not import another application's source. Use explicit workspace dependencies and package exports.
- Keep pipeline code and configuration together in src/catalog, src/details, src/translation and src/publish. Use the root pnpm data CLI; do not recreate Step directories.
- Keep all tests and test-only scripts in the repository-root test/ directory. Run pnpm test, pnpm typecheck, pnpm lint and pnpm build as appropriate.
- Use only the root pnpm lockfile. Do not install dependencies with npm in subdirectories or upgrade dependencies during a structural refactor.
- Runtime state and credentials belong in ignored runtime/ directories, never source or Turbo cache. Preserve checkpoints, collection names, Redis namespaces and completion markers unless a task explicitly changes them.
- Treat data commands as real writes or paid API calls. Tests/builds must not implicitly run them. Isolated integration tests require explicit opt-in and must not target business data.
