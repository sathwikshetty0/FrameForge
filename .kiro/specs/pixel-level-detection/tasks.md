# Implementation Plan: Pixel-Level Detection for FrameForge Verify

## Overview

This plan implements pixel-level image forensics for FrameForge Verify by adding ELA analysis, histogram uniformity detection, PNG metadata parsing, filename pattern matching, and an ELA heatmap visualization. New modules are created as pure-function TypeScript modules, then wired into the existing detection engine and scoring pipeline. All processing is client-side using Canvas API and ArrayBuffer/DataView.

## Tasks

- [x] 1. Extend core types and scoring infrastructure
  - [x] 1.1 Add new SignalTypes and MAX_DEDUCTIONS to types.ts
    - Add `PIXEL_ANALYSIS`, `PNG_METADATA_AI`, `FILENAME_PATTERN` to the `SignalType` union
    - Add corresponding entries to `MAX_DEDUCTIONS` record (25, 35, 30)
    - Export `ElaResult` and `HistogramResult` interfaces
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [-] 1.2 Update scoring.ts to handle new signal types
    - Add `PIXEL_ANALYSIS`, `PNG_METADATA_AI`, `FILENAME_PATTERN` to `ALL_SIGNAL_TYPES` array
    - Add human-readable labels to `SIGNAL_TYPE_LABELS` in ForensicReport
    - Verify `computeScore` already handles new types via the generic loop (no formula changes needed)
    - _Requirements: 7.5, 7.6_

- [x] 2. Implement Filename Detector
  - [-] 2.1 Create src/lib/filename-detector.ts
    - Implement `FILENAME_PATTERNS` array with regex patterns for DALL-E, Midjourney (UUID hex), ComfyUI prefix, and generic AI prefixes
    - Implement `matchFilename(filename: string): FilenameMatch | null`
    - Implement `detectFilenamePattern(filename: string): DetectionSignal | null` returning severity 1.0 on match
    - Return null for empty filenames or no pattern match
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 2.2 Write property test for filename pattern detection
    - **Property 9: Filename pattern detection**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8**

- [x] 3. Implement PNG Metadata Parser
  - [-] 3.1 Create src/lib/png-metadata-parser.ts
    - Implement `isPngSignature(buffer: ArrayBuffer): boolean` checking the 8-byte PNG magic
    - Implement `parsePngChunks(buffer: ArrayBuffer): PngChunk[]` parsing tEXt and iTXt chunks with bounds checking
    - Implement `identifyAiTool(content: string): AiToolId` matching content patterns for A1111, ComfyUI, NovelAI, Stable Diffusion
    - Implement `detectAiMetadata(chunks: PngChunk[]): DetectionSignal | null` returning severity 1.0 when AI keywords found
    - Handle malformed/truncated chunks gracefully (stop parsing, no throw)
    - Return empty array for non-PNG input
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 8.2_

  - [x] 3.2 Write property test for PNG chunk extraction
    - **Property 7: PNG chunk extraction round-trip**
    - **Validates: Requirements 5.1, 5.2, 5.7, 5.8**

  - [x] 3.3 Write property test for PNG AI keyword detection
    - **Property 8: PNG metadata AI keyword detection**
    - **Validates: Requirements 5.3, 5.4, 5.5, 5.6**

- [x] 4. Implement Histogram Analyzer
  - [-] 4.1 Create src/lib/histogram-analyzer.ts
    - Implement `computeChannelHistogram(pixelData: Uint8ClampedArray, channelOffset: number): number[]` returning 256-bin frequency array
    - Implement `computeSmoothness(histogram: number[]): number` as mean absolute difference between adjacent bins
    - Implement `analyzeHistogram(imageData: ImageData, smoothnessThreshold?: number): HistogramResult` combining per-channel analysis into severity
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 8.1_

  - [x] 4.2 Write property test for histogram computation invariant
    - **Property 4: Histogram computation invariant**
    - **Validates: Requirements 3.1**

  - [x] 4.3 Write property test for histogram severity classification
    - **Property 5: Histogram severity classification**
    - **Validates: Requirements 3.2, 3.3, 3.4**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement ELA Analyzer
  - [x] 6.1 Create src/lib/ela-analyzer.ts
    - Implement `computePixelDifference(original, recompressed, amplificationFactor): Uint8ClampedArray`
    - Implement `computeMeanDifference(differenceData: Uint8ClampedArray): number`
    - Implement `computeBlockStdDev(differenceData, width, height, blockSize): number`
    - Implement `analyzeEla(imageData: ImageData, amplificationFactor?, blockSize?): ElaResult | null`
    - Use Canvas API for JPEG re-compression at quality 0.6
    - Return null if Canvas 2D context is unavailable or toDataURL fails
    - Wrap all Canvas operations in try/catch for graceful failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 8.1, 8.4, 8.5_

  - [x] 6.2 Write property test for ELA difference computation
    - **Property 1: ELA difference computation and normalization**
    - **Validates: Requirements 1.2, 1.3**

  - [x] 6.3 Write property test for ELA uniformity severity
    - **Property 2: ELA uniformity severity classification**
    - **Validates: Requirements 1.4, 1.5**

