Live broadcasts use staff confirmation and a bounded time window. Provider links alone do not confirm whether a video is airing; this change does not add automatic provider detection or require new provider credentials.

1. Create a stream with its actual viewing link and schedule. Leave **This broadcast is airing now** unchecked while preparing a future service.
2. Once the provider is broadcasting, confirm that the start time has arrived and set a future end time in Malawi time. Use **Go live** on the stream detail page, or check **This broadcast is airing now** and confirm when saving the editor.
3. Use **End broadcast** as soon as broadcasting stops. This removes the website's live indicator/player and records the early end time. Stop the broadcast on its provider separately.
4. The website automatically stops presenting a stream as live at its end time. To continue beyond that time, update the end time and confirm the broadcast is still airing. Polling refreshes status every 30 seconds, with a local end-time cutoff and a 65-second limit on unrefreshed live status.

`/live` shows the current broadcast or a grey off-air/unavailable state. `/broadcasts` contains scheduled and past broadcasts. Existing `/streams/[slug]` recordings remain accessible; old `/live` library-filter URLs redirect to `/broadcasts` with their filters.

Both public and private live reads require an active record, `isLive: true`, a non-null start at or before now, and a non-null end strictly after now. New live writes also require an available platform link. Missing dates, future starts and expired windows cannot be switched live. Ending a legacy selection remains possible even when its dates need correction. The existing MEDIA authorization and audit logging apply to both actions. No database migration is required.

After building the API, review existing selected records on the server:

```bash
cd /var/www/api
node --env-file=.env scripts/audit-live-streams.cjs
```

Run this as the API service account with its normal environment/file access. The command only reads selected records and reports missing dates, invalid/expired windows, future selections and current windows that need confirmation against the provider. It never updates records or prints environment values. Use **End broadcast** for stale selections; retain their recording links. Review future selections before their scheduled start because older versions allowed selecting them in advance.

Deploy the API and frontend together, including the new `POST /streams/:id/end` route. No production records are changed by the implementation or fixture tests.
