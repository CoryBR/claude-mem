/**
 * Runtime patch for child_process.spawn to add windowsHide on Windows
 * Preloaded via NODE_OPTIONS=--import to run before SDK loads
 *
 * This patches ChildProcess.prototype.spawn which works even when SDK uses
 * ESM imports like: import { spawn } from 'child_process'
 */

import { createRequire } from 'node:module';
import { sep } from 'node:path';

// Only apply on Windows
if (process.platform === 'win32') {
  const require = createRequire(import.meta.url);
  const cp = require('child_process');

  // Patch 1: Top-level spawn wrapper (covers dynamic usage)
  const origSpawn = cp.spawn;
  cp.spawn = function patchedSpawn(cmd, args, options) {
    options = options ?? {};
    if (options.windowsHide === undefined) {
      options.windowsHide = true;
    }
    return origSpawn.call(this, cmd, args, options);
  };

  // Patch 2: Low-level ChildProcess.prototype.spawn (covers ESM named imports)
  const ChildProcess = cp.ChildProcess;
  const origProtoSpawn = ChildProcess.prototype.spawn;

  ChildProcess.prototype.spawn = function patchedProtoSpawn(options) {
    if (options && options.windowsHide === undefined) {
      // Optional: Scope to SDK only by checking stack trace
      const stack = new Error().stack || '';
      const isSdkSpawn = stack.includes(`${sep}@anthropic-ai${sep}claude-agent-sdk${sep}`);

      if (isSdkSpawn) {
        options.windowsHide = true;
        console.error('[claude-mem] Applied windowsHide to SDK spawn');
      }
    }
    return origProtoSpawn.call(this, options);
  };

  console.error('[claude-mem] Windows spawn patch registered (ChildProcess.prototype)');
}
