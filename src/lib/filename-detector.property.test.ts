// Feature: pixel-level-detection, Property 9: Filename pattern detection
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { detectFilenamePattern, matchFilename } from './filename-detector';

/**
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 *
 * Property 9: Filename pattern detection
 * For any filename that matches a known AI tool pattern, detectFilenamePattern SHALL
 * produce a signal of type FILENAME_PATTERN with severity 1.0. For any filename that
 * does NOT match any known pattern, the function SHALL return null. The function SHALL
 * correctly identify DALL-E, Midjourney, ComfyUI, and generic AI prefix patterns.
 */

// --- Generators for filenames matching each pattern ---

/**
 * Generator for DALL-E filenames: "DALL" followed by a dot or middle-dot and a date.
 * Pattern: /DALL[\.\u00B7].*\d{4}-\d{2}-\d{2}/
 */
const dallEFilenameArb = fc
  .tuple(
    fc.constantFrom('.', '\u00B7'), // dot or middle-dot separator
    fc.stringOf(fc.char().filter((c) => /[a-zA-Z0-9 _\-]/.test(c)), { minLength: 0, maxLength: 10 }),
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
  )
  .map(([sep, middle, year, month, day]) => {
    const m = month.toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `DALL${sep}${middle}${year}-${m}-${d}`;
  });

/**
 * Generator for Midjourney filenames: UUID-like hex segment of 8+ chars.
 * Pattern: /[a-f0-9]{8,}/
 */
const midjourneyFilenameArb = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...'abcdef0123456789'.split('')), { minLength: 8, maxLength: 32 }),
    fc.stringOf(fc.char().filter((c) => /[a-zA-Z_\-]/.test(c)), { minLength: 0, maxLength: 5 })
  )
  .map(([hex, suffix]) => `image_${hex}${suffix}`);

/**
 * Generator for ComfyUI filenames: "ComfyUI_" prefix followed by digits/underscores.
 * Pattern: /^ComfyUI_[\d_]+/
 * Note: The numeric portion must not contain 8+ consecutive hex-only chars (0-9, a-f)
 * that would match the Midjourney pattern first. We use short segments separated by
 * underscores to prevent this.
 */
const comfyUIFilenameArb = fc
  .tuple(
    fc.integer({ min: 1, max: 9999999 }), // max 7 digits to avoid 8+ hex match
    fc.integer({ min: 1, max: 9999 })
  )
  .map(([a, b]) => `ComfyUI_${a}_${b}`)
  .filter((filename) => {
    // Ensure this matches as comfyui, not midjourney
    const match = matchFilename(filename);
    return match !== null && match.pattern === 'comfyui';
  });

/**
 * Generator for generic AI prefix filenames: "ai_generated", "generated_", or "output_"
 * followed by numeric identifiers.
 * Pattern: /^(ai_generated|generated_|output_)\d+/
 * Note: Must avoid creating 8+ consecutive hex chars that would match Midjourney first.
 * "ai_generated" contains 'a' then 'i' (non-hex) which breaks the hex run.
 * "generated_" has 'g' (non-hex) at start. "output_" has 'o','u','t' (non-hex).
 * We limit digit suffix length to 7 to avoid 8+ digit hex matches.
 */
const genericAiPrefixArb = fc
  .tuple(
    fc.constantFrom('ai_generated', 'generated_', 'output_'),
    fc.integer({ min: 1, max: 9999999 }) // max 7 digits to avoid 8+ hex match
  )
  .map(([prefix, num]) => `${prefix}${num}`)
  .filter((filename) => {
    // Ensure the Midjourney pattern doesn't match first
    const match = matchFilename(filename);
    return match !== null && match.pattern === 'ai-generated';
  });

/**
 * Combined generator for any filename matching a known AI tool pattern.
 */
const matchingFilenameArb = fc.oneof(
  dallEFilenameArb,
  midjourneyFilenameArb,
  comfyUIFilenameArb,
  genericAiPrefixArb
);

/**
 * Generator for filenames that do NOT match any known pattern.
 * Uses safe characters and avoids patterns that could accidentally match.
 */
