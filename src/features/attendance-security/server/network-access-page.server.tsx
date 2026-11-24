import '@tanstack/react-start/server-only'
import { z } from 'zod'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  IconRefresh,
  IconShieldLock,
  IconShieldExclamation,
} from '@tabler/icons-react'
import {
  Card,
  CardHeader,
  CardDescription,
  CardFooter,
  CardContent,
} from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { APP_NAME } from '#/lib/app'
import { networkErrorDescription } from '#/lib/error-diagnostics'
import type { ErrorDiagnostic } from '#/lib/error-diagnostics'

// Access can fail before scripts, styles or images are served, so this document is self-contained.
const styles = `
:root { color-scheme: light dark; --background:#f7f7f7; --foreground:#262626; --card:#fff; --muted-foreground:#666; --border:#dedede; --primary:#303030; --primary-foreground:#fff; }
@media(prefers-color-scheme:dark) { :root { --background:#141414; --foreground:#ededed; --card:#1c1c1c; --muted-foreground:#aaa; --border:#383838; --primary:#ededed; --primary-foreground:#1c1c1c; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--background); color:var(--foreground); font-family:system-ui,sans-serif; }
main { min-height:100svh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:28px; padding:32px 20px; }
.brand { display:flex; align-items:center; gap:10px; font-size:18px; font-weight:600; }
.brand-mark { display:grid; place-items:center; width:36px; height:36px; border-radius:10px; background:var(--primary); color:var(--primary-foreground); font-weight:700; }
[data-slot=card] { width:100%; max-width:540px; overflow:hidden; border:1px solid var(--border); border-radius:16px; background:var(--card); box-shadow:0 1px 2px #00000008; }
[data-slot=card-header] { padding:32px 28px 28px; text-align:center; }
.symbol { display:grid; place-items:center; width:64px; height:64px; margin:0 auto 20px; border:1px solid var(--border); border-radius:18px; background:var(--background); }
.symbol svg { width:30px; height:30px; }
.code { margin:0 0 10px; color:var(--muted-foreground); font-size:12px; font-weight:600; letter-spacing:.08em; }
h1 { margin:0 0 16px; font-size:24px; font-weight:600; line-height:1.5; letter-spacing:-.025em; overflow-wrap:anywhere; }
[data-slot=card-description] { color:var(--muted-foreground); font-size:14px; line-height:1.9; }
[data-slot=card-content] { padding:0 28px 28px; }
.details { margin:0; padding:20px; border:1px solid var(--border); border-radius:10px; background:var(--background); font-size:13px; line-height:1.8; }
.details dt { margin-top:16px; color:var(--muted-foreground); }
.details dt:first-child { margin-top:0; }
.details dd { margin:4px 0 0; overflow-wrap:anywhere; }
.details code { font-family:ui-monospace,monospace; font-size:12px; }
.help { margin:16px 0 0; color:var(--muted-foreground); font-size:12px; line-height:1.9; }
[data-slot=card-footer] { display:flex; justify-content:center; padding:20px 28px; border-top:1px solid var(--border); background:var(--background); }
[data-slot=button] { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:10px 22px; border:1px solid var(--border); border-radius:8px; background:var(--primary); color:var(--primary-foreground); box-shadow:0 2px 0 #00000026,inset 0 1px 0 #ffffff26; text-decoration:none; font-size:14px; font-weight:600; line-height:1.5; }
[data-slot=button]:hover { opacity:.9; }
[data-slot=button]:active { box-shadow:inset 0 1px 2px #00000026; }
[data-slot=button]:focus-visible { outline:3px solid var(--foreground); outline-offset:4px; }
[data-slot=button] svg { width:18px; height:18px; }
@media(max-width:400px) { [data-slot=card-header] { padding:28px 20px 24px; } h1 { font-size:22px; } [data-slot=button] { width:100%; } }
`