- [x] 7. Implement Pixel Analysis Engine
  - [x] 7.1 Create src/lib/pixel-analysis-engine.ts
    - Implement `combineSignals(ela: ElaResult | null, histogram: HistogramResult): DetectionSignal | null`
    - Implement `analyzePixels(input: PixelAnalysisInput): PixelAnalysisResult`
    - Use max severity between ELA and Histogram results
    - Set triggerField to the sub-analysis with higher severity
    - Concatenate descriptions from both non-zero sub-analyses separated by " | "
    - Return null signal when both severities are 0
    - Handle ELA being null (use Histogram only)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 7.2 Write property test for PIXEL_ANALYSIS signal composition
    - **Property 6: PIXEL_ANALYSIS signal composition**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**

- [x] 8. Wire new analyzers into Detection Engine
  - [x] 8.1 Extend detection-engine.ts analyze function
    - Add optional parameters: `imageData?: ImageData | null`, `fileBuffer?: ArrayBuffer | null`, `filename?: string`
    - When `imageData` provided: call `analyzePixels({ imageData })` and push resulting signal
    - When `fileBuffer` provided: call `parsePngChunks(fileBuffer)` then `detectAiMetadata(chunks)` and push resulting signal
    - When `filename` provided: call `detectFilenamePattern(filename)` and push resulting signal
    - Maintain backward compatibility (existing callers still work without new params)
    - _Requirements: 7.7_

  - [x] 8.2 Write property test for extended scoring completeness
    - **Property 10: Extended scoring completeness and deduction**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement ELA Heatmap component and integrate into UI
  - [x] 10.1 Create src/components/ElaHeatmap/ElaHeatmap.tsx and index.ts
    - Implement `magnitudeToColor(magnitude: number): [number, number, number, number]` with blue→green→yellow→red gradient
    - Implement `ElaHeatmap` React component rendering Canvas element with color-mapped difference data
    - Scale display to fit container via `maxDisplayWidth` prop (default 600px)
    - Include a color gradient legend (Low error → High error)
    - Add `aria-label` for accessibility
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 10.2 Write property test for heatmap color gradient mapping
    - **Property 3: Heatmap color gradient mapping**
    - **Validates: Requirements 2.2**

  - [x] 10.3 Extend ForensicReport to display ELA Heatmap
    - Add `elaResult` prop to `ForensicReportProps`
    - Add a new collapsible "ELA Heatmap" section below the existing sections
    - Render `ElaHeatmap` component when `elaResult` is non-null
    - Show "ELA visualization is unavailable for this image" message when `elaResult` is null and analysis is complete
    - _Requirements: 2.1, 2.5_

- [x] 11. Wire image data and filename through App pipeline
  - [x] 11.1 Update App.tsx to pass imageData, fileBuffer, and filename to detection
    - After reading ArrayBuffer, draw image to a temporary Canvas to obtain ImageData
    - Pass `imageData`, `buffer` (as fileBuffer), and `file.name` (as filename) to `analyze()`
    - Store `elaResult` from the pixel analysis in app state (extend `ExtendedAppState`)
    - Pass `elaResult` to `ForensicReport` component
    - Update `ANALYSIS_COMPLETE` action to include `elaResult`
    - _Requirements: 7.7, 8.4_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All new modules are pure functions (except the ElaHeatmap React component), enabling straightforward testing
- The existing scoring formula is preserved — only the signal type registry is extended
- Canvas API operations are wrapped in try/catch for graceful degradation in test environments

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.3", "4.2", "4.3", "6.1"] },
    { "id": 3, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 4, "tasks": ["7.2", "8.1"] },
    { "id": 5, "tasks": ["8.2", "10.1"] },
    { "id": 6, "tasks": ["10.2", "10.3"] },
    { "id": 7, "tasks": ["11.1"] }
  ]
}
```
