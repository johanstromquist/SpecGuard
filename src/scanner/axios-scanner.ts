import {
  Node,
  type Expression,
  type SourceFile,
  type CallExpression,
} from 'ts-morph';
import type { CallSite, TypeShape } from '../core/types.js';
import { analyzeUrl, urlFromString } from './url-analyzer.js';
import { typeToShape } from './type-scanner.js';
import { getStringProp } from './ast-utils.js';

const AXIOS_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

/**
 * Try to parse an axios call: axios.get('/url'), axios.post('/url', body),
 * or instance method calls from axios.create({ baseURL }).
 */
export function tryParseAxios(
  call: CallExpression,
  file: SourceFile,
): CallSite | null {
  const expr = call.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) return null;

  const methodName = expr.getName();
  const obj = expr.getExpression();

  // Direct axios.get/post/etc
  if (Node.isIdentifier(obj) && obj.getText() === 'axios') {
    if (!AXIOS_METHODS.has(methodName)) return null;
    return buildAxiosCallSite(call, file, methodName, null);
  }

  // Instance method: api.get/post/etc where api = axios.create({ baseURL })
  if (Node.isIdentifier(obj) && AXIOS_METHODS.has(methodName)) {
    const baseURL = resolveAxiosInstanceBaseURL(obj);
    if (baseURL !== undefined) {
      return buildAxiosCallSite(call, file, methodName, baseURL);
    }
  }

  return null;
}

function buildAxiosCallSite(
  call: CallExpression,
  file: SourceFile,
  methodName: string,
  baseURL: string | null,
): CallSite | null {
  const args = call.getArguments();
  if (args.length === 0) return null;

  let url = analyzeUrl(args[0] as Expression);

  // Prepend baseURL if present
  if (baseURL && url.resolved) {
    url = urlFromString(baseURL + url.resolved);
  }

  const method = methodName.toUpperCase();

  // Extract response type from generic type argument: axios.get<User>(...)
  let responseType: TypeShape | undefined;
  const typeArgs = call.getTypeArguments();
  if (typeArgs.length > 0) {
    responseType = typeToShape(typeArgs[0].getType());
  }

  // Extract request body from second argument for POST/PUT/PATCH
  let requestBody: TypeShape | undefined;
  if (['POST', 'PUT', 'PATCH'].includes(method) && args.length >= 2) {
    requestBody = typeToShape(args[1].getType());
  }

  return {
    file: file.getFilePath(),
    line: call.getStartLineNumber(),
    method,
    url,
    responseType,
    requestBody,
    callee: 'axios',
  };
}

function resolveAxiosInstanceBaseURL(identifier: Node): string | null | undefined {
  if (!Node.isIdentifier(identifier)) return undefined;

  const defs = identifier.getDefinitionNodes();
  for (const def of defs) {
    if (!Node.isVariableDeclaration(def)) continue;
    const init = def.getInitializer();
    if (!init || !Node.isCallExpression(init)) continue;

    const callExpr = init.getExpression();
    if (!Node.isPropertyAccessExpression(callExpr)) continue;
    if (callExpr.getName() !== 'create') continue;

    const obj = callExpr.getExpression();
    if (!Node.isIdentifier(obj) || obj.getText() !== 'axios') continue;

    // Found axios.create(...) -- extract baseURL
    const createArgs = init.getArguments();
    if (createArgs.length === 0) return null;

    const configArg = createArgs[0];
    if (!Node.isObjectLiteralExpression(configArg)) return null;

    return getStringProp(configArg, 'baseURL');
  }

  return undefined;
}