export function networkAccessResponse(
  request: Request,
  status: 403 | 503,
  diagnostic?: {
    reference: string
    timestamp: string
    diagnostic: ErrorDiagnostic
  },
) {
  const blocked = status === 403
  const title = blocked
    ? 'ამ ქსელიდან წვდომა შეზღუდულია'
    : 'წვდომა დროებით მიუწვდომელია'
  const negotiation = z
    .object({
      accept: z.string().max(8192).nullable(),
      destination: z.string().max(64).nullable(),
      mode: z.string().max(64).nullable(),
    })
    .safeParse({
      accept: request.headers.get('accept'),
      destination: request.headers.get('sec-fetch-dest'),
      mode: request.headers.get('sec-fetch-mode'),
    })
  const pathname = new URL(request.url).pathname
  const internalRequest = /^\/(?:api|_serverFn)(?:\/|$)/.test(pathname)
  const document =
    !internalRequest &&
    (request.method === 'GET' || request.method === 'HEAD') &&
    negotiation.success &&
    (negotiation.data.mode === 'navigate' ||
      ['document', 'iframe', 'frame'].includes(
        negotiation.data.destination ?? '',
      ) ||
      (!negotiation.data.destination &&
        negotiation.data.accept?.includes('text/html')))
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Accept, Sec-Fetch-Dest, Sec-Fetch-Mode',
  })
  if (diagnostic) headers.set('X-Error-Reference', diagnostic.reference)
  if (status === 503) headers.set('Retry-After', '30')
  if (!document) {
    headers.set('Content-Type', 'text/plain; charset=utf-8')
    return new Response(
      request.method === 'HEAD'
        ? null
        : blocked
          ? 'ამ ქსელიდან წვდომა აკრძალულია.'
          : 'წვდომის შემოწმება დროებით მიუწვდომელია.',
      { status, headers },
    )
  }
  headers.set('Content-Type', 'text/html; charset=utf-8')
  headers.set(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  )
  const Icon = blocked ? IconShieldLock : IconShieldExclamation
  const markup = renderToStaticMarkup(
    <html lang="ka">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{`${title} | ${APP_NAME}`}</title>
        <style>{styles}</style>
      </head>
      <body>
        <main>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              T
            </span>
            {APP_NAME}
          </div>
          <Card>
            <CardHeader>
              <div className="symbol">
                <Icon aria-hidden="true" stroke={1.5} />
              </div>
              <p className="code">{status}</p>
              <h1>{title}</h1>
              <CardDescription>
                {blocked
                  ? 'სამუშაო სივრცე ამ ქსელიდან მიუწვდომელია. გამოიყენეთ დაშვებული ქსელი ან დაუკავშირდით ადმინისტრატორს.'
                  : 'სამუშაო სივრცე ვერ გაიხსნა, რადგან ქსელიდან წვდომის შემოწმება ვერ დასრულდა. ცოტა ხანში სცადეთ ხელახლა.'}
              </CardDescription>
            </CardHeader>
            {diagnostic && (
              <CardContent>
                <dl className="details">
                  <dt>მიზეზი</dt>
                  <dd>{networkErrorDescription(diagnostic.diagnostic)}</dd>
                  <dt>ტექნიკური კოდი</dt>
                  <dd>
                    <code>{diagnostic.diagnostic}</code>
                  </dd>
                  <dt>შეცდომის კოდი</dt>
                  <dd>
                    <code>{diagnostic.reference}</code>
                  </dd>
                </dl>
                <p className="help">
                  თუ პრობლემა განმეორდება, ადმინისტრატორს მიაწოდეთ შეცდომის
                  კოდი.
                </p>
              </CardContent>
            )}
            <CardFooter>
              <Button nativeButton={false} role="link" render={<a href="" />}>
                <IconRefresh aria-hidden="true" />
                ხელახლა ცდა
              </Button>
            </CardFooter>
          </Card>
        </main>
      </body>
    </html>,
  )
  return new Response(
    request.method === 'HEAD' ? null : `<!doctype html>${markup}`,
    { status, headers },
  )
}
