import { z } from 'zod'
import { APP_NAME } from '#/lib/app'

const metadataSchema = z.object({
  status: z.number().optional(),
  code: z.string().optional(),
  name: z.string().optional(),
})

const causeSchema = metadataSchema.extend({
  cause: z.unknown().optional(),
  errors: z.array(z.unknown()).optional(),
})

const diagnosticMessages = {
  ECONNREFUSED:
    'მონაცემთა ბაზასთან კავშირი უარყოფილია. სერვისი შესაძლოა გამორთული იყოს.',
  ETIMEDOUT: 'მონაცემთა ბაზასთან დაკავშირების დრო ამოიწურა.',
  ENOTFOUND: 'მონაცემთა ბაზის სერვერის მისამართი ვერ მოიძებნა.',
  ECONNRESET: 'მონაცემთა ბაზასთან კავშირი მოულოდნელად გაწყდა.',
  '53300': 'მონაცემთა ბაზის კავშირების ლიმიტი ამოწურულია.',
  '57P01': 'მონაცემთა ბაზის სერვისი შეჩერებულია ან თავიდან ირთვება.',
  '08006': 'მონაცემთა ბაზასთან კავშირი ვერ დამყარდა.',
  '42P01':
    'მონაცემთა ბაზაში საჭირო ცხრილი ვერ მოიძებნა. ადმინისტრატორმა უნდა შეამოწმოს მიგრაციები.',
  '42703':
    'მონაცემთა ბაზის სტრუქტურა აპლიკაციას არ შეესაბამება. ადმინისტრატორმა უნდა შეამოწმოს მიგრაციები.',
  '28P01': 'მონაცემთა ბაზაში ავტორიზაცია ვერ მოხერხდა.',
  '3D000': 'მითითებული მონაცემთა ბაზა ვერ მოიძებნა.',
  DATABASE_NOT_CONFIGURED:
    'მონაცემთა ბაზასთან კავშირი კონფიგურირებული არ არის.',
  INVALID_CONFIGURATION_OR_INPUT:
    'წვდომის შემოწმებისთვის საჭირო კონფიგურაცია ან მონაცემები არასწორია.',
  UNCLASSIFIED:
    'წვდომის შემოწმებისას მოულოდნელი შეცდომა მოხდა. მიზეზის დასადგენად ადმინისტრატორს მიაწოდეთ შეცდომის კოდი.',
} as const

export type ErrorDiagnostic = keyof typeof diagnosticMessages

export function networkErrorDescription(diagnostic: ErrorDiagnostic) {
  return diagnosticMessages[diagnostic]
}

function classifyError(error: unknown): ErrorDiagnostic {
  const pending = [error]
  const seen = new Set<unknown>()
  // Drivers wrap failures in causes and AggregateErrors. Bound traversal, including cycles.
  for (let index = 0; index < pending.length && index < 32; index++) {
    const current = pending[index]
    if (seen.has(current)) continue
    seen.add(current)
    const parsed = causeSchema.safeParse(current)
    if (!parsed.success) continue
    const { code, name, cause, errors } = parsed.data
    if (code && Object.hasOwn(diagnosticMessages, code)) {
      return code as ErrorDiagnostic
    }
    if (name === 'ZodError') return 'INVALID_CONFIGURATION_OR_INPUT'
    if (cause) pending.push(cause)
    if (errors) pending.push(...errors.slice(0, 16))
  }
  return 'UNCLASSIFIED'
}

export function errorStatus(error: unknown) {
  const result = metadataSchema.safeParse(error)
  if (!result.success) return 500
  const { status, code, name } = result.data
  if (code === 'FORBIDDEN' || name === 'AuthorizationError') return 403
  switch (status) {
    case 401:
    case 403:
    case 404:
    case 429:
    case 503:
      return status
    default:
      return 500
  }
}

/** Never log the original error: provider messages and stacks can contain private data. */
export function reportError(
  source: 'route' | 'network-access' | 'database-pool',
  error: unknown,
  status = errorStatus(error),
) {
  const reference = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  const diagnostic = classifyError(error)
  console.error(`[${APP_NAME}]`, {
    source,
    reference,
    timestamp,
    status,
    diagnostic,
  })
  return { reference, timestamp, diagnostic }
}
