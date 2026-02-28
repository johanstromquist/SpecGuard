export interface TypeShape {
  kind:
    | 'object'
    | 'array'
    | 'string'
    | 'number'
    | 'boolean'
    | 'null'
    | 'union'
    | 'any'
    | 'unknown';
  properties?: Record<string, { shape: TypeShape; required: boolean }>;
  elementType?: TypeShape;
  members?: TypeShape[];
  typeName?: string;
  literalValue?: string;
  additionalProperties?: boolean | TypeShape;
}

export interface ParamDef {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  shape: TypeShape;
}

export interface SpecEndpoint {
  id: string;
  method: string;
  pathTemplate: string;
  params: ParamDef[];
  requestBody?: TypeShape;
  responses: Record<string, TypeShape>;
  deprecated: boolean;
}

export interface UrlSegment {
  value: string;
  dynamic: boolean;
  paramName?: string;
}

export interface UrlPattern {
  segments: UrlSegment[];
  resolved: string | null;
  queryParams?: Record<string, string | true>;
}

export interface CallSite {
  file: string;
  line: number;
  method: string;
  url: UrlPattern;
  responseType?: TypeShape;
  requestBody?: TypeShape;
  callee: string;
}

export type MismatchKind =
  | 'missing-in-spec'
  | 'missing-in-frontend'
  | 'type-mismatch'
  | 'extra-in-spec'
  | 'required-mismatch'
  | 'method-mismatch'
  | 'deprecated'
  | 'unmatched-endpoint';

export type Severity = 'error' | 'warn' | 'info' | 'off';

export interface Mismatch {
  kind: MismatchKind;
  severity: Severity;
  message: string;
  callSite: CallSite;
  endpoint?: SpecEndpoint;
  path?: string;
}

export interface ScanResult {
  mismatches: Mismatch[];
  stats: {
    filesScanned: number;
    callSitesFound: number;
    endpointsMatched: number;
    errors: number;
    warnings: number;
    infos: number;
  };
}
