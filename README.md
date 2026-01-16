Service for distributing builds across multiple platforms and services.

Planned Features:
- [X] Next JS frontend for monitoring build status and kicking builds.
- [X] Python workers for handling CLI based build distribution.
- [X] Realtime logs for distribution.
- [ ] Publish builds directly from the filesystem by triggering via frontend or REST API.
- [ ] Publish builds by providing a URL to a zipped build.
- [ ] Publish builds by webhook from Unity DevOps.
- [X] Publish to any S3 compatible bucket or CDN.
- [X] Publish builds to Steam via SteamPipe.
- [ ] Publish builds to Meta.
- [ ] Publish builds to Google Drive.
- [ ] Send new build notifications via Slack or Discord.

## Steam Integration

BuildRelay now supports uploading builds to Steam using SteamPipe. This feature automatically generates VDF configuration files and streams the SteamPipe upload process in real-time.

### Steam Setup

**Step 1: Start the containers**
```bash
docker compose up
```

**Step 2: Log in to the worker container**
```bash
docker compose exec workers bash
```

**Step 3: Login to Steam with SteamCMD**
```bash
steamcmd +login your_steam_username +quit
```

Enter your Steam password when prompted. SteamCMD will cache your login token in the `/steamcmd/config` volume.

**Step 4: Exit the container**
```bash
exit
```

Your login is now cached and will persist across container restarts. You only need to do this once!

### Why No Environment Credentials?

This approach is more secure than storing credentials in `.env` because:
- **No plain-text credentials** stored in version control or environment
- **Login token cached** in a Docker volume, not transmitted each time
- **Single authentication** required - you log in once, then it's cached
- **Steam Guard friendly** - you only deal with Steam Guard during initial login

### Job Structure for Steam Builds

Include a `steam_build` object in your job to upload to Steam:

```json
{
  "id": "unique-job-id",
  "ingestPath": "builds/my-game",
  "absoluteIngestPath": "/app/builds/my-game",
  "steam_build": {
    "app_id": "1234567",
    "beta_channel": "public",
    "depots": [
      {
        "id": "1234568",
        "path": "."
      },
      {
        "id": "1234569",
        "path": "content"
      }
    ]
  }
}
```

#### Steam Build Configuration Fields

- **app_id** (required): Your Steam App ID
- **depots** (required): Array of depot configurations
  - **id**: Depot ID
  - **path**: Relative path within the build directory
- **beta_channel** (optional): Beta channel name to set live (e.g., "public", "beta", "staging")

### How Steam Upload Works

1. Worker receives job with `steam_build` configuration
2. Generates SteamPipe VDF configuration file
3. Runs `steamcmd` with the VDF file
4. Streams all SteamPipe output to the real-time log
5. Optionally sets the build live on specified beta channel
6. Stores upload result in job data