const { reservesDate, canChangeOrder } = require('../../utils/booking-rules');
const session = require('../../utils/session');
const { orders, profiles } = require('../../utils/data');
const { statusText, friendlyDate, today } = require('../../utils/format');
const { push } = require('../../utils/notify');
const { parseSkills, matchScore, matchClass } = require('../../utils/skills');

Page({
    data: {
        order: null,
        dateLabel: '',
        statusLabel: '',
        busy: false,
        forbidden: false,
        // 技能匹配
        requiredTags: [],
        match: -1,
        matchClass: '',
    },

    onLoad(query) {
        this.orderId = query.id;
    },

    onShow() {
        const current = session.getSession();
        if (!current || current.role !== 'interpreter') {
            this.setData({ order: null, forbidden: true });
            return;
        }
        this.setData({ forbidden: false });
        this.loadOrder();
    },

    loadOrder() {
        const self = this;
        return Promise.all([orders.list(), profiles.list()]).then(function (results) {
            if (results[0].error) throw results[0].error;
            const found = (results[0].data || []).find(function (o) { return String(o.id) === String(self.orderId); });
            // 归属校验：不是派给当前译员账号的预约一律不可见（上云后由 RLS 兜底）
            if (!found || found.interpreterId !== 'me') {
                self.setData({ order: null, forbidden: !!found });
                return;
            }
            // 技能匹配：订单需求 vs 我的技能
            const myProfile = (results[1].data || []).find((p) => p.ownerId === 'me' && p.role === 'interpreter');
            const score = matchScore(myProfile ? myProfile.skills : '', found.requiredSkills);
            self.setData({
                order: found,
                dateLabel: friendlyDate(found.serviceDate).label,
                statusLabel: statusText(found.status),
                requiredTags: parseSkills(found.requiredSkills),
                match: score === null ? -1 : score,
                matchClass: matchClass(score),
            });
        }).catch(function () {
            wx.showToast({ title: '预约加载失败，请重新进入', icon: 'none' });
        });
    },

    canOperate() {
        const current = session.getSession();
        const order = this.data.order;
        if (!current || current.role !== 'interpreter' || !order || order.interpreterId !== 'me') {
            wx.showToast({ title: '无权操作该预约', icon: 'none' });
            return false;
        }
        return true;
    },

    openLocation() {
        const o = this.data.order;
        if (o && Number(o.locationLat) && Number(o.locationLng)) {
            wx.openLocation({
                latitude: Number(o.locationLat),
                longitude: Number(o.locationLng),
                name: o.locationName || '服务地点',
                address: o.locationAddress || '',
            });
        }
    },

    accept() {
        this.confirmDecision(true);
    },

    reject() {
        this.confirmDecision(false);
    },

    confirmDecision(accepting) {
        const action = accepting ? 'accept' : 'reject';
        if (this.data.busy || !this.canOperate() || !canChangeOrder(action, session.getSession(), this.data.order)) return;
        this.setData({ busy: true });
        wx.showModal({
            title: accepting ? '确认接单？' : '拒绝这个预约？',
            content: accepting ? '接单后请按约定时间到场服务。' : '拒绝后商家会收到取消通知。',
            editable: !accepting,
            placeholderText: '拒绝原因（选填）',
            confirmText: accepting ? '接单' : '拒绝',
            confirmColor: accepting ? '#c78d00' : '#c2410c',
            success: async (res) => {
                try {
                    if (res.confirm) await this.saveDecision(accepting, (res.content || '').trim());
                } catch (error) {
                    wx.showToast({ title: error.message || '操作失败，请重试', icon: 'none' });
                } finally {
                    this.setData({ busy: false });
                }
            },
            fail: () => this.setData({ busy: false }),
        });
    },

    async saveDecision(accepting, reason) {
        if (!this.canOperate()) return;
        const all = await orders.list();
        if (all.error) throw all.error;
        const order = (all.data || []).find((o) => String(o.id) === String(this.orderId));
        if (!canChangeOrder(accepting ? 'accept' : 'reject', session.getSession(), order) ||
            order.serviceDate !== this.data.order.serviceDate || order.serviceDate < today()) {
            await this.loadOrder();
            throw new Error('预约已变更或过期，请查看最新状态');
        }
        const conflict = accepting && all.data.some((o) =>
            o.interpreterId === order.interpreterId && o.serviceDate === order.serviceDate &&
            reservesDate(o, false)
        );
        if (conflict) throw new Error('当天已有其他生效预约，无法接单');

        const patch = accepting ? { status: 'accepted' } : {
            status: 'cancelled',
            cancelReason: reason,
            cancelledByRole: 'interpreter',
        };
        const result = await orders.update(this.orderId, patch, {
            status: order.status, serviceDate: order.serviceDate, interpreterId: order.interpreterId,
        });
        if (result.error) throw result.error;
        this.setData({
            order: Object.assign({}, order, patch),
            statusLabel: statusText(patch.status),
        });
        push(order.businessId, 'business', {
            orderId: this.orderId,
            title: accepting ? '译员已接单' : '译员已拒绝预约',
            body: accepting
                ? '预约已确认，请尽快支付定金 ¥' + order.deposit + ' 锁定档期'
                : '译员已拒绝该预约' + (reason ? '：' + reason : '') + '，可更换日期或译员重新预约',
        });
        wx.showToast({ title: accepting ? '已接单，等商家付定金' : '已拒绝', icon: 'none' });
    },
});
