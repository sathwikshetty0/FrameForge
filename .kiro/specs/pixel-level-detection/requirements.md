# Requirements Document

## Introduction

This feature extends FrameForge Verify with pixel-level image analysis capabilities to detect AI-generated images. It adds Error Level Analysis (ELA) with heatmap visualization, color histogram uniformity detection, PNG metadata chunk parsing for AI generation parameters, and filename pattern detection for known AI tool naming conventions. These analyses integrate as three new signal types (PIXEL_ANALYSIS, PNG_METADATA_AI, FILENAME_PATTERN) into the existing scoring system. All processing runs client-side using Canvas API with zero external dependencies.

## Glossary

- **ELA_Analyzer**: The module that performs Error Level Analysis by re-compressing an image at JPEG quality 60 and computing per-pixel differences between the original and re-compressed versions.
- **Histogram_Analyzer**: The module that computes and evaluates RGB color channel distributions for uniformity patterns indicative of AI generation.
- **Pixel_Analysis_Engine**: The combined module encompassing ELA_Analyzer and Histogram_Analyzer that produces a single PIXEL_ANALYSIS signal using the worst severity from either sub-analysis.
- **PNG_Metadata_Parser**: The module that reads and interprets tEXt and iTXt chunks from PNG files to detect AI generation parameters.
- **Filename_Detector**: The module that evaluates image filenames against known AI tool naming patterns.
- **ELA_Heatmap**: A Canvas-rendered visualization showing per-pixel error levels as a color-mapped overlay, where brighter regions indicate higher error differences.
- **Detection_Engine**: The existing module that evaluates metadata for AI/synthetic indicators and produces detection signals.
- **Scoring_Engine**: The existing module that computes authenticity scores from detection signals.
- **ForensicReport**: The existing React component that renders analysis results including signal details, metadata, and verdict.

## Requirements

### Requirement 1: Error Level Analysis

**User Story:** As a teacher verifying student submissions, I want the system to analyze pixel-level compression artifacts so that I can detect uniformly generated AI images that lack natural compression variation.

#### Acceptance Criteria

1.1. WHEN an image file is loaded into the analysis pipeline, THE ELA_Analyzer SHALL re-compress the image as JPEG at quality level 60 using the Canvas API toDataURL method.

1.2. WHEN the re-compressed image is produced, THE ELA_Analyzer SHALL compute the absolute per-pixel difference between the original image pixel data and the re-compressed image pixel data for each RGB channel.

1.3. THE ELA_Analyzer SHALL normalize the per-pixel difference values to a 0–255 scale by multiplying each difference value by a configurable amplification factor.

1.4. WHEN the per-pixel differences are computed, THE ELA_Analyzer SHALL calculate the mean difference value across all pixels and all RGB channels as the ELA score.

1.5. WHEN the ELA score standard deviation across pixel blocks is below a threshold indicating uniform error distribution, THE ELA_Analyzer SHALL classify the image as exhibiting AI-generation characteristics with severity proportional to the uniformity (lower variance produces higher severity).

1.6. IF the Canvas API fails to render or re-compress the image, THEN THE ELA_Analyzer SHALL return a null result without producing a signal and without blocking the analysis pipeline.

### Requirement 2: ELA Heatmap Visualization

**User Story:** As a teacher, I want to see a visual heatmap of compression error levels so that I can visually verify which regions of an image have suspicious uniform error patterns.

#### Acceptance Criteria

2.1. WHEN ELA analysis completes with a valid result, THE ForensicReport SHALL render an ELA_Heatmap as a Canvas element within the forensic report output.

2.2. THE ELA_Heatmap SHALL map per-pixel difference magnitudes to a color gradient where low differences appear as dark blue, moderate differences appear as green-yellow, and high differences appear as red-white.

2.3. THE ELA_Heatmap SHALL render at the same pixel dimensions as the source image, scaled to fit within the report layout container.

2.4. WHILE the ELA_Heatmap is displayed, THE ForensicReport SHALL show a legend explaining the color gradient mapping from low error to high error.

