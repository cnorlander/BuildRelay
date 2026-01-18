// ============================================================================
// LOGOUT API ROUTE
// ============================================================================
// Handles user logout by clearing JWT authentication cookie
// Clears the HTTP-only JWT cookie to end user session
//
// Supported Methods:
//   - POST: Clear authentication cookie and logout user
// ============================================================================

export default function handler(req, res) {
  // ========================================================================
  // Method Validation
  // ========================================================================
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }


  // Clear Authentication Cookie
  // Set JWT cookie with Max-Age=0 to expire immediately
  res.setHeader('Set-Cookie', 'jwt=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  return res.status(200).json({ success: true, message: 'Logged out successfully' });
}
