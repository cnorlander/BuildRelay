require('dotenv').config();

const env = {
  VALKEY_HOST: process.env.VALKEY_HOST || 'localhost',
  VALKEY_PORT: process.env.VALKEY_PORT || 6379,
  API_KEY: process.env.API_KEY,
};

module.exports = env;
