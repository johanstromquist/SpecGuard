import type { CallSite, Mismatch, SpecEndpoint, Severity, MismatchKind } from '../core/types.js';
import type { SpecPlugin } from '../spec/types.js';

export interface MatchResult {
  endpoint: SpecEndpoint | null;
  mismatches: Mismatch[];
}

/**
 * Match a call site to a spec endpoint.
 * Returns the matched endpoint and any method/unmatched mismatches.
 */
export function matchEndpoint(
  callSite: CallSite,
  endpoints: SpecEndpoint[],
  plugin: SpecPlugin,
  baseUrl: string,
  rules: Record<MismatchKind, Severity>,
): MatchResult {
  const mismatches: Mismatch[] = [];

  function pushMismatch(
    kind: MismatchKind,
    message: string,
    endpoint?: SpecEndpoint,
    path?: string,
  ): void {
    if (rules[kind] !== 'off') {
      mismatches.push({
        kind,
        severity: rules[kind],
        message,
        callSite,
        ...(endpoint !== undefined ? { endpoint } : {}),
        ...(path !== undefined ? { path } : {}),
      });
    }
  }

  // Strip baseUrl prefix from the resolved URL
  let url = callSite.url;
  if (baseUrl && url.resolved) {
    const stripped = url.resolved.startsWith(baseUrl)
      ? url.resolved.slice(baseUrl.length)
      : url.resolved;
    url = { ...url, resolved: stripped };
  }

  const matched = plugin.matchUrl(url, endpoints, callSite.method);

  if (!matched) {
    pushMismatch(
      'unmatched-endpoint',
      `No spec endpoint matches ${callSite.method} ${url.resolved ?? '<dynamic>'}`,
    );
    return { endpoint: null, mismatches };
  }

  // Check method match
  if (matched.method !== callSite.method) {
    pushMismatch(
      'method-mismatch',
      `Method mismatch: code uses ${callSite.method} but spec defines ${matched.method} for ${matched.pathTemplate}`,
      matched,
    );
  }

  // Check query parameters (url includes queryParams via the spread on line 28)
  if (url.queryParams) {
    const specQueryParams = matched.params.filter((p) => p.in === 'query');
    const specParamNames = new Set(specQueryParams.map((p) => p.name));

    // Check for unknown query params in frontend (skip dynamic/unresolvable params)
    for (const paramName of Object.keys(url.queryParams)) {
      if (paramName.includes('{dynamic}')) continue;
      if (!specParamNames.has(paramName)) {
        pushMismatch(
          'missing-in-spec',
          `Query parameter "${paramName}" is used in frontend but not defined in spec for ${matched.pathTemplate}`,
          matched,
          `query.${paramName}`,
        );
      }
    }

    // Check for missing required query params
    for (const specParam of specQueryParams) {
      if (specParam.required && !(specParam.name in url.queryParams)) {
        pushMismatch(
          'missing-in-frontend',
          `Required query parameter "${specParam.name}" from spec is missing in frontend call to ${matched.pathTemplate}`,
          matched,
          `query.${specParam.name}`,
        );
      }
    }
  }

  // Check deprecated
  if (matched.deprecated) {
    pushMismatch(
      'deprecated',
      `Endpoint ${matched.id} is deprecated`,
      matched,
    );
  }

  return { endpoint: matched, mismatches };
}
