import '@tanstack/react-start/server-only'
import { readActorFromHeaders } from '#/lib/auth/session.server'
import { assertPermissions } from '#/lib/authorization/access'
import { AuthorizationError } from '#/lib/authorization/authorization-error'
import { monthlyExportSchema } from '../monthly.schemas'
import {
  MonthlyPayrollError,
  readMonthlyPayroll,
} from './monthly.service.server'

const privateHeaders = { 'Cache-Control': 'private, no-store' }

export async function monthlyPayrollPdfResponse(request: Request) {
  const fail = (message: string, status: number) =>
    new Response(message, { status, headers: privateHeaders })

  try {
    const actor = await readActorFromHeaders(request.headers, true)
    if (!actor) return fail('გთხოვთ, გაიაროთ ავტორიზაცია.', 401)
    assertPermissions(actor, ['manage.access', 'payroll.read.all'])
    const input = monthlyExportSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    )
    if (!input.success) return fail(input.error.issues[0].message, 400)

    const report = await readMonthlyPayroll(actor, input.data, true)
    const { streamMonthlyPayrollPdf } = await import('./monthly-pdf.server')
    return new Response(streamMonthlyPayrollPdf(report), {
      headers: {
        ...privateHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="payroll-${report.month}-${report.period}.pdf"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return fail(error.message, 403)
    if (error instanceof MonthlyPayrollError) return fail(error.message, 422)
    return fail('უწყისის ექსპორტი ვერ შესრულდა. სცადეთ ხელახლა.', 500)
  }
}
