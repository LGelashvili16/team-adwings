import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'
import { reportError } from '#/lib/error-diagnostics'

const GLOBAL_SENSITIVE_QUERY_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'confirmpassword',
])
const AUTH_SENSITIVE_QUERY_KEYS = new Set(['identifier', 'code'])
const CREDENTIAL_PAGE_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/reset-password',
  '/settings/security',
])

function isSensitiveQueryKey(pathname: string, key: string) {
  const lower = key.toLowerCase()
  if (GLOBAL_SENSITIVE_QUERY_KEYS.has(lower)) return true
  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    return AUTH_SENSITIVE_QUERY_KEYS.has(lower)
  }
  return false
}

function redirectWithoutCredentials(url: URL) {
  const cleaned = new URLSearchParams()
  for (const [key, value] of url.searchParams) {
    if (!isSensitiveQueryKey(url.pathname, key)) {
      cleaned.append(key, value)
    }
  }
  const safePath = `/${url.pathname.replace(/^\/+/, '')}`
  const query = cleaned.toString()
  return new Response(null, {
    status: 303,
    headers: {
      location: query ? `${safePath}?${query}` : safePath,
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
    },
  })
}

export function credentialRequestGuard(request: Request): Response | null {
  const url = new URL(request.url)
  if (
    url.pathname === '/api' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_serverFn')
  ) {
    return null
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (!url.search) return null
    for (const key of url.searchParams.keys()) {
      if (isSensitiveQueryKey(url.pathname, key)) {
        return redirectWithoutCredentials(url)
      }
    }
    return null
  }
  const normalizedPath = url.pathname.replace(/\/+$/, '') || '/'
  if (request.method === 'POST' && CREDENTIAL_PAGE_PATHS.has(normalizedPath)) {
    return redirectWithoutCredentials(url)
  }
  return null
}

const csrfMiddleware = createCsrfMiddleware({
  filter: ({ handlerType }) => handlerType === 'serverFn',
  failureResponse: () => new Response('მოთხოვნა დაბლოკილია.', { status: 403 }),
})

const networkMiddleware = createMiddleware().server(
  async ({ request, next }) => {
    const { networkAccessResponse } =
      await import('#/features/attendance-security/server/network-access-page.server')
    try {
      const { currentRequestIp, networkAllowed } =
        await import('#/features/attendance-security/server/network.server')
      if (!(await networkAllowed(currentRequestIp(request))))
        return networkAccessResponse(request, 403)
    } catch (error) {
      const diagnostic = reportError('network-access', error, 503)
      return networkAccessResponse(request, 503, diagnostic)
    }
    const credentialRedirect = credentialRequestGuard(request)
    if (credentialRedirect) return credentialRedirect
    return next()
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, networkMiddleware],
}))
