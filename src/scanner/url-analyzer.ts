import {
  Node,
  SyntaxKind,
  type Expression,
  type TemplateExpression,
  type NoSubstitutionTemplateLiteral,
} from 'ts-morph';
import type { UrlPattern, UrlSegment } from '../core/types.js';

const DYNAMIC_MARKER = '{dynamic}';

/**
 * Extract a UrlPattern from an expression node.
 * Handles string literals, template literals, and simple variable references.
 */
export function analyzeUrl(expr: Expression): UrlPattern {
  // String literal
  if (Node.isStringLiteral(expr)) {
    const value = expr.getLiteralValue();
    return urlFromString(value);
  }

  // No-substitution template literal: `some string`
  if (Node.isNoSubstitutionTemplateLiteral(expr)) {
    const value = (expr as NoSubstitutionTemplateLiteral).getLiteralValue();
    return urlFromString(value);
  }

  // Template expression: `prefix${expr}suffix`
  if (Node.isTemplateExpression(expr)) {
    return analyzeTemplate(expr as TemplateExpression);
  }

  // Binary expression: BASE_URL + '/users'
  if (Node.isBinaryExpression(expr)) {
    const op = expr.getOperatorToken().getKind();
    if (op === SyntaxKind.PlusToken) {
      const left = analyzeUrl(expr.getLeft());
      const right = analyzeUrl(expr.getRight());
      if (left.resolved !== null && right.resolved !== null) {
        const combined = left.resolved + right.resolved;
        return urlFromString(combined);
      }
      // One side is dynamic
      const segments = [...left.segments, ...right.segments];
      return { segments, resolved: null };
    }
  }

  // Identifier -- follow to initializer
  if (Node.isIdentifier(expr)) {
    const defs = expr.getDefinitionNodes();
    for (const def of defs) {
      if (Node.isVariableDeclaration(def)) {
        const init = def.getInitializer();
        if (init) return analyzeUrl(init);
      }
    }
  }

  // Unresolvable
  return { segments: [], resolved: null };
}

function parseQueryParams(qs: string): Record<string, string | true> {
  const params: Record<string, string | true> = {};
  for (const part of qs.split('&')) {
    const [key, val] = part.split('=');
    if (key) {
      params[key] = val !== undefined ? val : true;
    }
  }
  return params;
}

export function urlFromString(value: string): UrlPattern {
  const [pathPart, queryPart] = value.split('?');
  const segments: UrlSegment[] = pathPart
    .split('/')
    .filter(Boolean)
    .map((s) => ({ value: s, dynamic: false }));

  const result: UrlPattern = { segments, resolved: pathPart };
  if (queryPart) {
    result.queryParams = parseQueryParams(queryPart);
  }
  return result;
}

function analyzeTemplate(expr: TemplateExpression): UrlPattern {
  const segments: UrlSegment[] = [];
  const parts: string[] = [];
  const spanExpressions: Expression[] = [];

  // getHead() returns a TemplateHead -- use getText() and strip the backtick/dollar-brace
  const headText = expr.getHead().getText();
  // TemplateHead text looks like: `some text${  -- strip leading ` and trailing ${
  const head = headText.slice(1, headText.lastIndexOf('$'));
  parts.push(head);

  for (const span of expr.getTemplateSpans()) {
    // The expression part becomes a dynamic segment
    parts.push(DYNAMIC_MARKER);
    spanExpressions.push(span.getExpression());
    // getLiteral() returns TemplateMiddle or TemplateTail
    const litText = span.getLiteral().getText();
    // TemplateMiddle: }text${  TemplateTail: }text`
    const literal = litText.startsWith('}')
      ? litText.slice(1, litText.endsWith('`') ? -1 : litText.lastIndexOf('$'))
      : litText;
    parts.push(literal);
  }

  const full = parts.join('');

  // Split query string before segmenting
  const [pathPart, queryPart] = full.split('?');
  const segs = pathPart.split('/').filter(Boolean);

  let currentDynIdx = 0;
  for (const seg of segs) {
    if (isDynamicSegment(seg)) {
      // Find the param name from the span expression if it's an identifier
      let paramName: string | undefined;
      if (currentDynIdx < spanExpressions.length) {
        const spanExpr = spanExpressions[currentDynIdx];
        if (Node.isIdentifier(spanExpr)) {
          paramName = spanExpr.getText();
        }
      }
      segments.push({ value: seg, dynamic: true, paramName });
      currentDynIdx++;
    } else {
      segments.push({ value: seg, dynamic: false });
    }
  }

  // Build a resolved version with dynamic parts replaced by {param} or {paramName}
  const resolved = '/' + segments.map((seg) => {
    if (seg.dynamic) {
      if (seg.paramName) return `{${seg.paramName}}`;
      return '{param}';
    }
    return seg.value;
  }).join('/');

  const result: UrlPattern = { segments, resolved };
  if (queryPart) {
    // Parse query params, treating {dynamic} values as true (dynamic)
    result.queryParams = parseQueryParams(queryPart);
  }
  return result;
}

function isDynamicSegment(seg: string): boolean {
  return seg.includes(DYNAMIC_MARKER);
}
