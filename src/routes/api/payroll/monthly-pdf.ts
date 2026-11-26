import { createFileRoute } from '@tanstack/react-router'
import { monthlyPayrollPdfResponse } from '#/features/payroll/server/monthly-export.server'

export const Route = createFileRoute('/api/payroll/monthly-pdf')({
  server: {
    handlers: { GET: ({ request }) => monthlyPayrollPdfResponse(request) },
  },
})
