// 站内通知：订单状态变动时写入对方收件箱（user_id + role 定位收件人）。
// 本地版收件人按 'me' 与 demo 账号区分；上云后应由服务端写入
// （RLS 不允许客户端替其他用户创建行）。
const { notifications } = require('./data');

function push(userId, role, payload) {
    const row = {
        userId: userId,
        role: role,
        type: payload.type || 'order',
        title: payload.title || '',
        body: payload.body || '',
        read: 0,
    };
    if (payload.orderId !== undefined && payload.orderId !== '') {
        row.orderId = payload.orderId;
    }
    return notifications.create(row);
}

module.exports = { push: push };
