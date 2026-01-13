export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  res.setHeader('Set-Cookie', 'jwt=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  return res.status(200).json({ success: true, message: 'Logged out successfully' });
}
