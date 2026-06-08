# Requirements Document

## Introduction

FrameForge Verify — Module 1: Image Authenticity Analyzer is a production-grade React web application that serves as a forensic dashboard for dashcam footage verification. Users upload an image (dashcam screenshot or frame), the application extracts EXIF metadata, analyzes it for AI/synthetic generation signatures, and renders a forensic report with an authenticity score. All processing occurs client-side with no backend dependency. The UI follows a dark industrial/forensic aesthetic inspired by CCTV control rooms and legal evidence rooms.

## Glossary

- **Upload_Zone**: The drag-and-drop or click-to-upload image input component that accepts JPG, PNG, HEIC, and WebP formats
- **EXIF_Parser**: The client-side module that extracts EXIF metadata from uploaded images using the `exifr` library
- **Detection_Engine**: The scoring module that analyzes extracted metadata for AI/synthetic generation signals and computes the authenticity score
- **Forensic_Report**: The visual report layout displaying field-by-field metadata breakdown, detection signals, and verdict
- **Authenticity_Score**: A numeric value from 0 to 100 representing image genuineness, mapped to a verdict category
- **Verdict**: A categorical classification of GENUINE (score 70–100), SUSPICIOUS (score 40–69), or LIKELY SYNTHETIC (score 0–39)
- **Metadata_Field**: An individual data point extracted from the image EXIF data (e.g., camera make, GPS coordinates, timestamp)
- **Signal**: A detection criterion used by the Detection_Engine to identify synthetic or manipulated images
- **Report_Exporter**: The component that formats the forensic report as a text summary for clipboard export

## Requirements

### Requirement 1: Image Upload

**User Story:** As a forensic analyst, I want to upload dashcam images via drag-and-drop or file picker, so that I can begin authenticity analysis.

#### Acceptance Criteria

1. THE Upload_Zone SHALL accept image files in JPG, PNG, HEIC, and WebP formats only, identified by MIME type (image/jpeg, image/png, image/heic, image/webp) and file extension (.jpg, .jpeg, .png, .heic, .heif, .webp)
2. WHEN a user drags an image file over the Upload_Zone, THE Upload_Zone SHALL display a visual drop target indicator with a highlighted border and instructional text
3. WHEN a user drops a valid image file onto the Upload_Zone, THE Upload_Zone SHALL load the single file into memory for processing and replace any previously loaded image
4. WHEN a user clicks the Upload_Zone, THE Upload_Zone SHALL open the system file picker filtered to supported image formats (accept attribute set to .jpg,.jpeg,.png,.heic,.heif,.webp)
5. IF a user uploads a file with an unsupported format, THEN THE Upload_Zone SHALL display an error message specifying the supported formats (JPG, PNG, HEIC, WebP) and reject the file without processing
6. IF a user uploads a file exceeding 50 MB, THEN THE Upload_Zone SHALL display an error message indicating the 50 MB file size limit and reject the file without processing
7. WHEN a valid image file is accepted, THE Upload_Zone SHALL display a thumbnail preview of the uploaded image scaled to fit within the upload zone dimensions
8. IF a user uploads a file that passes format and size validation but cannot be decoded as a valid image, THEN THE Upload_Zone SHALL display an error message indicating the file is corrupted or unreadable
9. WHEN a new valid image file is accepted while a previous image is loaded, THE Upload_Zone SHALL replace the previous image and reset all prior analysis results before beginning new processing

### Requirement 2: EXIF Metadata Extraction

**User Story:** As a forensic analyst, I want comprehensive EXIF metadata extracted from uploaded images, so that I can assess image provenance.

#### Acceptance Criteria

1. WHEN a valid image is uploaded, THE EXIF_Parser SHALL extract camera make and model fields from the image EXIF IFD0 segment
2. WHEN a valid image is uploaded, THE EXIF_Parser SHALL extract lens information (LensModel, LensMake, FocalLength) from the image EXIF metadata
3. WHEN a valid image is uploaded, THE EXIF_Parser SHALL extract GPS coordinates including latitude, longitude (as decimal degrees with at least 6 decimal places), and altitude (as meters with at least 1 decimal place) from the image GPS IFD segment
4. WHEN a valid image is uploaded, THE EXIF_Parser SHALL extract the DateTimeOriginal field as the capture timestamp and the ModifyDate field as the file modification timestamp from the image metadata
5. WHEN a valid image is uploaded, THE EXIF_Parser SHALL extract exposure settings including FNumber (aperture), ISO (ISOSpeedRatings), and ExposureTime (shutter speed) from the image EXIF metadata
6. WHEN a valid image is uploaded, THE EXIF_Parser SHALL extract the Software field from the image IFD0 segment
7. IF a metadata field is not present in the image, THEN THE EXIF_Parser SHALL report that field with an explicit null value and a status of "absent" rather than omitting it from results
8. IF the image file contains no EXIF data at all, THEN THE EXIF_Parser SHALL return a complete result object with all expected fields marked as absent
9. IF the EXIF_Parser encounters a metadata field that is present but contains malformed or unreadable data, THEN THE EXIF_Parser SHALL report that field as corrupt with an indication that the value could not be parsed

