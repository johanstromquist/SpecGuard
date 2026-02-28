import { Node, type ObjectLiteralExpression } from 'ts-morph';

/**
 * Read a string property from an object literal expression.
 * Returns the string value if found, null otherwise.
 */
export function getStringProp(obj: ObjectLiteralExpression, propName: string): string | null {
  const prop = obj.getProperty(propName);
  if (!prop || !Node.isPropertyAssignment(prop)) return null;

  const init = prop.getInitializer();
  if (!init || !Node.isStringLiteral(init)) return null;

  return init.getLiteralValue();
}
