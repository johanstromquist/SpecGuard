import type { SpecEndpoint, UrlPattern } from '../core/types.js';

export interface SpecPlugin {
  name: string;
  supportedExtensions: string[];
  parse(specPath: string): Promise<SpecEndpoint[]>;
  matchUrl(url: UrlPattern, endpoints: SpecEndpoint[]): SpecEndpoint | null;
}
