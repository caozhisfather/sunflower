const session = require('../../utils/session');
const { profiles } = require('../../utils/data');
const { statusText } = require('../../utils/format');

Page({
    data: {
        authState: 'checking',
        name: '',
        role: '',
        pendingCount: 0,
        activeCount: 0,
        // 译员
        incomeTotal: 0,
        profileFilled: false,
    },

    onShow() {
        const current = session.getSession();
        if (!current) {
            this.setData({ authState: 'onboard' });
            return;
        }
        this.setData({
            authState: 'ready',
            name: current.name,
            role: current.role,
            pendingCount: 0,
            activeCount: 0,
            incomeTotal: 0,
            profileFilled: false,
        });
        this.loadSummary();
    },

    goHome() {
        wx.switchTab({ url: '/pages/index/index' });
    },

    loadSummary() {
        const self = this;
        const role = this.data.role;
        const jobs = [require('../../utils/data').orders.list()];
        if (role === 'interpreter') {
            jobs.push(profiles.list());
        }
        Promise.all(jobs).then(function (results) {
            const mine = results[0].data.filter(function (o) { return o.interpreterId === 'me'; });
            const patch = {
                pendingCount: mine.filter(function (o) { return o.status === 'pending'; }).length,
                activeCount: mine.filter(function (o) {
                    return ['accepted', 'deposit_paid', 'completed'].indexOf(o.status) >= 0;
                }).length,
            };
            if (role === 'interpreter') {
                patch.incomeTotal = mine
                    .filter(function (o) { return o.status === 'finished'; })
                    .reduce(function (sum, o) { return sum + Number(o.price || 0); }, 0);
                const myProfile = results[1].data.find((p) => p.ownerId === 'me' && p.role === role);
                patch.profileFilled = !!myProfile;
            }
            self.setData(patch);
        });
    },

    goProfileEdit() {
        wx.navigateTo({ url: '/pages/profile-edit/profile-edit' });
    },

    goAvailability() {
        wx.navigateTo({ url: '/pages/availability/availability' });
    },

    goIncome() {
        wx.navigateTo({ url: '/pages/income/income' });
    },

    goOrders() {
        wx.switchTab({ url: '/pages/orders/orders' });
    },

    signOut() {
        const doSignOut = () => {
            try {
                session.signOut();
            } catch (error) {
                wx.showToast({ title: '退出失败，请重试', icon: 'none' });
                return;
            }
            this.setData({ authState: 'onboard' });
        };
        // 预览环境若不支持弹窗，直接退出，避免点了没反应
        if (typeof wx.showModal !== 'function') {
            doSignOut();
            return;
        }
        wx.showModal({
            title: '退出登录',
            content: '退出后保留本机资料和账号类型，下次仍以原身份登录。',
            confirmText: '退出',
            confirmColor: '#c78d00',
            success: (res) => {
                if (!res.confirm) return;
                doSignOut();
            },
        });
    },
});
