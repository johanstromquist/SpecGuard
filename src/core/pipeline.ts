import { Project } from 'ts-morph';
import { glob } from 'glob';
import path from 'node:path';
import type { ScanResult, Mismatch, SpecEndpoint, TypeShape, Severity, MismatchKind } from './types.js';
import { loadConfig, resolveRules, type SpecGuardConfig } from './config.js';
import { getPluginForSpec } from '../spec/registry.js';
import { scanCallSites } from '../scanner/call-site-scanner.js';
import { matchEndpoint } from '../matcher/endpoint-matcher.js';
import { compareShapes, type CompareContext } from '../matcher/schema-comparator.js';
import { getCached, setCache } from '../spec/cache.js';

export interface ScanOptions {
  configOverrides?: Partial<SpecGuardConfig>;
  config?: SpecGuardConfig;
  cwd?: string;
}

function selectResponseShape(endpoint: SpecEndpoint): TypeShape | undefined {
  return (
    endpoint.responses['200'] ??
    endpoint.responses['201'] ??
    Object.values(endpoint.responses)[0]
  );
}

export async function scan(options: ScanOptions = {}): Promise<ScanResult> {
  const cwd = options.cwd ?? process.cwd();

  // Load config
  const config = options.config ?? (await loadConfig(options.configOverrides));
  const rules = resolveRules(config.rules as Partial<Record<MismatchKind, Severity>>);

  // Parse all specs (concurrently since they're independent)
  const allEndpoints: SpecEndpoint[] = [];
  const cacheDir = path.resolve(cwd, 'node_modules/.cache/specguard');

  // We use the first plugin for URL matching (Phase 1: single spec type)
  const primaryPlugin = getPluginForSpec(path.resolve(cwd, config.specs[0].path));

  // Run spec parsing and source file discovery concurrently
  const specParsingPromise = Promise.all(
    config.specs.map(async (specDef) => {
      const specPath = path.resolve(cwd, specDef.path);
      const plugin = getPluginForSpec(specPath);

      if (config.cache.enabled) {
        const cached = await getCached(specPath, cacheDir);
        if (cached.endpoints) return cached.endpoints;
        // contentHash was computed during getCached (spec file already read)
        const endpoints = await plugin.parse(specPath);
        void setCache(specPath, cacheDir, endpoints, cached.contentHash ?? undefined);
        return endpoints;
      }

      return plugin.parse(specPath);
    }),
  );

  const tsconfigPath = path.resolve(cwd, config.tsconfig);
  const sourceFilePromise = glob(config.include, {
    cwd,
    ignore: config.exclude,
    absolute: true,
  });

  const [specResults, filePaths] = await Promise.all([specParsingPromise, sourceFilePromise]);

  for (const endpoints of specResults) {
    allEndpoints.push(...endpoints);
  }

  const project = new Project({ tsConfigFilePath: tsconfigPath });
  const sourceFiles = filePaths
    .map((fp) => project.getSourceFile(fp))
    .filter((sf) => sf !== undefined);

  // Scan call sites
  const callSites = scanCallSites(sourceFiles, config);

  // Match and compare
  const mismatches: Mismatch[] = [];
  let endpointsMatched = 0;

  for (const callSite of callSites) {
    const { endpoint, mismatches: matchMismatches } = matchEndpoint(
      callSite,
      allEndpoints,
      primaryPlugin,
      config.baseUrl,
      rules,
    );

    mismatches.push(...matchMismatches);

    if (endpoint) {
      endpointsMatched++;

      const ctx: CompareContext = {
        callSite,
        endpoint,
        rules,
        typeMappings: config.typeMappings,
      };

      // Compare response types if we have both sides
      if (callSite.responseType) {
        const responseShape = selectResponseShape(endpoint);

        if (responseShape) {
          mismatches.push(...compareShapes(callSite.responseType, responseShape, ctx));
        }
      }

      // Compare request body if we have both sides
      if (callSite.requestBody && endpoint.requestBody) {
        mismatches.push(
          ...compareShapes(callSite.requestBody, endpoint.requestBody, ctx, 'requestBody'),
        );
      }
    }
  }

  // Compute stats
  let errors = 0, warnings = 0, infos = 0;
  for (const m of mismatches) {
    if (m.severity === 'error') errors++;
    else if (m.severity === 'warn') warnings++;
    else if (m.severity === 'info') infos++;
  }

  const stats = {
    filesScanned: sourceFiles.length,
    callSitesFound: callSites.length,
    endpointsMatched,
    errors,
    warnings,
    infos,
  };

  return { mismatches, stats };
}
