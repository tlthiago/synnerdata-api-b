# Project Architecture

## Stack

- **Runtime**: Bun | **Framework**: Elysia | **ORM**: Drizzle + PostgreSQL
- **Validation**: Zod v4 (NOT TypeBox/t.\*) | **Auth**: Better Auth | **Email**: Nodemailer

## Architectural Decisions

- **Zod for all validation** — never use Elysia's `t.*` types. Zod schemas serve as single source of truth for request/response validation and OpenAPI docs
- **AppError hierarchy for errors** — throw typed errors (`NotFoundError`, `ForbiddenError`, etc.) from `src/lib/errors/`. Never use Elysia's `status()` function for error responses
- **Response envelope** — all responses use `{ success, data }` or `{ success, error }` via `wrapSuccess()` / `wrapSuccessWithMessage()` from `src/lib/responses/envelope.ts`
- **Response schemas** — use `successResponseSchema()` and `paginatedResponseSchema()` from `src/lib/responses/response.types.ts` for typed OpenAPI responses
- **Error schemas** — reuse `unauthorizedErrorSchema`, `forbiddenErrorSchema`, `validationErrorSchema`, etc. from `src/lib/responses/response.types.ts`
- **No re-exports or barrel files** — import directly from source modules. The only allowed barrel file is `src/db/schema/index.ts` (Drizzle schema aggregation)
- **Typed env config** — all environment variables are parsed via Zod in `src/env.ts`. Import `env` from there, never use `process.env` directly
- **Domain-prefixed IDs** — entity IDs follow `<domain>-<uuid>` format (e.g., `absence-${crypto.randomUUID()}`). Always use `crypto.randomUUID()` with the appropriate prefix
- **Soft deletes** — entities use `deletedAt`/`deletedBy` fields instead of hard delete. Always filter with `isNull(schema.<table>.deletedAt)` in queries to exclude deleted records
- **Timestamps convention** — all tables include `createdAt` (defaultNow), `updatedAt` ($onUpdate), `createdBy`, `updatedBy`. Populate `createdBy`/`updatedBy` with the user ID from session

## Maintaining CLAUDE.md Files

When modifying business rules, enums, status lifecycles, relationships, or module patterns, update the corresponding CLAUDE.md file in the affected module directory. If a change impacts architectural decisions, update this file as well.

---

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config Biome preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `npx ultracite fix`
- **Check for issues**: `npx ultracite check`
- **Diagnose setup**: `npx ultracite doctor`

Biome (the underlying engine) provides extremely fast Rust-based linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns
- **Never use re-exports** - Import directly from the source module instead of re-exporting from intermediate files. This avoids circular dependencies, improves tree-shaking, and makes the codebase easier to navigate

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**
- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**
- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**
- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations

---

Most formatting and common issues are automatically fixed by Biome. Run `npx ultracite fix` before committing to ensure compliance.
