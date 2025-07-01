// File: supabase/functions/fetch-strava-activities/index.ts
// @ts-nocheck
import { serve } from 'https://deno.land/x/sift/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Initialize Supabase client with service role key
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Refresh Strava access token
async function getStravaAccessToken(): Promise<string> {
  const refreshToken = Deno.env.get('STRAVA_REFRESH_TOKEN')!;
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('STRAVA_CLIENT_ID'),
      client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  return data.access_token as string;
}

// Fetch a page of recent activities
async function fetchActivities(token: string) {
  const res = await fetch(
    'https://www.strava.com/api/v3/athlete/activities?per_page=30',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json() as Promise<any[]>;
}

// Fetch full details for one activity
async function fetchActivityDetails(id: number, token: string) {
  const url = `https://www.strava.com/api/v3/activities/${id}?include_all_efforts=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

// Map Strava JSON to your Supabase `runs` table columns
function mapActivityToRunRow(act: any) {
  console.log('DBG:', {
    id: act.id,
    has_heartrate:        act.has_heartrate,
    average_heartrate:    act.average_heartrate,
    max_heartrate:        act.max_heartrate,
    moving_time:          act.moving_time,
    elapsed_time:         act.elapsed_time,
    total_elevation_gain: act.total_elevation_gain,
    description:          act.description,
  });

  return {
    strava_workout_id:    act.id,
    start_date:           act.start_date,
    distance:             act.distance,
    average_speed:        act.average_speed,
    average_pace:         act.moving_time > 0 ? act.distance / act.moving_time : null,
    has_heartrate:        act.has_heartrate,
    average_heartrate:    act.has_heartrate ? act.average_heartrate : null,
    max_heartrate:        act.has_heartrate ? act.max_heartrate : null,
    elevation_gain:       act.total_elevation_gain,
    moving_time:          act.moving_time,
    elapsed_time:         act.elapsed_time,
    description:          act.description || '',
  };
}

// **ENTRYPOINT**: catch every POST on any path
serve({
  'POST /:rest*': async () => {
    const token     = await getStravaAccessToken();
    const summaries = await fetchActivities(token);

    for (const summary of summaries) {
      const detailed = await fetchActivityDetails(summary.id, token);
      const row      = mapActivityToRunRow(detailed);
      const { error } = await supabase
        .from('runs')
        .upsert(row, { onConflict: ['strava_workout_id'] });
      if (error) console.error('Upsert error for', summary.id, error);
    }

    return new Response(JSON.stringify({ status: 'synced' }), { status: 200 });
  }
});
