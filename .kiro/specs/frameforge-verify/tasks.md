# Implementation Plan: FrameForge Verify — Image Authenticity Analyzer

## Overview

This plan implements a client-side React SPA that performs forensic analysis of dashcam images. The implementation follows a bottom-up approach: core pure-function libraries first (parser, detection, scoring, formatter), then UI components, then integration and wiring. TypeScript with Vitest and fast-check for testing.

## Tasks

- [x] 1. Set up project structure, dependencies, and core types
  - [x] 1.1 Initialize React project with Vite, TypeScript, and install dependencies (vitest, fast-check, @testing-library/react)
    - Create Vite React-TS project scaffold
    - Configure Vitest in vite.config.ts
    - Install fast-check as dev dependency
    - Set up the directory structure: src/lib/, src/components/, src/utils/
    - _Requirements: 8.1, 8.2_

  - [x] 1.2 Define core TypeScript interfaces and types
    - Create `src/lib/types.ts` with all shared types: MetadataField<T>, MetadataResult, DetectionSignal, SignalType, ScoringResult, ScoringBreakdownEntry, Verdict, PipelineState, AppState, AppError, UploadError
    - Define constants: SUPPORTED_MIME_TYPES, SUPPORTED_EXTENSIONS, MAX_FILE_SIZE_BYTES, MAX_DEDUCTIONS, AI_SOFTWARE_KEYWORDS
    - _Requirements: 1.1, 3.9, 4.3_

- [x] 2. Implement EXIF Parser module
  - [x] 2.1 Implement the parseExif function
    - Create `src/lib/exif-parser.ts`
    - Implement CDN-based exifr dynamic import with error handling
    - Map exifr flat output to MetadataResult structure
    - Mark each field as 'present', 'absent', or 'corrupt' based on extraction results
    - Wrap all field access in try/catch for defensive parsing
    - Ensure GPS coordinates preserve 6+ decimal places, altitude preserves 1+ decimal place
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 9.1, 9.3_

  - [x] 2.2 Write property tests for EXIF Parser (Property 1: Field extraction preserves values)
    - **Property 1: Field extraction preserves values**
    - Generate arbitrary exifr output objects with string, number, and date fields
    - Assert parseExif output preserves all values exactly
    - **Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.6, 9.1**

  - [x] 2.3 Write property tests for EXIF Parser (Property 2: All fields always present in output)
    - **Property 2: All fields always present in output**
    - Generate arbitrary ArrayBuffer inputs including empty buffers
    - Assert every MetadataResult field exists with a valid status
    - **Validates: Requirements 2.7, 2.8**

  - [x] 2.4 Write property tests for EXIF Parser (Property 3: Corrupt fields reported as corrupt)
    - **Property 3: Corrupt fields reported as corrupt**
    - Generate exifr outputs with malformed field values (wrong types, NaN, invalid dates)
    - Assert those fields are reported with status 'corrupt'
    - **Validates: Requirements 2.9, 9.4**

  - [x] 2.5 Write property tests for EXIF Parser (Property 4: GPS precision preservation)
    - **Property 4: GPS precision preservation**
    - Generate GPS coordinate values with varying precision
    - Assert latitude/longitude have ≥6 decimal places, altitude has ≥1 decimal place
    - **Validates: Requirements 2.3, 9.3**

- [x] 3. Implement Detection Engine module
  - [x] 3.1 Implement signal evaluation functions
    - Create `src/lib/detection-engine.ts`
    - Implement MISSING_EXIF signal: count present core fields, trigger if <3, severity = (3 - presentCount) / 3
    - Implement SOFTWARE_FINGERPRINT signal: case-insensitive match against AI_SOFTWARE_KEYWORDS, severity 1.0
    - Implement TIMESTAMP_INCONSISTENCY signal: >24h diff or absent timestamps, severity scaled by hoursDiff/720
    - Implement FILE_SIZE_ANOMALY signal: ratio check (<0.2 or >5.0), severity proportional to deviation
    - Implement COLOR_PROFILE_ABNORMALITY signal: absent profile or non-8/16 bit depth, severity 0.5/1.0
    - Implement MISSING_GPS signal: absent lat/lon, severity 1.0
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x] 3.2 Write property tests for Detection Engine (Property 5: MISSING_EXIF signal threshold)
    - **Property 5: MISSING_EXIF signal threshold**
    - Generate MetadataResult with varying combinations of core fields present/absent
    - Assert signal triggers iff fewer than 3 of 6 core fields are present
    - **Validates: Requirements 3.1**

  - [x] 3.3 Write property tests for Detection Engine (Property 6: SOFTWARE_FINGERPRINT detection)
    - **Property 6: SOFTWARE_FINGERPRINT detection**
    - Generate MetadataResult with arbitrary Software field values (including case variants of keywords)
    - Assert signal triggers iff Software value matches any AI keyword case-insensitively
    - **Validates: Requirements 3.2**

  - [x] 3.4 Write property tests for Detection Engine (Property 7: TIMESTAMP_INCONSISTENCY detection)
    - **Property 7: TIMESTAMP_INCONSISTENCY detection**
    - Generate MetadataResult with various DateTimeOriginal/ModifyDate combinations
    - Assert signal triggers when diff >24h or either is absent
    - **Validates: Requirements 3.3, 3.4**

  - [x] 3.5 Write property tests for Detection Engine (Property 8: FILE_SIZE_ANOMALY detection)
    - **Property 8: FILE_SIZE_ANOMALY detection**
    - Generate file sizes and image dimensions, compute ratio
    - Assert signal triggers iff ratio <0.2 or >5.0
    - **Validates: Requirements 3.5, 3.6**

  - [x] 3.6 Write property tests for Detection Engine (Property 9: COLOR_PROFILE_ABNORMALITY detection)
    - **Property 9: COLOR_PROFILE_ABNORMALITY detection**
    - Generate MetadataResult with varying color profile and bit depth values
    - Assert signal triggers when profile absent OR bit depth not 8/16
    - **Validates: Requirements 3.7**

  - [x] 3.7 Write property tests for Detection Engine (Property 10: Signal structure invariant)
    - **Property 10: Signal structure invariant**
    - Generate arbitrary MetadataResult inputs and run detection
    - Assert every produced signal has valid type, severity in [0,1], and non-empty triggerField
    - **Validates: Requirements 3.9**

