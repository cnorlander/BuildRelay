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

module.exports = clientPromise;