### Requirement 3: AI/Synthetic Detection Signals

**User Story:** As a forensic analyst, I want the system to check for known indicators of AI-generated or manipulated images, so that I can assess whether an image is authentic.

#### Acceptance Criteria

1. WHEN metadata extraction completes and fewer than 3 of the following EXIF fields are present (Make, Model, DateTimeOriginal, ExposureTime, FNumber, ISOSpeedRatings), THE Detection_Engine SHALL flag the image as having insufficient EXIF data and produce a synthetic origin signal
2. WHEN the Software field contains a known AI generator name (case-insensitive match against "DALL-E", "Midjourney", "Stable Diffusion", "Photoshop", "Adobe Firefly", "Leonardo", "Runway"), THE Detection_Engine SHALL flag the Software field as a synthetic indicator
3. WHEN the original capture timestamp (DateTimeOriginal) and file modification timestamp (ModifyDate) are both present and differ by more than 24 hours, THE Detection_Engine SHALL flag a timestamp inconsistency signal
4. IF the original capture timestamp or the file modification timestamp is absent, THEN THE Detection_Engine SHALL flag a missing timestamp signal
5. WHEN the file size in bytes is less than 20 percent of the expected size (calculated as width × height × channels × bytes-per-channel for uncompressed equivalent) for the declared resolution and bit depth, THE Detection_Engine SHALL flag a file size anomaly signal
6. WHEN the file size in bytes exceeds 500 percent of the expected size (calculated as width × height × channels × bytes-per-channel for uncompressed equivalent) for the declared resolution and bit depth, THE Detection_Engine SHALL flag a file size anomaly signal
7. WHEN the color profile is absent or the bit depth is not 8 or 16 bits per channel, THE Detection_Engine SHALL flag a color profile abnormality signal
8. WHEN GPS data is absent from an image in the dashcam verification context, THE Detection_Engine SHALL flag missing GPS as a suspicious signal
9. WHEN the Detection_Engine produces a signal, THE Detection_Engine SHALL include in the signal output the signal type identifier, a severity weight between 0.0 and 1.0, and the metadata field name that triggered detection

### Requirement 4: Authenticity Scoring

**User Story:** As a forensic analyst, I want a computed authenticity score with a clear verdict, so that I can make quick assessments about image genuineness.

#### Acceptance Criteria

1. WHEN all detection signals are evaluated, THE Detection_Engine SHALL compute an Authenticity_Score as an integer from 0 to 100 inclusive
2. THE Detection_Engine SHALL start computation from a base score of 100 and subtract points based on triggered Signals, where the score SHALL NOT fall below 0
3. THE Detection_Engine SHALL apply the following maximum point deductions per signal type: Software field fingerprint match up to 30 points, missing EXIF up to 25 points, timestamp inconsistency up to 15 points, file size anomaly up to 15 points, color profile abnormality up to 10 points, and missing GPS up to 5 points (total maximum deduction: 100 points)
4. WHEN multiple signals of the same type are triggered, THE Detection_Engine SHALL apply the deduction for that signal type only once using the highest severity instance
5. WHEN the Authenticity_Score is 70 or above, THE Detection_Engine SHALL assign a Verdict of GENUINE
6. WHEN the Authenticity_Score is between 40 and 69 inclusive, THE Detection_Engine SHALL assign a Verdict of SUSPICIOUS
7. WHEN the Authenticity_Score is below 40, THE Detection_Engine SHALL assign a Verdict of LIKELY SYNTHETIC
8. THE Detection_Engine SHALL produce a scoring breakdown listing each signal type, whether it was triggered, and the points deducted for that signal

### Requirement 5: Scanning Animation

**User Story:** As a forensic analyst, I want visual feedback during image processing, so that I understand the system is actively analyzing the image.

#### Acceptance Criteria

1. WHEN image processing begins, THE Forensic_Report SHALL display a "SCANNING..." text label with a pulsing animation overlay within 100 milliseconds of processing start
2. WHILE the EXIF_Parser and Detection_Engine are processing, THE Forensic_Report SHALL display an animated scan-line effect (horizontal line sweeping vertically) over the image thumbnail at a rate of one full sweep per 1.5 seconds
3. WHEN processing completes, THE Forensic_Report SHALL remove the scanning animation and reveal results with a staggered field-by-field animation where each field appears with a delay of 80–120 milliseconds between fields
4. IF processing completes in less than 500 milliseconds, THEN THE Forensic_Report SHALL maintain the scanning animation for a minimum of 500 milliseconds total before revealing results to ensure the animation is perceivable
5. IF an error occurs during processing, THEN THE Forensic_Report SHALL stop the scanning animation and display an error state with a descriptive message

### Requirement 6: Forensic Report Display

**User Story:** As a forensic analyst, I want a structured visual report with color-coded metadata fields, so that I can quickly identify normal, suspicious, and anomalous data points.

