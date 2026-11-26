const session = require('../../utils/session');
const { orders, settlements } = require('../../utils/data');
const { friendlyDate } = require('../../utils/format');
const { sweepPendingSettlements } = require('../../utils/sweep');

Page({
    data: {
        authState: 'checking',
        role: '',
        loading: true,
        // 已结算（订单已完成、尾款已付）
        settledTotal: 0,
        settledCount: 0,
        // 待结算（服务已完成、尾款未付）
        pendingTotal: 0,
        pendingCount: 0,
        settledRecords: [],
        pendingRecords: [],
        // 结算单（提现）
        balance: 0,
        withdrawnTotal: 0,
        settlementRecords: [],
        requesting: false,
    },

    onShow() {
        const current = session.getSession();
        if (!current || current.role !== 'interpreter') {
            this.setData({ authState: 'onboard' });
            return;
        }
        this.setData({ authState: 'ready', role: current.role });
        this.refresh();
    },

    async refresh() {
        await sweepPendingSettlements();
        this.load();
    },

    onUnload() {
        clearTimeout(this.settleTimer);
    },

    goHome() {
        wx.switchTab({ url: '/pages/index/index' });
    },

    load() {
        const self = this;
        this.setData({ loading: true });
        Promise.all([orders.list(), settlements.list()]).then(function (results) {
            if (results[0].error || results[1].error) {
                self.setData({ loading: false });
                wx.showToast({ title: '加载失败，请重试', icon: 'none' });
                return;
            }
            const mine = results[0].data.filter(function (o) {
                return o.interpreterId === 'me';
            });
            const settled = mine.filter(function (o) {
                return o.status === 'finished';
            });
            const pending = mine.filter(function (o) {
                return o.status === 'completed';
            });

            const decorate = function (o, paidLabel) {
                const price = Number(o.price || 0);
                const deposit = Number(o.deposit || 0);
                return {
                    id: o.id,
                    businessName: o.businessName,
                    dateLabel: friendlyDate(o.serviceDate).label,
                    startTime: o.startTime,
                    price: price,
                    deposit: deposit,
                    rest: price - deposit,
                    paidLabel: paidLabel,
                };
            };

            // 结算单：余额 = 已结算收入 - 已申请结算总额
            const settlementRows = results[1].data.filter(function (s) {
                return s.userId === 'me';
            });
            const settledTotal = settled.reduce(function (sum, o) {
                return sum + Number(o.price || 0);
            }, 0);
            const withdrawnTotal = settlementRows.reduce(function (sum, s) {
                return sum + Number(s.amount || 0);
            }, 0);
            const pendingAmount = settlementRows
                .filter(function (s) { return s.status === 'pending'; })
                .reduce(function (sum, s) { return sum + Number(s.amount || 0); }, 0);

            self.setData({
                loading: false,
                settledTotal: settledTotal,
                settledCount: settled.length,
                pendingTotal: pending.reduce(function (sum, o) {
                    return sum + Number(o.price || 0);
                }, 0),
                pendingCount: pending.length,
                settledRecords: settled.map(function (o) {
                    return decorate(o, o.finalPaidAt ? '尾款已结 ' + String(o.finalPaidAt).slice(0, 10) : '已完成');
                }),
                pendingRecords: pending.map(function (o) {
                    return decorate(o, '待商家支付尾款');
                }),
                balance: Math.max(0, settledTotal - withdrawnTotal),
                withdrawnTotal: withdrawnTotal,
                pendingAmount: pendingAmount,
                settlementRecords: settlementRows.map(function (s) {
                    return {
                        id: s.id,
                        amount: s.amount,
                        status: s.status,
                        statusLabel: s.status === 'done' ? '已到账' : '到账中',
                        timeLabel: s.paidAt ? '到账于 ' + String(s.paidAt).slice(0, 10) : '已申请结算',
                    };
                }),
            });

            // 有到账中的结算单时，停留本页约 9 秒后自动刷新看结果（本地版模拟）
            if (self.settleTimer) {
                clearTimeout(self.settleTimer);
                self.settleTimer = null;
            }
            if (pendingAmount > 0) {
                self.settleTimer = setTimeout(function () {
                    self.refresh();
                }, 9000);
            }
        });
    },

    async requestSettlement() {
        if (this.data.requesting) return;
        const current = session.getSession();
        if (!current || current.role !== 'interpreter') return;
        this.setData({ requesting: true });
        try {
            const [income, existing] = await Promise.all([orders.list(), settlements.list()]);
            if (income.error || existing.error) throw income.error || existing.error;
            const earned = income.data.filter((o) => o.interpreterId === current.userId && o.status === 'finished')
                .reduce((sum, o) => sum + Number(o.price || 0), 0);
            const reserved = existing.data.filter((s) => s.userId === current.userId)
                .reduce((sum, s) => sum + Number(s.amount || 0), 0);
            const balance = earned - reserved;
            if (!Number.isFinite(balance) || balance <= 0) {
                wx.showToast({ title: '暂无可结算金额', icon: 'none' });
                return;
            }
            const result = await settlements.create({ userId: current.userId, amount: balance, status: 'pending' });
            if (result.error) throw result.error;
            wx.showToast({ title: '已申请结算 ¥' + balance, icon: 'none' });
            this.load();
        } catch (error) {
            wx.showToast({ title: error.message || '申请失败', icon: 'none' });
        } finally {
            this.setData({ requesting: false });
        }
    },

    goDetail(event) {
        wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + event.currentTarget.dataset.id });
    },
});