- [x] 4. Implement Scoring module
  - [x] 4.1 Implement the scoring algorithm
    - Create `src/lib/scoring.ts`
    - Implement `computeScore(signals: DetectionSignal[]): ScoringResult`
    - Start from base 100, subtract deductions per signal type (highest severity × max deduction)
    - Deduplicate same-type signals (use highest severity only)
    - Clamp score to [0, 100]
    - Map score to verdict: ≥70 GENUINE, 40–69 SUSPICIOUS, <40 LIKELY SYNTHETIC
    - Produce breakdown array with all 6 signal types regardless of trigger status
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 4.2 Write property tests for Scoring (Property 11: Score range invariant)
    - **Property 11: Score range invariant**
    - Generate arbitrary sets of DetectionSignals
    - Assert computed score is integer in [0, 100]
    - **Validates: Requirements 4.1, 4.2**

  - [x] 4.3 Write property tests for Scoring (Property 12: Per-signal deduction capping)
    - **Property 12: Per-signal deduction capping**
    - Generate signals with severity up to 1.0
    - Assert deduction for each type never exceeds defined maximum
    - **Validates: Requirements 4.3**

  - [x] 4.4 Write property tests for Scoring (Property 13: Same-type signal deduplication)
    - **Property 13: Same-type signal deduplication**
    - Generate multiple signals of the same type with varying severities
    - Assert only one deduction applied per type using highest severity
    - **Validates: Requirements 4.4**

  - [x] 4.5 Write property tests for Scoring (Property 14: Verdict mapping)
    - **Property 14: Verdict mapping**
    - Generate scores in [0, 100]
    - Assert verdict is GENUINE iff ≥70, SUSPICIOUS iff 40–69, LIKELY SYNTHETIC iff <40
    - **Validates: Requirements 4.5, 4.6, 4.7**

  - [x] 4.6 Write property tests for Scoring (Property 15: Scoring breakdown completeness)
    - **Property 15: Scoring breakdown completeness**
    - Generate arbitrary signal sets
    - Assert breakdown always contains all 6 signal types with triggered/deducted/max fields
    - **Validates: Requirements 4.8**

- [~] 5. Checkpoint - Ensure all core logic tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement validation utilities and report formatter
  - [x] 6.1 Implement file format and size validation
    - Create `src/utils/validation.ts`
    - Implement `validateFile(file: File): UploadError | null`
    - Check MIME type against SUPPORTED_MIME_TYPES
    - Check extension against SUPPORTED_EXTENSIONS
    - Check file.size ≤ MAX_FILE_SIZE_BYTES
    - _Requirements: 1.1, 1.5, 1.6_

  - [~] 6.2 Implement report text formatter
    - Create `src/lib/report-formatter.ts`
    - Implement `formatReport(metadata, result, fileName, analysisTimestamp): string`
    - Structure output with sections: Header, Metadata, Detection Signals, Scoring Breakdown, Verdict
    - Display 'MISSING' for absent fields, exact values for present fields
    - Format dates as ISO 8601, numbers with units
    - _Requirements: 7.2, 9.2_

  - [~] 6.3 Write property tests for validation (Property 19: Format validation)
    - **Property 19: Format validation**
    - Generate arbitrary MIME type + extension pairs
    - Assert acceptance iff MIME type is in allowed set AND extension is in allowed set
    - **Validates: Requirements 1.1, 1.5**

  - [~] 6.4 Write property tests for report formatter (Property 17: Report format completeness)
    - **Property 17: Report format completeness**
    - Generate arbitrary valid MetadataResult and ScoringResult
    - Assert output contains all required sections (Header, Metadata, Signals, Breakdown, Verdict)
    - **Validates: Requirements 7.2**

  - [~] 6.5 Write property tests for report formatter (Property 18: Report display fidelity)
    - **Property 18: Report display fidelity**
    - Generate MetadataResult with known values
    - Assert output contains exact field names and values with only permitted formatting
    - **Validates: Requirements 9.2**

