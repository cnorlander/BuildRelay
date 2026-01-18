# Volume Configuration Guide

BuildRelay needs access to your build files for distribution if you plan to distribute builds created locally. The default configuration maps the local `./builds` folder of this project, but for convenience you may want to change this volume to point to another folder, for example the build output folder for your game engine.

## Why Volume Mapping?

When you create a distribution job, BuildRelay reads the build file from the mounted volume, zips it (if needed), and uploads it to your configured channels.

## Edit `docker-compose.yml` Volumes Section

The volumes mapping in `docker-compose.yml` currently looks like:
```yaml
volumes:
  - ./builds:/builds
```

Change this to point to your build output folder:

## Configuration Examples

### Example 1: Game Engine Output

If you're using Unreal Engine or Unity and they output builds to a specific folder:

```yaml
volumes:
  - /home/user/UnrealProjects/MyGame/Binaries/Win64:/builds
  # or for Unity
  - /home/user/UnityProjects/MyGame/Builds:/builds
```

### Example 2: Central Build Folder

If you have a central folder where you manually place or organize builds:

```yaml
volumes:
  - /mnt/buildserver/releases:/builds
```

### Example 3: Windows with Docker Desktop

Docker Desktop on Windows (using WSL2 or Hyper-V) handles volume mapping differently. You can use either Windows paths or WSL2 paths:

**Option A: Windows Absolute Path (Recommended)**
```yaml
volumes:
  - C:\Users\YourUsername\Games\MyGameBuilds:/builds
```

**Option B: WSL2 Path (if using WSL2 backend)**
```yaml
volumes:
  - /mnt/c/Users/YourUsername/Games/MyGameBuilds:/builds
```

**Option C: Network Share**
```yaml
volumes:
  - //192.168.1.100/builds:/builds
```

Make sure:
- The path exists before running `docker compose up`
- Docker Desktop has permission to access the folder (check Settings > Resources > File Sharing in Docker Desktop)
- Use forward slashes `/` in the docker-compose.yml file, even on Windows
- The user running Docker Desktop has read access to the folder

### Example 4: Using Symlinks for Multiple Locations

If your builds are scattered across multiple locations on your computer, create a central folder with symlinks pointing to each build location. This allows BuildRelay to access all builds from one mount point.

**On Linux/Mac:**
```bash
# Create a central builds folder
mkdir -p ~/builds

# Create symlinks to each build location
ln -s /home/user/UnrealProjects/MyGame/Binaries/Win64 ~/builds/unrealengine-win
ln -s /home/user/Unity/MyGame/Builds ~/builds/unity-builds
ln -s /mnt/network/other-builds ~/builds/network-builds

# Then in docker-compose.yml:
# volumes:
#   - ~/builds:/builds
```

**On Windows (PowerShell as Administrator):**
```powershell
# Create a central builds folder
New-Item -ItemType Directory -Path "C:\builds" -Force

# Create symbolic links to build locations
cmd /c mklink /d "C:\builds\unrealengine" "C:\Users\YourUsername\UnrealProjects\MyGame\Binaries\Win64"
cmd /c mklink /d "C:\builds\unity" "C:\Users\YourUsername\UnityProjects\MyGame\Builds"
cmd /c mklink /d "C:\builds\network" "\\server\builds"

# Then in docker-compose.yml:
# volumes:
#   - C:\builds:/builds
```

Now when you create a distribution job, the builds dropdown will show:
```
- unrealengine-win/
- unity-builds/
- network-builds/
```

This approach is especially useful if:
- You have multiple game projects with separate build folders
- Different team members output builds to different locations
- You want to keep BuildRelay's configuration simple while accessing builds from many places

### Example 5: Network Path (Linux/Mac)

If you're on a Linux server or Mac with builds on a network share:

```yaml
volumes:
  - //server/builds:/builds
  # or for NFS
  - /mnt/nfs/builds:/builds
```

### Example 6: Development (Keep Default)

For local development, the default works fine:

```yaml
volumes:
  - ./builds:/builds
```

Then place your test builds in a `./builds` folder in the project root.

## Important Notes

- The path **inside the container** should always be `/builds` (on the right side of the colon)
- The path **on your host machine** (left side of the colon) should point to where your actual builds are stored
- Permissions: The Docker container runs as root, so ensure the host folder is readable
- On Linux, use absolute paths: `/home/user/builds` or `/mnt/builds`
- On Windows, Docker Desktop handles path translation automatically
- On Mac, ensure the path is shared in Docker Desktop's file sharing settings
- The `temp_build_path` in your `.env` should remain as `/tmp/builds` (temporary working directory inside the container)

## Verification

After updating the volumes, restart the containers:

```bash
docker compose down
docker compose up
```

Then create a test job to verify BuildRelay can see your build files. The build selection dropdown on the dashboard when creating a job should show files from your mounted folder.
