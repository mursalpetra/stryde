# Calendar and actual-workout regression checks

- Launch, Today navigation and safe app resume focus today's Asia/Shanghai date, even when local/cloud data contains an older browsed week.
- Week/month browsing remains intentional during an open session. Active workout forms, timers and unsaved entries are not discarded on resume.
- Calendar dates distinguish the original planned session, any saved prescription, and completed actual activities. Recovery is not an unlogged missed workout.
- Extra Run automatically checks the selected Shenzhen date in the signed-in user's Strava account; imported activity IDs are not duplicated as manual runs.
- Empty results, a missing connection, an offline request and a rate limit are distinct states; manual logging stays available.
- Selecting a strength preset fills the movement list and suggested sets/load. Users can edit/remove/add movements, including Custom exercise.
- Suggested values are not completed records: users explicitly confirm or edit actual performance before saving.
- All date and preset changes preserve existing workout data, unit distinctions, custom IDs and private photo/auth settings.
