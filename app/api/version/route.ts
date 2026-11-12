import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Which version of the app is live (the git commit Vercel built). The app checks it when it comes back to the screen,
// and offers to update when it has changed (components/UpdateBar.tsx).
export async function GET() {
  return NextResponse.json({ v: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? 'dev' }, { headers: { 'Cache-Control': 'no-store' } });
}
