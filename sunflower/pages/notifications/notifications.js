const session = require('../../utils/session');
const { notifications } = require('../../utils/data');

Page({
    data: {
        authState: 'checking',
        role: '',
        list: [],
        loading: true,
        marking: false,
    },

    onShow() {
        const current = session.getSession();
        if (!current) {
            this.setData({ authState: 'onboard', list: [] });
            return;
        }
        this.setData({ authState: 'ready', role: current.role });
        this.load();
    },

    goHome() {
        wx.switchTab({ url: '/pages/index/index' });
    },

    load() {
        const self = this;
        this.setData({ loading: true });
        notifications.list().then(function (result) {
            if (result.error) throw result.error;
            // 收件人按 user_id + 角色 双维度匹配（本地版两身份共用 'me'）
            const mine = (result.data || []).filter(function (n) {
                return n.userId === 'me' && n.role === self.data.role;
            });
            self.setData({ loading: false, list: mine });
        }).catch(function () {
            self.setData({ loading: false });
            wx.showToast({ title: '通知加载失败，请重试', icon: 'none' });
        });
    },

    async openItem(event) {
        const id = event.currentTarget.dataset.id;
        const item = this.data.list.find((notice) => String(notice.id) === String(id));
        if (!item) return;
        if (!item.read) {
            try {
                const result = await notifications.update(item.id, { read: 1 });
                if (result.error) throw result.error;
            } catch (error) {
                wx.showToast({ title: '标记已读失败，请重试', icon: 'none' });
                return;
            }
        }
        const orderId = item.orderId;
        if (orderId) {
            wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + orderId });
        } else {
            this.load();
        }
    },

    async markAll() {
        if (this.data.marking) return;
        this.setData({ marking: true });
        const jobs = this.data.list
            .filter(function (n) { return !n.read; })
            .map(function (n) { return notifications.update(n.id, { read: 1 }); });
        const results = await Promise.allSettled(jobs);
        this.setData({ marking: false });
        if (results.some((result) => result.status === 'rejected' || result.value.error)) {
            wx.showToast({ title: '部分通知标记失败，请重试', icon: 'none' });
        }
        this.load();
    },
});
