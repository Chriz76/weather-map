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