#### Acceptance Criteria

1. THE Forensic_Report SHALL display each Metadata_Field with color coding based on its status: green (#22c55e) for fields with normal values, amber (#f59e0b) for fields flagged as suspicious by the Detection_Engine, and red (#ef4444) for fields that are missing or anomalous
2. THE Forensic_Report SHALL organize content into three collapsible sections: Raw Metadata, AI Detection Signals, and Verdict, with all sections expanded by default on initial load
3. WHEN a collapsible section header is clicked, THE Forensic_Report SHALL toggle the visibility of that section content between expanded and collapsed states
4. THE Forensic_Report SHALL display the Authenticity_Score (range 0 to 100) as a circular gauge with color matching the Verdict category: green (#22c55e) for GENUINE (70–100), amber (#f59e0b) for SUSPICIOUS (40–69), and red (#ef4444) for LIKELY SYNTHETIC (0–39)
5. THE Forensic_Report SHALL render data fields using a monospace font (JetBrains Mono or IBM Plex Mono)
6. THE Forensic_Report SHALL use a dark industrial color scheme with charcoal background (#0f1117), amber accent (#f59e0b), and a scan-line texture overlay
7. WHEN results are revealed, THE Forensic_Report SHALL animate each Metadata_Field appearing sequentially with a staggered delay of 80–120 milliseconds between fields, where each field transitions from hidden to visible with a fade-in over 200 milliseconds
8. IF a Metadata_Field value is unavailable or cannot be parsed, THEN THE Forensic_Report SHALL display that field with the red (#ef4444) color coding and a placeholder label indicating the value is missing

### Requirement 7: Report Export

**User Story:** As a forensic analyst, I want to copy the forensic report as a text summary, so that I can paste it into case notes or share findings.

#### Acceptance Criteria

1. THE Report_Exporter SHALL provide a "Copy to Clipboard" button in the Forensic_Report view, visible only when analysis results are available
2. WHEN the "Copy to Clipboard" button is clicked, THE Report_Exporter SHALL format the report as a plain-text summary structured in sections: Header (file name, analysis timestamp), Metadata Fields (field name: value pairs), Detection Signals (signal type and status), Scoring Breakdown (per-signal deductions), and Verdict (score and category)
3. WHEN the "Copy to Clipboard" button is clicked, THE Report_Exporter SHALL copy the formatted text summary to the system clipboard using the Clipboard API (navigator.clipboard.writeText)
4. WHEN the clipboard copy operation succeeds, THE Report_Exporter SHALL display a confirmation message for 3 seconds and then automatically dismiss it
5. IF the clipboard copy operation fails, THEN THE Report_Exporter SHALL display the text summary in a selectable text area as a fallback, allowing manual copy
6. IF analysis is incomplete or has errored, THEN THE Report_Exporter SHALL disable the "Copy to Clipboard" button and display a tooltip indicating that a complete report is required

### Requirement 8: Client-Side Processing

**User Story:** As a user, I want all image analysis to happen in my browser without uploading data to any server, so that I retain full control over sensitive forensic evidence.

#### Acceptance Criteria

1. THE EXIF_Parser SHALL perform all metadata extraction using client-side JavaScript without transmitting image data or metadata to external servers
2. THE Detection_Engine SHALL perform all scoring computations using client-side JavaScript without transmitting image data or metadata to external servers
3. WHEN the application loads, THE EXIF_Parser SHALL import the exifr library from the CDN endpoint https://cdn.jsdelivr.net/npm/exifr/dist/full.esm.js
4. IF the exifr CDN import fails, THEN THE application SHALL display an error message indicating that the EXIF parsing library could not be loaded and that analysis functionality is unavailable
5. THE Upload_Zone SHALL read uploaded files using the browser FileReader API without server-side processing
6. AFTER the exifr library is loaded, THE application SHALL make no further network requests during image analysis operations

### Requirement 9: EXIF Parser Round-Trip Integrity

**User Story:** As a developer, I want assurance that extracted metadata is accurately represented in the forensic report, so that findings are reliable for evidence purposes.

#### Acceptance Criteria

1. THE EXIF_Parser SHALL extract all Metadata_Field values such that string fields preserve the original character sequence, numeric fields preserve the original numeric value, and date fields preserve the original timestamp to the second
2. THE Forensic_Report SHALL display each Metadata_Field using the exact field name and value as returned by the EXIF_Parser, where permitted formatting is limited to: date values rendered in ISO 8601 format, numeric values rendered with their unit label appended, and string values displayed verbatim with no truncation
3. WHEN the EXIF_Parser extracts GPS coordinates, THE EXIF_Parser SHALL represent latitude and longitude as decimal degrees with at least 6 decimal places of precision and altitude as meters with at least 1 decimal place of precision
4. IF the EXIF_Parser encounters a metadata field that is present but contains malformed or unreadable data, THEN THE EXIF_Parser SHALL report that field as corrupt with an indication that the value could not be parsed, rather than silently omitting the field or substituting a default value
