import shutil
import os
from libs.streams import LogStream

def zip_build(job_id: str, directory_path: str, stream: LogStream) -> str:
    """
    Create a zip archive of a build directory.
    
    Args:  
        job_id: ID of the job
        directory_path: Path to the build directory
        stream: LogStream instance for logging progress
    Returns:
        Path to the created zip file
    """
    # Use TEMP_BUILD_PATH from environment or default to /tmp/builds
    os.environ.get("TEMP_BUILD_PATH", "/tmp/builds")
    zip_path = f"/tmp/{job_id}.zip"

    # Make the zip archive
    try:
        shutil.make_archive(zip_path.replace('.zip', ''), 'zip', directory_path)
        stream.log(f"Successfully created zip file: {zip_path}")
    except Exception as e:
        stream.log(f"Error creating zip: {str(e)}", level="error")
        raise Exception(f"Error creating zip: {str(e)}")
    return zip_path
