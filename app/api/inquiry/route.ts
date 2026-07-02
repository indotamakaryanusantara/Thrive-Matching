import { fetchAppsScript } from '@/lib/apps-script';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await fetchAppsScript<{ ok?: boolean; inquiryId?: string; error?: string }>(
      'inquiry',
      { method: 'POST', body: { ...body, action: 'inquiry' } }
    );
    if (data.error) {
      return Response.json(data, { status: 400 });
    }
    return Response.json(data);
  } catch (err) {
    console.error('POST /api/inquiry', err);
    return Response.json({ error: 'Failed to save inquiry' }, { status: 503 });
  }
}
