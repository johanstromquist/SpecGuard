import type { SpecEndpoint, UrlPattern } from '../../../core/types.js';

/**
 * Match a URL pattern against spec endpoint path templates.
 * Returns the best matching endpoint or null.
 */
export function matchPath(
  url: UrlPattern,
  endpoints: SpecEndpoint[],
): SpecEndpoint | null {
  const resolved = url.resolved;
  if (!resolved) return null;

  // url.resolved is guaranteed query-free: url-analyzer.ts splits on '?'
  // and stores only the path portion in `resolved`, with query params
  // stored separately in `url.queryParams`.
  const urlSegments = resolved.split('/').filter(Boolean);
  let bestMatch: SpecEndpoint | null = null;
  let bestScore = -1;

  for (const endpoint of endpoints) {
    const templateSegments = endpoint.pathTemplate.split('/').filter(Boolean);
    if (templateSegments.length !== urlSegments.length) continue;

    let score = 0;
    let matches = true;

    for (let i = 0; i < templateSegments.length; i++) {
      const tSeg = templateSegments[i];
      const uSeg = urlSegments[i];

      if (tSeg.startsWith('{') && tSeg.endsWith('}')) {
        // Check for param name match from URL segments
        const urlSegDef = url.segments[i];
        if (urlSegDef?.paramName) {
          const specParamName = tSeg.slice(1, -1);
          if (urlSegDef.paramName === specParamName || urlSegDef.paramName === specParamName + 'Id' || specParamName === urlSegDef.paramName + 'Id') {
            score += 3; // Param name match bonus
          } else {
            score += 1;
          }
        } else {
          score += 1;
        }
      } else if (tSeg === uSeg) {
        // Exact match is best
        score += 2;
      } else {
        matches = false;
        break;
      }
    }

    if (matches && score > bestScore) {
      bestScore = score;
      bestMatch = endpoint;
    }
  }

  return bestMatch;
}
