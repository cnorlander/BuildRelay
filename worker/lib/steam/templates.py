"""VDF templates for SteamPipe build configuration."""

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
