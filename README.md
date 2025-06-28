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

runCodemods([myCodemod], './src');
```

## API

### `runCodemods(codemods, transformationPath, options?)`

Runs a list of codemods on a given path.

- `codemods`: An array of `Codemod` objects.
- `transformationPath`: The path to the directory to transform.
- `options`: Optional configuration for the run.

### `runCodemod(codemod, transformationPath, globItems, options?)`

Runs a single codemod.

- `codemod`: A `Codemod` object.
- `transformationPath`: The path to the directory to transform.
- `globItems`: An array of file paths to transform.
- `options`: Optional configuration for the run.

### `findAndReplace(content, rule, transformer)`

A utility function for finding and replacing AST nodes based on a rule.

- `content`: An `SgRoot<TypesMap>` object representing the parsed AST.
- `rule`: A `Rule<TypesMap>` object defining the pattern to search for.
- `transformer`: A function that takes a matched node and returns an optional string replacement.

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
const result = findAndReplace(
  ast,
  { pattern: 'function oldFunction() { $$$ }' },
  node => 'function newFunction() { return "hello world"; }',
);
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
  log?: boolean;
  dry?: boolean;
};
```

- `hooks`: The hooks to use.
- `log`: Whether to log the output.
- `dry`: Whether to run in dry mode (no changes are written to disk).
