import { describe, it, expect } from 'vitest';
import { schemaToTypeShape } from '../../src/spec/plugins/openapi/normalizer.js';

describe('schemaToTypeShape', () => {
  it('converts primitive types', () => {
    expect(schemaToTypeShape({ type: 'string' })).toEqual({ kind: 'string' });
    expect(schemaToTypeShape({ type: 'number' })).toEqual({ kind: 'number' });
    expect(schemaToTypeShape({ type: 'integer' })).toEqual({ kind: 'number' });
    expect(schemaToTypeShape({ type: 'boolean' })).toEqual({ kind: 'boolean' });
  });

  it('converts objects with properties', () => {
    const result = schemaToTypeShape({
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        email: { type: 'string' },
      },
    });

    expect(result.kind).toBe('object');
    expect(result.properties?.id).toEqual({ shape: { kind: 'number' }, required: true });
    expect(result.properties?.name).toEqual({ shape: { kind: 'string' }, required: true });
    expect(result.properties?.email).toEqual({ shape: { kind: 'string' }, required: false });
  });

  it('converts arrays', () => {
    const result = schemaToTypeShape({
      type: 'array',
      items: { type: 'string' },
    });
    expect(result).toEqual({ kind: 'array', elementType: { kind: 'string' } });
  });

  it('converts nested objects', () => {
    const result = schemaToTypeShape({
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
          },
        },
      },
    });
    expect(result.properties?.address.shape.kind).toBe('object');
    expect(result.properties?.address.shape.properties?.street.shape.kind).toBe('string');
  });

  it('converts oneOf/anyOf as unions', () => {
    const result = schemaToTypeShape({
      oneOf: [{ type: 'string' }, { type: 'number' }],
    });
    expect(result.kind).toBe('union');
    expect(result.members).toHaveLength(2);
  });

  it('handles allOf by merging properties', () => {
    const result = schemaToTypeShape({
      allOf: [
        { type: 'object', properties: { id: { type: 'number' } } },
        { type: 'object', properties: { name: { type: 'string' } } },
      ],
    });
    expect(result.kind).toBe('object');
    expect(result.properties?.id).toBeDefined();
    expect(result.properties?.name).toBeDefined();
  });

  it('returns any for undefined schema', () => {
    expect(schemaToTypeShape(undefined)).toEqual({ kind: 'any' });
  });

  it('converts string enum to union of literals', () => {
    const result = schemaToTypeShape({
      type: 'string',
      enum: ['active', 'inactive'],
    });
    expect(result.kind).toBe('union');
    expect(result.members).toHaveLength(2);
    expect(result.members![0]).toEqual({ kind: 'string', literalValue: 'active' });
    expect(result.members![1]).toEqual({ kind: 'string', literalValue: 'inactive' });
  });

  it('converts integer enum to union of number literals', () => {
    const result = schemaToTypeShape({
      type: 'integer',
      enum: [1, 2, 3],
    });
    expect(result.kind).toBe('union');
    expect(result.members).toHaveLength(3);
    expect(result.members![0]).toEqual({ kind: 'number', literalValue: '1' });
  });

  it('converts single-value enum to literal shape', () => {
    const result = schemaToTypeShape({
      type: 'string',
      enum: ['only'],
    });
    expect(result.kind).toBe('string');
    expect(result.literalValue).toBe('only');
  });

  it('handles additionalProperties', () => {
    const result = schemaToTypeShape({
      type: 'object',
      additionalProperties: { type: 'string' },
    });
    expect(result.additionalProperties).toEqual({ kind: 'string' });
  });
});
