import type { OpenAPIV3 } from 'openapi-types';
import type { TypeShape } from '../../../core/types.js';

type SchemaObject = OpenAPIV3.SchemaObject;

export function schemaToTypeShape(schema: SchemaObject | undefined): TypeShape {
  return schemaToTypeShapeInner(schema, new Set());
}

function schemaToTypeShapeInner(schema: SchemaObject | undefined, seen: Set<SchemaObject>): TypeShape {
  if (!schema) {
    return { kind: 'any' };
  }

  if (seen.has(schema)) return { kind: 'any' };
  seen.add(schema);

  // Handle allOf by merging properties
  if (schema.allOf) {
    const merged: TypeShape = { kind: 'object', properties: {} };
    for (const sub of schema.allOf) {
      const subShape = schemaToTypeShapeInner(sub as SchemaObject, seen);
      if (subShape.kind === 'object' && subShape.properties) {
        merged.properties = { ...merged.properties, ...subShape.properties };
      }
    }
    return merged;
  }

  // Handle oneOf/anyOf as unions
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf ?? schema.anyOf) as SchemaObject[];
    const members = variants.map((v) => schemaToTypeShapeInner(v, seen));
    if (members.length === 1) return members[0];
    return { kind: 'union', members };
  }

  // Handle enum as union of literal types
  if (schema.enum) {
    const baseKind = schema.type === 'integer' || schema.type === 'number' ? 'number' : 'string';
    const members: TypeShape[] = schema.enum.map((val) => ({
      kind: baseKind as TypeShape['kind'],
      literalValue: String(val),
    }));
    if (members.length === 1) return members[0];
    return { kind: 'union', members };
  }

  switch (schema.type) {
    case 'object': {
      const properties: Record<string, { shape: TypeShape; required: boolean }> = {};
      const required = new Set(schema.required ?? []);
      if (schema.properties) {
        for (const [name, propSchema] of Object.entries(schema.properties)) {
          properties[name] = {
            shape: schemaToTypeShapeInner(propSchema as SchemaObject, seen),
            required: required.has(name),
          };
        }
      }
      const result: TypeShape = { kind: 'object', properties };
      if (schema.additionalProperties !== undefined) {
        if (typeof schema.additionalProperties === 'boolean') {
          result.additionalProperties = schema.additionalProperties;
        } else {
          result.additionalProperties = schemaToTypeShapeInner(
            schema.additionalProperties as SchemaObject, seen,
          );
        }
      }
      return result;
    }

    case 'array': {
      const items = schema.items as SchemaObject | undefined;
      return {
        kind: 'array',
        elementType: schemaToTypeShapeInner(items, seen),
      };
    }

    case 'string':
      return { kind: 'string' };
    case 'integer':
    case 'number':
      return { kind: 'number' };
    case 'boolean':
      return { kind: 'boolean' };

    default:
      // No type specified -- treat as any
      if (schema.properties) {
        // Has properties but no explicit type -- treat as object
        return schemaToTypeShapeInner({ ...schema, type: 'object' }, seen);
      }
      return { kind: 'any' };
  }
}
