const { sql, getPool } = require('../config/db');

// ---- Public: customer submits a review after their order is served ----
async function createReview(req, res) {
  try {
    const { orderToken, rating, comment } = req.body;
    if (!orderToken || !rating) return res.status(400).json({ error: 'orderToken and rating are required' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'rating must be between 1 and 5' });

    const pool = await getPool();
    const orderRes = await pool.request()
      .input('Token', sql.NVarChar, orderToken)
      .query('SELECT id, shop_id FROM orders WHERE order_token = @Token');
    const order = orderRes.recordset[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await pool.request()
      .input('ShopId', sql.Int, order.shop_id)
      .input('OrderId', sql.Int, order.id)
      .input('Rating', sql.Int, rating)
      .input('Comment', sql.NVarChar, comment || null)
      .execute('sp_Review_Create');

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit review' });
  }
}

// ---- Admin: reviews list + summary ----
async function listReviews(req, res) {
  try {
    const onlyLowRated = req.query.lowRated === 'true';
    const pool = await getPool();
    const result = await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .input('OnlyLowRated', sql.Bit, onlyLowRated)
      .execute('sp_Review_ListForShop');
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch reviews' });
  }
}

async function reviewSummary(req, res) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .execute('sp_Review_Summary');
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch review summary' });
  }
}

// ---- Admin: sales report ----
async function salesReport(req, res) {
  try {
    const { from, to, status, paymentMethod } = req.query;
    const fromDate = from || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);

    const pool = await getPool();
    const result = await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .input('FromDate', sql.Date, fromDate)
      .input('ToDate', sql.Date, toDate)
      .input('OrderStatus', sql.NVarChar, status && status !== 'all' ? status : null)
      .input('PaymentMethod', sql.NVarChar, paymentMethod && paymentMethod !== 'all' ? paymentMethod : null)
      .execute('sp_Report_Sales');

    const [summary, byDay, bestSellers, statusBreakdown, paymentBreakdown] = result.recordsets;
    res.json({ summary: summary[0], byDay, bestSellers, statusBreakdown, paymentBreakdown });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch sales report' });
  }
}

module.exports = { createReview, listReviews, reviewSummary, salesReport };
