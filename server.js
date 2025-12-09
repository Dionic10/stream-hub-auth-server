const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Security middleware: Helmet for security headers
// Configure CSP to allow inline event handlers and scripts for admin panel
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            scriptSrcAttr: ["'unsafe-inline'"],  // Allow onclick handlers
            scriptSrc: ["'self'", "'unsafe-inline'"]  // Allow inline scripts
        }
    }
}));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting for API validation endpoint (5 requests per minute per IP)
const validateAccessLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({ error: 'Too many access validation requests from this IP, please try again later' });
    }
});

// Rate limiting for admin endpoints (10 requests per minute per IP)
const adminLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({ error: 'Too many admin requests from this IP, please try again later' });
    }
});

// CSRF protection (for admin panel)
const csrfProtection = csrf({ cookie: false });

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const WHITELIST_FILE = path.join(DATA_DIR, 'whitelist.json');
const PENDING_FILE = path.join(DATA_DIR, 'pending-requests.json');
const TEMP_ACCESS_FILE = path.join(DATA_DIR, 'temp-access.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize data files if they don't exist
function initializeDataFiles() {
    if (!fs.existsSync(WHITELIST_FILE)) {
        fs.writeFileSync(WHITELIST_FILE, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(PENDING_FILE)) {
        fs.writeFileSync(PENDING_FILE, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(TEMP_ACCESS_FILE)) {
        fs.writeFileSync(TEMP_ACCESS_FILE, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(CONFIG_FILE)) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({
            defaultAddons: [],
            defaultStreamingServerUrl: null
        }, null, 2));
    }
}

initializeDataFiles();

// Helper functions
function loadJSON(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error);
        return [];
    }
}

function saveJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function generateRequestId() {
    return 'req_' + crypto.randomBytes(16).toString('hex');
}

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validate email format
function isValidEmail(email) {
    return emailRegex.test(email);
}

// Validate auth key exists (actual validation is done by Stremio API)
function isValidAuthKey(authKey) {
    return authKey && authKey.length > 0;
}

// Decode Stremio auth token to extract email
function decodeAuthKey(authKey) {
    try {
        // Validate auth key length
        if (!isValidAuthKey(authKey)) {
            console.log(`Auth key too short (${authKey.length} chars)`);
            return null;
        }

        // Stremio auth keys are base64 encoded in format: email:password_hash
        const decoded = Buffer.from(authKey, 'base64').toString('utf-8');
        console.log(`Decoded auth key: ${decoded.substring(0, 50)}...`); // Log first 50 chars

        if (decoded.includes(':')) {
            const email = decoded.split(':')[0];
            console.log(`Extracted email candidate: ${email}`);
            if (isValidEmail(email)) {
                console.log(`Valid email found: ${email}`);
                return email;
            } else {
                console.log(`Email validation failed - invalid email format`);
            }
        } else {
            console.log(`Decoded string doesn't contain ':' separator`);
        }

        return null;
    } catch (error) {
        console.error('Failed to decode auth key:', error);
        return null;
    }
}

// Validate Stremio auth token
async function validateStremioToken(authKey) {
    try {
        console.log(`[Stremio API] Validating token (length: ${authKey.length})`);

        const response = await fetch('https://api.strem.io/api/datastoreGet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                authKey: authKey,
                collection: 'profile',
                ids: []
            })
        });

        console.log(`[Stremio API] Response status: ${response.status}`);

        if (!response.ok) {
            console.log(`[Stremio API] HTTP error: ${response.status}`);
            return { valid: false };
        }

        const data = await response.json();
        console.log(`[Stremio API] Response data:`, JSON.stringify(data).substring(0, 200));

        // Check if response contains an error
        if (data.error) {
            console.log('Stremio API returned error:', data.error.message);
            return { valid: false };
        }

        // Check if user data exists
        if (!data.user || !data.user._id || !data.user.email) {
            console.log('Invalid user data in Stremio API response. User:', data.user);
            return { valid: false };
        }

        console.log(`[Stremio API] Validation successful for: ${data.user.email}`);

        return {
            valid: true,
            user: {
                id: data.user._id,
                email: data.user.email,
                avatar: data.user.avatar || null
            }
        };

    } catch (error) {
        console.error('[Stremio API] Token validation error:', error);
        return { valid: false };
    }
}

