"""SteamCMD integration for uploading builds to Steam."""

import os
import subprocess
from typing import Dict, Any, Optional
from libs.streams import LogStream


# ===============================================================
# SteamCMD Integration
# ===============================================================

class SteamUploader:
    """Handles uploading builds to Steam using SteamPipe."""
    
    def __init__(self, stream: LogStream):
        """Initialize Steam uploader.
        
        Args:
            stream: LogStream instance for logging
        
        Note:
            Requires STEAM_USERNAME environment variable for SteamCMD login.
            Steam config is cached in /root/Steam Docker volume for reuse.
        """
        self.stream = stream
        self.steam_username = os.environ.get("STEAM_USERNAME", "")
    
    def _strip_ansi(self, text: str) -> str:
        """Remove ANSI escape codes from text.
        
        Removes color codes and formatting from SteamCMD output for cleaner logging.
        
        Args:
            text: Text potentially containing ANSI escape codes
        
        Returns:
            Text with ANSI codes removed
        """
        # Remove ANSI escape sequences like [0m, [1m, etc.
        import re
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_escape.sub('', text)
    
    def _extract_build_id(self, output: str) -> Optional[str]:
        """Extract build ID from SteamCMD output.
        
        Parses SteamCMD output to find the assigned build ID from the upload.
        Build IDs are logged by SteamCMD as "BuildID 12345".
        
        Args:
            output: SteamCMD output text
        
        Returns:
            Build ID if found, None otherwise
        """
        import re
        # Look for "BuildID 12345" pattern in SteamCMD output
        match = re.search(r'BuildID\s+(\d+)', output)
        if match:
            return match.group(1)
        return None
    
    def upload_build(self, app_id: str, vdf_path: str, branch: Optional[str] = None) -> Dict[str, Any]:
        """Upload build to Steam using SteamPipe.
        
        Executes SteamCMD with the VDF configuration to upload the build to Steam.
        Streams output in real-time and extracts the resulting Build ID from logs.
        
        Args:
            app_id: Steam App ID
            vdf_path: Path to the VDF configuration file (with SetLive if branch specified)
            branch: Optional branch name (for logging, already in VDF)
        
        Returns:
            dict with keys: app_id, build_id, branch_set, success, message
        
        Raises:
            Exception: If upload fails
        """
        try:
            # Validate steam username is set
            if not self.steam_username:
                raise ValueError("STEAM_USERNAME environment variable is required")
            
            self.stream.log(f"Starting SteamPipe upload for app {app_id}...")
            
            # Build steamcmd command with login and build execution
            cmd = [
                'steamcmd',
                '+login', self.steam_username,
                '+run_app_build', vdf_path,
                '+quit'
            ]
            
            # Log command (without showing password)
            self.stream.log(f"Executing: steamcmd ...")
            
            # Run steamcmd with real-time output streaming
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )
            
            # Stream output in real-time and capture for build ID extraction
            output_lines = []
            for line in iter(process.stdout.readline, ''):
                if line:
                    clean_line = self._strip_ansi(line.rstrip())
                    self.stream.log(clean_line)
                    output_lines.append(clean_line)
            
            # Wait for process completion
            return_code = process.wait()
            
            # Handle upload failure
            if return_code != 0:
                error_msg = f"SteamPipe upload failed with code {return_code}"
                self.stream.log(error_msg, level="error")
                raise Exception(error_msg)
            
            # Extract build ID from captured output
            full_output = '\n'.join(output_lines)
            build_id = self._extract_build_id(full_output)
            
            branch_set = None
            
            # Log results
            if build_id:
                self.stream.log(f"Extracted Build ID: {build_id}")
                if branch:
                    self.stream.log(f"Build {build_id} set live on branch '{branch}'")
                    branch_set = branch
                else:
                    self.stream.log("Build uploaded but not set live on any branch")
            else:
                self.stream.log("Warning: Could not extract Build ID from output", level="warning")
            
            self.stream.log(f"SteamPipe upload completed successfully for app {app_id}")
            
            # Return results
            return {
                'app_id': app_id,
                'build_id': build_id,
                'branch_set': branch_set,
                'success': True,
                'message': 'Build successfully uploaded to Steam'
            }
        
        except Exception as e:
            self.stream.log(f"Steam upload error: {str(e)}", level="error")
            raise
