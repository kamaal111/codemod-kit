import { Lang } from '@ast-grep/napi';

const JAVASCRIPT_EXTENSIONS = ['.js', '.cjs', '.mjs'];
const TYPESCRIPT_EXTENSIONS = JAVASCRIPT_EXTENSIONS.concat(['.ts', '.mts']);
const JSX_EXTENSIONS = ['.jsx'];

export const LANG_TO_EXTENSIONS_MAPPING: Record<string, Set<string>> = Object.fromEntries(
  Object.entries({
    [Lang.TypeScript]: TYPESCRIPT_EXTENSIONS,
    ts: TYPESCRIPT_EXTENSIONS,
    [Lang.Tsx]: JSX_EXTENSIONS.concat(['.tsx']),
    jsx: JSX_EXTENSIONS,
    [Lang.JavaScript]: JAVASCRIPT_EXTENSIONS,
    js: JAVASCRIPT_EXTENSIONS,
  }).map(([key, value]) => [key.toLowerCase(), new Set(value)]),
);
