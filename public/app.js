let adminPassword = '';

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
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        loadDashboard();
    })
    .catch(err => {
        showError('loginError', err.message);
        adminPassword = '';
    });
}

function logout() {
    adminPassword = '';
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('adminPassword').value = '';
}

function showError(elementId, message) {
    document.getElementById(elementId).textContent = message;
}

function showTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tabs .tab:not(.logout)').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    document.getElementById(tabName + 'Tab').classList.add('active');

    // Load data for the tab
    if (tabName === 'pending') {
        refreshPending();
    } else if (tabName === 'whitelist') {
        refreshWhitelist();
    } else if (tabName === 'tempAccess') {
        refreshTempAccess();
    }
}

function loadDashboard() {
    refreshPending();
}

function refreshPending() {
    fetch('/api/admin/pending-requests', {
        headers: { 'X-Admin-Password': adminPassword }
    })
    .then(res => res.json())
    .then(requests => {
        renderPendingRequests(requests);
    })
    .catch(err => console.error(err));
}

function refreshWhitelist() {
    fetch('/api/admin/whitelist', {
        headers: { 'X-Admin-Password': adminPassword }
    })
    .then(res => res.json())
    .then(users => {
        renderWhitelist(users);
    })
    .catch(err => console.error(err));
}

function refreshTempAccess() {
    fetch('/api/admin/temp-access', {
        headers: { 'X-Admin-Password': adminPassword }
    })
    .then(res => res.json())
    .then(grants => {
        renderTempAccess(grants);
    })
    .catch(err => console.error(err));
}

function renderPendingRequests(requests) {
    const container = document.getElementById('pendingRequests');

    if (requests.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <p>No pending requests</p>
            </div>
        `;
        return;
    }

    container.innerHTML = requests.map(req => `
        <div class="request-card">
            <div class="request-header">
                <div class="avatar">${req.avatar ? `<img src="${req.avatar}" style="width:100%;height:100%;border-radius:50%;" />` : '👤'}</div>
                <div class="request-info">
                    <div class="email">${req.email}</div>
                    <div class="meta">
                        Request ID: ${req.requestId}<br>
                        Requested: ${new Date(req.requestedAt).toLocaleString()}<br>
                        IP: ${req.ipAddress}<br>
                        Status: <span class="status status-${req.status}">${req.status.toUpperCase()}</span>
                    </div>
                </div>
            </div>
            ${req.status === 'pending' ? `
                <div class="actions">
                    <button class="btn btn-approve" onclick="approveRequest('${req.requestId}', true)">
                        ✓ Approve Permanently
                    </button>
                    <button class="btn btn-temp" onclick="showTempAccessOptions('${req.requestId}')">
                        ⏰ Temporary Access
                    </button>
                    <button class="btn btn-deny" onclick="denyRequest('${req.requestId}')">
                        ✗ Deny
                    </button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function renderWhitelist(users) {
    const container = document.getElementById('whitelistUsers');

    if (users.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <p>No whitelisted users</p>
            </div>
        `;
        return;
    }

    container.innerHTML = users.map(user => {
        const email = typeof user === 'string' ? user : user.email;
        const addedAt = user.addedAt ? new Date(user.addedAt).toLocaleString() : 'Unknown';

        return `
            <div class="user-card">
                <div class="user-header">
                    <div class="avatar">👤</div>
                    <div class="user-info">
                        <div class="email">${email}</div>
                        <div class="meta">Added: ${addedAt}</div>
                    </div>
                </div>
                <div class="actions">
                    <button class="btn btn-remove" onclick="removeUser('${email}')">
                        Remove from Whitelist
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderTempAccess(grants) {
    const container = document.getElementById('tempAccessList');

    if (grants.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⏰</div>
                <p>No temporary access grants</p>
            </div>
        `;
        return;
    }

    container.innerHTML = grants.map(grant => {
        const expiresAt = new Date(grant.expiresAt);
        const now = new Date();
        const isExpired = expiresAt < now;
        const timeLeft = isExpired ? 'Expired' : formatTimeLeft(expiresAt - now);

        return `
            <div class="user-card">
                <div class="user-header">
                    <div class="avatar">⏰</div>
                    <div class="user-info">
                        <div class="email">${grant.email}</div>
                        <div class="meta">
                            Granted: ${new Date(grant.grantedAt).toLocaleString()}<br>
                            Duration: ${grant.duration}h<br>
                            <span class="expires">${timeLeft}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
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
    if (!confirm(`Remove ${email} from whitelist?`)) return;

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
    document.getElementById('adminPassword')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
});
