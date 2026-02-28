import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIV3 } from 'openapi-types';
import type { ParamDef, SpecEndpoint, UrlPattern } from '../../../core/types.js';
import type { SpecPlugin } from '../../types.js';
import { schemaToTypeShape } from './normalizer.js';
import { matchPath } from './path-matcher.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function parseParam(param: OpenAPIV3.ParameterObject): ParamDef {
  return {
    name: param.name,
    in: param.in as 'path' | 'query',
    required: param.required ?? false,
    shape: schemaToTypeShape(param.schema as OpenAPIV3.SchemaObject | undefined),
  };
}

async function parse(specPath: string): Promise<SpecEndpoint[]> {
  const api = (await SwaggerParser.dereference(specPath)) as OpenAPIV3.Document;
  const endpoints: SpecEndpoint[] = [];

  if (!api.paths) return endpoints;

  for (const [pathTemplate, pathItem] of Object.entries(api.paths)) {
    if (!pathItem) continue;

    // Path-level parameters
    const pathLevelParams = (
      (pathItem as OpenAPIV3.PathItemObject).parameters ?? []
    ) as OpenAPIV3.ParameterObject[];

    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[method] as
        | OpenAPIV3.OperationObject
        | undefined;
      if (!operation) continue;

      // Merge path-level and operation-level params
      const opParams = (operation.parameters ?? []) as OpenAPIV3.ParameterObject[];
      const allParams = [...pathLevelParams, ...opParams];

      const params = allParams.map(parseParam);

      // Request body
      let requestBody: SpecEndpoint['requestBody'];
      if (operation.requestBody) {
        const body = operation.requestBody as OpenAPIV3.RequestBodyObject;
        const jsonContent = body.content?.['application/json'];
        if (jsonContent?.schema) {
          requestBody = schemaToTypeShape(jsonContent.schema as OpenAPIV3.SchemaObject);
        }
      }

      // Responses
      const responses: Record<string, ReturnType<typeof schemaToTypeShape>> = {};
      if (operation.responses) {
        for (const [statusCode, responseObj] of Object.entries(operation.responses)) {
          const response = responseObj as OpenAPIV3.ResponseObject;
          const jsonContent = response.content?.['application/json'];
          if (jsonContent?.schema) {
            responses[statusCode] = schemaToTypeShape(
              jsonContent.schema as OpenAPIV3.SchemaObject,
            );
          }
        }
      }

      endpoints.push({
        id: `${method.toUpperCase()} ${pathTemplate}`,
        method: method.toUpperCase(),
        pathTemplate,
        params,
        requestBody,
        responses,
        deprecated: operation.deprecated ?? false,
      });
    }
  }

  return endpoints;
}

export const openApiPlugin: SpecPlugin = {
  name: 'openapi',
  supportedExtensions: ['.json', '.yaml', '.yml'],
  parse,
  matchUrl(url: UrlPattern, endpoints: SpecEndpoint[]) {
    return matchPath(url, endpoints);
  },
};
