import type { TypeShape, Mismatch, CallSite, SpecEndpoint, Severity, MismatchKind } from '../core/types.js';

export interface CompareContext {
  callSite: CallSite;
  endpoint: SpecEndpoint;
  rules: Record<MismatchKind, Severity>;
  typeMappings?: Record<string, string>;
}

/**
 * Compare frontend TypeShape against spec TypeShape.
 * Produces mismatches for missing fields, type mismatches, etc.
 */
export function compareShapes(
  frontend: TypeShape,
  spec: TypeShape,
  ctx: CompareContext,
  path: string = '',
): Mismatch[] {
  const mismatches: Mismatch[] = [];

  function pushMismatch(kind: MismatchKind, message: string, propPath?: string): void {
    if (ctx.rules[kind] !== 'off') {
      mismatches.push({
        kind,
        severity: ctx.rules[kind],
        message,
        callSite: ctx.callSite,
        endpoint: ctx.endpoint,
        ...(propPath !== undefined ? { path: propPath } : { path }),
      });
    }
  }

  // If either side is any/unknown, we can't compare
  if (frontend.kind === 'any' || frontend.kind === 'unknown') return mismatches;
  if (spec.kind === 'any' || spec.kind === 'unknown') return mismatches;

  // Array comparison
  if (frontend.kind === 'array' && spec.kind === 'array') {
    if (frontend.elementType && spec.elementType) {
      return compareShapes(frontend.elementType, spec.elementType, ctx, `${path}[]`);
    }
    return mismatches;
  }

  // Frontend string vs spec union of string/number literals: no false positive
  // (a plain string/number is a valid supertype of a union of literals)
  if (
    (frontend.kind === 'string' || frontend.kind === 'number') &&
    spec.kind === 'union' &&
    spec.members?.every((m) => m.kind === frontend.kind && m.literalValue !== undefined)
  ) {
    return mismatches;
  }

  // Kind mismatch at this level
  if (frontend.kind !== spec.kind && frontend.kind !== 'union' && spec.kind !== 'union') {
    pushMismatch(
      'type-mismatch',
      `Type mismatch${path ? ` at ${path}` : ''}: frontend expects ${frontend.kind} but spec defines ${spec.kind}`,
    );
    return mismatches;
  }

  // Object comparison -- property-by-property
  if (frontend.kind === 'object' && spec.kind === 'object') {
    const frontendProps = frontend.properties ?? {};
    const specProps = spec.properties ?? {};
    const mappingInfo = buildMappingInfo(frontend.typeName, ctx.typeMappings);

    // Properties in frontend but not in spec
    for (const [name, prop] of Object.entries(frontendProps)) {
      const propPath = path ? `${path}.${name}` : name;
      if (!(name in specProps)) {
        pushMismatch(
          'missing-in-spec',
          `Property "${propPath}" exists in frontend type${formatTypeName(frontend.typeName, mappingInfo)} but not in spec`,
          propPath,
        );
      } else {
        // Both have this property -- recurse
        const specProp = specProps[name];
        mismatches.push(...compareShapes(prop.shape, specProp.shape, ctx, propPath));

        // Required mismatch: frontend treats as required but spec says optional
        if (prop.required && !specProp.required) {
          pushMismatch(
            'required-mismatch',
            `Property "${propPath}" is required in frontend but optional in spec`,
            propPath,
          );
        }
      }
    }

    // Required properties in spec but not in frontend
    for (const [name, prop] of Object.entries(specProps)) {
      const propPath = path ? `${path}.${name}` : name;
      if (!(name in frontendProps)) {
        if (prop.required) {
          pushMismatch(
            'missing-in-frontend',
            `Required property "${propPath}" from spec is not in frontend type${formatTypeName(frontend.typeName, mappingInfo)}`,
            propPath,
          );
        } else {
          pushMismatch(
            'extra-in-spec',
            `Optional property "${propPath}" from spec is not used in frontend`,
            propPath,
          );
        }
      }
    }
  }

  return mismatches;
}

function buildMappingInfo(
  typeName: string | undefined,
  typeMappings?: Record<string, string>,
): string | undefined {
  if (!typeName || !typeMappings) return undefined;
  return typeMappings[typeName];
}

function formatTypeName(typeName: string | undefined, mappedTo?: string): string {
  if (!typeName) return '';
  if (mappedTo) return ` (${typeName}, mapped to ${mappedTo})`;
  return ` (${typeName})`;
}
