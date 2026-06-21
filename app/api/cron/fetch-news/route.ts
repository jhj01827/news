import { NextRequest, NextResponse } from 'next/server';
import { GET as fetchNewsGET } from '@/app/api/fetch-news/route';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return fetchNewsGET(req);
}
