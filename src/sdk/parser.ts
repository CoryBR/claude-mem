/**
 * XML Parser Module
 * Parses observation and summary XML blocks from SDK responses
 */

import { logger } from '../utils/logger.js';

export interface ParsedObservation {
  type: string;
  title: string | null;
  subtitle: string | null;
  facts: string[];
  narrative: string | null;
  concepts: string[];
  files_read: string[];
  files_modified: string[];
}

export interface ParsedSummary {
  request: string;
  investigated: string;
  learned: string;
  completed: string;
  next_steps: string;
  notes: string | null;
}

/**
 * Parse observation XML blocks from SDK response
 * Returns all observations found in the response
 */
export function parseObservations(text: string, correlationId?: string): ParsedObservation[] {
  const observations: ParsedObservation[] = [];

  // Match <observation>...</observation> blocks (non-greedy)
  const observationRegex = /<observation>([\s\S]*?)<\/observation>/g;

  let match;
  while ((match = observationRegex.exec(text)) !== null) {
    const obsContent = match[1];

    // Extract all fields
    const type = extractField(obsContent, 'type');
    const title = extractField(obsContent, 'title');
    const subtitle = extractField(obsContent, 'subtitle');
    const narrative = extractField(obsContent, 'narrative');
    const facts = extractArrayElements(obsContent, 'facts', 'fact');
    const concepts = extractArrayElements(obsContent, 'concepts', 'concept');
    const files_read = extractArrayElements(obsContent, 'files_read', 'file');
    const files_modified = extractArrayElements(obsContent, 'files_modified', 'file');

    // NOTE FROM THEDOTMACK: ALWAYS save observations - never skip. 10/24/2025
    // All fields except type are nullable in schema
    // If type is missing or invalid, use "change" as catch-all fallback

    // Determine final type
    let finalType = 'change'; // Default catch-all
    if (type) {
      const validTypes = ['bugfix', 'feature', 'refactor', 'change', 'discovery', 'decision'];
      if (validTypes.includes(type.trim())) {
        finalType = type.trim();
      } else {
        logger.warn('PARSER', `Invalid observation type: ${type}, using "change"`, { correlationId });
      }
    } else {
      logger.warn('PARSER', 'Observation missing type field, using "change"', { correlationId });
    }

    // All other fields are optional - save whatever we have

    // Filter out type from concepts array (types and concepts are separate dimensions)
    const cleanedConcepts = concepts.filter(c => c !== finalType);

    if (cleanedConcepts.length !== concepts.length) {
      logger.warn('PARSER', 'Removed observation type from concepts array', {
        correlationId,
        type: finalType,
        originalConcepts: concepts,
        cleanedConcepts
      });
    }

    observations.push({
      type: finalType,
      title,
      subtitle,
      facts,
      narrative,
      concepts: cleanedConcepts,
      files_read,
      files_modified
    });
  }

  return observations;
}

/**
 * Parse summary XML block from SDK response
 * Returns null if no valid summary found or if summary was skipped
 */
export function parseSummary(text: string, sessionId?: number): ParsedSummary | null {
  // Check for skip_summary first
  const skipRegex = /<skip_summary\s+reason="([^"]+)"\s*\/>/;
  const skipMatch = skipRegex.exec(text);

  if (skipMatch) {
    logger.info('PARSER', 'Summary skipped', {
      sessionId,
      reason: skipMatch[1]
    });
    return null;
  }

  // Match <summary>...</summary> block (non-greedy)
  const summaryRegex = /<summary>([\s\S]*?)<\/summary>/;
  const summaryMatch = summaryRegex.exec(text);

  if (!summaryMatch) {
    return null;
  }

  const summaryContent = summaryMatch[1];

  // Extract fields
  const request = extractField(summaryContent, 'request');
  const investigated = extractField(summaryContent, 'investigated');
  const learned = extractField(summaryContent, 'learned');
  const completed = extractField(summaryContent, 'completed');
  const next_steps = extractField(summaryContent, 'next_steps');
  const notes = extractField(summaryContent, 'notes'); // Optional

  // NOTE FROM THEDOTMACK: 100% of the time we must SAVE the summary, even if fields are missing. 10/24/2025 
  // NEVER DO THIS NONSENSE AGAIN.

  // Validate required fields are present (notes is optional)
  // if (!request || !investigated || !learned || !completed || !next_steps) {
  //   logger.warn('PARSER', 'Summary missing required fields', {
  //     sessionId,
  //     hasRequest: !!request,
  //     hasInvestigated: !!investigated,
  //     hasLearned: !!learned,
  //     hasCompleted: !!completed,
  //     hasNextSteps: !!next_steps
  //   });
  //   return null;
  // }

  return {
    request,
    investigated,
    learned,
    completed,
    next_steps,
    notes
  };
}

/**
 * Extract a simple field value from XML content
 * Returns null for missing or empty/whitespace-only fields
 */
function extractField(content: string, fieldName: string): string | null {
  const regex = new RegExp(`<${fieldName}>([^<]*)</${fieldName}>`);
  const match = regex.exec(content);
  if (!match) return null;

  const trimmed = match[1].trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Extract array of elements from XML content
 */
function extractArrayElements(content: string, arrayName: string, elementName: string): string[] {
  const elements: string[] = [];

  // Match the array block
  const arrayRegex = new RegExp(`<${arrayName}>(.*?)</${arrayName}>`, 's');
  const arrayMatch = arrayRegex.exec(content);

  if (!arrayMatch) {
    return elements;
  }

  const arrayContent = arrayMatch[1];

  // Extract individual elements
  const elementRegex = new RegExp(`<${elementName}>([^<]+)</${elementName}>`, 'g');
  let elementMatch;
  while ((elementMatch = elementRegex.exec(arrayContent)) !== null) {
    elements.push(elementMatch[1].trim());
  }

  return elements;
}
