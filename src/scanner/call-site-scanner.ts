import {
  Node,
  SyntaxKind,
  type Expression,
  type SourceFile,
  type CallExpression,
} from 'ts-morph';
import type { CallSite, TypeShape } from '../core/types.js';
import type { SpecGuardConfig, WrapperConfig } from '../core/config.js';
import { analyzeUrl } from './url-analyzer.js';
import { typeToShape } from './type-scanner.js';
import { tryParseAxios } from './axios-scanner.js';
import { getStringProp } from './ast-utils.js';

/**
 * If the node's parent is an AwaitExpression, return that parent; otherwise return the node unchanged.
 */
function skipAwait(node: Node): Node {
  const parent = node.getParent();
  if (parent && Node.isAwaitExpression(parent)) {
    return parent;
  }
  return node;
}

/**
 * Scan source files for fetch() and configured wrapper calls.
 * Returns CallSite[] with URL, method, and response type information.
 */
export function scanCallSites(
  sourceFiles: SourceFile[],
  config: Pick<SpecGuardConfig, 'wrappers'>,
): CallSite[] {
  const callSites: CallSite[] = [];
  const wrappers = config.wrappers ?? [];

  for (const file of sourceFiles) {
    const calls = file.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of calls) {
      const site = tryParseFetch(call, file) ?? tryParseAxios(call, file) ?? tryParseWrapper(call, file, wrappers);
      if (site) {
        callSites.push(site);
      }
    }
  }

  return callSites;
}

function tryParseFetch(call: CallExpression, file: SourceFile): CallSite | null {
  const expr = call.getExpression();
  if (!Node.isIdentifier(expr) || expr.getText() !== 'fetch') return null;

  const args = call.getArguments();
  if (args.length === 0) return null;

  const url = analyzeUrl(args[0] as Expression);
  const method = extractMethodFromOptions(args[1]) ?? 'GET';
  const responseType = extractResponseType(call) ?? traceJsonAssertion(call);
  const requestBody = extractRequestBody(args[1]);

  return {
    file: file.getFilePath(),
    line: call.getStartLineNumber(),
    method: method.toUpperCase(),
    url,
    responseType,
    requestBody,
    callee: 'fetch',
  };
}

function tryParseWrapper(
  call: CallExpression,
  file: SourceFile,
  wrappers: WrapperConfig[],
): CallSite | null {
  const expr = call.getExpression();
  const calleeName = expr.getText();

  const wrapper = wrappers.find((w) => w.name === calleeName);
  if (!wrapper) return null;

  const args = call.getArguments();
  if (args.length <= wrapper.urlArg) return null;

  const url = analyzeUrl(args[wrapper.urlArg] as Expression);
  let method = wrapper.defaultMethod;

  if (wrapper.methodFrom) {
    const extracted = extractMethodFromArg(args, wrapper.methodFrom);
    if (extracted) method = extracted;
  }

  const responseType = extractResponseType(call);

  return {
    file: file.getFilePath(),
    line: call.getStartLineNumber(),
    method: method.toUpperCase(),
    url,
    responseType,
    callee: calleeName,
  };
}

function extractMethodFromOptions(optionsArg: Node | undefined): string | null {
  if (!optionsArg || !Node.isObjectLiteralExpression(optionsArg)) return null;
  return getStringProp(optionsArg, 'method');
}

function extractMethodFromArg(args: Node[], methodFrom: string): string | null {
  const match = methodFrom.match(/^arg(\d+)\.(\w+)$/);
  if (!match) return null;

  const argIndex = parseInt(match[1], 10);
  const propName = match[2];

  if (argIndex >= args.length) return null;
  const arg = args[argIndex];

  if (!Node.isObjectLiteralExpression(arg)) return null;
  return getStringProp(arg, propName);
}

/**
 * Extract request body type from fetch options: `{ body: JSON.stringify(data) }`
 * Resolves the argument to JSON.stringify to get the body shape.
 */
function extractRequestBody(optionsArg: Node | undefined): TypeShape | undefined {
  if (!optionsArg || !Node.isObjectLiteralExpression(optionsArg)) return undefined;

  const bodyProp = optionsArg.getProperty('body');
  if (!bodyProp || !Node.isPropertyAssignment(bodyProp)) return undefined;

  const init = bodyProp.getInitializer();
  if (!init || !Node.isCallExpression(init)) return undefined;

  // Check for JSON.stringify(expr)
  const callExpr = init.getExpression();
  if (!Node.isPropertyAccessExpression(callExpr)) return undefined;
  if (callExpr.getName() !== 'stringify') return undefined;

  const obj = callExpr.getExpression();
  if (!Node.isIdentifier(obj) || obj.getText() !== 'JSON') return undefined;

  const jsonArgs = init.getArguments();
  if (jsonArgs.length === 0) return undefined;

  const bodyExpr = jsonArgs[0];
  return typeToShape(bodyExpr.getType());
}

/**
 * Check if a node (after skipping await) has an `as X` type assertion and return its shape.
 */
function extractTypeAssertion(node: Node): TypeShape | undefined {
  const parent = node.getParent();
  if (parent && Node.isAsExpression(parent)) {
    return typeToShape(parent.getType());
  }
  return undefined;
}

/**
 * Extract response type from type assertions directly on the call or its immediate parent.
 * Handles: `fetch(...) as X`, `await fetch(...) as X`
 */
function extractResponseType(call: CallExpression): TypeShape | undefined {
  return extractTypeAssertion(skipAwait(call));
}

/**
 * Trace the common two-line fetch pattern:
 *   const res = await fetch(url);
 *   return await res.json() as SomeType;
 *
 * Find the variable the fetch result is assigned to, then find .json() calls
 * on that variable and check for type assertions.
 */
function traceJsonAssertion(fetchCall: CallExpression): TypeShape | undefined {
  // Walk up to find the variable declaration: `const res = await fetch(...)`
  const node = skipAwait(fetchCall);

  const varDecl = node.getParent();
  if (!varDecl || !Node.isVariableDeclaration(varDecl)) return undefined;

  const varName = varDecl.getName();

  // Find the containing block/function
  const block = varDecl.getFirstAncestorByKind(SyntaxKind.Block) ??
    varDecl.getFirstAncestorByKind(SyntaxKind.SourceFile);
  if (!block) return undefined;

  // Search for `<varName>.json()` calls in the same scope
  const allCalls = block.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of allCalls) {
    const callExpr = call.getExpression();
    if (!Node.isPropertyAccessExpression(callExpr)) continue;
    if (callExpr.getName() !== 'json') continue;

    const obj = callExpr.getExpression();
    if (!Node.isIdentifier(obj) || obj.getText() !== varName) continue;

    // Found `res.json()` -- check for `as X` on it or its parent await
    const jsonNode = skipAwait(call);
    const asserted = extractTypeAssertion(jsonNode);
    if (asserted) return asserted;

    // Check for variable type annotation: `const user: User = await res.json()`
    // Also handles destructuring: `const { id }: User = await res.json()`
    const parent = jsonNode.getParent();
    if (parent && Node.isVariableDeclaration(parent)) {
      const typeNode = parent.getTypeNode();
      if (typeNode) {
        return typeToShape(typeNode.getType());
      }
    }
  }

  return undefined;
}
