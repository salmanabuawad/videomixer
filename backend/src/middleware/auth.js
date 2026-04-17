import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || 'change_me_in_prod';

export function signSession({ user_id, user_name, user_role }) {
  return jwt.sign({ user_id, user_name, user_role }, SECRET, { expiresIn: '7d' });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}
