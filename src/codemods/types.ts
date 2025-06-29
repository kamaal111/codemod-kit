import type { Edit, Rule, SgNode, SgRoot } from '@ast-grep/napi';
import type { NapiLang } from '@ast-grep/napi/types/lang.js';
import type { Kinds, TypesMap } from '@ast-grep/napi/types/staticTypes.js';
import type { types } from '@kamaalio/kamaal';
import type { Result } from 'neverthrow';

export type RunCodemodOkResult = { hasChanges: boolean; content: string; fullPath: string; root: string };
export type RunCodemodResult = Result<RunCodemodOkResult, Error>;

export type Codemod = {
  name: string;
  languages: Set<NapiLang> | Array<NapiLang>;
  transformer: (content: string, filename?: types.Optional<string>) => Promise<string>;
  postTransform?: (results: { root: string; results: Array<RunCodemodOkResult> }) => Promise<void>;
};

export type ModificationsReport = {
  changesApplied: number;
};

export type Modifications = {
  ast: SgRoot<TypesMap>;
  report: ModificationsReport;
  lang: NapiLang;
  filename: types.Optional<string>;
  history: Array<SgRoot<TypesMap>>;
};

export type FindAndReplaceConfig = {
  rule: Rule<TypesMap>;
  transformer:
    | ((
        node: SgNode<TypesMap, Kinds<TypesMap>>,
        rule: Rule<TypesMap>,
      ) => types.Optional<Edit | string> | Array<Edit | string>)
    | string;
};
