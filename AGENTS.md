<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- AIOX project rules -->

# Synkra AIOS

- Siga a Constitution em `.aiox-core/constitution.md`.
- Priorize CLI First -> Observability Second -> UI Third.
- Trabalhe por stories em `docs/stories/` e atualize checklist/file list.
- Mantenha o design do baseline `catalog-builder-technical` sem redesenho não solicitado.
- Gates antes de concluir: `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`.
