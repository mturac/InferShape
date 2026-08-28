# Contributing

InferShape accepts focused changes that improve coding-agent session diagnosis or repair handoff without turning the project into a generic observability platform.

1. Open an issue for behavior changes.
2. Add the smallest failing test first.
3. Keep the runtime dependency-free and offline.
4. Run `npm run verify`.
5. Include a privacy review whenever normalized or rendered fields change.

Pull requests must explain the user-visible failure mode, the new evidence produced, and the exact verification command.
