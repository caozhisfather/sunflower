// 后台式扫描任务：本地版在启动与页面 onShow 时执行；正式版由服务端定时任务承担。
const { orders, settlements } = require('./data');
const { today } = require('./format');
const { push } = require('./notify');
const { isCloudEnabled } = require('./cloud');

// 模拟退款到账延迟
const REFUND_DELAY_MS = 8000;

// 过期订单自动取消：待接单 / 已接单未付定金，且服务日期已过
function sweepExpiredOrders() {
    if (isCloudEnabled()) return;
    orders.list().then(function (result) {
        const t = today();
        const expired = (result.data || []).filter(function (o) {
            return (o.status === 'pending' || o.status === 'accepted') && o.serviceDate < t;
        });
        expired.forEach(function (o) {
            orders.update(o.id, {
                status: 'cancelled',
                cancelReason: '服务日期已过，系统自动取消',
                cancelledByRole: 'system',
            }, { status: o.status, serviceDate: o.serviceDate }).then(function (result) {
                if (result.error) return;
                push(o.interpreterId, 'interpreter', {
                    orderId: o.id,
                    title: '预约已自动取消',
                    body: '服务日期已过，商家未完成定金支付，预约已自动取消',
                });
                push(o.businessId, 'business', {
                    orderId: o.id,
                    title: '预约已自动取消',
                    body: '服务日期已过且未支付定金，预约已自动取消',
                });
            });
        });
    });
}

// 模拟退款完成：取消时定金在途（refundStatus=pending），到点自动到账
function sweepPendingRefunds() {
    if (isCloudEnabled()) return;
    return orders.list().then(function (result) {
        const now = Date.now();
        return Promise.all((result.data || []).map(function (o) {
            if (o.status !== 'cancelled' || o.refundStatus !== 'pending' || !o.updatedAt) {
                return;
            }
            if (now - new Date(o.updatedAt).getTime() >= REFUND_DELAY_MS) {
                return orders.update(o.id, {
                    refundStatus: 'done',
                    refundedAt: new Date().toISOString(),
                }, { status: o.status, refundStatus: o.refundStatus });
            }
        }));
    });
}

// 模拟结算到账：译员申请结算（pending）到点自动到账
let settlementSweep;
function sweepPendingSettlements() {
    if (isCloudEnabled()) return;
    if (settlementSweep) return settlementSweep;
    settlementSweep = settlements.list().then(function (result) {
        const now = Date.now();
        return Promise.all((result.data || []).map(function (s) {
            if (s.status !== 'pending' || !s.createdAt) {
                return;
            }
            if (now - new Date(s.createdAt).getTime() >= REFUND_DELAY_MS) {
                return settlements.update(s.id, {
                    status: 'done',
                    paidAt: new Date().toISOString(),
                }, { status: s.status }).then(function (updated) {
                    if (updated.error) return;
                    return push(s.userId, 'interpreter', {
                        title: '结算到账',
                        body: '结算单 ¥' + s.amount + ' 已模拟到账，请查收',
                    });
                });
            }
        }));
    }).finally(function () {
        settlementSweep = null;
    });
    return settlementSweep;
}

module.exports = {
    sweepExpiredOrders: sweepExpiredOrders,
    sweepPendingRefunds: sweepPendingRefunds,
    sweepPendingSettlements: sweepPendingSettlements,
};
