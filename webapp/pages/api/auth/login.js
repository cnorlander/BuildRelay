import { verifyPassword, generateJWT } from '@lib/auth';

// ============================================================================
// LOGIN API ROUTE
// ============================================================================
// Handles user authentication via username and password
// Generates and sets JWT token in HTTP-only cookie on successful login
// Returns error on invalid credentials or authentication failure
//
// Supported Methods:
//   - POST: Authenticate user with username and password
// ============================================================================

export default async function handler(req, res) {
  // ========================================================================
  // Method Validation
  // ========================================================================
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // ========================================================================
  // Extract and Validate Credentials
  // ========================================================================
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // ========================================================================
  // Verify Password and Generate Token
  // ========================================================================
  try {
    // Verify credentials against stored password hash
    const isValid = await verifyPassword(username, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token with user identity
    const token = generateJWT(username);
    // Set HTTP-only cookie to prevent XSS attacks (24 hour expiration)
    res.setHeader('Set-Cookie', `jwt=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
    return res.status(200).json({ success: true, message: 'Logged in successfully' });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
}