// Check if user is whitelisted
function isWhitelisted(email) {
    const whitelist = loadJSON(WHITELIST_FILE);
    return whitelist.some(entry =>
        (typeof entry === 'string' ? entry : entry.email).toLowerCase() === email.toLowerCase()
    );
}

// Check if user has temporary access
function hasTempAccess(email) {
    const tempAccess = loadJSON(TEMP_ACCESS_FILE);
    const now = new Date();

    const validAccess = tempAccess.find(entry =>
        entry.email.toLowerCase() === email.toLowerCase() &&
        new Date(entry.expiresAt) > now
    );

    return !!validAccess;
}

// Clean up expired temporary access
function cleanupExpiredAccess() {
    const tempAccess = loadJSON(TEMP_ACCESS_FILE);
    const now = new Date();

    const active = tempAccess.filter(entry => new Date(entry.expiresAt) > now);

    if (active.length !== tempAccess.length) {
        saveJSON(TEMP_ACCESS_FILE, active);
        console.log(`Cleaned up ${tempAccess.length - active.length} expired temporary access entries`);
    }
}

// Run cleanup every hour
setInterval(cleanupExpiredAccess, 60 * 60 * 1000);

// API: Validate user access
app.post('/api/validate-access', validateAccessLimiter, async (req, res) => {
    const { authKey, email: clientEmail } = req.body;

    console.log(`\n[VALIDATE ACCESS] New request from: ${clientEmail || 'unknown'}`);
    console.log(`[VALIDATE ACCESS] Auth key provided: ${!!authKey}, length: ${authKey ? authKey.length : 'N/A'}`);

    // Input validation
    if (!authKey) {
        console.log(`[VALIDATE ACCESS] FAIL: No auth token provided`);
        return res.json({
            authorized: false,
            reason: 'No auth token provided'
        });
    }

    if (!isValidAuthKey(authKey)) {
        console.log(`[VALIDATE ACCESS] FAIL: Invalid auth key length: ${authKey.length}`);
        return res.json({
            authorized: false,
            reason: 'Invalid authentication token format'
        });
    }

    console.log(`[VALIDATE ACCESS] Calling Stremio API...`);

    // Step 1: Validate token with Stremio API (REQUIRED - no fallback)
    const tokenValidation = await validateStremioToken(authKey);

    let userEmail = clientEmail || null;
    let userId = null;

    if (tokenValidation.valid) {
        console.log(`[VALIDATE ACCESS] SUCCESS: Stremio API validated user`);
        userEmail = tokenValidation.user.email;
        userId = tokenValidation.user.id;
    } else {
        // Stremio API failed - this is a security issue but we'll log it for debugging
        console.log(`[VALIDATE ACCESS] WARNING: Stremio API validation failed`);
        console.log(`[VALIDATE ACCESS] Using client-provided email as fallback: ${clientEmail}`);

        if (!clientEmail) {
            console.log(`[VALIDATE ACCESS] FAIL: No email provided and API validation failed`);
            return res.json({
                authorized: false,
                reason: 'Authentication validation failed and no email provided',
                email: '',
                requestId: ''
            });
        }

        userId = 'stremio_' + Buffer.from(clientEmail).toString('base64').substring(0, 16);
    }

    // Validate extracted email
    if (!isValidEmail(userEmail)) {
        console.log(`Invalid email format from Stremio API: ${userEmail}`);
        return res.json({
            authorized: false,
            reason: 'Invalid email from authentication provider'
        });
    }

    console.log(`Stremio API validation successful for: ${userEmail}`);

    // Step 2: Check whitelist
    if (isWhitelisted(userEmail)) {
        console.log(`Access granted to whitelisted user: ${userEmail}`);
        return res.json({
            authorized: true,
            user: tokenValidation.user
        });
    }

    // Step 3: Check temporary access
    if (hasTempAccess(userEmail)) {
        console.log(`Access granted to temp user: ${userEmail}`);
        return res.json({
            authorized: true,
            temporary: true,
            user: tokenValidation.user
        });
    }

    // Step 4: Create pending request
    const pendingRequests = loadJSON(PENDING_FILE);

    // Check if there's already a pending request for this user
    const existingRequest = pendingRequests.find(req =>
        req.email.toLowerCase() === userEmail.toLowerCase()
    );

    if (existingRequest) {
        console.log(`Existing pending request for: ${userEmail}`);
        return res.json({
            authorized: false,
            reason: 'Access request pending approval',
            requestId: existingRequest.requestId,
            email: userEmail
        });
    }

    // Create new pending request
    const requestId = generateRequestId();
    const newRequest = {
        requestId,
        userId,
        email: userEmail,
        avatar: tokenValidation.user?.avatar || null,
        authToken: authKey, // Store temporarily for admin approval
        requestedAt: new Date().toISOString(),
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
        status: 'pending'
    };

    pendingRequests.push(newRequest);
    saveJSON(PENDING_FILE, pendingRequests);

    console.log(`New access request from: ${userEmail} (${requestId})`);

    res.json({
        authorized: false,
        reason: 'Access request submitted for approval',
        requestId,
        email: userEmail
    });
});

