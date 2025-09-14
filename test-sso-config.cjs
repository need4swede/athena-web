// Test script to verify SSO configuration with environment variables
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#') && line.includes('=')) {
            const [key, value] = line.split('=', 2);
            if (key && value) {
                process.env[key.trim()] = value.trim();
            }
        }
    });
    console.log('📄 Loaded environment variables from .env file\n');
} else {
    console.log('⚠️  No .env file found\n');
}

console.log('🧪 Testing SSO Configuration System\n');

// 1. Check if sso-config.json exists
const configPath = path.join(__dirname, 'public', 'sso-config.json');
console.log('1️⃣ Checking sso-config.json file...');
if (fs.existsSync(configPath)) {
    console.log('✅ sso-config.json exists');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('   - Microsoft provider enabled:', config.providers.microsoft.enabled);
    console.log('   - Client ID placeholder:', config.providers.microsoft.clientId);
    console.log('   - Access control domains:', config.accessControl.allowedDomains);
} else {
    console.log('❌ sso-config.json not found');
}

// 2. Check environment variables
console.log('\n2️⃣ Checking environment variables...');
const requiredEnvVars = [
    'SSO_MICROSOFT_CLIENT_ID',
    'SSO_MICROSOFT_CLIENT_SECRET',
    'SSO_MICROSOFT_TENANT_ID',
    'SSO_ALLOWED_DOMAINS',
    'SSO_ALLOWED_EMAILS'
];

requiredEnvVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        console.log(`✅ ${varName}: ${value.substring(0, 10)}...`);
    } else {
        console.log(`❌ ${varName}: Not set`);
    }
});

// 3. Test environment variable substitution
console.log('\n3️⃣ Testing environment variable substitution...');
function substituteEnvVars(text) {
    const pattern = /\$\{([^}]+)\}/g;
    return text.replace(pattern, (match, varName) => {
        return process.env[varName] || '';
    });
}

const testString = '${SSO_MICROSOFT_CLIENT_ID}';
const substituted = substituteEnvVars(testString);
console.log(`   - Input: ${testString}`);
console.log(`   - Output: ${substituted || '(empty)'}`);

// 4. Test access control logic
console.log('\n4️⃣ Testing access control logic...');
function parseCommaSeparatedList(value) {
    if (!value || value.trim() === '') return [];
    return value.split(',').map(item => item.trim().toLowerCase());
}

function checkAccessControl(email, allowedDomains, allowedEmails) {
    if (!email || !email.includes('@')) return false;

    email = email.toLowerCase().trim();
    const domain = email.split('@')[1];

    if (allowedEmails.length > 0) {
        return allowedEmails.includes(email);
    }

    if (allowedDomains.length > 0) {
        return allowedDomains.includes(domain);
    }

    return true;
}

const testEmails = [
    'user@example.com',
    'admin@example.com',
    'user@otherdomain.com'
];

const allowedDomains = parseCommaSeparatedList(process.env.SSO_ALLOWED_DOMAINS || '');
const allowedEmails = parseCommaSeparatedList(process.env.SSO_ALLOWED_EMAILS || '');

console.log(`   - Allowed domains: ${allowedDomains.join(', ') || '(none)'}`);
console.log(`   - Allowed emails: ${allowedEmails.join(', ') || '(none)'}`);

testEmails.forEach(email => {
    const allowed = checkAccessControl(email, allowedDomains, allowedEmails);
    console.log(`   - ${email}: ${allowed ? '✅ Allowed' : '❌ Denied'}`);
});

console.log('\n✅ SSO configuration test complete!');
console.log('\n📝 Next steps:');
console.log('1. Set the environment variables in your .env file');
console.log('2. Restart the server to load the new configuration');
console.log('3. The SSO system will automatically substitute environment variables');
