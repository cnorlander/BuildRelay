"""Utilities for Steam build preparation and multi-channel upload orchestration."""

import os
from typing import Dict, Any, Optional
from lib.streams import LogStream
from lib.zip import unzip_build
from .builder import SteamVDFBuilder
from .uploader import SteamUploader



def prepare_steam_build(job: Dict[str, Any], stream: LogStream) -> str:
    """Prepare build directory for Steam upload (unzip if needed).
    
    Determines if the ingest path is a file or directory and prepares it for
    Steam upload. If it's a zip file, extracts to temp directory. Otherwise
    returns the directory path.
    
    Args:
        job: The job dictionary containing ingest path information
        stream: LogStream instance for logging progress
    
    Returns:
        Path to the directory containing the build for Steam upload
    
    Raises:
        Exception: If the path does not exist or unzip fails
    """
    absolute_build_path: Optional[str] = job.get("absoluteIngestPath")
    stream.log(f"Preparing build for Steam upload from {job['ingestPath']}...")

    # Validate path exists
    if not absolute_build_path or not os.path.exists(absolute_build_path):
        stream.log(f"Path does not exist: {absolute_build_path}", level="error")
        raise Exception(f"Build path does not exist: {absolute_build_path}")
    
    # If already a directory, return as-is
    if os.path.isdir(absolute_build_path):
        stream.log(f"Found directory: {absolute_build_path}")
        return absolute_build_path
    
    # If a file, check if it's a zip and extract if needed
    elif os.path.isfile(absolute_build_path):
        if absolute_build_path.lower().endswith('.zip'):
            stream.log(f"Found zip file: {absolute_build_path}, extracting to temp directory...")
            return unzip_build(absolute_build_path, job['id'], stream)
        else:
            # Single non-zip file, use parent directory
            stream.log(f"Found single file (not zip): {absolute_build_path}, using parent directory")
            return os.path.dirname(absolute_build_path)
    else:
        raise Exception(f"Invalid path: {absolute_build_path}")



def handle_steam_upload(job: Dict[str, Any], file_path: str, stream: LogStream) -> Dict[str, Any]:
    """Handle Steam build uploads for all configured Steam channels.
    
    Orchestrates the complete Steam upload process for multiple channels.
    For each channel: generates VDF config, uploads via SteamCMD, and tracks results.
    All channels share the same prepared build to avoid redundant operations.
    
    Args:
        job: The job dictionary containing steam_channels array with app IDs and depots
        file_path: Path to the prepared build directory
        stream: LogStream instance for logging progress
    
    Returns:
        dict with keys: success (bool), channels_uploaded (int)
    
    Raises:
        Exception: If any Steam upload fails
    """
    steam_channels: list = job.get("steam_channels", [])
    
    # Validate channels are configured
    if not steam_channels:
        stream.log("No Steam channels configured for this job", level="warning")
        return {"success": False, "message": "No Steam channels configured"}
    
    results = []
    
    try:
        # Process each Steam channel
        for channel in steam_channels:
            stream.log(f"Preparing Steam upload to channel '{channel.get('label')}' for app {channel.get('appId')}...")
            
            # Extract channel configuration
            app_id: str = channel.get("appId")
            depots: list = channel.get("depots", [])
            branch: Optional[str] = channel.get("branch")
            
            # Validate required fields
            if not app_id or not depots:
                raise ValueError(f"Steam channel '{channel.get('label')}' must include 'appId' and 'depots'")
            
            # Generate VDF configuration file for this channel
            vdf_builder = SteamVDFBuilder(app_id, depots, stream)
            vdf_path: str = vdf_builder.build_vdf(file_path, job.get("description"), branch)
            
            # Upload build to Steam using generated VDF
            uploader = SteamUploader(stream)
            result = uploader.upload_build(app_id, vdf_path, branch)
            
            # Track result for this channel
            results.append({
                "channel": channel.get("label"),
                "app_id": app_id,
                "result": result
            })
        
        # Store results in job object
        job["steam_results"] = results
        return {"success": True, "channels_uploaded": len(results)}
    
    except Exception as e:
        stream.log(f"Steam upload failed: {str(e)}", level="error")
        raise
