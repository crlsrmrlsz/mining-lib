## What & why

<!-- One or two sentences. Link the spec / roadmap phase if applicable. -->

## Checklist

- [ ] `pnpm lint` clean (0 warnings)
- [ ] `pnpm typecheck` clean (src + tests + configs)
- [ ] `pnpm test` green (unit + e2e)
- [ ] `pnpm check:cycles` — no circular imports
- [ ] `pnpm size` — bundle under budget (if `src/` changed)
- [ ] Conventional-commit messages, atomic commits
- [ ] No new **runtime** dependency (or justified + approved per `specs/tech-stack.md`)
- [ ] Docs / specs updated if behaviour changed
