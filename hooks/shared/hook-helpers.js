#!/usr/bin/env node

/**
 * Hook Helper Functions
 * 
 * This module provides JavaScript wrappers around the TypeScript PromptOrchestrator
 * and HookTemplates system, making them accessible to the JavaScript hook scripts.
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Creates a standardized hook response using the HookTemplates system
 * @param {string} hookType - Type of hook ('PreCompact' or 'SessionStart')
 * @param {boolean} success - Whether the operation was successful
 * @param {Object} options - Additional options
 * @returns {Object} Formatted hook response
 */
export function createHookResponse(hookType, success, options = {}) {
  if (hookType === 'PreCompact') {
    if (success) {
      return {
        continue: true,
        suppressOutput: true
      };
    } else {
      return {
        continue: false,
        stopReason: options.reason || 'Pre-compact operation failed',
        suppressOutput: true
      };
    }
  }
  
  if (hookType === 'SessionStart') {
    if (success && options.context) {
      return {
        continue: true,
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: options.context
        }
      };
    } else if (success) {
      return {
        continue: true,
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: 'Starting fresh session - no previous context available'
        }
      };
    } else {
      return {
        continue: true, // Continue even on context loading failure
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: `Context loading encountered an issue: ${options.error || 'Unknown error'}. Starting without previous context.`
        }
      };
    }
  }
  
  // Generic response for unknown hook types
  return {
    continue: success,
    suppressOutput: true,
    ...(options.reason && !success ? { stopReason: options.reason } : {})
  };
}

/**
 * Formats a session start context message using standardized templates
 * @param {Object} contextData - Context information
 * @returns {string} Formatted context message
 */
export function formatSessionStartContext(contextData) {
  const {
    projectName = 'unknown project',
    memoryCount = 0,
    lastSessionTime,
    recentComponents = [],
    recentDecisions = []
  } = contextData;
  
  const timeInfo = lastSessionTime ? ` (last worked: ${lastSessionTime})` : '';
  const contextParts = [];
  
  contextParts.push(`🧠 Loaded ${memoryCount} memories from previous sessions for ${projectName}${timeInfo}`);
  
  if (recentComponents.length > 0) {
    contextParts.push(`\n🎯 Recent components: ${recentComponents.slice(0, 3).join(', ')}`);
  }
  
  if (recentDecisions.length > 0) {
    contextParts.push(`\n🔄 Recent decisions: ${recentDecisions.slice(0, 2).join(', ')}`);
  }
  
  if (memoryCount > 0) {
    contextParts.push('\n💡 Use search_nodes("keywords") to find related work or open_nodes(["entity_name"]) to load specific components');
  }
  
  return contextParts.join('');
}

/**
 * Executes a CLI command and returns the result
 * @param {string} command - CLI command to execute
 * @param {Array} args - Command arguments
 * @param {Object} options - Spawn options
 * @returns {Promise<{stdout: string, stderr: string, success: boolean}>}
 */
export async function executeCliCommand(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const process = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    });
    
    let stdout = '';
    let stderr = '';
    
    if (process.stdout) {
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }
    
    if (process.stderr) {
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }
    
    process.on('close', (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        success: code === 0
      });
    });
    
    process.on('error', (error) => {
      resolve({
        stdout: '',
        stderr: error.message,
        success: false
      });
    });
  });
}

/**
 * Parses context data from CLI output
 * @param {string} output - Raw CLI output
 * @returns {Object} Parsed context data
 */
export function parseContextData(output) {
  if (!output || !output.trim()) {
    return {
      memoryCount: 0,
      recentComponents: [],
      recentDecisions: []
    };
  }
  
  // Try to parse as JSON first (if CLI outputs structured data)
  try {
    const parsed = JSON.parse(output);
    return {
      memoryCount: parsed.memoryCount || 0,
      recentComponents: parsed.recentComponents || [],
      recentDecisions: parsed.recentDecisions || [],
      lastSessionTime: parsed.lastSessionTime
    };
  } catch (e) {
    // If not JSON, treat as plain text context
    const lines = output.split('\n').filter(line => line.trim());
    return {
      memoryCount: lines.length,
      recentComponents: [],
      recentDecisions: [],
      rawContext: output
    };
  }
}

/**
 * Validates hook payload structure
 * @param {Object} payload - Hook payload to validate
 * @param {string} expectedHookType - Expected hook event name
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateHookPayload(payload, expectedHookType) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Payload must be a valid object' };
  }
  
  if (!payload.session_id || typeof payload.session_id !== 'string') {
    return { valid: false, error: 'Missing or invalid session_id' };
  }
  
  if (!payload.transcript_path || typeof payload.transcript_path !== 'string') {
    return { valid: false, error: 'Missing or invalid transcript_path' };
  }
  
  if (expectedHookType && payload.hook_event_name !== expectedHookType) {
    return { valid: false, error: `Expected hook_event_name to be ${expectedHookType}` };
  }
  
  return { valid: true };
}

/**
 * Logs debug information if debug mode is enabled
 * @param {string} message - Debug message
 * @param {Object} data - Additional data to log
 */
export function debugLog(message, data = {}) {
  if (process.env.DEBUG === 'true' || process.env.CLAUDE_MEM_DEBUG === 'true') {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] HOOK DEBUG: ${message}`, data);
  }
}