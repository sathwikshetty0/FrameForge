// Feature: pixel-level-detection, Property 7: PNG chunk extraction round-trip
// Feature: pixel-level-detection, Property 8: PNG metadata AI keyword detection
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parsePngChunks,
  isPngSignature,
  detectAiMetadata,
  identifyAiTool,
  AI_CHUNK_KEYWORDS,
  AI_TOOL_PATTERNS,
  PngChunk,
  AiToolId,
} from './png-metadata-parser';

// --- Property 7: PNG chunk extraction round-trip ---

describe('Property 7: PNG chunk extraction round-trip', () => {
  /**
   * Validates: Requirements 5.1, 5.2, 5.7, 5.8
   *
   * For any valid PNG binary structure containing N tEXt/iTXt chunks with known
   * keywords and text content, parsePngChunks SHALL extract exactly those N chunks
   * with matching keywords and text. For any non-PNG input (invalid signature), it
   * SHALL return an empty array. For any truncated/malformed chunk data, it SHALL
   * stop parsing gracefully without throwing.
   */

  // --- Helper: PNG binary structure builders ---

  const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  /** Build a minimal IHDR chunk (required first chunk in valid PNG) */
  function buildIhdrChunk(): Uint8Array {
    const ihdrData = new Uint8Array(13);
    ihdrData[0] = 0; ihdrData[1] = 0; ihdrData[2] = 0; ihdrData[3] = 1;
    ihdrData[4] = 0; ihdrData[5] = 0; ihdrData[6] = 0; ihdrData[7] = 1;
    ihdrData[8] = 8; ihdrData[9] = 2; ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
    return buildRawChunk('IHDR', ihdrData);
  }

  /** Build an IEND chunk */
  function buildIendChunk(): Uint8Array {
    return buildRawChunk('IEND', new Uint8Array(0));
  }

  /** Build a raw PNG chunk: [4-byte length][4-byte type][data][4-byte CRC] */
  function buildRawChunk(type: string, data: Uint8Array): Uint8Array {
    const chunk = new Uint8Array(12 + data.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) {
      chunk[4 + i] = type.charCodeAt(i);
    }
    chunk.set(data, 8);
    view.setUint32(8 + data.length, 0);
    return chunk;
  }

  /** Build a tEXt chunk: keyword\0text */
  function buildTextChunk(keyword: string, text: string): Uint8Array {
    const encoder = new TextEncoder();
    const keywordBytes = encoder.encode(keyword);
    const textBytes = encoder.encode(text);
    const data = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
    data.set(keywordBytes, 0);
    data[keywordBytes.length] = 0;
    data.set(textBytes, keywordBytes.length + 1);
    return buildRawChunk('tEXt', data);
  }

  /** Build an iTXt chunk: keyword\0\0\0\0\0text */
  function buildItxtChunk(keyword: string, text: string): Uint8Array {
    const encoder = new TextEncoder();
    const keywordBytes = encoder.encode(keyword);
    const textBytes = encoder.encode(text);
    const data = new Uint8Array(keywordBytes.length + 5 + textBytes.length);
    data.set(keywordBytes, 0);
    data[keywordBytes.length] = 0;
    data[keywordBytes.length + 1] = 0;
    data[keywordBytes.length + 2] = 0;
    data[keywordBytes.length + 3] = 0;
    data[keywordBytes.length + 4] = 0;
    data.set(textBytes, keywordBytes.length + 5);
    return buildRawChunk('iTXt', data);
  }

  /** Concatenate multiple Uint8Arrays into a single ArrayBuffer */
  function concatToBuffer(...arrays: Uint8Array[]): ArrayBuffer {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result.buffer;
  }

  // --- Arbitraries ---

  /** Generate a valid PNG keyword (printable ASCII, no null bytes, 1-30 chars) */
  const pngKeywordArb = fc.string({
    minLength: 1,
    maxLength: 30,
    unit: fc.integer({ min: 32, max: 126 }).map((code) => String.fromCharCode(code)),
  });

  /** Generate text content (printable ASCII, no null bytes) */
  const pngTextArb = fc.string({
    minLength: 0,
    maxLength: 100,
    unit: fc.integer({ min: 32, max: 126 }).map((code) => String.fromCharCode(code)),
  });

  /** Generate a chunk descriptor */
  const chunkDescriptorArb = fc.record({
    type: fc.constantFrom('tEXt', 'iTXt') as fc.Arbitrary<'tEXt' | 'iTXt'>,
    keyword: pngKeywordArb,
    text: pngTextArb,
  });

  // --- Property tests ---

  it('should extract exactly N tEXt/iTXt chunks with matching keywords and text from a valid PNG', () => {
    fc.assert(
      fc.property(
        fc.array(chunkDescriptorArb, { minLength: 0, maxLength: 10 }),
        (chunkDescriptors) => {
          const parts: Uint8Array[] = [PNG_SIGNATURE, buildIhdrChunk()];

          for (const desc of chunkDescriptors) {
            if (desc.type === 'tEXt') {
              parts.push(buildTextChunk(desc.keyword, desc.text));
            } else {
              parts.push(buildItxtChunk(desc.keyword, desc.text));
            }
          }

          parts.push(buildIendChunk());
          const buffer = concatToBuffer(...parts);

          const parsed = parsePngChunks(buffer);

          // Should extract exactly N chunks
          expect(parsed).toHaveLength(chunkDescriptors.length);

          // Each chunk should match keyword and text
          for (let i = 0; i < chunkDescriptors.length; i++) {
            expect(parsed[i].type).toBe(chunkDescriptors[i].type);
            expect(parsed[i].keyword).toBe(chunkDescriptors[i].keyword);
            expect(parsed[i].text).toBe(chunkDescriptors[i].text);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return an empty array for any non-PNG input (invalid signature)', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 200 }).filter((arr) => {
          if (arr.length < 8) return true;
          const sig = [137, 80, 78, 71, 13, 10, 26, 10];
          for (let i = 0; i < 8; i++) {
            if (arr[i] !== sig[i]) return true;
          }
          return false;
        }),
        (randomBytes) => {
          const buffer = randomBytes.buffer.slice(
            randomBytes.byteOffset,
            randomBytes.byteOffset + randomBytes.byteLength
          ) as ArrayBuffer;

          const result = parsePngChunks(buffer);
          expect(result).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not throw for truncated/malformed PNG chunk data', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 50 }),
        fc.uint8Array({ minLength: 0, maxLength: 100 }),
        (truncatePoint, _extraGarbage) => {
          const validParts: Uint8Array[] = [
            PNG_SIGNATURE,
            buildIhdrChunk(),
            buildTextChunk('TestKey', 'TestValue'),
            buildIendChunk(),
          ];
          const fullBuffer = new Uint8Array(concatToBuffer(...validParts));

          const truncateAt = Math.min(truncatePoint, fullBuffer.length);
          const truncatedBuffer = fullBuffer.slice(0, truncateAt).buffer;

          expect(() => parsePngChunks(truncatedBuffer)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not throw for PNG with corrupted chunk length fields', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 0xFFFFFF }),
        pngKeywordArb,
        pngTextArb,
        (corruptLength, keyword, text) => {
          const ihdr = buildIhdrChunk();
          const textChunk = buildTextChunk(keyword, text);

          // Corrupt the length field of the text chunk
          const corruptedChunk = new Uint8Array(textChunk);
          const view = new DataView(corruptedChunk.buffer);
          view.setUint32(0, corruptLength);

          const buffer = concatToBuffer(PNG_SIGNATURE, ihdr, corruptedChunk, buildIendChunk());

          expect(() => parsePngChunks(buffer)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly identify PNG signature for valid PNG buffers', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 200 }),
        (randomTail) => {
          const buffer = concatToBuffer(PNG_SIGNATURE, randomTail);
          expect(isPngSignature(buffer)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return false from isPngSignature for buffers without valid PNG signature', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 200 }).filter((arr) => {
          if (arr.length < 8) return true;
          const sig = [137, 80, 78, 71, 13, 10, 26, 10];
          for (let i = 0; i < 8; i++) {
            if (arr[i] !== sig[i]) return true;
          }
          return false;
        }),
        (randomBytes) => {
          const buffer = randomBytes.buffer.slice(
            randomBytes.byteOffset,
            randomBytes.byteOffset + randomBytes.byteLength
          ) as ArrayBuffer;
          expect(isPngSignature(buffer)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should gracefully handle PNG with arbitrary non-text chunks interspersed', () => {
    fc.assert(
      fc.property(
        fc.array(chunkDescriptorArb, { minLength: 1, maxLength: 5 }),
        fc.array(
          fc.record({
            type: fc.string({
              minLength: 4,
              maxLength: 4,
              unit: fc.integer({ min: 65, max: 90 }).map((c) => String.fromCharCode(c)),
            }).filter((t) => t !== 'tEXt' && t !== 'iTXt' && t !== 'IEND' && t !== 'IHDR'),
            data: fc.uint8Array({ minLength: 0, maxLength: 50 }),
          }),
          { minLength: 0, maxLength: 3 }
        ),
        (textChunks, otherChunks) => {
          const parts: Uint8Array[] = [PNG_SIGNATURE, buildIhdrChunk()];

          // Interleave text chunks with other chunks
          for (let i = 0; i < Math.max(textChunks.length, otherChunks.length); i++) {
            if (i < otherChunks.length) {
              parts.push(buildRawChunk(otherChunks[i].type, otherChunks[i].data));
            }
            if (i < textChunks.length) {
              const tc = textChunks[i];
              if (tc.type === 'tEXt') {
                parts.push(buildTextChunk(tc.keyword, tc.text));
              } else {
                parts.push(buildItxtChunk(tc.keyword, tc.text));
              }
            }
          }

          parts.push(buildIendChunk());
          const buffer = concatToBuffer(...parts);

          const parsed = parsePngChunks(buffer);

          // Should extract only the text/iTXt chunks, ignoring others
          expect(parsed).toHaveLength(textChunks.length);

          for (let i = 0; i < textChunks.length; i++) {
            expect(parsed[i].keyword).toBe(textChunks[i].keyword);
            expect(parsed[i].text).toBe(textChunks[i].text);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 8: PNG metadata AI keyword detection ---

/**
 * Validates: Requirements 5.3, 5.4, 5.5, 5.6
 *
 * Property 8: PNG metadata AI keyword detection
 * For any array of PngChunks containing at least one chunk whose keyword is in
 * AI_CHUNK_KEYWORDS, detectAiMetadata SHALL return a DetectionSignal with type
 * 'PNG_METADATA_AI' and severity 1.0. For any array of PngChunks where NO keyword
 * matches AI_CHUNK_KEYWORDS, detectAiMetadata SHALL return null. The identifyAiTool
 * function SHALL correctly classify content matching known AI tool patterns.
 */

/** Arbitrary: generates a random chunk type string (tEXt or iTXt) */
const chunkTypeArb = fc.constantFrom('tEXt', 'iTXt');

/** Arbitrary: generates a random non-AI keyword that won't match AI_CHUNK_KEYWORDS */
const nonAiKeywordArb = fc
  .stringOf(fc.char().filter((c) => /[a-zA-Z0-9_]/.test(c)), {
    minLength: 1,
    maxLength: 30,
  })
  .filter((s) => {
    const lower = s.toLowerCase();
    return !AI_CHUNK_KEYWORDS.some((k) => k.toLowerCase() === lower);
  });

/** Arbitrary: picks one of the known AI chunk keywords */
const aiKeywordArb = fc.constantFrom(...AI_CHUNK_KEYWORDS);

/** Arbitrary: generates random text content for chunk */
const chunkTextArb = fc.string({ minLength: 0, maxLength: 200 });

/** Arbitrary: generates a PngChunk with a non-AI keyword */
const nonAiChunkArb: fc.Arbitrary<PngChunk> = fc.record({
  type: chunkTypeArb,
  keyword: nonAiKeywordArb,
  text: chunkTextArb,
});

/** Arbitrary: generates a PngChunk with an AI keyword */
const aiChunkArb: fc.Arbitrary<PngChunk> = fc.record({
  type: chunkTypeArb,
  keyword: aiKeywordArb,
  text: chunkTextArb,
});

/** Arbitrary: generates content that matches the A1111 pattern */
const a1111ContentArb = fc
  .tuple(
    fc.integer({ min: 1, max: 150 }),
    fc.constantFrom('Euler a', 'DPM++ 2M Karras', 'DDIM', 'UniPC')
  )
  .map(([steps, sampler]) => `Steps: ${steps}, Sampler: ${sampler}, CFG scale: 7`);

/** Arbitrary: generates content that matches the ComfyUI pattern */
const comfyuiContentArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .map((name) => `{"class_type": "${name}", "inputs": {}}`);

/** Arbitrary: generates content that matches the NovelAI pattern */
const novelaiContentArb = fc.constantFrom(
  'Source: Stable Diffusion',
  'Description: AI generated image',
  'Source: NovelAI',
  'Description: txt2img'
);

/** Arbitrary: generates content that matches the Stable Diffusion pattern (but not A1111) */
const stableDiffusionContentArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => !s.includes('Steps:') && !s.includes('Sampler:'))
  .map((model) => `Model: ${model}`);

describe('PNG Metadata Parser - Property 8: PNG metadata AI keyword detection', () => {
  describe('detectAiMetadata signal generation', () => {
    it('returns a signal with type PNG_METADATA_AI and severity 1.0 when chunks contain an AI keyword', () => {
      fc.assert(
        fc.property(
          fc.array(nonAiChunkArb, { minLength: 0, maxLength: 5 }),
          aiChunkArb,
          fc.array(nonAiChunkArb, { minLength: 0, maxLength: 5 }),
          (before, aiChunk, after) => {
            // Place the AI chunk somewhere in the array
            const chunks = [...before, aiChunk, ...after];
            const result = detectAiMetadata(chunks);

            expect(result).not.toBeNull();
            expect(result!.type).toBe('PNG_METADATA_AI');
            expect(result!.severity).toBe(1.0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns null when no chunk keyword matches AI_CHUNK_KEYWORDS', () => {
      fc.assert(
        fc.property(
          fc.array(nonAiChunkArb, { minLength: 0, maxLength: 10 }),
          (chunks) => {
            const result = detectAiMetadata(chunks);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('includes the matched keyword in the signal description', () => {
      fc.assert(
        fc.property(aiChunkArb, (aiChunk) => {
          const result = detectAiMetadata([aiChunk]);

          expect(result).not.toBeNull();
          // Description should mention the keyword that was matched
          expect(result!.description).toContain(aiChunk.keyword);
        }),
        { numRuns: 100 }
      );
    });

    it('includes the identified AI tool name in the signal description', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: chunkTypeArb,
            keyword: aiKeywordArb,
            text: a1111ContentArb,
          }),
          (aiChunk) => {
            const result = detectAiMetadata([aiChunk]);

            expect(result).not.toBeNull();
            // The tool identified should be a1111, and it should appear in description
            expect(result!.description).toContain('a1111');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('identifyAiTool pattern classification', () => {
    it('identifies A1111 content correctly', () => {
      fc.assert(
        fc.property(a1111ContentArb, (content) => {
          const tool = identifyAiTool(content);
          expect(tool).toBe('a1111');
        }),
        { numRuns: 100 }
      );
    });

    it('identifies ComfyUI content correctly', () => {
      fc.assert(
        fc.property(comfyuiContentArb, (content) => {
          const tool = identifyAiTool(content);
          expect(tool).toBe('comfyui');
        }),
        { numRuns: 100 }
      );
    });

    it('identifies NovelAI content correctly', () => {
      fc.assert(
        fc.property(novelaiContentArb, (content) => {
          const tool = identifyAiTool(content);
          expect(tool).toBe('novelai');
        }),
        { numRuns: 100 }
      );
    });

    it('identifies Stable Diffusion content correctly', () => {
      fc.assert(
        fc.property(stableDiffusionContentArb, (content) => {
          const tool = identifyAiTool(content);
          expect(tool).toBe('stable-diffusion');
        }),
        { numRuns: 100 }
      );
    });

    it('returns unknown-ai for content not matching any specific pattern', () => {
      // Generate content that doesn't match any specific tool pattern (except unknown-ai)
      const noPatternContentArb = fc
        .string({ minLength: 0, maxLength: 100 })
        .filter((s) => {
          return (
            !AI_TOOL_PATTERNS['a1111'].test(s) &&
            !AI_TOOL_PATTERNS['comfyui'].test(s) &&
            !AI_TOOL_PATTERNS['novelai'].test(s) &&
            !AI_TOOL_PATTERNS['stable-diffusion'].test(s)
          );
        });

      fc.assert(
        fc.property(noPatternContentArb, (content) => {
          const tool = identifyAiTool(content);
          expect(tool).toBe('unknown-ai');
        }),
        { numRuns: 100 }
      );
    });

    it('always returns a valid AiToolId for any string input', () => {
      const validToolIds: AiToolId[] = [
        'a1111',
        'comfyui',
        'novelai',
        'stable-diffusion',
        'unknown-ai',
      ];

      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 500 }), (content) => {
          const tool = identifyAiTool(content);
          expect(validToolIds).toContain(tool);
        }),
        { numRuns: 100 }
      );
    });
  });
});
