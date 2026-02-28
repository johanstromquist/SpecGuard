import path from 'node:path';
import type { SpecPlugin } from './types.js';
import { openApiPlugin } from './plugins/openapi/parser.js';

const plugins: SpecPlugin[] = [openApiPlugin];

export function getPluginForSpec(specPath: string): SpecPlugin {
  const ext = path.extname(specPath).toLowerCase();
  const plugin = plugins.find((p) => p.supportedExtensions.includes(ext));
  if (!plugin) {
    throw new Error(
      `No spec plugin found for extension "${ext}". Supported: ${plugins.flatMap((p) => p.supportedExtensions).join(', ')}`,
    );
  }
  return plugin;
}
