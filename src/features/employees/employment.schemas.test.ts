import { describe, expect, it } from 'vitest'
import {
  employmentFormSchema,
  employmentSearchSchema,
  employmentWriteSchema,
  employmentRangeSchema,
} from './employment.schemas'

describe('employment input boundaries', () => {
  const form = {
    startDate: '2026-01-01',
    endDate: '',
    reason: 'ხელშეკრულების დადასტურება',
  }
  it('accepts ongoing employment and inclusive same-day dates', () => {
    expect(employmentFormSchema.safeParse(form).success).toBe(true)
    expect(
      employmentFormSchema.safeParse({ ...form, endDate: form.startDate })
        .success,
    ).toBe(true)
  })
  it.each([
    '',
    '2026-02-30',
    '1899-12-31',
    '2101-01-01',
    '2026-01-01T12:00:00Z',
  ])('rejects invalid or unsupported dates: %s', (startDate) => {
    expect(employmentFormSchema.safeParse({ ...form, startDate }).success).toBe(
      false,
    )
  })
  it('rejects reversed dates, empty reasons and writable identity injection', () => {
    expect(
      employmentFormSchema.safeParse({ ...form, endDate: '2025-12-31' })
        .success,
    ).toBe(false)
    expect(
      employmentFormSchema.safeParse({ ...form, reason: '  ' }).success,
    ).toBe(false)
    expect(
      employmentWriteSchema.safeParse({
        ...form,
        endDate: null,
        userId: 'employee',
        periodId: null,
        expectedRevision: 0,
        actorId: 'owner',
      }).success,
    ).toBe(false)
  })
  it('validates one-based URL pages and bounded date-range readers', () => {
    expect(employmentSearchSchema.parse({})).toEqual({
      employmentPage: 1,
      employmentHistoryPage: 1,
    })
    expect(
      employmentSearchSchema.parse({ employmentPage: '2' }).employmentPage,
    ).toBe(2)
    for (const employmentPage of [0, -1, 'invalid', 10001])
      expect(employmentSearchSchema.safeParse({ employmentPage }).success).toBe(
        false,
      )
    const range = {
      employeeId: '019a095c-7cc2-7000-8000-000000000001',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
    }
    expect(employmentRangeSchema.safeParse(range).success).toBe(true)
    expect(
      employmentRangeSchema.safeParse({ ...range, endDate: '2027-01-02' })
        .success,
    ).toBe(false)
  })
})
