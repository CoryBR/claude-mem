/**
 * Cleanup Hook - SessionEnd
 * Consolidated entry point + logic
 */

import { stdin } from 'process';
import { SessionStore } from '../services/sqlite/SessionStore.js';
import { ensureWorkerRunning } from '../shared/worker-utils.js';

export interface SessionEndInput {
  session_id: string;
  cwd: string;
  transcript_path?: string;
  hook_event_name: string;
  reason: 'exit' | 'clear' | 'logout' | 'prompt_input_exit' | 'other';
}

/**
 * Cleanup Hook Main Logic
 */
async function cleanupHook(input?: SessionEndInput): Promise<void> {
  // Log hook entry point
  console.error('[claude-mem cleanup] Hook fired', {
    input: input ? {
      session_id: input.session_id,
      cwd: input.cwd,
      reason: input.reason
    } : null
  });

  // Handle standalone execution (no input provided)
  if (!input) {
    console.log('No input provided - this script is designed to run as a Claude Code SessionEnd hook');
    console.log('\nExpected input format:');
    console.log(JSON.stringify({
      session_id: "string",
      cwd: "string",
      transcript_path: "string",
      hook_event_name: "SessionEnd",
      reason: "exit"
    }, null, 2));
    process.exit(0);
  }

  const { session_id, reason } = input;
  console.error('[claude-mem cleanup] Searching for active SDK session', { session_id, reason });

  // Ensure worker is running first
  const workerReady = await ensureWorkerRunning();
  if (!workerReady) {
    console.error('[claude-mem cleanup] Worker not available - skipping HTTP cleanup');
  }

  // Find active SDK session
  const db = new SessionStore();
  const session = db.findActiveSDKSession(session_id);

  if (!session) {
    // No active session - nothing to clean up
    console.error('[claude-mem cleanup] No active SDK session found', { session_id });
    db.close();
    console.log('{"continue": true, "suppressOutput": true}');
    process.exit(0);
  }

  console.error('[claude-mem cleanup] Active SDK session found', {
    session_id: session.id,
    sdk_session_id: session.sdk_session_id,
    project: session.project,
    worker_port: session.worker_port
  });

  // Mark session as completed in DB
  db.markSessionCompleted(session.id);
  console.error('[claude-mem cleanup] Session marked as completed in database');

  db.close();

  // Abort SDK agent for terminal reasons (not 'clear' which might resume)
  if (reason !== 'clear' && session.worker_port) {
    console.error('[claude-mem cleanup] Aborting SDK agent', { reason, worker_port: session.worker_port });

    try {
      const workerUrl = `http://127.0.0.1:${session.worker_port}/sessions/${session.id}`;
      const response = await fetch(workerUrl, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        console.error('[claude-mem cleanup] ✓ SDK agent aborted successfully');
      } else {
        const errorText = await response.text();
        console.error('[claude-mem cleanup] Failed to abort agent:', errorText);
      }
    } catch (error: any) {
      // Worker might be down - not critical since we marked DB completed
      console.error('[claude-mem cleanup] Could not reach worker to abort agent:', error.message);
    }
  } else if (reason === 'clear') {
    console.error('[claude-mem cleanup] Preserving SDK agent for potential /resume (reason=clear)');
  } else if (!session.worker_port) {
    console.error('[claude-mem cleanup] No worker_port - skipping agent abort (legacy session?)');
  }

  console.error('[claude-mem cleanup] Cleanup completed successfully');
  console.log('{"continue": true, "suppressOutput": true}');
  process.exit(0);
}

// Entry Point
if (stdin.isTTY) {
  // Running manually
  cleanupHook(undefined);
} else {
  let input = '';
  stdin.on('data', (chunk) => input += chunk);
  stdin.on('end', async () => {
    const parsed = input ? JSON.parse(input) : undefined;
    await cleanupHook(parsed);
  });
}
