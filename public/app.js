let adminPassword = '';
let sessionTimeoutId = null;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const STORAGE_KEY = 'admin_session_token';

// Load session from localStorage on page load
function loadSession() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        adminPassword = saved;
        // Verify session is still valid
        fetch('/api/admin/pending-requests', {
            headers: {
                'X-Admin-Password': adminPassword
            }
        })
        .then(res => {
            if (res.status === 403) {
                throw new Error('Session expired');
            }
            return res.json();
        })
        .then(() => {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            setSessionTimeout();
            loadDashboard();
        })
        .catch(() => {
            localStorage.removeItem(STORAGE_KEY);
            adminPassword = '';
        });
    }
}

function setSessionTimeout() {
    // Clear existing timeout
    if (sessionTimeoutId) {
        clearTimeout(sessionTimeoutId);
    }

    // Set new timeout
    sessionTimeoutId = setTimeout(() => {
        logout();
        showError('loginError', 'Session expired due to inactivity. Please login again.');
    }, SESSION_TIMEOUT_MS);
}

function resetSessionTimeout() {
    // Reset timeout on any activity
    if (adminPassword) {
        setSessionTimeout();
    }
}

function login() {
    const password = document.getElementById('adminPassword').value;
    if (!password) {
        showError('loginError', 'Please enter password');
        return;
    }

    adminPassword = password;

    // Test authentication by fetching pending requests
    fetch('/api/admin/pending-requests', {
        headers: {
            'X-Admin-Password': adminPassword
        }
    })
    .then(res => {
        if (res.status === 403) {
            throw new Error('Invalid password');
        }
        return res.json();
    })
    .then(() => {
        // Save session to localStorage
        localStorage.setItem(STORAGE_KEY, adminPassword);
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        setSessionTimeout();
        loadDashboard();
    })
    .catch(err => {
        showError('loginError', err.message);
        adminPassword = '';
    });
}

function logout() {
    try {
        if (sessionTimeoutId) {
            clearTimeout(sessionTimeoutId);
            sessionTimeoutId = null;
        }
        localStorage.removeItem(STORAGE_KEY);
        adminPassword = '';

        const loginSection = document.getElementById('loginSection');
        const dashboard = document.getElementById('dashboard');
        const adminPasswordInput = document.getElementById('adminPassword');
        const loginError = document.getElementById('loginError');

        if (loginSection) {
            loginSection.style.display = 'block';
        }
        if (dashboard) {
            dashboard.style.display = 'none';
        }
        if (adminPasswordInput) {
            adminPasswordInput.value = '';
            adminPasswordInput.focus();
        }
        if (loginError) {
            loginError.textContent = '';
        }
    } catch (err) {
        console.error('Error in logout():', err);
    }
}

function showError(elementId, message) {
    document.getElementById(elementId).textContent = message;
}

// Helper function to escape HTML special characters
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
}

// Helper function to validate URLs (for avatar images)
function isValidUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
}

function showTab(tabName, eventTarget) {
    try {
        // Update tab buttons
        document.querySelectorAll('.tabs .tab:not(.logout)').forEach(tab => {
            tab.classList.remove('active');
        });
        if (eventTarget) {
            eventTarget.classList.add('active');
        }

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        const tabElement = document.getElementById(tabName + 'Tab');
        if (tabElement) {
            tabElement.classList.add('active');
        }

        resetSessionTimeout();

        // Load data for the tab
        if (tabName === 'pending') {
            refreshPending();
        } else if (tabName === 'whitelist') {
            refreshWhitelist();
        } else if (tabName === 'tempAccess') {
            refreshTempAccess();
        }
    } catch (err) {
        console.error('Error in showTab():', err);
    }
}

function loadDashboard() {
    refreshPending();
}

function showLoading(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = '<div style="text-align: center; padding: 20px;">Loading...</div>';
    }
}

function refreshPending() {
    resetSessionTimeout();
    showLoading('pendingRequests');
    fetch('/api/admin/pending-requests', {
        headers: { 'X-Admin-Password': adminPassword }
    })
    .then(res => {
        if (res.status === 403) {
            logout();
            showError('loginError', 'Session expired. Please login again.');
            throw new Error('Unauthorized');
        }
        return res.json();
    })
    .then(requests => {
        renderPendingRequests(requests);
    })
    .catch(err => {
        console.error('Error in refreshPending:', err);
        const container = document.getElementById('pendingRequests');
        if (container) {
            container.innerHTML = '<div style="color: red; padding: 10px;">Error loading requests</div>';
        }
    });
}

