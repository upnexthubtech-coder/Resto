require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');

const { initSocket } = require('./socket');
const authRoutes = require('./routes/authRoutes');
const menuRoutes = require('./routes/menuRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reportRoutes = require('./routes/reportRoutes');
const publicRoutes = require('./routes/publicRoutes');

const app = express();
const httpServer = http.createServer(app);

const allowedOrigins = [process.env.ADMIN_APP_URL, process.env.MENU_APP_URL].filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Auth (signup/login are public inside this router; staff creation requires auth)
app.use('/api/auth', authRoutes);

// Admin-only, tenant-scoped routes (all require a valid JWT)
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);

// Public, no-login routes for customers scanning a QR code
app.use('/api/public', publicRoutes);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

initSocket(httpServer, allowedOrigins);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`QR Menu SaaS API running on port ${PORT}`);
});
