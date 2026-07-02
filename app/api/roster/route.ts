import { fetchAppsScript } from '@/lib/apps-script';

export const dynamic = 'force-dynamic';

type RosterResponse = {
  therapists?: unknown[];
  error?: string;
};

export async function GET() {
  try {
    const data = await fetchAppsScript<RosterResponse>('roster');
    return Response.json({ therapists: data.therapists ?? [] });
  } catch (err) {
    console.error('GET /api/roster', err);
    return Response.json(
      { therapists: [], error: 'Roster unavailable — using embedded fallback in app' },
      { status: 503 }
    );
  }
}