const nonMatchingFilenameArb = fc
  .stringOf(
    fc.constantFrom(
      ...'ABCGHIJKLMNOPQRSTUVWXYZ'.split('')
    ),
    { minLength: 3, maxLength: 20 }
  )
  .filter((s) => {
    // Verify it doesn't match any known pattern
    return matchFilename(s) === null;
  });

describe('Filename Detector - Property 9: Filename pattern detection', () => {
  describe('Matching filenames produce FILENAME_PATTERN signal with severity 1.0', () => {
    it('DALL-E filenames produce a signal with severity 1.0 and type FILENAME_PATTERN', () => {
      fc.assert(
        fc.property(dallEFilenameArb, (filename) => {
          const signal = detectFilenamePattern(filename);

          expect(signal).not.toBeNull();
          expect(signal!.type).toBe('FILENAME_PATTERN');
          expect(signal!.severity).toBe(1.0);
          expect(signal!.triggerField).toBe('filename');
          expect(signal!.description).toContain('dall-e');
          expect(signal!.description.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('Midjourney filenames produce a signal with severity 1.0 and type FILENAME_PATTERN', () => {
      fc.assert(
        fc.property(midjourneyFilenameArb, (filename) => {
          const signal = detectFilenamePattern(filename);

          expect(signal).not.toBeNull();
          expect(signal!.type).toBe('FILENAME_PATTERN');
          expect(signal!.severity).toBe(1.0);
          expect(signal!.triggerField).toBe('filename');
          expect(signal!.description).toContain('midjourney');
          expect(signal!.description.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('ComfyUI filenames produce a signal with severity 1.0 and type FILENAME_PATTERN', () => {
      fc.assert(
        fc.property(comfyUIFilenameArb, (filename) => {
          const signal = detectFilenamePattern(filename);

          expect(signal).not.toBeNull();
          expect(signal!.type).toBe('FILENAME_PATTERN');
          expect(signal!.severity).toBe(1.0);
          expect(signal!.triggerField).toBe('filename');
          expect(signal!.description).toContain('comfyui');
          expect(signal!.description.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('Generic AI prefix filenames produce a signal with severity 1.0 and type FILENAME_PATTERN', () => {
      fc.assert(
        fc.property(genericAiPrefixArb, (filename) => {
          const signal = detectFilenamePattern(filename);

          expect(signal).not.toBeNull();
          expect(signal!.type).toBe('FILENAME_PATTERN');
          expect(signal!.severity).toBe(1.0);
          expect(signal!.triggerField).toBe('filename');
          expect(signal!.description).toContain('ai-generated');
          expect(signal!.description.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Non-matching filenames return null', () => {
    it('filenames that do not match any known pattern return null', () => {
      fc.assert(
        fc.property(nonMatchingFilenameArb, (filename) => {
          const signal = detectFilenamePattern(filename);
          expect(signal).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('empty filenames return null', () => {
      const signal = detectFilenamePattern('');
      expect(signal).toBeNull();
    });
  });

  describe('Signal description contains pattern name and matched portion', () => {
    it('for any matching filename, description includes the pattern name and matched text', () => {
      fc.assert(
        fc.property(matchingFilenameArb, (filename) => {
          const signal = detectFilenamePattern(filename);
          const match = matchFilename(filename);

          expect(signal).not.toBeNull();
          expect(match).not.toBeNull();

          // Description must contain the pattern name
          expect(signal!.description).toContain(match!.pattern);
          // Description must contain the matched portion
          expect(signal!.description).toContain(match!.matched);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('matchFilename consistency with detectFilenamePattern', () => {
    it('detectFilenamePattern returns a signal iff matchFilename returns a match', () => {
      fc.assert(
        fc.property(
          fc.oneof(matchingFilenameArb, nonMatchingFilenameArb),
          (filename) => {
            const match = matchFilename(filename);
            const signal = detectFilenamePattern(filename);

            if (match !== null) {
              expect(signal).not.toBeNull();
              expect(signal!.type).toBe('FILENAME_PATTERN');
              expect(signal!.severity).toBe(1.0);
            } else {
              expect(signal).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
