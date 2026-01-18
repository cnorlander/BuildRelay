const { GlideClient } = require('@valkey/valkey-glide');
const env = require('./env');

// Configure Valkey server addresses
const addresses = [
    {
        host: env.VALKEY_HOST,
        port: env.VALKEY_PORT,
    },
];

// Determine if SSL should be used based on environment variable
const useSsl = (env.VALKEY_USE_SSL || 'false').toLowerCase() === 'true';

// Create Valkey Glide client for general use
const clientPromise = GlideClient.createClient({
    addresses: addresses,
    credentials: {
        password: env.VALKEY_PASSWORD || 'change_in_production',
    },
    useSsl: useSsl,
    requestTimeout: 500, // 500ms timeout
});

// Create a separate stream client that's not limited by request timeout
const streamClientPromise = GlideClient.createClient({
    addresses: addresses,
    credentials: {
        password: env.VALKEY_PASSWORD || 'change_in_production',
    },
    useSsl: useSsl,
    requestTimeout: 30000, // 30 second timeout for blocking operations
});

module.exports = clientPromise;
module.exports.streamClient = streamClientPromise;
