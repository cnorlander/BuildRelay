const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const clientPromise = require('./valkey');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '24h';


async function ensureDefaultUserExists() {
  const client = await clientPromise;
  const username = process.env.DEFAULT_USERNAME || 'admin';
  const userJson = await client.get(`user:${username}`);
  
  if (!userJson) {
    const password = process.env.DEFAULT_PASSWORD || 'bob_the_builder';
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

export function generateJWT(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyJWT(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export function validateApiKey(key) {
  console.log('Validating API key:', key, 'against', process.env.API_KEY);
  
  return key === process.env.API_KEY;
}

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
