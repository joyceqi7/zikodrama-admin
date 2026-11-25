# Development Protocol

1. Read `AGENTS.md`, `CONTEXT.md`, and the selected shared requirement.
2. Confirm the fixed official/direct channel and whether each operation is global-catalog or application-scoped before editing; application selection must not change the channel of a management route.
3. Keep cloud credentials and privileged behavior behind the API.
4. Preserve string identifiers and the `{ code, reason?, message, data }` contract.
5. Use focused component, domain, uploader, or API tests while editing.
6. Exercise large episode lists and asynchronous upload states when affected.
7. Run `npx pnpm@11.11.0 verify` before committing.
8. Record browser checks, skipped live media checks, exact commits, and next steps in the shared requirement.
