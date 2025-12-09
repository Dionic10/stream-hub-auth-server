# Stream Hub Auth Server

> **Important Notice:** This is a companion authentication server for [Stream Hub Web](https://github.com/Dionic10/stream-hub-web), a personal fork of Stremio Web with self-hosting features.
>
> **For the official Stremio Web application, please visit the [original repository](https://github.com/Stremio/stremio-web).**
>
> This project was developed with AI assistance and is not affiliated with or endorsed by the Stremio team.

---

Authentication and authorization server for private Stream Hub Web instances. Implements whitelist-based access control using Stremio account authentication.

> **⚠️ Compatibility Notice:** This auth server is designed to work exclusively with [Stream Hub Web](https://github.com/Dionic10/stream-hub-web), which includes the AuthGuard component and auth integration. It is **not compatible** with the official Stremio Web repository.

## Features

* **Stremio Account Integration** - Users log in with their existing Stremio credentials
* **Whitelist Management** - Admin panel for approving/denying users
* **Pending Requests** - Track unauthorized access attempts
* **Temporary Access** - Grant time-limited access (hours/days/weeks)
* **Token Validation** - Validates auth tokens with Stremio API (api.strem.io)
* **No Password Storage** - Only handles temporary auth tokens
* **Beautiful Admin Panel** - Easy-to-use web interface
* **Access Denied Page** - User-friendly rejection with request tracking

## Architecture

```
User → Stream Hub Web (your instance) → Logs in with Stremio
                                       → Auth token sent to Auth Server
                                       → Server validates with api.strem.io
                                       → Server checks whitelist
                                       → Grants or denies access
```

## Quick Start

### Method 1: Docker (Recommended)

```bash
# Clone or navigate to the auth server directory
cd stream-hub-auth-server

# Create .env file
cp .env.example .env
# Edit .env and set ADMIN_PASSWORD

# Start with Docker Compose
docker-compose up -d

# Access admin panel at http://localhost:3000/admin
```

### Method 2: Node.js

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env and set ADMIN_PASSWORD

# Start server
npm start

# For development with auto-reload
npm run dev
```

## Configuration

### Environment Variables

Create a `.env` file:

```env
# Required: Admin password for accessing the admin panel
ADMIN_PASSWORD=your-secure-password-here

# Optional: Port to run the server on (default: 3000)
PORT=3000

# Optional: Public URL of this auth server (for CORS)
PUBLIC_URL=https://auth.yourdomain.com
```

### Configuration File

Application configuration (addon URLs and streaming server) is stored in `data/config.json`:

```json
{
  "defaultAddons": [
    "https://addon1.com/manifest.json",
    "https://addon2.com/manifest.json"
  ],
  "defaultStreamingServerUrl": "https://streaming-server.com/"
}
```

**Updating Configuration:** Edit `data/config.json` at any time. Changes take effect immediately on the next `/api/config` API call - no server restart required.

### Data Files

The server stores data in JSON files in the `data/` directory:

* `config.json` - Application configuration (addon URLs, streaming server) - **editable at runtime**
* `whitelist.json` - Approved users (permanent access)
* `pending-requests.json` - Users awaiting approval
* `temp-access.json` - Temporary access grants

These files are created automatically on first run.

## Admin Panel

Access at: `http://localhost:3000/admin` (or your deployed URL)

### Features

**Pending Requests Tab:**
* View all access requests from unauthorized users
* See user email, request time, IP address
* Approve permanently (add to whitelist)
* Grant temporary access (1h to custom duration)
* Deny requests

**Whitelist Tab:**
* View all permanently approved users
* Add users manually by email
* Remove users from whitelist

**Temporary Access Tab:**
* View all active temporary access grants
* See expiration times
* Automatically cleaned up when expired

## API Endpoints

### User-Facing

**POST `/api/validate-access`**

Validates if a user has access to the Stremio instance.

Request:
```json
{
  "authKey": "stremio-auth-token"
}
```

Response (authorized):
```json
{
  "authorized": true,
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "avatar": "https://..."
  }
}
```

Response (unauthorized - new request):
```json
{
  "authorized": false,
  "reason": "Access request submitted for approval",
  "requestId": "req_abc123",
  "email": "user@example.com"
}
```

**POST `/api/config`**

Returns addon URLs and streaming server configuration for authenticated users only. This prevents sensitive URLs from being exposed to unauthorized users.

Request:
```json
{
  "authKey": "stremio-auth-token",
  "email": "user@example.com"
}
```

Response (authorized - 200 OK):
```json
{
  "defaultAddons": [
    "https://addon1.com/manifest.json",
    "https://addon2.com/manifest.json"
  ],
  "defaultStreamingServerUrl": "https://streaming-server.com/"
}
```

Response (unauthorized - 403 Forbidden):
```json
{
  "error": "Access denied"
}
```

Response (invalid token - 401 Unauthorized):
```json
{
  "error": "Authentication failed"
}
```

**Configuration Environment Variables:**

```env
# Addon manifest URLs (comma-separated)
DEFAULT_ADDONS="https://addon1.com/manifest.json,https://addon2.com/manifest.json"

# Default streaming server URL
STREAMING_SERVER_URL="https://streaming-server.com/"
```

**GET `/access-denied?email=...&requestId=...`**

User-friendly access denied page shown to unauthorized users.

### Admin (Requires X-Admin-Password header)

* **GET `/api/admin/pending-requests`** - List pending requests
* **GET `/api/admin/whitelist`** - List whitelisted users
* **GET `/api/admin/temp-access`** - List temporary access grants
* **POST `/api/admin/approve-request`** - Approve a pending request
* **POST `/api/admin/grant-temp-access`** - Grant temporary access
* **POST `/api/admin/deny-request`** - Deny a pending request
* **POST `/api/admin/add-user`** - Manually add user to whitelist
* **POST `/api/admin/remove-user`** - Remove user from whitelist

## Integration with Stream Hub Web

### Build Stream Hub Web with Auth

```bash
cd /path/to/stream-hub-web

AUTH_SERVER_URL=http://localhost:3000 pnpm run build
```

The build only requires `AUTH_SERVER_URL`. Application configuration (addon URLs and streaming server) is managed via `data/config.json` on the auth server at runtime.

### Docker Build

```bash
docker build \
  --build-arg AUTH_SERVER_URL=https://auth.yourdomain.com \
  -t stream-hub-web .
```

### Configure Addon URLs and Streaming Server

Edit the auth server's configuration file:

```bash
nano /path/to/stremio-auth-server/data/config.json
```

Example:

```json
{
  "defaultAddons": [
    "https://addon1.com/manifest.json",
    "https://addon2.com/manifest.json"
  ],
  "defaultStreamingServerUrl": "https://streaming-server.com/"
}
```

Changes take effect immediately - no restart needed.

## Deployment

### Production Setup

1. **Deploy Auth Server:**
   ```bash
   # Using Docker Compose
   docker-compose up -d

   # Or using Node.js with PM2
   pm2 start server.js --name stream-hub-auth
   ```

2. **Set up reverse proxy (Nginx example):**
   ```nginx
   server {
       listen 443 ssl;
       server_name auth.yourdomain.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

3. **Update Stream Hub Web build:**
   ```bash
   AUTH_SERVER_URL=https://auth.yourdomain.com pnpm run build
   ```

### Security Recommendations

* Use HTTPS in production
* Set a strong ADMIN_PASSWORD
* Regularly backup the `data/` directory
* Monitor pending requests
* Review whitelist periodically
* Consider firewall rules to restrict admin panel access

## User Experience

### For Whitelisted Users

1. Visit your Stream Hub instance
2. Log in with Stremio credentials
3. Instant access (< 1 second validation)
4. Custom streaming server & addons auto-configured

### For Non-Whitelisted Users

1. Visit your Stream Hub instance
2. Log in with Stremio credentials
3. See "Access Not Authorized" page
4. Request automatically submitted to admin
5. Receive request ID for reference

### For Admins

1. User logs in → Creates pending request
2. Admin receives notification (check admin panel)
3. Admin reviews user info (email, IP, timestamp)
4. Admin chooses:
   * Approve permanently → User added to whitelist
   * Grant temporary access → User gets X hours of access
   * Deny → User cannot access

## Troubleshooting

### "Invalid Stremio authentication token"

* User's Stremio session may have expired
* Ask user to log out and log back in to Stremio Web

### Admin panel won't load

* Check ADMIN_PASSWORD in .env file
* Ensure server is running (check `npm start` logs)
* Check browser console for errors

### Whitelist validation fails

* Ensure AUTH_SERVER_URL is correctly set in Stream Hub Web build
* Check server is accessible from Stream Hub Web
* Verify CORS settings if servers are on different domains
* Check server logs for errors

### Pending requests not appearing

* Check data/pending-requests.json exists and has correct permissions
* Verify server can write to data/ directory
* Check browser console for network errors

### Docker & Deployment Issues

#### Docker Build Fails: "addgroup: group 'node' in use"

**Problem:** Alpine Linux already has a built-in `node` user, causing user creation to fail.

**Solution:** The Dockerfile now uses error suppression:
```dockerfile
RUN addgroup -g 1000 node 2>/dev/null || true && \
    adduser -D -u 1000 -G node node 2>/dev/null || true
```

This safely reuses the existing Alpine node user if present.

#### Docker Volume Mount Permission Denied

**Problem:** Running `docker-compose up -d` results in permission errors:
```
stat() failed (13: Permission denied)
chown: changing ownership of '/app/data': Operation not permitted
```

**Solution:** The Alpine node user needs proper directory ownership:

1. **Create data directory before mounting:**
   ```bash
   mkdir -p ./data
   chmod 755 ./data
   ```

2. **Adjust docker-compose.yml volumes:**
   ```yaml
   volumes:
     - ./data:/app/data:rw
   ```

3. **Fix ownership if already created:**
   ```bash
   # If Docker container is already running
   docker-compose exec auth-server chown -R node:node /app/data

   # Or from host (if accessible)
   sudo chown 1000:1000 ./data
   ```

#### Nginx: "Permission denied" serving static files

**Problem:** Nginx can't read files served by the auth server.

**Solution:** Ensure proper Docker user and permissions:

1. **Verify the running container user:**
   ```bash
   docker-compose exec auth-server whoami
   # Should output: node
   ```

2. **Check data directory permissions:**
   ```bash
   docker-compose exec auth-server ls -la /app/
   # Verify node:node ownership
   ```

3. **Nginx reverse proxy configuration:**
   ```nginx
   location / {
       proxy_pass http://localhost:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

#### Container Won't Start or Crashes Immediately

**Problem:** Container exits with code 1 immediately after starting.

**Solution:** Check logs for the specific error:
```bash
# View full container logs
docker-compose logs -f auth-server

# Common issues:
# - ADMIN_PASSWORD not set in .env
# - PORT already in use
# - /app/data directory not writable
```

#### Node Process Won't Bind to Port 3000

**Problem:** "EADDRINUSE: address already in use :::3000"

**Solution:**
```bash
# Find and kill existing process
lsof -i :3000
kill -9 <PID>

# Or use a different port in docker-compose.yml
ports:
  - "3001:3000"  # Host port 3001 → Container port 3000
```

#### Environment Variables Not Loaded

**Problem:** NODE_ENV=production and TZ not working in Docker.

**Solution:** Ensure .env file exists and is properly formatted:
```bash
# Copy and edit the example
cp .env.example .env
nano .env  # Edit with your values

# Verify variables are loaded
docker-compose exec auth-server printenv | grep -E "NODE_ENV|TZ|ADMIN_PASSWORD"
```

**Note:** Variables set in `.env` are read by Docker Compose. If using `docker run` directly, use `-e` flag:
```bash
docker run -e ADMIN_PASSWORD=secure-pwd -e NODE_ENV=production -e TZ=Europe/Vienna ...
```

#### Volume Mount Ownership Issues on Linux

**Problem:** Container runs as `node` user (UID 1000) but host files have different ownership.

**Solutions:**

1. **Option A - Fix host ownership (recommended):**
   ```bash
   # Ensure data directory matches container user
   sudo chown -R 1000:1000 ./data
   chmod 755 ./data
   ```

2. **Option B - Use docker-compose user override:**
   ```yaml
   services:
     auth-server:
       build: .
       user: "0"  # Run as root (less secure, use Option A instead)
   ```

3. **Option C - Use bind mount with proper SELinux/AppArmor:**
   ```yaml
   volumes:
     - ./data:/app/data:Z  # :Z flag for SELinux systems
   ```

### Production Deployment with Nginx

Ensure your Nginx configuration properly proxies to the Docker container:

```nginx
upstream auth_server {
    server 127.0.0.1:3000;
}

server {
    listen 443 ssl http2;
    server_name auth.yourdomain.com;

    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    location / {
        proxy_pass http://auth_server;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# HTTP redirect
server {
    listen 80;
    server_name auth.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

## Development

### File Structure

```
stream-hub-auth-server/
├── server.js              # Main Express server
├── package.json           # Dependencies
├── Dockerfile            # Docker container config
├── docker-compose.yml    # Docker Compose config
├── .env.example          # Environment template
├── public/               # Admin panel static files
│   ├── index.html       # Admin UI
│   ├── styles.css       # Styling
│   └── app.js           # Admin panel logic
├── views/                # Server-rendered pages
│   └── access-denied.html  # Access denied page
└── data/                 # Runtime data (auto-created)
    ├── whitelist.json
    ├── pending-requests.json
    └── temp-access.json
```

### Running Tests

```bash
# Start server
npm start

# In another terminal, test the API
curl -X POST http://localhost:3000/api/validate-access \
  -H "Content-Type: application/json" \
  -d '{"authKey": "test-token"}'

# Test admin panel
curl http://localhost:3000/api/admin/whitelist \
  -H "X-Admin-Password: your-password"
```

## License

MIT

## Support

For issues or questions:
* Check the troubleshooting section above
* Review server logs for errors
* Check Stream Hub Web console for client-side errors

## Related

* [Stream Hub Web](https://github.com/Dionic10/stream-hub-web) - Modified Stremio Web with auth integration (required for this auth server)
* [Official Stremio Web](https://github.com/Stremio/stremio-web) - Official Stremio Web repository (not compatible with this auth server)
* [Stremio API](https://github.com/Stremio/stremio-api-client) - Stremio API documentation
