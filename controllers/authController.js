const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../config/db');

function slugify(name) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

function signToken(user) {
  return jwt.sign(
    { userId: user.user_id, shopId: user.shop_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function signup(req, res) {
  try {
    const { shopName, ownerName, email, password } = req.body;
    if (!shopName || !ownerName || !email || !password) {
      return res.status(400).json({ error: 'shopName, ownerName, email, password are all required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const slug = slugify(shopName);

    const pool = await getPool();
    const result = await pool.request()
      .input('ShopName', sql.NVarChar, shopName)
      .input('Slug', sql.NVarChar, slug)
      .input('OwnerName', sql.NVarChar, ownerName)
      .input('Email', sql.NVarChar, email)
      .input('PasswordHash', sql.NVarChar, passwordHash)
      .execute('sp_Signup_CreateShopAndOwner');

    const user = result.recordset[0];
    const token = signToken(user);

    res.status(201).json({
      token,
      user: { id: user.user_id, name: user.name, email: user.email, role: user.role },
      shop: { id: user.shop_id, slug: user.slug },
    });
  } catch (err) {
    if (err.number === 51000) return res.status(409).json({ error: 'Email already registered' });
    if (err.number === 51001) return res.status(409).json({ error: 'Shop name already taken, try a different name' });
    console.error(err);
    res.status(500).json({ error: 'Signup failed' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('Email', sql.NVarChar, email)
      .execute('sp_Login_GetUserByEmail');

    const user = result.recordset[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (user.shop_status !== 'active') return res.status(403).json({ error: 'This shop account is disabled' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.user_id, name: user.name, email: user.email, role: user.role },
      shop: { id: user.shop_id, slug: user.slug },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
}

// Owner creates a staff account for kitchen/counter access
async function createStaff(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, password are required' });
    }
    const passwordHash = await bcrypt.hash(password, 10);

    const pool = await getPool();
    const result = await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .input('Name', sql.NVarChar, name)
      .input('Email', sql.NVarChar, email)
      .input('PasswordHash', sql.NVarChar, passwordHash)
      .execute('sp_Staff_Create');

    res.status(201).json({ userId: result.recordset[0].user_id });
  } catch (err) {
    if (err.number === 51000) return res.status(409).json({ error: 'Email already registered' });
    console.error(err);
    res.status(500).json({ error: 'Could not create staff account' });
  }
}

module.exports = { signup, login, createStaff };
