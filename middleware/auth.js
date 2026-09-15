const jwt = require('jsonwebtoken');

// Verifies the JWT and attaches { userId, shopId, role } to req.auth
// EVERY protected route must use this, and every query after it must
// filter by req.auth.shopId - that is what keeps tenants isolated.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = { userId: payload.userId, shopId: payload.shopId, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optional role gate, e.g. requireRole('owner')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Not permitted for this role' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