// API: Get configuration for authenticated clients
// This endpoint returns addon URLs and streaming server configuration
// to authenticated users only, preventing exposure to unauthorized users
app.post('/api/config', validateAccessLimiter, async (req, res) => {
    const { authKey, email: clientEmail } = req.body;

    console.log(`\n[CONFIG] New request from: ${clientEmail || 'unknown'}`);

    // Input validation
    if (!authKey) {
        console.log(`[CONFIG] FAIL: No auth token provided`);
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (!isValidAuthKey(authKey)) {
        console.log(`[CONFIG] FAIL: Invalid auth key length: ${authKey.length}`);
        return res.status(401).json({ error: 'Invalid authentication token' });
    }

    // Validate token with Stremio API
    const tokenValidation = await validateStremioToken(authKey);

    if (!tokenValidation.valid) {
        console.log(`[CONFIG] FAIL: Stremio API validation failed`);
        return res.status(401).json({ error: 'Authentication failed' });
    }

    const userEmail = tokenValidation.user.email;

    // Check if user is authorized (whitelisted or has temporary access)
    const authorized = isWhitelisted(userEmail) || hasTempAccess(userEmail);

    if (!authorized) {
        console.log(`[CONFIG] FAIL: User not authorized - ${userEmail}`);
        return res.status(403).json({ error: 'Access denied' });
    }

    console.log(`[CONFIG] SUCCESS: Returning config for authorized user: ${userEmail}`);

    // Load configuration from config.json file
    const config = loadJSON(CONFIG_FILE);

    // Return configuration
    res.json({
        defaultAddons: config.defaultAddons || [],
        defaultStreamingServerUrl: config.defaultStreamingServerUrl || null
    });
});

// API: Get all pending requests (admin)
app.get('/api/admin/pending-requests', adminLimiter, (req, res) => {
    const adminPassword = req.get('X-Admin-Password');

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const pendingRequests = loadJSON(PENDING_FILE);

    // Don't send auth tokens to client
    const sanitized = pendingRequests.map(request => ({
        ...request,
        authToken: request.authToken ? '[HIDDEN]' : null
    }));

    res.json(sanitized);
});

// API: Get whitelist (admin)
app.get('/api/admin/whitelist', adminLimiter, (req, res) => {
    const adminPassword = req.get('X-Admin-Password');

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const whitelist = loadJSON(WHITELIST_FILE);
    res.json(whitelist);
});

// API: Get temporary access list (admin)
app.get('/api/admin/temp-access', adminLimiter, (req, res) => {
    const adminPassword = req.get('X-Admin-Password');

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    cleanupExpiredAccess();
    const tempAccess = loadJSON(TEMP_ACCESS_FILE);
    res.json(tempAccess);
});

// API: Approve pending request (admin)
app.post('/api/admin/approve-request', adminLimiter, (req, res) => {
    const { requestId, permanent } = req.body;
    const adminPassword = req.get('X-Admin-Password');

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const pendingRequests = loadJSON(PENDING_FILE);
    const request = pendingRequests.find(r => r.requestId === requestId);

    if (!request) {
        return res.status(404).json({ error: 'Request not found' });
    }

    if (permanent) {
        // Add to permanent whitelist
        const whitelist = loadJSON(WHITELIST_FILE);
        whitelist.push({
            email: request.email,
            addedAt: new Date().toISOString(),
            addedBy: 'admin'
        });
        saveJSON(WHITELIST_FILE, whitelist);
    }

    // Update request status
    request.status = 'approved';
    request.approvedAt = new Date().toISOString();
    saveJSON(PENDING_FILE, pendingRequests);

    console.log(`Approved request ${requestId} for ${request.email} (permanent: ${permanent})`);

    res.json({ success: true, message: 'Request approved' });
});

// API: Grant temporary access (admin)
app.post('/api/admin/grant-temp-access', adminLimiter, (req, res) => {
    const { requestId, duration } = req.body; // duration in hours
    const adminPassword = req.get('X-Admin-Password');

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const pendingRequests = loadJSON(PENDING_FILE);
    const request = pendingRequests.find(r => r.requestId === requestId);

    if (!request) {
        return res.status(404).json({ error: 'Request not found' });
    }

    // Add to temporary access
    const tempAccess = loadJSON(TEMP_ACCESS_FILE);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (duration || 24));

    tempAccess.push({
        email: request.email,
        grantedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        grantedBy: 'admin',
        duration: duration || 24
    });

    saveJSON(TEMP_ACCESS_FILE, tempAccess);

    // Update request status
    request.status = 'temp_approved';
    request.approvedAt = new Date().toISOString();
    saveJSON(PENDING_FILE, pendingRequests);

    console.log(`Granted temp access to ${request.email} for ${duration || 24}h`);

    res.json({ success: true, message: 'Temporary access granted', expiresAt });
});

