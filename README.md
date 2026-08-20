# Codemod kit

A toolkit to run codemods.

## Installation

```bash
pnpm add @kamaalio/codemod-kit
```

## Usage

```typescript
import { runCodemods } from '@kamaalio/codemod-kit';
import type { CodeMod } from '@kamaalio/codemod-kit';

const myCodemod: CodeMod = {
  name: 'my-codemod',
  languages: ['typescript'],
  transformer: async (content, filename) => {
    // ... transform the content
  },
};

runCodemods([myCodemod], { paths: ['./src'] });
```

## API

### `runCodemods(codemods, config, options?)`

Runs a list of codemods against a `CodemodConfig` (see [Config](#config)).

- `codemods`: An array of `Codemod` objects.
- `config`: A `CodemodConfig` object (`{ paths, dry_run?, log? }`) describing what to transform.
- `options`: Optional configuration for the run (`hooks`, `rootPaths` — see [Hooks](#hooks) and [Options](#options)).

### `runCodemod(codemod, config, options?)`

Runs a single codemod against a `CodemodConfig`, transforming every path in `config.paths`.

- `codemod`: A `Codemod` object.
- `config`: A `CodemodConfig` object (`{ paths, dry_run?, log? }`) describing what to transform.
- `options`: Optional configuration for the run.

```typescript
import { loadCodemodConfig, runCodemod } from '@kamaalio/codemod-kit';

const config = await loadCodemodConfig('joi-migration-phase1.json');
await runCodemod(myCodemod, config);
```

### `findAndReplace(content, rule, transformer)`

A utility function for finding and replacing AST nodes based on a rule.

- `content`: An `SgRoot<TypesMap>` object representing the parsed AST.
- `rule`: A `Rule<TypesMap>` object defining the pattern to search for.
- `transformer`: A function that takes a matched node and returns an optional string replacement, or a string for direct replacement.

Returns the transformed content as a string with all matching nodes replaced.

```typescript
import { findAndReplace } from '@kamaalio/codemod-kit';
import { parseAsync } from '@ast-grep/napi';

const code = `
function oldFunction() {
  return "hello";
}
`;

const ast = await parseAsync('javascript', code);

// Using a function transformer
const result1 = findAndReplace(
  ast,
  { pattern: 'function oldFunction() { $$$ }' },
  node => 'function newFunction() { return "hello world"; }',
);

// Using a string transformer
const result2 = findAndReplace(
  ast,
  { pattern: 'function oldFunction() { $$$ }' },
  'function newFunction() { return "hello world"; }',
);
```

### `findAndReplaceEdits(content, rule, transformer)`

A utility function for finding AST nodes and generating edit operations without committing them.

- `content`: An `SgRoot<TypesMap>` object representing the parsed AST.
- `rule`: A `Rule<TypesMap>` object defining the pattern to search for.
- `transformer`: A function that takes a matched node and returns an optional string replacement, or a string for direct replacement.

Returns an array of `Edit` objects that can be committed later using `commitEdits()`.

```typescript
import { findAndReplaceEdits } from '@kamaalio/codemod-kit';
import { parseAsync } from '@ast-grep/napi';

const code = `
function oldFunction() {
  return "hello";
}
`;

const ast = await parseAsync('javascript', code);

// Using a function transformer
const edits1 = findAndReplaceEdits(
  ast,
  { pattern: 'function oldFunction() { $$$ }' },
  node => 'function newFunction() { return "hello world"; }',
);

// Using a string transformer
const edits2 = findAndReplaceEdits(
  ast,
  { pattern: 'function oldFunction() { $$$ }' },
  'function newFunction() { return "hello world"; }',
);

// Commit the edits later
const result = ast.root().commitEdits(edits1);
```

### `findAndReplaceConfig(content, lang, config)`

A utility function for applying multiple find-and-replace operations sequentially on AST content.

- `content`: An `SgRoot<TypesMap>` object representing the parsed AST.
- `lang`: A `NapiLang` value specifying the language for re-parsing after each transformation.
- `config`: An array of objects containing `rule` and `transformer` pairs to apply sequentially. The `transformer` can be either a function or a string.

Returns the final transformed content as a string after applying all transformations.

```typescript
import { findAndReplaceConfig } from '@kamaalio/codemod-kit';
import { parseAsync } from '@ast-grep/napi';

const code = `
function oldFunction() {
  return "hello";
}
const value = 42;
`;

const ast = await parseAsync('javascript', code);
const result = await findAndReplaceConfig(ast, 'javascript', [
  {
    rule: { pattern: 'function oldFunction() { $$$ }' },
    transformer: node => 'function newFunction() { return "hello world"; }',
  },
  {
    rule: { pattern: 'const value = $VAL' },
    transformer: 'const value = 100', // String transformer
  },
]);
```

### `findAndReplaceConfigModifications(modifications, config)`

A utility function for applying multiple find-and-replace operations sequentially on a `Modifications` object.

- `modifications`: A `Modifications` object containing the AST, language, and transformation history.
- `config`: An array of objects containing `rule` and `transformer` pairs to apply sequentially. The `transformer` can be either a function or a string.

Returns a `Promise<Modifications>` with the updated AST, accumulated edit count, and transformation history.

```typescript
import { findAndReplaceConfigModifications } from '@kamaalio/codemod-kit';
import { parseAsync } from '@ast-grep/napi';

const code = `
function oldFunction() {
  return "hello";
}
const value = 42;
`;

const ast = await parseAsync('javascript', code);
const initialModifications = {
  ast,
  lang: 'javascript' as const,
  filename: 'example.js',
  report: { changesApplied: 0 },
  history: [ast],
};

const result = await findAndReplaceConfigModifications(initialModifications, [
  {
    rule: { pattern: 'function oldFunction() { $$$ }' },
    transformer: node => 'function newFunction() { return "hello world"; }',
  },
  {
    rule: { pattern: 'const value = $VAL' },
    transformer: 'const value = 100', // String transformer
  },
]);

// result.ast contains the final transformed AST
// result.report.changesApplied contains the total number of edits applied
// result.history contains the transformation history
```

### `Codemod`

A codemod is defined by the `Codemod` type:

```typescript
export type Codemod = {
  name: string;
  languages: Set<NapiLang> | Array<NapiLang>;
  transformer: (content: SgRoot<TypesMap> | string, filename?: Optional<string>) => Promise<Modifications>;
};
```

- `name`: The name of the codemod.
- `languages`: The languages the codemod applies to.
- `transformer`: The function that transforms the code.

### `Modifications`

The `transformer` function returns a `Modifications` object:

```typescript
export type Modifications = {
  ast: SgRoot<TypesMap>;
  report: ModificationsReport;
  lang: NapiLang;
  filename: Optional<string>;
  history: Array<SgRoot<TypesMap>>;
};
```

- `ast`: The modified AST.
- `report`: A report of the changes.
- `lang`: The language of the file.
- `filename`: The name of the file.
- `history`: A history of the modifications.

## Config

Codemods can be driven by a JSON config file instead of hardcoding paths. `loadCodemodConfig` reads a file and returns the config, ready to pass straight into `runCodemod`/`runCodemods`:

```json
{
  "paths": ["src/controllers"],
  "dry_run": true,
  "log": false
}
```

```typescript
import { loadCodemodConfig, runCodemod } from '@kamaalio/codemod-kit';

const config = await loadCodemodConfig('joi-migration-phase1.json');
await runCodemod(myCodemod, config);
```

A config file requires `paths` (the files/directories to transform) and may optionally set `dry_run` and `log` to control those same behaviors without touching `RunCodemodOptions`.

If your codemod needs extra fields beyond that, extend `CodemodConfigSchema` (a zod schema) with `.extend()` and pass it as `loadCodemodConfig`'s second argument — it validates against and returns your extended shape:

```typescript
import { CodemodConfigSchema, loadCodemodConfig } from '@kamaalio/codemod-kit';
import z from 'zod';

const MyConfigSchema = CodemodConfigSchema.extend({ ticket_id: z.string() });

const config = await loadCodemodConfig('my-codemod.json', MyConfigSchema);
// config.paths, config.dry_run, config.ticket_id
```

`loadCodemodConfig` throws (rather than returning a value you have to check) when the file is missing, isn't valid JSON, or fails validation — the error message says exactly what's wrong.

## Hooks

You can provide hooks to customize the codemod run:

```typescript
type RunCodemodHooks = {
  targetFiltering?: (filepath: string) => boolean;
  preCodemodRun?: (codemod: Codemod) => Promise<void>;
  postTransform?: (transformedContent: string) => Promise<string>;
};
```

- `targetFiltering`: A function to filter the files to transform.
- `preCodemodRun`: A function to run before each codemod.
- `postTransform`: A function to run after each transformation.

## Options

You can provide options to customize the codemod run:

```typescript
type RunCodemodOptions = {
  hooks?: RunCodemodHooks;
  rootPaths?: Array<string>;
};
```

- `hooks`: The hooks to use.
- `rootPaths`: Root paths used to group results for `postTransform`/hook invocation across multiple targets.

`log` and `dry_run` (whether to log output, and whether to run in dry mode without writing changes) live on the `CodemodConfig` object passed to `runCodemod`/`runCodemods` — see [Config](#config).
