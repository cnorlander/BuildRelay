import os
import subprocess
import json
from typing import Dict, Any, Optional, List
from libs.streams import LogStream

# VDF Template for SteamPipe builds
VDF_TEMPLATE = '''\"AppBuild\"
{{
    \"AppID\" \"{app_id}\"
    \"Desc\"  \"{description}\"
{set_live}
    \"Depots\"
    {{
{depots}
    }}
}}'''

DEPOT_TEMPLATE = '''        \"{depot_id}\"
        {{
            \"ContentRoot\" \"{content_root}\"

            \"FileMapping\"
            {{
                \"LocalPath\" \"*\"
                \"DepotPath\" \".\"
                \"Recursive\" \"1\"
            }}
        }}'''

class SteamVDFBuilder:
    """Builds SteamPipe VDF configuration files for depot uploads."""
    
    def __init__(self, app_id: str, depots: list, stream: LogStream):
        """Initialize VDF builder.
        
        Args:
            app_id: Steam App ID
            depots: List of depot configurations
            stream: LogStream instance for logging
        """
        self.app_id = app_id
        self.depots = depots
        self.stream = stream
    
    def build_vdf(self, build_path: str, description: Optional[str] = None, branch: Optional[str] = None) -> str:
        """Generate SteamPipe VDF configuration file.
        
        Args:
            build_path: Path to the build directory
            description: Optional build description
            branch: Optional branch name to set live on
        
        Returns:
            Path to the generated VDF file
        
        Raises:
            ValueError: If VDF generation fails
        """
        try:
            self.stream.log(f"Generating SteamPipe VDF for app {self.app_id}...")
            
            # Build depot sections
            depot_sections = []
            for depot in self.depots:
                depot_id = depot.get('id')
                depot_path = depot.get('path', '.')
                content_root = f"{build_path}/{depot_path}"
                
                depot_content = DEPOT_TEMPLATE.format(
                    depot_id=depot_id,
                    content_root=content_root
                )
                depot_sections.append(depot_content)
            
            # Join depot sections with newlines
            depots_str = '\n'.join(depot_sections)
            
            # Use provided description or default
            desc = description if description else 'Build from BuildRelay'
            
            # Add SetLive parameter if branch is specified
            set_live_str = f'    \"SetLive\" \"{branch}\"\n' if branch else ''
            
            # Fill main template
            vdf_content = VDF_TEMPLATE.format(
                app_id=self.app_id,
                depots=depots_str,
                description=desc,
                set_live=set_live_str
            )
            
            # Write VDF file
            vdf_path = f"/tmp/{self.app_id}_build.vdf"
            with open(vdf_path, 'w') as f:
                f.write(vdf_content)
            
            self.stream.log(f"VDF file generated: {vdf_path}")
            return vdf_path
        
        except Exception as e:
            self.stream.log(f"Error generating VDF: {str(e)}", level="error")
            raise ValueError(f"VDF generation failed: {str(e)}")
    
class SteamUploader:
    """Handles uploading builds to Steam using SteamPipe."""
    
    def __init__(self, stream: LogStream):
        """Initialize Steam uploader.
        
        Args:
            stream: LogStream instance for logging
        
        Note:
            Requires STEAM_USERNAME environment variable for login.
            Steam config is cached in /root/Steam Docker volume.
        """
        self.stream = stream
        self.steam_username = os.environ.get("STEAM_USERNAME", "")
    
    def _strip_ansi(self, text: str) -> str:
        """Remove ANSI escape codes from text.
        
        Args:
            text: Text potentially containing ANSI codes
        
        Returns:
            Text with ANSI codes removed
        """
        # Remove ANSI escape sequences like [0m, [1m, etc.
        import re
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_escape.sub('', text)
    
    def _extract_build_id(self, output: str) -> Optional[str]:
        """Extract build ID from SteamCMD output.
        
        Args:
            output: SteamCMD output text
        
        Returns:
            Build ID if found, None otherwise
        """
        import re
        # Look for "Successfully finished AppID ... build (BuildID 12345)."
        match = re.search(r'BuildID\s+(\d+)', output)
        if match:
            return match.group(1)
        return None
    
    def upload_build(self, app_id: str, vdf_path: str, branch: Optional[str] = None) -> Dict[str, Any]:
        """Upload build to Steam using SteamPipe.
        
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
            if not self.steam_username:
                raise ValueError("STEAM_USERNAME environment variable is required")
            
            self.stream.log(f"Starting SteamPipe upload for app {app_id}...")
            
            # Build steamcmd command with login and build in one call
            cmd = [
                'steamcmd',
                '+login', self.steam_username,
                '+run_app_build', vdf_path,
            ]
            
            cmd.append('+quit')
            
            # Run steamcmd with real-time output
            self.stream.log(f"Executing: steamcmd ...")
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
            
            return_code = process.wait()
            
            if return_code != 0:
                error_msg = f"SteamPipe upload failed with code {return_code}"
                self.stream.log(error_msg, level="error")
                raise Exception(error_msg)
            
            # Extract build ID from output
            full_output = '\n'.join(output_lines)
            build_id = self._extract_build_id(full_output)
            
            branch_set = None
            
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
