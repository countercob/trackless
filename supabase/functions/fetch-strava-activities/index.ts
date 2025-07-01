// supabase/functions/fetch-strava-activities/index.ts
// @ts-nocheck

import { serve } from 'https://deno.land/x/sift/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// 1) Initialize Supabase
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// 2) Refresh Strava token
async function getStravaAccessToken(): Promise<string> {
  const refreshToken = Deno.env.get('STRAVA_REFRESH_TOKEN')!;
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     Deno.env.get('STRAVA_CLIENT_ID'),
      client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const j = await r.json();
  return j.access_token as string;
}

// 3) Fetch summaries & details
async function fetchSummaries(token: string) {
  const r = await fetch(
    'https://www.strava.com/api/v3/athlete/activities?per_page=30',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return r.json() as Promise<any[]>;
}
async function fetchDetails(id: number, token: string) {
  const r = await fetch(
    `https://www.strava.com/api/v3/activities/${id}?include_all_efforts=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return r.json();
}

// 4) Map to your runs table
function mapToRow(a: any) {
  console.log('DBG:', {
    id: a.id,
    avg_hr: a.average_heartrate,
    max_hr: a.max_heartrate,
    move: a.moving_time,
    elapsed: a.elapsed_time,
  });
  return {
    strava_workout_id:   a.id,
    start_date:          a.start_date,
    distance:            a.distance,
    average_speed:       a.average_speed,
    has_heartrate:       a.has_heartrate,
    average_heartrate:   a.has_heartrate ? a.average_heartrate : null,
    max_heartrate:       a.has_heartrate ? a.max_heartrate : null,
    moving_time:         a.moving_time,
    elapsed_time:        a.elapsed_time,
    elevation_gain:      a.total_elevation_gain,
    description:         a.description || '',
  };
}

// 5) Entrypoint: one async for ALL requests
serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Not Found', { status: 404 });
  }

  const token     = await getStravaAccessToken();
  const summaries = await fetchSummaries(token);

  for (const s of summaries) {
    const d = await fetchDetails(s.id, token);
    const row = mapToRow(d);
    const { error } = await supabase
      .from('runs')
      .upsert(row, { onConflict: ['strava_workout_id'] });
    if (error) console.error('Upsert error', error);
  }

  return new Response(JSON.stringify({ status: 'synced' }), { status: 200 });
});
