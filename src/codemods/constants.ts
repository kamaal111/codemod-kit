import { type SgRoot, Lang } from '@ast-grep/napi';
import type { NapiLang } from '@ast-grep/napi/types/lang';
import type { TypesMap } from '@ast-grep/napi/types/staticTypes';

import type { Optional } from '../utils/type-utils';
import type { Modifications } from './types';

export type CodeMod = {
  name: string;
  languages: Set<NapiLang> | Array<NapiLang>;
  commitMessage: string;
  transformer: (content: SgRoot<TypesMap> | string, filename?: Optional<string>) => Promise<Modifications>;
};

export const LANG_TO_EXTENSIONS_MAPPING: Partial<Record<string, Set<string>>> = {
  [Lang.TypeScript]: new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.mts']),
};
