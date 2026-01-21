import os
import requests
from typing import Dict, Any, Optional
from lib.streams import LogStream


def download_unity_cloud_artifact(
    job: Dict[str, Any], 
    stream: LogStream
) -> str:
    """
    Download the primary artifact from a Unity Cloud Build job.
    
    Extracts the artifact URL from the metadata (the original webhook payload)
    and downloads it to a temporary directory.
    
    Args:
        job: The job dictionary containing metadata with artifact information
        stream: LogStream instance for logging progress
    
    Returns:
        Path to the downloaded artifact file
    
    Raises:
        Exception: If artifact not found, download fails, or extraction fails
    """
    metadata = job.get("metadata", {})
    links = metadata.get("links", {})
    artifacts = links.get("artifacts", [])
    
    # Find the primary artifact (the .ZIP file)
    primary_artifact = None
    for artifact in artifacts:
        if artifact.get("primary"):
            artifact_files = artifact.get("files", [])
            if artifact_files:
                primary_artifact = artifact_files[0]
                break
    
    if not primary_artifact:
        raise Exception("No primary artifact found in Unity Cloud Build metadata")
    
    artifact_url = primary_artifact.get("href")
    artifact_filename = primary_artifact.get("filename")
    
    if not artifact_url or not artifact_filename:
        raise Exception("Primary artifact missing URL or filename")
    
    # Determine temp directory
    temp_path = os.environ.get("TEMP_BUILD_PATH", "/tmp")
    artifact_path = os.path.join(temp_path, f"unity_cloud_{job['id']}_{artifact_filename}")
    
    try:
        stream.log(f"Downloading Unity Cloud Build artifact: {artifact_filename}")
        
        # Download the artifact with streaming to handle large files
        response = requests.get(artifact_url, stream=True, timeout=300)
        response.raise_for_status()
        
        # Write to disk
        with open(artifact_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        stream.log(f"Successfully downloaded artifact to: {artifact_path}")
        return artifact_path
        
    except requests.exceptions.RequestException as e:
        raise Exception(f"Failed to download Unity Cloud artifact: {str(e)}")
    except IOError as e:
        raise Exception(f"Failed to save artifact to disk: {str(e)}")