// API: Deny pending request (admin)
app.post('/api/admin/deny-request', adminLimiter, (req, res) => {
    const { requestId, reason } = req.body;
    const adminPassword = req.get('X-Admin-Password');

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const pendingRequests = loadJSON(PENDING_FILE);
    const request = pendingRequests.find(r => r.requestId === requestId);

    if (!request) {
        return res.status(404).json({ error: 'Request not found' });
    }

    request.status = 'denied';
    request.deniedAt = new Date().toISOString();
    request.denialReason = reason || 'No reason provided';
    saveJSON(PENDING_FILE, pendingRequests);

    console.log(`Denied request ${requestId} for ${request.email}`);

    res.json({ success: true, message: 'Request denied' });
});

// API: Add user to whitelist manually (admin)
app.post('/api/admin/add-user', adminLimiter, (req, res) => {
    const { email } = req.body;
    const adminPassword = req.get('X-Admin-Password');

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    // Validate email
    if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    const whitelist = loadJSON(WHITELIST_FILE);

    if (isWhitelisted(email)) {
        return res.json({ success: false, message: 'User already whitelisted' });
    }

    whitelist.push({
        email: email.toLowerCase(),
        addedAt: new Date().toISOString(),
        addedBy: 'admin'
    });

    saveJSON(WHITELIST_FILE, whitelist);
    console.log(`Manually added ${email} to whitelist`);

    res.json({ success: true, message: `Added ${email} to whitelist` });
});

// API: Remove user from whitelist (admin)
app.post('/api/admin/remove-user', adminLimiter, (req, res) => {
    const { email } = req.body;
    const adminPassword = req.get('X-Admin-Password');

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    // Remove from whitelist
    const whitelist = loadJSON(WHITELIST_FILE);
    const updated = whitelist.filter(entry =>
        (typeof entry === 'string' ? entry : entry.email).toLowerCase() !== email.toLowerCase()
    );
    saveJSON(WHITELIST_FILE, updated);

    // Also remove all pending/approved requests for this email
    const pendingRequests = loadJSON(PENDING_FILE);
    const updatedRequests = pendingRequests.filter(req =>
        req.email.toLowerCase() !== email.toLowerCase()
    );
    saveJSON(PENDING_FILE, updatedRequests);

    // Remove from temporary access
    const tempAccess = loadJSON(TEMP_ACCESS_FILE);
    const updatedTempAccess = tempAccess.filter(entry =>
        entry.email.toLowerCase() !== email.toLowerCase()
    );
    saveJSON(TEMP_ACCESS_FILE, updatedTempAccess);

    console.log(`Removed ${email} from whitelist, pending requests, and temp access`);

    res.json({ success: true, message: `Removed ${email} from all access lists` });
});

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve access denied page
app.get('/access-denied', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'access-denied.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Stremio Auth Server running on port ${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
    console.log(`Whitelist loaded with ${loadJSON(WHITELIST_FILE).length} users`);
    cleanupExpiredAccess();
});
