import os
import requests
import json
from typing import Optional, Dict, Any
from datetime import datetime


class NotificationService:
    """Send notifications to Slack and Discord webhooks."""
    
    def __init__(self):
        """Initialize notification service with webhook URLs from environment."""
        self.slack_webhook = (os.environ.get("SLACK_WEBHOOK_URL", "") or "").strip()
        self.discord_webhook = (os.environ.get("DISCORD_WEBHOOK_URL", "") or "").strip()
        
        if self.slack_webhook:
            print(f"✓ Slack notifications enabled")
        if self.discord_webhook:
            print(f"✓ Discord notifications enabled")
    
    def send_job_notification(self, job: Dict[str, Any], status: str, error: Optional[str] = None) -> None:
        """Send notification about job completion or failure.
        
        Args:
            job: Job dictionary with metadata
            status: Job status ('completed' or 'failed')
            error: Optional error message if job failed
        """
        if not self.slack_webhook and not self.discord_webhook:
            print("No webhooks configured, skipping notifications")
            return  # No webhooks configured, skip
        
        job_id = job.get('id', 'unknown')
        print(f"Sending {status} notification for job {job_id}")
        
        if self.discord_webhook:
            self._send_discord_notification(job, status, error)
        
        if self.slack_webhook:
            self._send_slack_notification(job, status, error)
    
    def _format_duration(self, start: str, end: str) -> str:
        """Calculate duration between two ISO timestamps.
        
        Args:
            start: ISO format start timestamp
            end: ISO format end timestamp
        
        Returns:
            Formatted duration string
        """
        try:
            start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
            delta = end_dt - start_dt
            
            hours = delta.seconds // 3600
            minutes = (delta.seconds % 3600) // 60
            seconds = delta.seconds % 60
            
            if hours > 0:
                return f"{hours}h {minutes}m {seconds}s"
            elif minutes > 0:
                return f"{minutes}m {seconds}s"
            else:
                return f"{seconds}s"
        except Exception:
            return "N/A"
    
    def _send_discord_notification(self, job: Dict[str, Any], status: str, error: Optional[str] = None) -> None:
        """Send detailed notification to Discord webhook.
        
        Args:
            job: Job dictionary with full metadata
            status: Job status ('completed' or 'failed')
            error: Optional error message if job failed
        """
        try:
            if not self.discord_webhook:
                return
            
            is_success = status == 'completed'
            color = 3381519 if is_success else 13632211  # Green : Red
            
            # Build fields array
            fields = []
            
            # Basic info
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
            
            # Source
            fields.append({
                'name': 'Source',
                'value': job.get('source', 'N/A'),
                'inline': True
            })
            
            # Services
            services = job.get('services', [])
            fields.append({
                'name': 'Services',
                'value': ', '.join(services) if services else 'N/A',
                'inline': True
            })
            
            # Timestamps and duration
            if job.get('startedAt') and job.get('completedAt'):
                duration = self._format_duration(job['startedAt'], job['completedAt'])
                fields.append({
                    'name': 'Distribution Time',
                    'value': duration,
                    'inline': True
                })
            
            fields.append({
                'name': 'Job ID',
                'value': f"`{job.get('id', 'N/A')}`",
                'inline': False
            })
            
            # CDN upload info
            if job.get('cdnUrl'):
                fields.append({
                    'name': 'CDN URL',
                    'value': f"[Download]({job['cdnUrl']})",
                    'inline': False
                })
            
            # Steam upload info
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
            
            # Error if failed
            if error:
                fields.append({
                    'name': 'Error',
                    'value': error,
                    'inline': False
                })
            
            # Build the embed
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
        """Send detailed notification to Slack webhook.
        
        Args:
            job: Job dictionary with full metadata
            status: Job status ('completed' or 'failed')
            error: Optional error message if job failed
        """
        try:
            if not self.slack_webhook:
                return
            
            is_success = status == 'completed'
            color = '#36a64f' if is_success else '#d32f2f'  # Green : Red
            
            fields = []
            
            # Basic info
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
            
            # Services
            services = job.get('services', [])
            fields.append({
                'title': 'Services',
                'value': ', '.join(services) if services else 'N/A',
                'short': True
            })
            
            # Duration
            if job.get('startedAt') and job.get('completedAt'):
                duration = self._format_duration(job['startedAt'], job['completedAt'])
                fields.append({
                    'title': 'Distribution Time',
                    'value': duration,
                    'short': True
                })
            
            # Job ID
            fields.append({
                'title': 'Job ID',
                'value': job.get('id', 'N/A'),
                'short': False
            })
            
            # CDN URL if available
            if job.get('cdnUrl'):
                fields.append({
                    'title': 'CDN URL',
                    'value': job['cdnUrl'],
                    'short': False
                })
            
            # Steam info if available
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
            
            # Error if failed
            if error:
                fields.append({
                    'title': 'Error',
                    'value': error,
                    'short': False
                })
            
            message = {
                'attachments': [
                    {
                        'color': color,
                        'title': f"Build Distribution{status.title()}: {job.get('project', 'Unknown')}",
                        'fields': fields,
                        'ts': int(datetime.utcnow().timestamp())
                    }
                ]
            }
            
            response = requests.post(self.slack_webhook, json=message, timeout=10)
            if response.status_code >= 400:
                print(f"Slack webhook error: {response.status_code} - {response.text}")
            else:
                print("Slack notification sent successfully")
        except Exception as e:
            print(f"Error sending Slack notification: {str(e)}")