2.5. IF ELA analysis returned a null result due to Canvas failure, THEN THE ForensicReport SHALL display a message indicating that ELA visualization is unavailable for the image.

### Requirement 3: Color Histogram Analysis

**User Story:** As a teacher, I want the system to detect unnaturally smooth color distributions so that I can identify AI-generated images that lack the natural noise and variation of real photographs.

#### Acceptance Criteria

3.1. WHEN an image is loaded into the analysis pipeline, THE Histogram_Analyzer SHALL compute separate frequency distributions for the Red, Green, and Blue channels across all pixel values (0–255).

3.2. WHEN the RGB histograms are computed, THE Histogram_Analyzer SHALL calculate a smoothness metric for each channel by measuring the average absolute difference between adjacent bin values.

3.3. WHEN all three channel smoothness metrics are below a threshold indicating unnaturally uniform distribution, THE Histogram_Analyzer SHALL classify the image as exhibiting AI-generation characteristics.

3.4. THE Histogram_Analyzer SHALL produce a severity value between 0.0 and 1.0 where 1.0 represents maximum smoothness uniformity and 0.0 represents natural photographic variation.

### Requirement 4: Combined PIXEL_ANALYSIS Signal

**User Story:** As a user, I want ELA and histogram results combined into a single signal so that the scoring system reflects the worst-case pixel-level detection finding.

#### Acceptance Criteria

4.1. WHEN both ELA_Analyzer and Histogram_Analyzer complete analysis, THE Pixel_Analysis_Engine SHALL produce a single detection signal of type PIXEL_ANALYSIS.

4.2. THE Pixel_Analysis_Engine SHALL set the PIXEL_ANALYSIS signal severity to the maximum severity value between the ELA result severity and the Histogram result severity.

4.3. THE Pixel_Analysis_Engine SHALL set the PIXEL_ANALYSIS signal triggerField to the sub-analysis name that produced the higher severity value.

4.4. THE Pixel_Analysis_Engine SHALL include descriptions from both sub-analyses in the PIXEL_ANALYSIS signal description field, separated by a delimiter.

4.5. IF only one sub-analysis produces a valid result (due to Canvas failure in ELA), THEN THE Pixel_Analysis_Engine SHALL use the available result as the sole basis for the PIXEL_ANALYSIS signal.

4.6. IF neither sub-analysis produces a valid result, THEN THE Pixel_Analysis_Engine SHALL not produce a PIXEL_ANALYSIS signal.

### Requirement 5: PNG Metadata Chunk Parsing

**User Story:** As a teacher, I want the system to detect AI generation parameters embedded in PNG metadata chunks so that I can identify images generated by Stable Diffusion, ComfyUI, NovelAI, or A1111.

#### Acceptance Criteria

5.1. WHEN a PNG file is loaded into the analysis pipeline, THE PNG_Metadata_Parser SHALL read all tEXt chunks from the PNG binary data by parsing the chunk structure according to the PNG specification.

5.2. WHEN a PNG file is loaded into the analysis pipeline, THE PNG_Metadata_Parser SHALL read all iTXt chunks from the PNG binary data by parsing the chunk structure according to the PNG specification.

5.3. WHEN tEXt or iTXt chunks are extracted, THE PNG_Metadata_Parser SHALL search for keywords indicating AI generation including "parameters", "prompt", "negative_prompt", "workflow", "Comment" (NovelAI), and "comf" (ComfyUI metadata).

5.4. WHEN a chunk keyword matches an AI generation indicator, THE PNG_Metadata_Parser SHALL produce a detection signal of type PNG_METADATA_AI with severity 1.0.

5.5. THE PNG_Metadata_Parser SHALL identify the specific AI tool by matching chunk content patterns: "Steps:" and "Sampler:" for A1111, "workflow" JSON structure for ComfyUI, "Source:" or "Description:" for NovelAI, and "Model:" for Stable Diffusion.

5.6. THE PNG_Metadata_Parser SHALL include the identified AI tool name and the matched keyword in the signal description.

