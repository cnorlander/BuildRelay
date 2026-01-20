"""Notification service for sending job status updates to Slack and Discord.

This module provides a centralized way to notify external services (Slack, Discord)
about build distribution job completions and failures. Webhooks are configured via
environment variables (SLACK_WEBHOOK_URL and DISCORD_WEBHOOK_URL).
"""

import os
import requests
import json
from typing import Optional, Dict, Any
from datetime import datetime


class NotificationService:
    """Send notifications to Slack and Discord webhooks."""
    

    def __init__(self):
        """Initialize notification service with webhook URLs from environment.
        
        Reads webhook URLs from SLACK_WEBHOOK_URL and DISCORD_WEBHOOK_URL environment
        variables. If no webhooks are configured, notifications will be silently skipped.
        """
        # Load webhook URLs from environment, default to empty string and strip whitespace
        self.slack_webhook = (os.environ.get("SLACK_WEBHOOK_URL", "") or "").strip()
        self.discord_webhook = (os.environ.get("DISCORD_WEBHOOK_URL", "") or "").strip()
        
        # Log which notification services are available
        if self.slack_webhook:
            print(f"✓ Slack notifications enabled")
        if self.discord_webhook:
            print(f"✓ Discord notifications enabled")
    

    def send_job_notification(self, job: Dict[str, Any], status: str, error: Optional[str] = None) -> None:
        """Send notification about job completion or failure to all configured services.
        
        This is the main entry point for sending notifications. It dispatches to
        platform-specific handlers (Discord, Slack) based on configured webhooks.
        
        Args:
            job: Job dictionary with metadata (id, project, platform, services, etc.)
            status: Job status - either 'completed' or 'failed'
            error: Optional error message if job failed, included in notification
        """
        # Skip if no webhooks are configured
        if not self.slack_webhook and not self.discord_webhook:
            print("No webhooks configured, skipping notifications")
            return
        
        # Log the notification being sent
        job_id = job.get('id', 'unknown')
        print(f"Sending {status} notification for job {job_id}")
        
        # Send to Discord if webhook is configured
        if self.discord_webhook:
            self._send_discord_notification(job, status, error)
        
        # Send to Slack if webhook is configured
        if self.slack_webhook:
            self._send_slack_notification(job, status, error)
    

    def _format_duration(self, start: str, end: str) -> str:
        """Calculate and format duration between two ISO 8601 timestamps.
        
        Converts timestamps (with or without Z suffix) to a human-readable
        duration string. For example, 125 seconds becomes "2m 5s".
        
        Args:
            start: format start timestamp (e.g. '2026-01-20T10:30:00Z')
            end: format end timestamp (e.g. '2026-01-20T10:32:05Z')
        
        Returns:
            Formatted duration string (e.g. "2m 5s", "1h 15m 30s"), or "N/A" on error
        """
        try:
            # Parse ISO 8601 timestamps, handling both Z and +00:00 timezone formats
            start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
            delta = end_dt - start_dt
            
            # Calculate hours, minutes, and seconds from the time delta
            hours = delta.seconds // 3600
            minutes = (delta.seconds % 3600) // 60
            seconds = delta.seconds % 60
            
            # Format as human-readable string, omitting zero values
            if hours > 0:
                return f"{hours}h {minutes}m {seconds}s"
            elif minutes > 0:
                return f"{minutes}m {seconds}s"
            else:
                return f"{seconds}s"
        except Exception:
            # Return N/A if timestamp parsing fails
            return "N/A"
    
    
    def _send_discord_notification(self, job: Dict[str, Any], status: str, error: Optional[str] = None) -> None:
        """Send formatted notification to Discord webhook via rich embed.
        
        Creates a Discord embed message with job metadata, status, and results.
        The embed color indicates success (green) or failure (red).
        
        Args:
            job: Job dictionary with full metadata (id, project, platform, services, etc.)
            status: Job status - 'completed' or 'failed'
            error: Optional error message if job failed
        """
        try:
            if not self.discord_webhook:
                return
            
            # Determine embed color based on status (green for success, red for failure)
            is_success = status == 'completed'
            color = 3381519 if is_success else 13632211  # 0x33A64F : 0xD32F2F
            
            # Build embed fields array with job metadata
            fields = []
            
            # Add basic job information (inline fields for compact display)
            fields.append({
                'name': 'Project',
                'value': job.get('project', 'N/A'),
                'inline': True
            })
            fields.append({
                'name': 'Platform',
                'value': job.get('platform', 'N/A'),
                'inline': True
            })
            fields.append({
                'name': 'Source',
                'value': job.get('source', 'N/A'),
                'inline': True
            })
            
            # Add distribution services (CDN, Steam, etc.)
            services = job.get('services', [])
            fields.append({
                'name': 'Services',
                'value': ', '.join(services) if services else 'N/A',
                'inline': True
            })
            
            # Add execution duration if available
            if job.get('startedAt') and job.get('completedAt'):
                duration = self._format_duration(job['startedAt'], job['completedAt'])
                fields.append({
                    'name': 'Distribution Time',
                    'value': duration,
                    'inline': True
                })
            
            # Add unique job identifier (full width field)
            fields.append({
                'name': 'Job ID',
                'value': f"`{job.get('id', 'N/A')}`",
                'inline': False
            })
            
            # Add CDN URL with clickable download link if available
            if job.get('cdnUrl'):
                fields.append({
                    'name': 'CDN URL',
                    'value': f"[Download]({job['cdnUrl']})",
                    'inline': False
                })
            
            # Add Steam upload results if available (build ID and branch)
            steam_result = job.get('steam_result', {})
            if steam_result.get('build_id'):
                steam_field = f"Build ID: `{steam_result['build_id']}`"
                if steam_result.get('branch_set'):
                    steam_field += f"\nBranch: `{steam_result['branch_set']}`"
                fields.append({
                    'name': 'Steam Upload',
                    'value': steam_field,
                    'inline': False
                })
            
            # Add error message if job failed
            if error:
                fields.append({
                    'name': 'Error',
                    'value': error,
                    'inline': False
                })
            
            # Build Discord webhook message with rich embed
            title = f"Build Distribution {status.title()}: {job.get('project', 'Unknown')}"
            message = {
                'content': title,
                'embeds': [
                    {
                        'title': title,
                        'color': color,
                        'fields': fields,
                        'timestamp': job.get('completedAt', datetime.utcnow().isoformat() + 'Z')
                    }
                ]
            }
            
            # Send webhook request with 10 second timeout
            response = requests.post(self.discord_webhook, json=message, timeout=10)
            if response.status_code >= 400:
                print(f"Discord webhook error: {response.status_code} - {response.text}")
            else:
                print("Discord notification sent successfully")
        except Exception as e:
            print(f"Error sending Discord notification: {str(e)}")
            import traceback
            traceback.print_exc()
    
    
    def _send_slack_notification(self, job: Dict[str, Any], status: str, error: Optional[str] = None) -> None:
        """Send formatted notification to Slack webhook via attachment.
        
        Creates a Slack message attachment with job metadata, status, and results.
        The attachment color indicates success (green) or failure (red).
        
        Args:
            job: Job dictionary with full metadata (id, project, platform, services, etc.)
            status: Job status - 'completed' or 'failed'
            error: Optional error message if job failed
        """
        try:
            if not self.slack_webhook:
                return
            
            # Determine attachment color based on status (green for success, red for failure)
            is_success = status == 'completed'
            color = '#36a64f' if is_success else '#d32f2f'  # Green : Red
            
            # Build attachment fields array with job metadata
            fields = []
            
            # Add basic job information (short fields for 2-column layout)
            fields.append({
                'title': 'Project',
                'value': job.get('project', 'N/A'),
                'short': True
            })
            fields.append({
                'title': 'Platform',
                'value': job.get('platform', 'N/A'),
                'short': True
            })
            fields.append({
                'title': 'Source',
                'value': job.get('source', 'N/A'),
                'short': True
            })
            
            # Add distribution services (CDN, Steam, etc.)
            services = job.get('services', [])
            fields.append({
                'title': 'Services',
                'value': ', '.join(services) if services else 'N/A',
                'short': True
            })
            
            # Add execution duration if available
            if job.get('startedAt') and job.get('completedAt'):
                duration = self._format_duration(job['startedAt'], job['completedAt'])
                fields.append({
                    'title': 'Distribution Time',
                    'value': duration,
                    'short': True
                })
            
            # Add unique job identifier (full width field)
            fields.append({
                'title': 'Job ID',
                'value': job.get('id', 'N/A'),
                'short': False
            })
            
            # Add CDN URL if available (full width field)
            if job.get('cdnUrl'):
                fields.append({
                    'title': 'CDN URL',
                    'value': job['cdnUrl'],
                    'short': False
                })
            
            # Add Steam upload results if available (build ID and branch)
            steam_result = job.get('steam_result', {})
            if steam_result.get('build_id'):
                steam_info = f"Build ID: {steam_result['build_id']}"
                if steam_result.get('branch_set'):
                    steam_info += f"\nBranch: {steam_result['branch_set']}"
                fields.append({
                    'title': 'Steam Upload',
                    'value': steam_info,
                    'short': False
                })
            
            # Add error message if job failed (full width field)
            if error:
                fields.append({
                    'title': 'Error',
                    'value': error,
                    'short': False
                })
            
            # Build Slack webhook message with colored attachment
            message = {
                'attachments': [
                    {
                        'color': color,
                        'title': f"Build Distribution {status.title()}: {job.get('project', 'Unknown')}",
                        'fields': fields,
                        'ts': int(datetime.utcnow().timestamp())
                    }
                ]
            }
            
            # Send webhook request with 10 second timeout
            response = requests.post(self.slack_webhook, json=message, timeout=10)
            if response.status_code >= 400:
                print(f"Slack webhook error: {response.status_code} - {response.text}")
            else:
                print("Slack notification sent successfully")
        except Exception as e:
            print(f"Error sending Slack notification: {str(e)}")

