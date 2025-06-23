import type { SgRoot } from '@ast-grep/napi';
import type { NapiLang } from '@ast-grep/napi/types/lang.js';
import type { TypesMap } from '@ast-grep/napi/types/staticTypes.js';

import type { Optional } from '../utils/type-utils.js';

export type Codemod = {
  name: string;
  languages: Set<NapiLang> | Array<NapiLang>;
  commitMessage: string;
  transformer: (content: SgRoot<TypesMap> | string, filename?: Optional<string>) => Promise<string>;
};

export type ModificationsReport = {
  changesApplied: number;
};

export type Modifications = {
  ast: SgRoot<TypesMap>;
  report: ModificationsReport;
  lang: NapiLang;
  filename: Optional<string>;
  history: Array<SgRoot<TypesMap>>;
};
