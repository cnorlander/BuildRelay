import { verifyPassword, generateJWT } from '@lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const isValid = await verifyPassword(username, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateJWT(username);
    res.setHeader('Set-Cookie', `jwt=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
    return res.status(200).json({ success: true, message: 'Logged in successfully' });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
}
