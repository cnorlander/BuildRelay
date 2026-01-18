# BuildRelay API Documentation

## Overview

BuildRelay provides REST APIs for submitting build jobs to be distributed across multiple platforms and services.

For detailed OpenAPI specification, see [openapi.json](./openapi.json)

## Authentication

All API endpoints require authentication via API key. Include your API key in the request header:

```
x-api-key: your_api_key_here
```

You can manage API keys through the BuildRelay dashboard.

## Endpoints

### Filesystem Job Submission

**Endpoint:** `POST /api/jobs/filesystem`

Submit a build job from files on the filesystem to be uploaded to configured channels.

#### Request

```bash
curl -X POST http://localhost:3000/api/jobs/filesystem \
  -H "x-api-key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "project": "Test Project",
    "description": "V0.0.1 Beta",
    "platform": "windows",
    "ingestPath": "build",
    "steam_channel_labels": ["Steam Label"],
    "cdn_channel_labels": ["CDN Label"]
  }'
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `project` | string | ✓ | Name of the project being built |
| `description` | string | | Description of the build (e.g., version number) |
| `platform` | string | ✓ | Target platform (e.g., "windows", "linux", "macos") |
| `ingestPath` | string | ✓ | Relative path within `/builds` directory containing build files. Must be a valid directory. |
| `steam_channel_labels` | array | | Labels of Steam channels to upload to |
| `cdn_channel_labels` | array | | Labels of CDN channels to upload to |

**Validation Rules:**
- At least one channel label (steam or cdn) must be provided
- `ingestPath` cannot be absolute or contain `..`
- `ingestPath` directory must exist on the filesystem
- All channel labels must match existing configured channels

#### Response (Success - 201)

```json
{
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "source": "filesystem",
    "project": "Test Project",
    "description": "V0.0.1 Beta",
    "platform": "windows",
    "status": "Queued",
    "buildStep": "Waiting for worker assignment.",
    "createdAt": "2026-01-18T10:30:00.000Z",
    "ingestPath": "build",
    "steam_channel_labels": ["Steam Label"],
    "cdn_channel_labels": ["CDN Label"]
  }
}
```

**Response Fields:**
- `id`: Unique job identifier (UUID)
- `source`: Job source type ("filesystem")
- `project`: Project name as submitted
- `description`: Build description (optional)
- `platform`: Target platform
- `status`: Current job status
- `buildStep`: Current build processing step
- `createdAt`: ISO 8601 timestamp when job was created
- `ingestPath`: Build files location
- `steam_channel_labels`: Steam channels submitted
- `cdn_channel_labels`: CDN channels submitted

> **Note:** Sensitive channel information (credentials, API keys, endpoints) is excluded from responses for security. Full channel details are stored internally for worker processing.

#### Response (Validation Error - 400)

```json
{
  "errors": [
    "steam channel with label \"Invalid Label\" not found",
    "ingestPath must be a non-empty string",
    "at least one channel label (steam or cdn) must be provided"
  ]
}
```

#### Response (Unauthorized - 401)

```json
{
  "error": "API key required"
}
```

#### Response (Method Not Allowed - 405)

```
Method GET Not Allowed
```

#### Response (Server Error - 500)

```json
{
  "error": "Failed to create job"
}
```

## Status Codes

| Code | Meaning | When |
|------|---------|------|
| 201 | Created | Job successfully submitted |
| 400 | Bad Request | Invalid input or channel labels not found |
| 401 | Unauthorized | Missing or invalid API key |
| 405 | Method Not Allowed | Request method is not POST |
| 500 | Internal Server Error | Server error during job creation |

## Job Lifecycle

1. **Queued** - Job submitted and waiting for worker assignment
2. **Running** - Worker is processing the job
3. **Complete** - Job finished successfully
4. **Failed** - Job encountered an error during processing

Monitor job status through the BuildRelay dashboard or by polling job endpoints.

## Rate Limiting

Currently no rate limiting is implemented. This may be added in future versions.

## Error Handling

API errors include a descriptive message. Always check the response status code:

- **2xx**: Success
- **4xx**: Client error (check request)
- **5xx**: Server error (try again or contact support)
