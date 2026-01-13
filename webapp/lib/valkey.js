const { GlideClient } = require('@valkey/valkey-glide');
const env = require('./env');

const addresses = [
    {
        host: env.VALKEY_HOST,
        port: env.VALKEY_PORT,
    },
];

const clientPromise = GlideClient.createClient({
    addresses: addresses,
    requestTimeout: 500, // 500ms timeout
});

// Create a separate stream client that's not limited by request timeout
const streamClientPromise = GlideClient.createClient({
    addresses: addresses,
    requestTimeout: 30000, // 30 second timeout for blocking operations
});

module.exports = clientPromise;
module.exports.streamClient = streamClientPromise;
