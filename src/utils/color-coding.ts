// Feature: frameforge-verify, Property 16: Field color coding
// Utility for determining field color based on status and signal triggers

/**
 * Determines the display color for a metadata field based on its status
 * and whether it is a trigger field of any detection signal.
 *
 * Color coding rules:
 * - Green (#22c55e): field is present and not triggered by any signal
 * - Amber (#f59e0b): field is the triggerField of any signal
 * - Red (#ef4444): field has status 'absent' or 'corrupt'
 *
 * @param fieldName - The name of the metadata field
 * @param fieldStatus - The extraction status of the field ('present', 'absent', or 'corrupt')
 * @param triggerFields - Array of field names that triggered detection signals
 * @returns The hex color string for the field
 */
export function getFieldColor(
  fieldName: string,
  fieldStatus: 'present' | 'absent' | 'corrupt',
  triggerFields: string[]
): string {
  if (fieldStatus === 'absent' || fieldStatus === 'corrupt') return '#ef4444'; // red
  if (triggerFields.includes(fieldName)) return '#f59e0b'; // amber
  return '#22c55e'; // green
}
