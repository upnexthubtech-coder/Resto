const { Server } = require('socket.io');

let io;

function initSocket(httpServer, corsOrigins) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigins, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    // Admin/kitchen dashboards join a room named after their shop right after connecting.
    // Everything emitted to that room is invisible to every other tenant.
    socket.on('join_shop', (shopId) => {
      if (!shopId) return;
      socket.join(`shop_${shopId}`);
    });

    // Customer's order-status screen joins a room for just their one order token,
    // so they only get updates for their own order, not the whole shop's traffic.
    socket.on('join_order', (orderToken) => {
      if (!orderToken) return;
      socket.join(`order_${orderToken}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io not initialized yet');
  return io;
}

// Notify the shop's kitchen/admin dashboard of a new order
function emitNewOrder(shopId, order) {
  getIO().to(`shop_${shopId}`).emit('new_order', order);
}

// Notify both the shop dashboard and the specific customer screen of a status change
function emitOrderStatusChanged(shopId, orderToken, order) {
  getIO().to(`shop_${shopId}`).emit('order_status_updated', order);
  getIO().to(`order_${orderToken}`).emit('order_status_updated', order);
}

module.exports = { initSocket, getIO, emitNewOrder, emitOrderStatusChanged };