function refreshWhitelist() {
    resetSessionTimeout();
    showLoading('whitelistUsers');
    fetch('/api/admin/whitelist', {
        headers: { 'X-Admin-Password': adminPassword }
    })
    .then(res => {
        if (res.status === 403) {
            logout();
            showError('loginError', 'Session expired. Please login again.');
            throw new Error('Unauthorized');
        }
        return res.json();
    })
    .then(users => {
        renderWhitelist(users);
    })
    .catch(err => {
        console.error('Error in refreshWhitelist:', err);
        const container = document.getElementById('whitelistUsers');
        if (container) {
            container.innerHTML = '<div style="color: red; padding: 10px;">Error loading whitelist</div>';
        }
    });
}

function refreshTempAccess() {
    resetSessionTimeout();
    showLoading('tempAccessList');
    fetch('/api/admin/temp-access', {
        headers: { 'X-Admin-Password': adminPassword }
    })
    .then(res => {
        if (res.status === 403) {
            logout();
            showError('loginError', 'Session expired. Please login again.');
            throw new Error('Unauthorized');
        }
        return res.json();
    })
    .then(grants => {
        renderTempAccess(grants);
    })
    .catch(err => {
        console.error('Error in refreshTempAccess:', err);
        const container = document.getElementById('tempAccessList');
        if (container) {
            container.innerHTML = '<div style="color: red; padding: 10px;">Error loading temp access</div>';
        }
    });
}

function renderPendingRequests(requests) {
    const container = document.getElementById('pendingRequests');
    if (!container) {
        return;
    }

    if (requests.length === 0) {
        container.innerHTML = '';
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.innerHTML = '<div class="empty-state-icon">📭</div><p>No pending requests</p>';
        container.appendChild(emptyDiv);
        return;
    }

    container.innerHTML = '';

    requests.forEach(req => {
        const card = document.createElement('div');
        card.className = 'request-card';

        // Avatar
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        if (req.avatar && isValidUrl(req.avatar)) {
            const img = document.createElement('img');
            img.src = req.avatar;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.borderRadius = '50%';
            avatar.appendChild(img);
        } else {
            avatar.textContent = '👤';
        }

        // Request info
        const header = document.createElement('div');
        header.className = 'request-header';

        const info = document.createElement('div');
        info.className = 'request-info';

        const emailDiv = document.createElement('div');
        emailDiv.className = 'email';
        emailDiv.textContent = req.email;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'meta';
        metaDiv.innerHTML = `
            Request ID: <code>${escapeHtml(req.requestId)}</code><br>
            Requested: ${new Date(req.requestedAt).toLocaleString()}<br>
            IP: ${escapeHtml(req.ipAddress)}<br>
            Status: <span class="status status-${escapeHtml(req.status)}">${escapeHtml(req.status.toUpperCase())}</span>
        `;

        info.appendChild(emailDiv);
        info.appendChild(metaDiv);
        header.appendChild(avatar);
        header.appendChild(info);
        card.appendChild(header);

        // Action buttons
        if (req.status === 'pending') {
            const actions = document.createElement('div');
            actions.className = 'actions';

            const approveBtn = document.createElement('button');
            approveBtn.className = 'btn btn-approve';
            approveBtn.textContent = '✓ Approve Permanently';
            approveBtn.onclick = () => { resetSessionTimeout(); approveRequest(req.requestId, true); };

            const tempBtn = document.createElement('button');
            tempBtn.className = 'btn btn-temp';
            tempBtn.textContent = '⏰ Temporary Access';
            tempBtn.onclick = () => { resetSessionTimeout(); showTempAccessOptions(req.requestId); };

            const denyBtn = document.createElement('button');
            denyBtn.className = 'btn btn-deny';
            denyBtn.textContent = '✗ Deny';
            denyBtn.onclick = () => { resetSessionTimeout(); denyRequest(req.requestId); };

            actions.appendChild(approveBtn);
            actions.appendChild(tempBtn);
            actions.appendChild(denyBtn);
            card.appendChild(actions);
        }

        container.appendChild(card);
    });
}

