import shutil
import os
import zipfile
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


def unzip_build(zip_path: str, job_id: str, stream: LogStream) -> str:
    """
    Extract a zip archive to a temporary directory.
    
    Args:
        zip_path: Path to the zip file
        job_id: ID of the job (used for naming temp directory)
        stream: LogStream instance for logging progress
    
    Returns:
        Path to the directory containing extracted files
    
    Raises:
        Exception: If extraction fails
    """
    temp_extract_dir = os.path.join(os.path.dirname(zip_path), f"extract_{job_id}")
    
    try:
        os.makedirs(temp_extract_dir, exist_ok=True)
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_extract_dir)
        stream.log(f"Successfully extracted zip to: {temp_extract_dir}")
        return temp_extract_dir
    except Exception as e:
        stream.log(f"Error extracting zip: {str(e)}", level="error")
        raise Exception(f"Error extracting zip: {str(e)}")
