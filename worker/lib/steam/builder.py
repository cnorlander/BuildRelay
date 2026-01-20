"""Steam VDF configuration builder for SteamPipe uploads."""

import os
from typing import Optional
from libs.streams import LogStream
from .templates import VDF_TEMPLATE, DEPOT_TEMPLATE


# ===============================================================
# VDF Configuration Builder
# ===============================================================

class SteamVDFBuilder:
    """Builds SteamPipe VDF configuration files for depot uploads."""
    
    def __init__(self, app_id: str, depots: list, stream: LogStream):
        """Initialize VDF builder.
        
        Args:
            app_id: Steam App ID for this build
            depots: List of depot configurations with id and path
            stream: LogStream instance for logging
        """
        self.app_id = app_id
        self.depots = depots
        self.stream = stream
    
    def build_vdf(self, build_path: str, description: Optional[str] = None, branch: Optional[str] = None) -> str:
        """Generate SteamPipe VDF configuration file.
        
        Creates the VDF configuration that SteamPipe uses to upload the build.
        Includes app ID, depots, and optional SetLive parameter for branching.
        
        Args:
            build_path: Path to the build directory
            description: Optional build description (default: 'Build from BuildRelay')
            branch: Optional branch name to set live on
        
        Returns:
            Path to the generated VDF file at /tmp/{app_id}_build.vdf
        
        Raises:
            ValueError: If VDF generation fails
        """
        try:
            self.stream.log(f"Generating SteamPipe VDF for app {self.app_id}...")
            
            # Build depot sections from configuration
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
            
            # Join depot sections with newlines for readability
            depots_str = '\n'.join(depot_sections)
            
            # Use provided description or default
            desc = description if description else 'Build from BuildRelay'
            
            # Add SetLive parameter if branch is specified
            set_live_str = f'    \"SetLive\" \"{branch}\"\n' if branch else ''
            
            # Fill main VDF template with all values
            vdf_content = VDF_TEMPLATE.format(
                app_id=self.app_id,
                depots=depots_str,
                description=desc,
                set_live=set_live_str
            )
            
            # Write VDF file to temp directory
            vdf_path = f"/tmp/{self.app_id}_build.vdf"
            with open(vdf_path, 'w') as f:
                f.write(vdf_content)
            
            self.stream.log(f"VDF file generated: {vdf_path}")
            return vdf_path
        
        except Exception as e:
            self.stream.log(f"Error generating VDF: {str(e)}", level="error")
            raise ValueError(f"VDF generation failed: {str(e)}")