function renderWhitelist(users) {
    const container = document.getElementById('whitelistUsers');
    if (!container) {
        return;
    }

    if (users.length === 0) {
        container.innerHTML = '';
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.innerHTML = '<div class="empty-state-icon">📝</div><p>No whitelisted users</p>';
        container.appendChild(emptyDiv);
        return;
    }

    container.innerHTML = '';

    users.forEach(user => {
        const email = typeof user === 'string' ? user : user.email;
        const addedAt = user.addedAt ? new Date(user.addedAt).toLocaleString() : 'Unknown';

        const card = document.createElement('div');
        card.className = 'user-card';

        const header = document.createElement('div');
        header.className = 'user-header';

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = '👤';

        const info = document.createElement('div');
        info.className = 'user-info';

        const emailDiv = document.createElement('div');
        emailDiv.className = 'email';
        emailDiv.textContent = email;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'meta';
        metaDiv.textContent = `Added: ${addedAt}`;

        info.appendChild(emailDiv);
        info.appendChild(metaDiv);
        header.appendChild(avatar);
        header.appendChild(info);
        card.appendChild(header);

        const actions = document.createElement('div');
        actions.className = 'actions';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-remove';
        removeBtn.textContent = 'Remove from Whitelist';
        removeBtn.onclick = () => { resetSessionTimeout(); removeUser(email); };

        actions.appendChild(removeBtn);
        card.appendChild(actions);
        container.appendChild(card);
    });
}

function renderTempAccess(grants) {
    const container = document.getElementById('tempAccessList');
    if (!container) {
        return;
    }

    if (grants.length === 0) {
        container.innerHTML = '';
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.innerHTML = '<div class="empty-state-icon">⏰</div><p>No temporary access grants</p>';
        container.appendChild(emptyDiv);
        return;
    }

    container.innerHTML = '';

    grants.forEach(grant => {
        const expiresAt = new Date(grant.expiresAt);
        const now = new Date();
        const isExpired = expiresAt < now;
        const timeLeft = isExpired ? 'Expired' : formatTimeLeft(expiresAt - now);

        const card = document.createElement('div');
        card.className = 'user-card';

        const header = document.createElement('div');
        header.className = 'user-header';

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = '⏰';

        const info = document.createElement('div');
        info.className = 'user-info';

        const emailDiv = document.createElement('div');
        emailDiv.className = 'email';
        emailDiv.textContent = grant.email;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'meta';
        metaDiv.innerHTML = `
            Granted: ${new Date(grant.grantedAt).toLocaleString()}<br>
            Duration: ${escapeHtml(grant.duration.toString())}h<br>
            <span class="expires">${escapeHtml(timeLeft)}</span>
        `;

        info.appendChild(emailDiv);
        info.appendChild(metaDiv);
        header.appendChild(avatar);
        header.appendChild(info);
        card.appendChild(header);
        container.appendChild(card);
    });
}

function formatTimeLeft(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `Expires in ${days}d ${hours % 24}h`;
    }
    return `Expires in ${hours}h ${minutes}m`;
}

function approveRequest(requestId, permanent) {
    resetSessionTimeout();
    if (!confirm('Approve this user?')) return;

    fetch('/api/admin/approve-request', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ requestId, permanent })
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
        refreshPending();
        if (permanent) refreshWhitelist();
    })
    .catch(err => alert('Error: ' + err.message));
}

function showTempAccessOptions(requestId) {
    resetSessionTimeout();
    const duration = prompt('Enter duration in hours (e.g., 24 for 1 day, 168 for 1 week):', '24');

    if (!duration) return;

    const hours = parseInt(duration);
    if (isNaN(hours) || hours <= 0) {
        alert('Invalid duration');
        return;
    }

    grantTempAccess(requestId, hours);
}

function grantTempAccess(requestId, duration) {
    resetSessionTimeout();
    fetch('/api/admin/grant-temp-access', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ requestId, duration })
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message + '\nExpires: ' + new Date(data.expiresAt).toLocaleString());
        refreshPending();
        refreshTempAccess();
    })
    .catch(err => alert('Error: ' + err.message));
}

function denyRequest(requestId) {
    resetSessionTimeout();
    const reason = prompt('Reason for denial (optional):');

    if (reason === null) return; // User cancelled

    fetch('/api/admin/deny-request', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ requestId, reason })
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
        refreshPending();
    })
    .catch(err => alert('Error: ' + err.message));
}

function addUser() {
    resetSessionTimeout();
    const email = document.getElementById('newUserEmail').value;

    if (!email) {
        alert('Please enter an email address');
        return;
    }

    fetch('/api/admin/add-user', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ email })
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
        if (data.success) {
            document.getElementById('newUserEmail').value = '';
            refreshWhitelist();
        }
    })
    .catch(err => alert('Error: ' + err.message));
}

function removeUser(email) {
    resetSessionTimeout();
    if (!confirm(`Remove ${escapeHtml(email)} from whitelist?`)) return;

    fetch('/api/admin/remove-user', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Admin-Password': adminPassword
        },
        body: JSON.stringify({ email })
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
        refreshWhitelist();
    })
    .catch(err => alert('Error: ' + err.message));
}

// Allow Enter key to login
document.addEventListener('DOMContentLoaded', () => {
    loadSession();
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });
    }
});
