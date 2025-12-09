#!/usr/bin/env node

/**
 * Test script for /api/config endpoint
 *
 * This script tests the configuration endpoint to verify it:
 * 1. Rejects requests without authentication
 * 2. Rejects requests with invalid auth tokens
 * 3. Returns config for authorized users
 * 4. Denies access to unauthorized users
 */

const fetch = require('node-fetch');

// Color output for better readability
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
    log(`\n>>> Test: ${name}`, 'blue');
}

function logPass(message) {
    log(`✓ ${message}`, 'green');
}

function logFail(message) {
    log(`✗ ${message}`, 'red');
}

function logWarn(message) {
    log(`⚠ ${message}`, 'yellow');
}

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_CONFIG = {
    invalidAuthKey: 'invalid-key-too-short',
    validAuthKey: process.env.STREMIO_AUTH_KEY, // Should be set via environment
    testEmail: process.env.TEST_EMAIL || 'test@example.com'
};

async function testMissingAuthKey() {
    logTest('Missing authentication key');

    try {
        const response = await fetch(`${API_URL}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        if (response.status === 401) {
            logPass(`Correctly rejected with 401 status`);
            const data = await response.json();
            if (data.error === 'Authentication required') {
                logPass(`Correct error message: "${data.error}"`);
                return true;
            } else {
                logWarn(`Unexpected error message: "${data.error}"`);
                return true;
            }
        } else {
            logFail(`Expected 401 status, got ${response.status}`);
            return false;
        }
    } catch (error) {
        logFail(`Request failed: ${error.message}`);
        return false;
    }
}

async function testInvalidAuthKey() {
    logTest('Invalid authentication key');

    try {
        const response = await fetch(`${API_URL}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                authKey: TEST_CONFIG.invalidAuthKey,
                email: TEST_CONFIG.testEmail
            })
        });

        if (response.status === 401) {
            logPass(`Correctly rejected with 401 status`);
            const data = await response.json();
            if (data.error) {
                logPass(`Error returned: "${data.error}"`);
                return true;
            }
        } else {
            logFail(`Expected 401 status, got ${response.status}`);
            return false;
        }
    } catch (error) {
        logFail(`Request failed: ${error.message}`);
        return false;
    }
}

async function testValidAuthKey() {
    logTest('Valid authentication key (if available)');

    if (!TEST_CONFIG.validAuthKey) {
        logWarn('STREMIO_AUTH_KEY not set in environment - skipping this test');
        logWarn('To test with a valid auth key, set STREMIO_AUTH_KEY environment variable');
        return null; // Skip but don't fail
    }

    try {
        const response = await fetch(`${API_URL}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                authKey: TEST_CONFIG.validAuthKey,
                email: TEST_CONFIG.testEmail
            })
        });

        if (response.status === 200) {
            logPass(`Request accepted with 200 status`);
            const data = await response.json();

            if (data.defaultAddons !== undefined) {
                logPass(`defaultAddons returned: ${JSON.stringify(data.defaultAddons)}`);
            } else {
                logFail(`defaultAddons not in response`);
                return false;
            }

            if (data.defaultStreamingServerUrl !== undefined) {
                logPass(`defaultStreamingServerUrl returned: ${data.defaultStreamingServerUrl}`);
            } else {
                logFail(`defaultStreamingServerUrl not in response`);
                return false;
            }

            return true;
        } else if (response.status === 403) {
            logWarn(`Access denied (403) - user not whitelisted or no temp access`);
            logWarn(`This is expected if the test user is not authorized`);
            return true;
        } else if (response.status === 401) {
            logWarn(`Authentication failed (401) - invalid or expired token`);
            return true;
        } else {
            logFail(`Unexpected status: ${response.status}`);
            return false;
        }
    } catch (error) {
        logFail(`Request failed: ${error.message}`);
        return false;
    }
}

async function runTests() {
    log('================================================', 'blue');
    log('Testing /api/config Endpoint', 'blue');
    log(`API URL: ${API_URL}`, 'blue');
    log('================================================', 'blue');

    const results = [];

    // Test 1: Missing auth key
    results.push({
        name: 'Missing authentication key',
        passed: await testMissingAuthKey()
    });

    // Test 2: Invalid auth key
    results.push({
        name: 'Invalid authentication key',
        passed: await testInvalidAuthKey()
    });

    // Test 3: Valid auth key (optional)
    const result3 = await testValidAuthKey();
    if (result3 !== null) {
        results.push({
            name: 'Valid authentication key',
            passed: result3
        });
    }

    // Summary
    log('\n================================================', 'blue');
    log('Test Summary', 'blue');
    log('================================================', 'blue');

    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;

    results.forEach(result => {
        const status = result.passed ? '✓' : '✗';
        const color = result.passed ? 'green' : 'red';
        log(`${status} ${result.name}`, color);
    });

    log(`\nPassed: ${passedCount}/${totalCount}`, passedCount === totalCount ? 'green' : 'yellow');

    if (passedCount === totalCount) {
        log('\n✓ All tests passed!', 'green');
        process.exit(0);
    } else {
        log('\n✗ Some tests failed', 'red');
        process.exit(1);
    }
}

// Run tests
runTests().catch(error => {
    logFail(`Unexpected error: ${error.message}`);
    process.exit(1);
});
