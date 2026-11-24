import { describe, expect, it } from 'vitest'
import { jobsMonthRange } from './jobs.dates'
import {
  createJobSchema,
  editJobSchema,
  jobFieldsSchema,
  jobSearchSchema,
  jobTransitionSchema,
} from './jobs.schemas'

const id = '019a365d-37cc-7a5c-bfe1-1e0752235b68'
it('validates the related-to-me URL filter and rejects unknown relationship scopes', () => {
  expect(jobSearchSchema.parse({ scope: 'related' }).scope).toBe('related')
  expect(jobSearchSchema.safeParse({ scope: 'someone-else' }).success).toBe(
    false,
  )
})
const fields = {
  title: 'ახალი მონტაჟი',
  address: 'თბილისი',
  notes: '',
  kind: 'installation',
  deadline: '2026-11-20',
  longitude: 44.8,
  latitude: 41.7,
}
it.each(['', '   ', '\t\n'])(
  'rejects blank addresses in forms, creation and edits: %j',
  (address) => {
    for (const schema of [jobFieldsSchema, createJobSchema, editJobSchema]) {
      const result = schema.safeParse({
        ...fields,
        address,
        requestId: id,
        id,
        version: 1,
      })
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({
            path: ['address'],
            message: 'მიუთითეთ მისამართი.',
          }),
        )
    }
    expect(
      jobFieldsSchema.parse({ ...fields, address: '  თბილისი  ' }).address,
    ).toBe('თბილისი')
  },
)
it('requires a valid calendar deadline for both creation and edits', () => {
  const { deadline: _deadline, ...withoutDeadline } = fields
  expect(
    createJobSchema.safeParse({ ...withoutDeadline, requestId: id }).success,
  ).toBe(false)
  expect(
    createJobSchema.safeParse({ ...fields, deadline: null, requestId: id })
      .success,
  ).toBe(false)
  expect(
    createJobSchema.parse({ ...fields, deadline: '2028-02-29', requestId: id })
      .deadline,
  ).toBe('2028-02-29')
  expect(
    editJobSchema.safeParse({ ...withoutDeadline, id, version: 1 }).success,
  ).toBe(false)
  expect(
    editJobSchema.safeParse({ ...fields, deadline: null, id, version: 1 })
      .success,
  ).toBe(false)
  for (const deadline of [
    '2026-02-30',
    '2026-11-07T10:00:00Z',
    '',
    '2101-01-01',
    '1899-12-31',
  ]) {
    const result = createJobSchema.safeParse({
      ...fields,
      deadline,
      requestId: id,
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toMatch(/[ა-ჰ]/)
  }
})
it('supports generic jobs consistently in forms, creates, edits and URL filters', () => {
  expect(jobFieldsSchema.parse({ ...fields, kind: 'other' }).kind).toBe('other')
  expect(
    createJobSchema.parse({ ...fields, kind: 'other', requestId: id }).kind,
  ).toBe('other')
  expect(
    editJobSchema.parse({ ...fields, kind: 'other', id, version: 1 }).kind,
  ).toBe('other')
  expect(jobSearchSchema.parse({ kind: 'other' }).kind).toBe('other')
  expect(
    jobFieldsSchema.safeParse({ ...fields, kind: 'unknown' }).success,
  ).toBe(false)
})

it('enforces the same Georgia boundary for forms, creates and edits', () => {
  for (const position of [
    { longitude: 28.9784, latitude: 41.0082 },
    { longitude: 44.681, latitude: 43.024 },
    { longitude: 41, latitude: 42 },
  ]) {
    const input = { ...fields, ...position }
    const result = jobFieldsSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['latitude'],
          message: 'სამუშაოს მდებარეობა საქართველოს ტერიტორიაზე უნდა იყოს.',
        }),
      )
    expect(createJobSchema.safeParse({ ...input, requestId: id }).success).toBe(
      false,
    )
    expect(editJobSchema.safeParse({ ...input, id, version: 1 }).success).toBe(
      false,
    )
  }
  expect(editJobSchema.safeParse({ ...fields, id, version: 1 }).success).toBe(
    true,
  )
})
describe('job boundary validation', () => {
  it('allows absent coordinates but never a partial pair', () => {
    expect(
      createJobSchema.parse({
        ...fields,
        requestId: id,
        longitude: null,
        latitude: null,
      }),
    ).toMatchObject({ longitude: null, latitude: null })
    const {
      longitude: _longitude,
      latitude: _latitude,
      ...withoutLocation
    } = fields
    expect(
      createJobSchema.parse({ ...withoutLocation, requestId: id }),
    ).toMatchObject({ longitude: null, latitude: null })
    for (const position of [{ longitude: null }, { latitude: null }]) {
      expect(
        createJobSchema.safeParse({ ...fields, ...position, requestId: id })
          .success,
      ).toBe(false)
      expect(
        editJobSchema.safeParse({ ...fields, ...position, id, version: 1 })
          .success,
      ).toBe(false)
    }
  })
  it('normalizes valid input and rejects unusable coordinates', () => {
    expect(
      jobFieldsSchema.parse({ ...fields, title: '  ახალი მონტაჟი  ' }).title,
    ).toBe(fields.title)
    for (const position of [
      { longitude: 181 },
      { latitude: 86 },
      { latitude: NaN },
      { longitude: Infinity },
      { latitude: '41.7' },
    ])
      expect(
        jobFieldsSchema.safeParse({ ...fields, ...position }).success,
      ).toBe(false)
    expect(
      createJobSchema.safeParse({ ...fields, requestId: id }).success,
    ).toBe(true)
    expect(
      createJobSchema.safeParse({ ...fields, requestId: 'bad' }).success,
    ).toBe(false)
  })
  it('requires meaningful reasons for rejection and reopening', () => {
    for (const status of ['pending', 'rejected']) {
      expect(
        jobTransitionSchema.safeParse({ id, version: 1, status, note: '   ' })
          .success,
      ).toBe(false)
      expect(
        jobTransitionSchema.safeParse({
          id,
          version: 1,
          status,
          note: 'ობიექტი დაკეტილია',
        }).success,
      ).toBe(true)
    }
    expect(
      jobTransitionSchema.safeParse({
        id,
        version: 1,
        status: 'on_site',
        note: '',
      }).success,
    ).toBe(true)
    expect(
      jobTransitionSchema.safeParse({
        id,
        version: 0,
        status: 'on_site',
        note: '',
      }).success,
    ).toBe(false)
  })
  it('bounds URL search, filters, sort, page and selected pin', () => {
    expect(jobSearchSchema.parse({ page: '2' })).toEqual({
      ...jobsMonthRange(),
      q: '',
      status: 'all',
      kind: 'all',
      scope: 'all',
      sort: 'newest',
      page: 2,
      view: 'map',
    })
    for (const input of [
      { page: 0 },
      { page: 10001 },
      { status: 'invalid' },
      { sort: 'sql' },
      { q: 'ა'.repeat(101) },
      { pin: 'bad' },
      { view: 'unknown' },
    ])
      expect(jobSearchSchema.safeParse(input).success).toBe(false)
    const errors = jobFieldsSchema.safeParse({
      title: 9,
      address: 7,
      notes: null,
      kind: 'bad',
      longitude: null,
      latitude: 'bad',
    })
    expect(errors.success).toBe(false)
    if (!errors.success)
      for (const issue of errors.error.issues)
        expect(issue.message).toMatch(/[ა-ჰ]/)
  })
})
