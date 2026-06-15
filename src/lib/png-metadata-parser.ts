import { DetectionSignal } from './types';

/**
 * Represents a parsed PNG text chunk (tEXt or iTXt).
 */
export interface PngChunk {
  type: string;       // 4-character chunk type (e.g., 'tEXt', 'iTXt')
  keyword: string;    // Chunk keyword (before null separator)
  text: string;       // Chunk text content (after null separator)
}

/** Known AI tool identifiers based on chunk content patterns */
export type AiToolId = 'a1111' | 'comfyui' | 'novelai' | 'stable-diffusion' | 'unknown-ai';

/** AI generation keywords to search for in tEXt/iTXt chunk keywords */
export const AI_CHUNK_KEYWORDS = [
  'parameters',
  'prompt',
  'negative_prompt',
  'workflow',
  'Comment',
  'comf',
] as const;

/** Content patterns for AI tool identification */
export const AI_TOOL_PATTERNS: Record<AiToolId, RegExp> = {
  'a1111': /Steps:\s*\d+.*Sampler:/s,
  'comfyui': /"class_type":/,
  'novelai': /Source:|Description:/,
  'stable-diffusion': /Model:\s*.+/,
  'unknown-ai': /.*/,
};

/** PNG file signature: 8 bytes */
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Validates the 8-byte PNG signature at the start of a buffer.
 */
export function isPngSignature(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 8) return false;
  const bytes = new Uint8Array(buffer, 0, 8);
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Parses PNG binary data and extracts tEXt/iTXt chunks.
 * Returns empty array if file is not PNG or is malformed.
 * Handles malformed/truncated chunks gracefully (stops parsing, no throw).
 */
export function parsePngChunks(buffer: ArrayBuffer): PngChunk[] {
  if (!isPngSignature(buffer)) return [];

  const view = new DataView(buffer);
  const chunks: PngChunk[] = [];
  let offset = 8; // Skip PNG signature

  while (offset + 12 <= buffer.byteLength) {
    // Bounds check: need at least 4 (length) + 4 (type) + 4 (CRC) = 12 bytes
    if (offset + 4 > buffer.byteLength) break;
    const length = view.getUint32(offset); // Big-endian chunk data length

    // Bounds check: ensure we can read the type field
    if (offset + 8 > buffer.byteLength) break;

    const typeBytes = new Uint8Array(buffer, offset + 4, 4);
    const chunkType = String.fromCharCode(typeBytes[0], typeBytes[1], typeBytes[2], typeBytes[3]);

    // Check if chunk data + CRC fits within the buffer
    // offset + 4 (length field) + 4 (type field) + length (data) + 4 (CRC) <= buffer.byteLength
    if (offset + 12 + length > buffer.byteLength) break;

    if (chunkType === 'tEXt' || chunkType === 'iTXt') {
      const parsed = parseTextChunk(buffer, offset + 8, length, chunkType);
      if (parsed) chunks.push(parsed);
    }

    if (chunkType === 'IEND') break;

    // Move to next chunk: 4 (length) + 4 (type) + data + 4 (CRC)
    offset += 12 + length;
  }

  return chunks;
}

/**
 * Parses a tEXt or iTXt chunk's data section into keyword and text.
 */
function parseTextChunk(
  buffer: ArrayBuffer,
  dataOffset: number,
  dataLength: number,
  chunkType: string
): PngChunk | null {
  if (dataLength === 0) return null;

  const data = new Uint8Array(buffer, dataOffset, dataLength);

  // Find the null byte separator for the keyword
  let nullIndex = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0) {
      nullIndex = i;
      break;
    }
  }

  if (nullIndex === -1) {
    // No null separator found - treat entire data as keyword with empty text
    const keyword = decodeBytes(data);
    return { type: chunkType, keyword, text: '' };
  }

  const keyword = decodeBytes(data.slice(0, nullIndex));

  if (chunkType === 'tEXt') {
    // tEXt format: keyword\0text
    const text = decodeBytes(data.slice(nullIndex + 1));
    return { type: chunkType, keyword, text };
  } else {
    // iTXt format: keyword\0compressionFlag\0compressionMethod\0languageTag\0translatedKeyword\0text
    // Simplified: keyword\0\0\0\0\0text (when no compression, no language, no translated keyword)
    // After keyword null, we need to skip: compression flag (1 byte), compression method (1 byte),
    // then language tag (null-terminated), then translated keyword (null-terminated), then text.
    let textStart = nullIndex + 1;

    // Skip compression flag and compression method (2 bytes)
    if (textStart + 2 > data.length) {
      return { type: chunkType, keyword, text: '' };
    }
    textStart += 2;

    // Skip language tag (null-terminated)
    while (textStart < data.length && data[textStart] !== 0) {
      textStart++;
    }
    if (textStart < data.length) textStart++; // Skip the null

    // Skip translated keyword (null-terminated)
    while (textStart < data.length && data[textStart] !== 0) {
      textStart++;
    }
    if (textStart < data.length) textStart++; // Skip the null

    const text = decodeBytes(data.slice(textStart));
    return { type: chunkType, keyword, text };
  }
}

/**
 * Decodes a Uint8Array to a string using TextDecoder (UTF-8).
 */
function decodeBytes(bytes: Uint8Array): string {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(bytes);
}

/**
 * Identifies the specific AI tool from chunk content.
 * Tests patterns in order (most specific first), falls back to 'unknown-ai'.
 */
export function identifyAiTool(content: string): AiToolId {
  if (AI_TOOL_PATTERNS['a1111'].test(content)) return 'a1111';
  if (AI_TOOL_PATTERNS['comfyui'].test(content)) return 'comfyui';
  if (AI_TOOL_PATTERNS['novelai'].test(content)) return 'novelai';
  if (AI_TOOL_PATTERNS['stable-diffusion'].test(content)) return 'stable-diffusion';
  return 'unknown-ai';
}

/**
 * Evaluates extracted PNG chunks for AI generation indicators.
 * Produces a PNG_METADATA_AI signal if AI keywords are found.
 */
export function detectAiMetadata(chunks: PngChunk[]): DetectionSignal | null {
  for (const chunk of chunks) {
    const keywordLower = chunk.keyword.toLowerCase();

    for (const aiKeyword of AI_CHUNK_KEYWORDS) {
      if (keywordLower === aiKeyword.toLowerCase()) {
        const tool = identifyAiTool(chunk.text);
        const toolLabel = tool === 'unknown-ai' ? 'Unknown AI tool' : tool;

        return {
          type: 'PNG_METADATA_AI',
          severity: 1.0,
          triggerField: chunk.keyword,
          description: `AI generation metadata detected: "${chunk.keyword}" chunk found (${toolLabel})`,
        };
      }
    }
  }

  return null;
}
