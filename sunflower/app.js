// Sunflower·英语陪同兼职 — 本地版入口
const { ensureSeed } = require('./utils/seed');
const { sweepExpiredOrders, sweepPendingRefunds, sweepPendingSettlements } = require('./utils/sweep');

App({
    onLaunch() {
        ensureSeed();
        sweepExpiredOrders();
        sweepPendingRefunds();
        sweepPendingSettlements();
        // 开启转发（发送给朋友 + 分享到朋友圈）
        try {
            wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
        } catch (e) {
            // 部分基础库不支持朋友圈菜单，忽略
        }
    },
});