- [ ] 7. Implement UI components
  - [~] 7.1 Implement the UploadZone component
    - Create `src/components/UploadZone/UploadZone.tsx`
    - Implement drag-and-drop with visual drop target indicator (highlighted border)
    - Implement click-to-open file picker with accept attribute for supported formats
    - Display thumbnail preview on valid file acceptance
    - Show error messages for unsupported format, file too large, corrupt image
    - Implement image decode verification via Image element onerror
    - Disable interaction during processing (isProcessing prop)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [~] 7.2 Implement the ScanningAnimation component
    - Create `src/components/ScanningAnimation/ScanningAnimation.tsx`
    - Display "SCANNING..." label with CSS pulsing animation
    - Animate horizontal scan-line sweeping vertically over thumbnail (1 sweep per 1.5s)
    - Enforce minimum 500ms display time before transition to COMPLETE
    - Stop animation and show error on error state
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [~] 7.3 Implement the VerdictGauge component
    - Create `src/components/VerdictGauge/VerdictGauge.tsx`
    - SVG-based circular arc with fill percentage = score/100
    - Color mapping: green for GENUINE, amber for SUSPICIOUS, red for LIKELY SYNTHETIC
    - Center text: score value + verdict label
    - _Requirements: 6.4_

  - [~] 7.4 Implement the ForensicReport component
    - Create `src/components/ForensicReport/ForensicReport.tsx`
    - Implement three collapsible sections: Raw Metadata, AI Detection Signals, Verdict (all expanded by default)
    - Color-code fields: green (present + not triggered), amber (trigger field of signal), red (absent/corrupt)
    - Staggered field-by-field reveal animation (80–120ms delay, 200ms fade-in)
    - Dark industrial styling: charcoal background (#0f1117), amber accent (#f59e0b), monospace font
    - Scan-line texture overlay
    - Render MetadataFields, DetectionSignals, ScoringBreakdown, and VerdictGauge sub-components
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [~] 7.5 Write property tests for field color coding (Property 16: Field color coding)
    - **Property 16: Field color coding**
    - Generate field status + signal trigger combinations
    - Assert correct color assignment: green for present+untriggered, amber for triggered, red for absent/corrupt
    - **Validates: Requirements 6.1, 6.4, 6.8**

  - [~] 7.6 Implement the ReportExporter component
    - Create `src/components/ReportExporter/ReportExporter.tsx`
    - Render "Copy to Clipboard" button, visible only when results are available
    - Call navigator.clipboard.writeText with formatted report text
    - Show success confirmation for 3 seconds then auto-dismiss
    - Fall back to selectable textarea on clipboard API failure
    - Disable button when analysis is incomplete or errored
    - _Requirements: 7.1, 7.3, 7.4, 7.5, 7.6_

- [~] 8. Checkpoint - Ensure all component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Wire application together
  - [~] 9.1 Implement App state machine and pipeline orchestration
    - Create `src/App.tsx` with useReducer for pipeline state management (IDLE → LOADING → SCANNING → COMPLETE | ERROR)
    - Implement state transitions: file accepted → LOADING, buffer ready → SCANNING, analysis done → COMPLETE, failure → ERROR
    - Reset all state on new file acceptance
    - Record scanStartTime to enforce minimum 500ms animation
    - Handle CDN library load failure at initialization → ERROR with library phase message
    - _Requirements: 1.9, 5.4, 8.3, 8.4, 8.6_

  - [~] 9.2 Wire pipeline: Upload → Parse → Detect → Score → Report
    - Connect UploadZone.onFileAccepted to trigger FileReader.readAsArrayBuffer
    - Pass ArrayBuffer to parseExif
    - Pass MetadataResult + fileSize to DetectionEngine.analyze
    - Pass signals to computeScore
    - Pass all results to ForensicReport and ReportExporter
    - Ensure no network requests occur during analysis (CDN load only at init)
    - _Requirements: 8.1, 8.2, 8.5, 8.6_

  - [~] 9.3 Apply global styles and forensic theme
    - Set up global CSS with dark theme: charcoal background (#0f1117), amber accent (#f59e0b)
    - Import monospace font (JetBrains Mono or IBM Plex Mono) via CSS
    - Add scan-line texture overlay to the report area
    - Ensure responsive layout for the single-page application
    - _Requirements: 6.5, 6.6_

- [~] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All computation is client-side; the only network request is the initial CDN library load
- The exifr library is loaded as an ES module from jsdelivr CDN

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "4.1", "6.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "4.2", "4.3", "4.4", "4.5", "4.6", "6.2", "6.3"] },
    { "id": 4, "tasks": ["6.4", "6.5", "7.1", "7.2", "7.3"] },
    { "id": 5, "tasks": ["7.4", "7.5", "7.6"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3"] }
  ]
}
```
