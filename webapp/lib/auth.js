const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createHmac } = require('crypto');
const clientPromise = require('./valkey');

// JWT_SECRET is REQUIRED in production - no default fallback
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. This is required for authentication.');
}

const JWT_EXPIRY = '24h';

// Ensure a default user exists in Valkey for initial login
async function ensureDefaultUserExists() {
  const client = await clientPromise;
  const username = process.env.DEFAULT_USERNAME;
  const password = process.env.DEFAULT_PASSWORD;

  // Both must be set - no hardcoded defaults
  if (!username || !password) {
    console.warn('WARNING: DEFAULT_USERNAME and/or DEFAULT_PASSWORD not set. Default user will not be created.');
    return;
  }

  const userJson = await client.get(`user:${username}`);
  
  if (!userJson) {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = {
      username,
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString(),
    };
    
    await client.set(`user:${username}`, JSON.stringify(user));
    console.log(`Default user '${username}' created`);
  }
}

// Verify provided password against stored hash for given username
export async function verifyPassword(username, password) {
  await ensureDefaultUserExists();
  
  const client = await clientPromise;
  const userJson = await client.get(`user:${username}`);
  
  if (!userJson) {
    return false;
  }

  const user = JSON.parse(userJson);
  return await bcrypt.compare(password, user.passwordHash);
}

// Generate JWT token for given username
export function generateJWT(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

// Verify JWT token and return decoded payload or null if invalid
export function verifyJWT(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Validate provided API key against server-stored key
export function validateApiKey(key) {
  return key === process.env.API_KEY;
}

// Validate request authentication via API key or JWT token
export function validateAuth(req) {
  // Check for API key first
  const apiKey = req.headers['x-api-key'];
  if (apiKey && validateApiKey(apiKey)) {
    return true;
  }

  // Check for JWT cookie
  const token = req.cookies.jwt;
  if (token && verifyJWT(token)) {
    return true;
  }

  return false;
}

// Verify HMAC-SHA256 webhook signature
// Used by services like Unity Cloud Build that provide signed webhooks
export function verifyWebhookSignature(body, signature, secret) {
  if (!secret || !signature) {
    return false;
  }

  try {
    const computed = createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    return computed === signature;
  } catch (err) {
    console.error('Error verifying webhook signature:', err);
    return false;
  }
}