5.7. IF the file is not a PNG format (based on the 8-byte PNG signature), THEN THE PNG_Metadata_Parser SHALL skip parsing and produce no signal.

5.8. IF the PNG chunk data is malformed or truncated, THEN THE PNG_Metadata_Parser SHALL stop parsing gracefully and produce no signal rather than throwing an error.

### Requirement 6: Filename Pattern Detection

**User Story:** As a teacher checking student submissions, I want the system to flag files with filenames matching known AI tool output patterns so that I can quickly identify images that were likely generated by DALL-E, Midjourney, or ComfyUI.

#### Acceptance Criteria

6.1. WHEN an image file is provided for analysis, THE Filename_Detector SHALL evaluate the filename against known AI tool naming patterns.

6.2. THE Filename_Detector SHALL detect DALL-E filename patterns matching the format containing "DALL" followed by a dot or middle-dot character and a date pattern (four digits, dash, two digits, dash, two digits).

6.3. THE Filename_Detector SHALL detect Midjourney filename patterns by identifying filenames that contain a UUID-like hexadecimal segment of 8 or more characters.

6.4. THE Filename_Detector SHALL detect ComfyUI filename patterns matching filenames beginning with "ComfyUI_" followed by numeric or underscore characters.

6.5. THE Filename_Detector SHALL detect other AI tool patterns including filenames beginning with "ai_generated", "generated_", or "output_" followed by numeric identifiers.

6.6. WHEN a filename matches any known AI tool pattern, THE Filename_Detector SHALL produce a detection signal of type FILENAME_PATTERN with severity 1.0.

6.7. THE Filename_Detector SHALL include the matched pattern name and the specific filename portion that triggered the match in the signal description.

6.8. IF the filename does not match any known pattern, THEN THE Filename_Detector SHALL not produce a signal.

### Requirement 7: Signal Type Integration

**User Story:** As a developer, I want the new signal types integrated into the existing scoring system so that pixel analysis, PNG metadata, and filename pattern results affect the final authenticity score.

#### Acceptance Criteria

7.1. THE Scoring_Engine SHALL recognize three additional signal types: PIXEL_ANALYSIS, PNG_METADATA_AI, and FILENAME_PATTERN.

7.2. THE Scoring_Engine SHALL assign a maximum deduction of 25 points to PIXEL_ANALYSIS signals.

7.3. THE Scoring_Engine SHALL assign a maximum deduction of 35 points to PNG_METADATA_AI signals.

7.4. THE Scoring_Engine SHALL assign a maximum deduction of 30 points to FILENAME_PATTERN signals.

7.5. THE Scoring_Engine SHALL include PIXEL_ANALYSIS, PNG_METADATA_AI, and FILENAME_PATTERN in the scoring breakdown output regardless of whether signals of those types are triggered.

7.6. THE Scoring_Engine SHALL apply the same deduction calculation to new signal types as existing types: deduction equals the maximum deduction multiplied by the highest severity signal of that type.

7.7. THE Detection_Engine SHALL invoke the Pixel_Analysis_Engine, PNG_Metadata_Parser, and Filename_Detector as part of the analysis pipeline alongside existing signal evaluators.

### Requirement 8: Client-Side Processing Constraints

**User Story:** As a user, I want all analysis to run in my browser without sending image data to external servers so that my images remain private and the tool works offline.

#### Acceptance Criteria

8.1. THE Pixel_Analysis_Engine SHALL perform all image re-compression and pixel comparison operations using the browser Canvas API without external library dependencies.

8.2. THE PNG_Metadata_Parser SHALL perform all PNG chunk parsing using ArrayBuffer and DataView operations without external library dependencies.

8.3. THE Filename_Detector SHALL perform all pattern matching using built-in JavaScript RegExp operations without external library dependencies.

8.4. THE Pixel_Analysis_Engine SHALL not transmit image data, pixel data, or analysis results to any remote endpoint.

8.5. IF the browser does not support Canvas 2D context, THEN THE Pixel_Analysis_Engine SHALL skip pixel analysis and allow the pipeline to continue with remaining analyzers.
