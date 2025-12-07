# Stremio Auth Server

Authentication and authorization server for private Stremio Web instances. Implements whitelist-based access control using Stremio account authentication.

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
User → Stremio Web (your instance) → Logs in with Stremio
                                   → Auth token sent to Auth Server
                                   → Server validates with api.strem.io
                                   → Server checks whitelist
                                   → Grants or denies access
```

## Quick Start

### Method 1: Docker (Recommended)

```bash
# Clone or navigate to the auth server directory
cd /home/dan/projects/stremio-auth-server

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

### Data Files

The server stores data in JSON files in the `data/` directory:

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

## Integration with Stremio Web

### Build Stremio Web with Auth

```bash
cd /path/to/stremio-web

AUTH_SERVER_URL=http://localhost:3000 \
STREAMING_SERVER_URL=https://your-streaming-server.com/ \
DEFAULT_ADDONS="https://addon1.com/manifest.json" \
pnpm run build
```

### Docker Build

```bash
docker build \
  --build-arg AUTH_SERVER_URL=https://auth.yourdomain.com \
  --build-arg STREAMING_SERVER_URL=https://streaming.yourdomain.com/ \
  --build-arg DEFAULT_ADDONS="https://addon.com/manifest.json" \
  -t stremio-web .
```

## Deployment

### Production Setup

1. **Deploy Auth Server:**
   ```bash
   # Using Docker Compose
   docker-compose up -d

   # Or using Node.js with PM2
   pm2 start server.js --name stremio-auth
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

3. **Update Stremio Web build:**
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

1. Visit your Stremio instance
2. Log in with Stremio credentials
3. Instant access (< 1 second validation)
4. Custom streaming server & addons auto-configured

### For Non-Whitelisted Users

1. Visit your Stremio instance
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

* Ensure AUTH_SERVER_URL is correctly set in Stremio Web build
* Check server is accessible from Stremio Web
* Verify CORS settings if servers are on different domains
* Check server logs for errors

### Pending requests not appearing

* Check data/pending-requests.json exists and has correct permissions
* Verify server can write to data/ directory
* Check browser console for network errors

## Development

### File Structure

```
stremio-auth-server/
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
* Check Stremio Web console for client-side errors

## Related

* [Stremio Web](https://github.com/Stremio/stremio-web) - Official Stremio Web repository
* [Stremio API](https://github.com/Stremio/stremio-api-client) - Stremio API documentation
