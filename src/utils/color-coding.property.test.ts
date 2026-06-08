// Feature: frameforge-verify, Property 16: Field color coding
// Validates: Requirements 6.1, 6.4, 6.8

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getFieldColor } from './color-coding';

/**
 * Property 16: Field color coding
 *
 * For any metadata field in the forensic report, the color coding SHALL be:
 * - green (#22c55e) when the field has status 'present' and is not a trigger field of any signal
 * - amber (#f59e0b) when the field is the trigger field of any signal
 * - red (#ef4444) when the field has status 'absent' or 'corrupt'
 */
describe('Property 16: Field color coding', () => {
  const fieldStatusArb = fc.constantFrom('present', 'absent', 'corrupt') as fc.Arbitrary<'present' | 'absent' | 'corrupt'>;
  const fieldNameArb = fc.string({ minLength: 1, maxLength: 50 });
  const triggerFieldsArb = fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 10 });

  it('should return red (#ef4444) for absent fields regardless of triggerFields', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        triggerFieldsArb,
        (fieldName, triggerFields) => {
          const color = getFieldColor(fieldName, 'absent', triggerFields);
          expect(color).toBe('#ef4444');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return red (#ef4444) for corrupt fields regardless of triggerFields', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        triggerFieldsArb,
        (fieldName, triggerFields) => {
          const color = getFieldColor(fieldName, 'corrupt', triggerFields);
          expect(color).toBe('#ef4444');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return amber (#f59e0b) when field is present AND in triggerFields', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        triggerFieldsArb,
        (fieldName, otherTriggerFields) => {
          // Ensure fieldName is in the triggerFields array
          const triggerFields = [...otherTriggerFields, fieldName];
          const color = getFieldColor(fieldName, 'present', triggerFields);
          expect(color).toBe('#f59e0b');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return green (#22c55e) when field is present AND NOT in triggerFields', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        triggerFieldsArb,
        (fieldName, triggerFields) => {
          // Ensure fieldName is NOT in the triggerFields array
          const filteredTriggerFields = triggerFields.filter(f => f !== fieldName);
          const color = getFieldColor(fieldName, 'present', filteredTriggerFields);
          expect(color).toBe('#22c55e');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should always return one of the three valid color values', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        fieldStatusArb,
        triggerFieldsArb,
        (fieldName, fieldStatus, triggerFields) => {
          const color = getFieldColor(fieldName, fieldStatus, triggerFields);
          expect(['#22c55e', '#f59e0b', '#ef4444']).toContain(color);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should prioritize red over amber when field is absent/corrupt even if in triggerFields', () => {
    fc.assert(
      fc.property(
        fieldNameArb,
        fc.constantFrom('absent', 'corrupt') as fc.Arbitrary<'absent' | 'corrupt'>,
        (fieldName, status) => {
          // Field is both absent/corrupt AND in triggerFields - red takes priority
          const triggerFields = [fieldName];
          const color = getFieldColor(fieldName, status, triggerFields);
          expect(color).toBe('#ef4444');
        }
      ),
      { numRuns: 100 }
    );
  });
});
