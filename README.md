Service for distributing builds across multiple platforms and services.

Planned Features:
- [X] Next JS frontend for monitoring build status and kicking builds.
- [X] Python workers for handling CLI based build distribution.
- [X] Realtime logs for distribution.
- [ ] Publish builds directly from the filesystem by triggering via frontend or REST API.
- [X] Publish builds by providing a URL to a zipped build.
- [ ] Publish builds by webhook from Unity DevOps.
- [X] Publish to any S3 compatible bucket or CDN.
- [X] Publish builds to Steam via SteamPipe.
- [ ] Publish builds to Meta.
- [ ] Publish builds to Google Drive.
- [X] Send new build notifications via Slack or Discord.

## Setup

1. Clone this repo.
2. Ensure Docker is installed on the machine you plan to deploy this on.
3. Copy the ```.env-example``` file and rename to ```.env```
4. Fill out the ```.env``` file. 
5. Run ```docker compose up```
6. Configure Steam Auth if you plan to push builds to steam. (Instructions below)
7. Login using the default credentials
8. Configure your channels for anywhere you might want to upload your builds to.

## Note for Production Use

- You likely want to set this up behind an NGINX proxy w/ SSL. I will probably include a config for one at some point in this project. 
- You likely want to change all the default passwords and setup SSL for Valkey.
- You likely want to run the webapp server not in dev mode.

## Steam Integration

BuildRelay now supports uploading builds to Steam using SteamPipe. This feature automatically generates VDF configuration files and can upload and set your build live on a branch if you wish. If you wish to use this feature you will need to complete the steam authentication setup below

### Steam Auth Setup

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
steamcmd +login your_steam_username + quit
```

Enter your Steam password when prompted. You may also be asked to verify with Steam Guard, SteamCMD will cache your login token provided you have a volume setup for it.

**Step 4: Exit the container**
```bash
exit
```

Your login is now cached and will persist across container restarts. You only need to do this once!
