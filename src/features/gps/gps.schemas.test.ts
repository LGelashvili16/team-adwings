import { expect, it } from 'vitest'
import { gpsCreateDeviceSchema, gpsSaveSchema } from './gps.schemas'

const device = {
  name: 'სატესტო ტრეკერი',
  reportedId: '009590038494',
  enabled: true,
}

it.each([undefined, '', '   ', '+995', '+995   '])(
  'rejects a missing mobile number for a new device (%s)',
  (phone) => {
    expect(gpsCreateDeviceSchema.safeParse({ ...device, phone }).success).toBe(
      false,
    )
    expect(
      gpsSaveSchema.safeParse({ ...device, phone, id: null, version: null })
        .success,
    ).toBe(false)
  },
)

it('normalizes a valid mobile number when creating a device', () => {
  expect(
    gpsSaveSchema.parse({
      ...device,
      phone: '555 12 34 56',
      id: null,
      version: null,
    }).phone,
  ).toBe('+995 555 12 34 56')
})

it('preserves optional phone numbers for existing devices', () => {
  expect(
    gpsSaveSchema.safeParse({
      ...device,
      phone: '',
      id: '019abb95-5882-78b2-94c1-83d1093b44ca',
      version: 1,
    }).success,
  ).toBe(true)
})
