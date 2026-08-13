# Weather Map - Coding Guidelines

## Language

**All code comments, documentation, and commit messages must be in English.**

- No German comments or variable names in source code
- Code reviews should enforce English-only documentation
- Use clear, concise English for all variable, function, and class names

## Code Style

- Follow existing patterns in `js/` directory
- Use const/let (avoid var)
- Use arrow functions where appropriate
- Comments should explain *why*, not *what*
- Require JSDoc comments for all exported functions and non-trivial internal functions in `js/`
- Use the shared logger at `js/utils/logger.js` for runtime logging instead of direct `console.*` calls
- Use `logger.debug(...)` for verbose diagnostics, `logger.info(...)` for normal operation messages, `logger.warn(...)` for recoverable warnings, and `logger.error(...)` for runtime failures

## Agent Instructions

- Run sequence for any change affecting TypeScript files:
	1. `tsc --noEmit` (typecheck)
 2. `eslint src --ext .ts --max-warnings=0` (lint:ci)
 3. Run unit tests (prefer targeted tests for changed files; fallback to full suite)
 4. `npm run build`

- On new `.ts` files with no tests: generate a minimal Vitest smoke test stub under `tests/spec/` that imports the module and asserts it loads. Mark generated tests with a clear TODO comment.

- Always use `unknown` instead of `any` where possible and add type guards to narrow runtime values.

- Messages, logs, test names and any generated text must be in English.

- CI requirements:
	- Lint must run with `--max-warnings=0` and fail on warnings/errors.
	- Typecheck and tests must run on `push`, `pull_request`, and manually via `workflow_dispatch`.

- On failures the agent should collect and report:
	- First failing error message
	- Full `tsc` diagnostics, ESLint output, and Vitest failure summary
	- Paths of modified files and generated tests

- Keep changes minimal and related to the task; do not modify unrelated files without explicit approval.

- For any automated fixes (e.g. `eslint --fix`), run tests before committing and document the rationale in the commit message.

- Ask before broad refactors; prefer iterative small fixes.

