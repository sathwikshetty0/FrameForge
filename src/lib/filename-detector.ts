import { DetectionSignal } from './types';

/**
 * Result of matching a filename against known AI tool patterns.
 */
export interface FilenameMatch {
  /** Pattern name (e.g., 'dall-e', 'midjourney') */
  pattern: string;
  /** The specific filename portion that matched */
  matched: string;
}

/**
 * Pattern definitions for known AI tool filename conventions.
 */
export const FILENAME_PATTERNS: Array<{
  name: string;
  regex: RegExp;
}> = [
  { name: 'dall-e', regex: /DALL[\.\u00B7].*\d{4}-\d{2}-\d{2}/ },
  { name: 'midjourney', regex: /[a-f0-9]{8,}/ },
  { name: 'comfyui', regex: /^ComfyUI_[\d_]+/ },
  { name: 'ai-generated', regex: /^(ai_generated|generated_|output_)\d+/ },
];

/**
 * Tests a filename against all known AI tool patterns and returns the first match.
 * Returns null if the filename is empty or no pattern matches.
 *
 * @param filename - The image filename to evaluate
 * @returns FilenameMatch with pattern name and matched portion, or null
 */
export function matchFilename(filename: string): FilenameMatch | null {
  if (!filename) return null;

  for (const { name, regex } of FILENAME_PATTERNS) {
    const match = filename.match(regex);
    if (match) {
      return {
        pattern: name,
        matched: match[0],
      };
    }
  }

  return null;
}

/**
 * Evaluates a filename against all known AI tool patterns.
 * Produces a DetectionSignal of type FILENAME_PATTERN with severity 1.0 if any
 * pattern matches, or null if the filename is empty or no pattern matches.
 *
 * @param filename - The image filename to evaluate
 * @returns DetectionSignal or null
 */
export function detectFilenamePattern(filename: string): DetectionSignal | null {
  if (!filename) return null;

  const match = matchFilename(filename);
  if (!match) return null;

  return {
    type: 'FILENAME_PATTERN',
    severity: 1.0,
    triggerField: 'filename',
    description: `Filename matches ${match.pattern} pattern: "${match.matched}"`,
  };
}
