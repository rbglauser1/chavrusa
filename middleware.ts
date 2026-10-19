import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, authToken } from './lib/auth';

export async function middleware(req: NextRequest) {
  if (!process.env.APP_PASSWORD) {
    return new NextResponse('APP_PASSWORD is not set. Add it in Vercel > Settings > Environment Variables, then redeploy.', { status: 500 });
  }
  const ok = req.cookies.get(AUTH_COOKIE)?.value === (await authToken());
  if (ok) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page, the login API, and static files.
  matcher: ['/((?!login|api/login|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)'],
};
