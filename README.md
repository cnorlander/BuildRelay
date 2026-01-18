# BuildRelay

Service for distributing builds across multiple platforms and services.

## Work In Progress
USE AT YOUR OWN RISK: This app is a work in progress. Though there are production settings and instructions in this document several features and security measures are not yet implimented. Future updates to this repo are not garunteed to be 100% backwards compatible as of yet so please do not rely on this application yet if you are looking for seemless updates. 


## Planned Features
- [X] Next JS frontend for monitoring build status and kicking builds.
- [X] Python workers for handling CLI based build distribution.
- [X] Realtime logs for distribution.
- [X] Publish builds directly from the filesystem by triggering via frontend or REST API.
- [X] Publish builds by providing a URL to a zipped build.
- [ ] Publish builds by webhook from Unity DevOps.
- [X] Publish to any S3 compatible bucket or CDN.
- [ ] Offer encryption for builds published to the CDN.
- [X] Publish builds to Steam via SteamPipe.
- [ ] Publish builds to Meta.
- [ ] Publish builds to Google Drive.
- [ ] Publish builds to Itch.io.
- [X] Send new build notifications via Slack or Discord.

## Setup

1. Clone this repo.
2. Ensure Docker is installed on the machine you plan to deploy this on.
3. Copy the ```.env-example``` file and rename to ```.env```
4. Fill out the ```.env``` file. 
5. Configure volume mappings in `docker-compose.yml` to point to your build folders (see Volume Configuration below)
6. Run ```docker compose up```
7. Configure Steam Auth if you plan to push builds to steam. (Instructions below)
8. Login using the default credentials
9. Configure your channels for anywhere you might want to upload your builds to.
10. You are ready to distribute your first build!

### Volume Configuration

BuildRelay needs access to your build files for distribution if you plan to distrubute builds created locally. The default configuration maps a the local `./builds` folder of this project, but for convienence you may want to change this volume to point to another folder for example the build output folder for your game engine.

For detailed volume configuration instructions including examples for Windows Docker Desktop, game engines, network paths, and symlink setups, see [VOLUMES.md](VOLUMES.md).

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

## Configuring Channels

Channels define where your builds can be distributed. BuildRelay supports two types of channels: Steam and CDN.

### Creating a Steam Channel

Steam channels allow you to upload builds directly to Steam using SteamPipe. To create a Steam channel:

1. Navigate to the Distribution Dashboard
2. Click the "Channels" menu (or navigate to `/channels/steam`)
3. Click "Create Steam Channel"
4. Fill in the following fields:
   - **Label**: A friendly name for this channel (e.g., "Main Steam Branch")
   - **App ID**: Your Steam application ID (from Steamworks)
   - **Depot ID**: The depot ID for your build platform (from Steamworks)
   - **Depot Path**: The path your depot is in within your build. If your app only has a single depot chances are you can leave this field blank.
   - **Branch**: The Steam branch to publish. You will need to set this up in steamworks beforehand to (e.g., "default", "staging", "testing")

5. Click "Create Channel"

The Steam channel will now appear in the job creation form and can be selected when submitting builds.

**Note**: Before using Steam channels, ensure you have completed the Steam Auth Setup above.

### Creating a CDN Channel

CDN channels allow you to upload builds to S3-compatible storage services like AWS S3, Backblaze B2, DigitalOcean Spaces, or any other S3-compatible provider. To create a CDN channel:

1. Navigate to the Distribution Dashboard
2. Click the "Channels" menu (or navigate to `/channels/cdn`)
3. Click "Create CDN Channel"
4. Fill in the following fields:
   - **Label**: A friendly name for this channel (e.g., "AWS S3 Production")
   - **Bucket Name**: The S3 bucket name where builds will be uploaded
   - **Region**: The AWS region (e.g., "us-east-1") or your provider's equivalent
   - **Access Key ID**: Your S3 access key ID or equivalent
   - **Secret Access Key**: Your S3 secret access key or equivalent
   - **Endpoint**: (Optional) Custom S3 endpoint URL for non-AWS providers
   - **WIP NOT YET WORKING - Filename Format**: Template for uploaded file names (e.g., `{project}-{platform}-{date}.zip`) will currently keep the jobs UUID as the zip file name.
     - Available variables: `{project}`, `{platform}`, `{date}`, `{timestamp}`
   - **WIP NOT YET WORKING - Encryption**: Optional encryption for your build zips coming soon.
   - **Public**: Check if uploaded files should be publicly accessible.

5. Click "Create Channel"

The CDN channel will now appear in the job creation form and can be selected when submitting builds.

**Note**: After uploading to a CDN channel, the build page will display clickable download links for direct access to the uploaded files.

## Using Channels in Jobs

Once you have created Steam and/or CDN channels, they become available when creating distribution jobs:

1. Click "Create Job" on the Dashboard
2. Select your build, project name, description, and platform
3. In the "Channels" section, select one or more Steam channels and/or CDN channels
4. Click "Submit Job"

The job will process the build and upload it to all selected channels according to their configuration.
