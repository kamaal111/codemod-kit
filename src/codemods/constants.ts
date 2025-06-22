import { Lang } from '@ast-grep/napi';

export const LANG_TO_EXTENSIONS_MAPPING: Partial<Record<string, Set<string>>> = {
  [Lang.TypeScript]: new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.mts']),
};
