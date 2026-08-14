# Weather Map - Coding Guidelines

## Language

**All code comments, documentation, and commit messages must be in English.**

- No German comments or variable names in source code
- Code reviews should enforce English-only documentation
- Use clear, concise English for all variable, function, and class names

## Code Style

- Follow existing patterns in `src/` directory (or `ts/`)
- Use `const`/`let` (avoid `var`)
- Use arrow functions where appropriate
- Comments should explain *why*, not *what*
- Require TSDoc comments for all exported functions and non-trivial internal functions in `src/`
- Use the shared logger at `src/utils/logger.ts` for runtime logging instead of direct `console.*` calls
- Use `logger.debug(...)` for verbose diagnostics, `logger.info(...)` for normal operation messages, `logger.warn(...)` for recoverable warnings, and `logger.error(...)` for runtime failures
- Enforce strict separation of concerns within MVC:
  - **Models (`src/models/`):** Manage data structure, state, and business logic only. No DOM/UI or direct HTTP handling. Emit events that the views listen to. No data in the events. The views will read the model
  - **Views (`src/views/`):** Handle UI rendering, DOM elements, and user input capture. No business logic. Only read access to the models.
  - **Controllers (`src/controllers/`):** Act as the glue—receive events/inputs from Views, execute Model logic.
  
## Module Design & Encapsulation Rules

- **Prefer Functional Modules over Classes:**
  - Avoid ES6 `class` syntax by default.
  - Use **Classes ONLY when strictly necessary** (e.g., extending framework/library base classes or when external APIs require class-based instances).

- **Encapsulation & Privacy:**
  - Keep internal helpers, constants, and state **private** within the module file scope (do not attach `export`).
  - Explicitly `export` only the required public API (functions, types, or object interfaces).

- **Module Import & Usage Style:**
  - Standard utilities and helper modules MUST be imported as namespace objects to enforce explicit prefix usage at invocation sites:
    ```typescript
    // DO:
    import * as dateUtils from '@/utils/date';
    dateUtils.formatDate(new Date());

    // AVOID: Direct function destructuring for general utilities
    // import { formatDate } from '@/utils/date';
    ```

- **Module Architectural Patterns:**
  1. **Stateless Utilities / Pure Helpers:** Use standard ES module exports and import via `import * as name` (e.g., `src/utils/math.ts`).
  2. **Singletons / Global Services (Logger, API Clients):** Export a frozen object literal (`export const logger = { ... } as const`) to enforce object-based invocation directly.
  3. **Stateful Entities / Models (when instantiations are needed without classes):** Use Factory Functions (Revealing Module Pattern) with closures to manage private state:
     ```typescript
     export const createCart = () => {
       const items: CartItem[] = []; // Private state
       return {
         addItem: (item: CartItem) => { items.push(item); },
         getTotal: () => items.reduce((sum, i) => sum + i.price, 0)
       };
     };
     ```
     

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

