import { Type, ts } from 'ts-morph';
import type { TypeShape } from '../core/types.js';

/**
 * Convert a ts-morph Type to a TypeShape.
 * Phase 1: handles interfaces, type aliases, arrays, primitives, unions.
 */
export function typeToShape(type: Type): TypeShape {
  return typeToShapeInner(type, new Set());
}

function typeToShapeInner(type: Type, seen: Set<Type>): TypeShape {
  if (seen.has(type)) return { kind: 'any' };
  seen.add(type);
  // Handle type aliases -- follow to underlying type but preserve name
  const aliasSymbol = type.getAliasSymbol();
  const typeName = aliasSymbol?.getName() ?? type.getSymbol()?.getName();

  // any / unknown
  if (type.isAny()) return { kind: 'any', typeName };
  if (type.isUnknown()) return { kind: 'unknown', typeName };

  // null / undefined
  if (type.isNull() || type.isUndefined()) return { kind: 'null', typeName };

  // boolean
  if (type.isBoolean() || type.isBooleanLiteral()) return { kind: 'boolean', typeName };

  // number
  if (type.isNumber() || type.isNumberLiteral()) return { kind: 'number', typeName };

  // string
  if (type.isString() || type.isStringLiteral()) return { kind: 'string', typeName };

  // array
  if (type.isArray()) {
    const elementType = type.getArrayElementTypeOrThrow();
    return {
      kind: 'array',
      elementType: typeToShapeInner(elementType, seen),
      typeName,
    };
  }

  // union (but not boolean which shows as true | false)
  if (type.isUnion() && !type.isBoolean()) {
    const members = type.getUnionTypes().map((t) => typeToShapeInner(t, seen));
    return { kind: 'union', members, typeName };
  }

  // object / interface
  if (type.isObject()) {
    const properties: Record<string, { shape: TypeShape; required: boolean }> = {};
    for (const prop of type.getProperties()) {
      const propType = prop.getValueDeclarationOrThrow().getType();
      const isOptional = prop.hasFlags(ts.SymbolFlags.Optional);
      properties[prop.getName()] = {
        shape: typeToShapeInner(propType, seen),
        required: !isOptional,
      };
    }
    return { kind: 'object', properties, typeName };
  }

  return { kind: 'any', typeName };
}
