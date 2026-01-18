require('dotenv').config();

// Load environment variables with defaults where applicable
const env = {
  VALKEY_HOST: process.env.VALKEY_HOST || 'localhost',
  VALKEY_PORT: process.env.VALKEY_PORT || 6379,
  API_KEY: process.env.API_KEY,
  BUILD_INGEST_PATH: process.env.BUILD_INGEST_PATH,
};

module.exports = env;
