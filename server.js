const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const WHITELIST_FILE = path.join(DATA_DIR, 'whitelist.json');
const PENDING_FILE = path.join(DATA_DIR, 'pending-requests.json');
const TEMP_ACCESS_FILE = path.join(DATA_DIR, 'temp-access.json');

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
    return 'req_' + Math.random().toString(36).substring(2, 15);
}

// Decode Stremio auth token to extract email
function decodeAuthKey(authKey) {
    try {
        // Stremio auth keys are base64 encoded in format: email:password_hash
        const decoded = Buffer.from(authKey, 'base64').toString('utf-8');
        console.log(`Decoded auth key: ${decoded.substring(0, 50)}...`); // Log first 50 chars

        if (decoded.includes(':')) {
            const email = decoded.split(':')[0];
            console.log(`Extracted email candidate: ${email}`);
            if (email && email.includes('@')) {
                console.log(`Valid email found: ${email}`);
                return email;
            } else {
                console.log(`Email validation failed - no @ symbol`);
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

        if (!response.ok) {
            return { valid: false };
        }

        const data = await response.json();

        // Check if response contains an error
        if (data.error) {
            console.log('Stremio API returned error:', data.error.message);
            return { valid: false };
        }

        // Check if user data exists
        if (!data.user || !data.user._id || !data.user.email) {
            console.log('Invalid user data in Stremio API response');
            return { valid: false };
        }

        return {
            valid: true,
            user: {
                id: data.user._id,
                email: data.user.email,
                avatar: data.user.avatar || null
            }
        };

    } catch (error) {
        console.error('Token validation error:', error);
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
app.post('/api/validate-access', async (req, res) => {
    const { authKey, email: clientEmail } = req.body;

    if (!authKey) {
        return res.json({
            authorized: false,
            reason: 'No auth token provided'
        });
    }

    // Step 1: Validate token with Stremio API
    const tokenValidation = await validateStremioToken(authKey);

    // Extract email (prefer from client, fallback to token validation or decode)
    let userEmail = clientEmail || null;
    let userId = null;

    if (tokenValidation.valid) {
        userEmail = userEmail || tokenValidation.user.email;
        userId = tokenValidation.user.id;
        console.log(`Stremio API validation successful for: ${userEmail}`);
    } else {
        // If API validation failed, use client-provided email or try to decode
        if (!userEmail) {
            console.log(`Attempting to decode auth key (length: ${authKey.length})`);
            userEmail = decodeAuthKey(authKey);
        }

        if (!userEmail) {
            console.log(`Failed to extract email from auth key`);
            return res.json({
                authorized: false,
                reason: 'Invalid Stremio authentication token - unable to extract email',
                email: '',
                requestId: ''
            });
        }

        // Generate a temporary user ID from the email
        userId = 'temp_' + Buffer.from(userEmail).toString('base64').substring(0, 16);
        console.log(`API validation failed but using email: ${userEmail}`);
    }

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

// API: Get all pending requests (admin)
app.get('/api/admin/pending-requests', (req, res) => {
    const adminPassword = req.get('X-Admin-Password');

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const pendingRequests = loadJSON(PENDING_FILE);

    // Don't send auth tokens to client
    const sanitized = pendingRequests.map(req => ({
        ...req,
        authToken: req.authToken ? '[HIDDEN]' : null
    }));

    res.json(sanitized);
});

// API: Get whitelist (admin)
app.get('/api/admin/whitelist', (req, res) => {
    const adminPassword = req.get('X-Admin-Password');

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const whitelist = loadJSON(WHITELIST_FILE);
    res.json(whitelist);
});

// API: Get temporary access list (admin)
app.get('/api/admin/temp-access', (req, res) => {
    const adminPassword = req.get('X-Admin-Password');

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    cleanupExpiredAccess();
    const tempAccess = loadJSON(TEMP_ACCESS_FILE);
    res.json(tempAccess);
});

// API: Approve pending request (admin)
app.post('/api/admin/approve-request', (req, res) => {
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
app.post('/api/admin/grant-temp-access', (req, res) => {
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
app.post('/api/admin/deny-request', (req, res) => {
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
app.post('/api/admin/add-user', (req, res) => {
    const { email } = req.body;
    const adminPassword = req.get('X-Admin-Password');

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Unauthorized' });
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
app.post('/api/admin/remove-user', (req, res) => {
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
