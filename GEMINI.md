## Building and running
```bash
bun run preflight
```
# TypeScript Core Standards

Our codebase prioritizes functional patterns, immutability, and strict type safety over object-oriented inheritance. Follow these guidelines to ensure interoperability with React and Node.

### 1. Data Structures: POJOs & Interfaces
Avoid using class to define data models. Classes mix state and behavior, which complicates React’s reconciliation and serialization (JSON) processes.
Preferred Approach: Use Plain Old JavaScript Objects (POJOs) typed via interface or type. Enforce immutability using the readonly modifier.

```ts
// ✅ DO: Use interfaces/types with readonly properties
interface UserProfile {
  readonly id: string;
  readonly username: string;
  readonly preferences: {
    readonly theme: 'light' | 'dark';
  };
}

const createUser = (name: string): UserProfile => ({
  id: crypto.randomUUID(),
  username: name,
  preferences: { theme: 'light' },
});

// ❌ DON'T: Use classes for data holding
class User {
  public id: string;
  constructor(public username: string) {
    this.id = crypto.randomUUID();
  }
}
```
### 2. Encapsulation: Modules over Classes
Do not use classes purely for namespacing or dependency injection. JavaScript's ES Modules (import/export) provide native, tree-shakeable encapsulation.

- Public API: Explicitly export only what consumers need.

- Private Implementation: Keep helper functions local (not exported). This makes them inaccessible to the outside world, eliminating the need for private class keywords.

- Testing: Test the public API. If you feel the need to spy on a private un-exported function, it suggests that function is complex enough to be extracted into its own module and tested independently.

## 3. Type Safety: unknown over any
The any type disables the type checker and silences valid errors. It is strictly forbidden except in legacy migration files.
- Use unknown: If the type is truly dynamic (e.g., API inputs), use unknown. This forces you to perform Type Narrowing before using the data.

```ts
// ✅ DO: Narrow types using Type Guards
function parseInput(input: unknown) {
  if (isString(input)) {
    // TypeScript knows 'input' is a string here
    console.log(input.toUpperCase());
  }
}

// Custom Type Guard example
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
```
- Avoid Type Assertions (as): Casting tells the compiler to ignore reality. Only use as when you have knowledge about the runtime environment that TypeScript cannot infer (e.g., specific DOM elements).

## 4. Functional Transformations
Avoid imperative loops (for, while) and array mutation (push, splice, pop). Prefer declarative array operators that return new instances.
- Transformation: .map(), .reduce(), .filter()
- Immutability: Treat arrays as readonly.

```ts
// ✅ DO: Chain operators for declarative transformations
const activeUserIds = users
  .filter(u => u.isActive)
  .map(u => u.id);

// ❌ DON'T: Mutate arrays
const ids: string[] = [];
for (const user of users) {
  if (user.isActive) ids.push(user.id); // Mutation
}
```