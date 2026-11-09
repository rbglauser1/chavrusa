import { NextResponse } from 'next/server';
import { balance, billingOn, markup } from '@/lib/credits';

export const runtime = 'nodejs';

export async function GET() {
  const { on } = await billingOn();
  try { return NextResponse.json({ on, markup: markup(), stripe: !!process.env.STRIPE_SECRET_KEY, ...(await balance()) }); }
  catch (e) { return NextResponse.json({ on, markup: markup(), stripe: !!process.env.STRIPE_SECRET_KEY, error: (e as Error).message }); }
}
