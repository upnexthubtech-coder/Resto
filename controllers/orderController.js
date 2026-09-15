const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const { sql, getPool } = require('../config/db');
const { emitNewOrder, emitOrderStatusChanged } = require('../socket');

function generateOrderToken() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
  const letter = letters[Math.floor(Math.random() * letters.length)];
  const digits = Math.floor(100 + Math.random() * 900); // 3-digit
  return `${letter}${digits}`;
}

// ---- Public: customer places an order (no login) ----
async function createOrder(req, res) {
  try {
    const { slug, tableNumber, items, paymentMethod = 'offline' } = req.body;
    if (!slug || !tableNumber || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'slug, tableNumber, and at least one item are required' });
    }
    if (!['online', 'offline'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'paymentMethod must be online or offline' });
    }

    const pool = await getPool();

    const shopResult = await pool.request()
      .input('Slug', sql.NVarChar, slug)
      .query('SELECT id FROM shops WHERE slug = @Slug AND status = \'active\'');
    const shop = shopResult.recordset[0];
    if (!shop) return res.status(404).json({ error: 'Shop not found or inactive' });

    let orderToken = generateOrderToken();
    // retry a couple of times on the rare collision
    for (let i = 0; i < 5; i++) {
      const existing = await pool.request()
        .input('Token', sql.NVarChar, orderToken)
        .query('SELECT 1 FROM orders WHERE order_token = @Token');
      if (existing.recordset.length === 0) break;
      orderToken = generateOrderToken();
    }

    const orderResult = await pool.request()
      .input('ShopId', sql.Int, shop.id)
      .input('TableNumber', sql.NVarChar, tableNumber)
      .input('OrderToken', sql.NVarChar, orderToken)
      .input('PaymentMethod', sql.NVarChar, paymentMethod)
      .execute('sp_Order_Create');
    const orderId = orderResult.recordset[0].order_id;

    for (const item of items) {
      await pool.request()
        .input('OrderId', sql.Int, orderId)
        .input('ItemId', sql.Int, item.itemId)
        .input('ItemName', sql.NVarChar, item.name)
        .input('Qty', sql.Int, item.qty)
        .input('Price', sql.Decimal(10, 2), item.price)
        .execute('sp_OrderItem_Add');
    }

    const finalResult = await pool.request()
      .input('OrderId', sql.Int, orderId)
      .execute('sp_Order_FinalizeTotal');
    const order = finalResult.recordset[0];

    emitNewOrder(shop.id, { ...order, items });

    res.status(201).json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not place order' });
  }
}

// ---- Public: order status/confirmation lookup ----
async function getOrderByToken(req, res) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('OrderToken', sql.NVarChar, req.params.token)
      .execute('sp_Order_GetByToken');

    const [orderRows, itemRows] = result.recordsets;
    if (!orderRows[0]) return res.status(404).json({ error: 'Order not found' });

    res.json({ order: orderRows[0], items: itemRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch order' });
  }
}

// ---- Admin: live board for kitchen display ----
async function listActiveOrders(req, res) {
  try {
    const pool = await getPool();
    const ordersResult = await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .execute('sp_Order_ListActiveForShop');

    const itemsResult = await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .execute('sp_Order_GetItemsBulk');

    const itemsByOrder = {};
    for (const row of itemsResult.recordset) {
      if (!itemsByOrder[row.order_id]) itemsByOrder[row.order_id] = [];
      itemsByOrder[row.order_id].push(row);
    }

    const orders = ordersResult.recordset.map((o) => ({ ...o, items: itemsByOrder[o.id] || [] }));
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch active orders' });
  }
}

// ---- Admin/staff: move an order to the next status ----
async function updateOrderStatus(req, res) {
  try {
    const { status } = req.body;
    const allowed = ['received', 'preparing', 'ready', 'served', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const pool = await getPool();
    const result = await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .input('OrderId', sql.Int, req.params.id)
      .input('Status', sql.NVarChar, status)
      .execute('sp_Order_UpdateStatus');

    const order = result.recordset[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    emitOrderStatusChanged(req.auth.shopId, order.order_token, order);
    res.json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update order status' });
  }
}

async function updatePaymentStatus(req, res) {
  try {
    const { paymentStatus } = req.body;
    if (!['pending', 'paid', 'failed'].includes(paymentStatus)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .input('OrderId', sql.Int, req.params.id)
      .input('PaymentStatus', sql.NVarChar, paymentStatus)
      .execute('sp_Order_UpdatePaymentStatus');

    const order = result.recordset[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update payment status' });
  }
}

// ---- Admin: complete order by scanning its barcode at the counter ----
async function completeByToken(req, res) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('ShopId', sql.Int, req.auth.shopId)
      .input('OrderToken', sql.NVarChar, req.params.token)
      .execute('sp_Order_CompleteByToken');

    const order = result.recordset[0];
    if (!order) return res.status(404).json({ error: 'Order not found for this shop' });

    emitOrderStatusChanged(req.auth.shopId, order.order_token, order);
    res.json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not complete order' });
  }
}

// ---- Barcode image for an order token (used on receipt / confirmation screen) ----
async function getOrderBarcode(req, res) {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: req.params.token,
      scale: 3,
      height: 12,
      includetext: true,
      textxalign: 'center',
    });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not generate barcode' });
  }
}

// ---- QR code for a shop's table (used by admin to print table QR codes) ----
async function getTableQr(req, res) {
  try {
    const { slug, tableNumber } = req.params;
    const url = tableNumber
      ? `${process.env.MENU_APP_URL}/menu/${slug}/${tableNumber}`
      : `${process.env.MENU_APP_URL}/menu/${slug}`;
    const png = await QRCode.toBuffer(url, { width: 400, margin: 2 });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not generate QR code' });
  }
}

module.exports = {
  createOrder, getOrderByToken, listActiveOrders,
  updateOrderStatus, updatePaymentStatus, completeByToken, getOrderBarcode, getTableQr,
};
