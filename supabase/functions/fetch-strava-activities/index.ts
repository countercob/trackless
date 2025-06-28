import { serve } from 'https://deno.land/x/sift/mod.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Initialize Supabase client with service role key
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Refresh Strava access token if necessary
async function getStravaAccessToken() {
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
  // TODO: Persist new refresh_token/data if you want
  return data.access_token as string;
}

// Fetch summary activities
async function fetchActivities(accessToken: string) {
  const res = await fetch(
    'https://www.strava.com/api/v3/athlete/activities?per_page=30',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return (await res.json()) as any[];
}

// Fetch detailed activity with all efforts
async function fetchActivityDetails(id: number, accessToken: string) {
  const url =
    `https://www.strava.com/api/v3/activities/${id}` +
    '?include_all_efforts=true';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  return await res.json();
}

// Map Strava activity to the "runs" table shape
function mapActivityToRunRow(act: any) {
  return {
    strava_workout_id: act.id,
    external_id: act.external_id,
    upload_id: act.upload_id,
    start_date: act.start_date,
    start_date_local: act.start_date_local,
    utc_offset: act.utc_offset,
    timezone: act.timezone,
    location_city: act.location_city,
    location_state: act.location_state,
    location_country: act.location_country,
    start_latlng: act.start_latlng,
    end_latlng: act.end_latlng,
    map_summary_polyline: act.map?.summary_polyline,
    moving_time: act.moving_time,
    elapsed_time: act.elapsed_time,
    distance: act.distance,
    average_speed: act.average_speed,
    max_speed: act.max_speed,
    average_pace: act.moving_time > 0 ? act.distance / act.moving_time : null,
    has_heartrate: act.has_heartrate,
    average_heartrate: act.has_heartrate ? act.average_heartrate : null,
    max_heartrate: act.has_heartrate ? act.max_heartrate : null,
    has_power: act.has_power,
    average_watts: act.has_power ? act.average_watts : null,
    max_watts: act.has_power ? act.max_watts : null,
    average_cadence: act.has_heartrate ? act.average_cadence : null,
    max_cadence: act.has_heartrate ? act.max_cadence : null,
    total_elevation_gain: act.total_elevation_gain,
    trainer: act.trainer,
    commute: act.commute,
    manual: act.manual,
    private: act.private,
    flagged: act.flagged,
    type: act.type,
    name: act.name,
    description: act.description,
    device_name: act.device_name,
    gear_id: act.gear_id,
    achievement_count: act.achievement_count,
    kudos_count: act.kudos_count,
    comment_count: act.comment_count,
    photos: act.photos,
    laps: act.laps,
    splits_metric: act.splits_metric,
    splits_standard: act.splits_standard,
    elev_high: act.elev_high,
    elev_low: act.elev_low,
    embed_token: act.embed_token,
    raw_data: act,
  };
}

// Entry point
serve(async () => {
  const token = await getStravaAccessToken();
  const activities = await fetchActivities(token);

  for (const summary of activities) {
    const detailed = await fetchActivityDetails(summary.id, token);
    const row = mapActivityToRunRow(detailed);

    const { error } = await supabase
      .from('runs')
      .upsert(row, { onConflict: ['strava_workout_id'] });

    if (error) console.error('Upsert error for', summary.id, error);
  }

  return new Response(JSON.stringify({ status: 'synced' }), { status: 200 });
});
