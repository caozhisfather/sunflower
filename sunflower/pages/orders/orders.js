const session = require('../../utils/session');
const { orders, notifications } = require('../../utils/data');
const { statusText, friendlyDate } = require('../../utils/format');

const FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'active', label: '进行中' },
    { key: 'done', label: '已完成' },
    { key: 'cancelled', label: '已取消' },
];

function matchFilter(status, key) {
    if (key === 'active') return ['pending', 'accepted', 'deposit_paid', 'completed'].indexOf(status) >= 0;
    if (key === 'done') return status === 'finished';
    if (key === 'cancelled') return status === 'cancelled';
    return true;
}

Page({
    data: {
        authState: 'checking',
        role: '',
        orders: [],
        viewOrders: [],
        filter: 'all',
        filters: FILTERS,
        loading: false,
        unreadCount: 0,
    },

    onShow() {
        const current = session.getSession();
        if (!current) {
            this.setData({ authState: 'onboard', orders: [], viewOrders: [] });
            return;
        }
        this.setData({ authState: 'ready', role: current.role });
        this.loadOrders();
        this.loadUnread();
    },

    goHome() {
        wx.switchTab({ url: '/pages/index/index' });
    },

    onPullDownRefresh() {
        this.loadOrders();
        this.loadUnread();
        setTimeout(function () {
            wx.stopPullDownRefresh();
        }, 400);
    },

    goNotifications() {
        wx.navigateTo({ url: '/pages/notifications/notifications' });
    },

    loadUnread() {
        const self = this;
        notifications.list().then(function (result) {
            const mine = (result.data || []).filter(function (n) {
                return n.userId === 'me' && n.role === self.data.role && !n.read;
            });
            self.setData({ unreadCount: mine.length });
            if (mine.length > 0) {
                wx.setTabBarBadge({ index: 1, text: String(mine.length) });
            } else {
                wx.removeTabBarBadge({ index: 1 });
            }
        });
    },

    setFilter(event) {
        this.setData({ filter: event.currentTarget.dataset.key });
        this.applyFilter();
    },

    applyFilter() {
        const key = this.data.filter;
        this.setData({
            viewOrders: this.data.orders.filter(function (o) {
                return matchFilter(o.status, key);
            }),
        });
    },

    loadOrders() {
        const self = this;
        this.setData({ loading: true });
        orders.list().then(function (result) {
            if (result.error) {
                self.setData({ loading: false });
                wx.showToast({ title: result.error.message || '加载失败', icon: 'none' });
                return;
            }
            // 按当前身份过滤：译员只看派给自己的单，商家只看自己发的单
            const role = self.data.role;
            const mine = result.data.filter(function (o) {
                return role === 'interpreter' ? o.interpreterId === 'me' : o.businessId === 'me';
            });
            self.setData({
                loading: false,
                orders: mine.map(function (o) {
                    const asBusiness = o.businessId === 'me';
                    return {
                        id: o.id,
                        counterName: asBusiness ? o.interpreterName || '译员' : o.businessName,
                        roleLabel: asBusiness ? '已预约译员' : '来自商家',
                        dateLabel: friendlyDate(o.serviceDate).label,
                        startTime: o.startTime,
                        price: o.price,
                        jobId: o.jobId,
                        status: o.status,
                        statusLabel: statusText(o.status),
                        statusClass: 'chip-' + (o.status === 'deposit_paid' ? 'deposit' : o.status),
                    };
                }),
            });
            self.applyFilter();
        });
    },

    goDetail(event) {
        wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + event.currentTarget.dataset.id });
    },
});
