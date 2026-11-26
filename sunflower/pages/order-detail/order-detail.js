const { reservesDate, canChangeOrder } = require('../../utils/booking-rules');
const session = require('../../utils/session');
const { orders, profiles, reviews, availability } = require('../../utils/data');
const { statusText, friendlyDate, today } = require('../../utils/format');
const { push } = require('../../utils/notify');
const { sweepPendingRefunds } = require('../../utils/sweep');

const STARS_FULL = '★★★★★';

function starsText(rating) {
    const n = Math.max(0, Math.min(5, Number(rating) || 0));
    return STARS_FULL.slice(0, n);
}

Page({
    data: {
        authState: 'checking',
        role: '',
        order: null,
        dateLabel: '',
        statusLabel: '',
        timeline: [],
        busy: false,
        forbidden: false,
        // 对方联系方式（定金支付后可见）
        contact: null,
        // 评价
        myReview: null,
        myReviewStars: '',
        counterpartReview: null,
        counterpartReviewStars: '',
        reviewRating: 0,
        reviewComment: '',
        submittingReview: false,
        // 已付定金且服务日期已过：提醒译员确认完成
        depositExpired: false,
        // 完结/取消状态一句话文案
        endText: '',
        // 改期
        rescheduling: false,
        newDate: '',
        rescheduleError: '',
        todayStr: today(),
        actualHoursInput: '',
    },

    onLoad(query) {
        this.orderId = query.id;
    },

    onShow() {
        const current = session.getSession();
        if (!current) {
            this.setData({ authState: 'onboard' });
            return;
        }
        this.setData({ authState: 'ready', role: current.role });
        sweepPendingRefunds();
        this.loadOrder();
    },

    onUnload() {
        clearTimeout(this.refundTimer);
    },

    loadOrder() {
        const self = this;
        Promise.all([orders.list(), profiles.list(), reviews.list()]).then(function (results) {
            const found = (results[0].data || []).find(function (o) { return String(o.id) === String(self.orderId); });
            if (!found) {
                self.setData({ order: null, forbidden: false });
                return;
            }
            // 归属 + 身份侧校验：商家只能操作自己发的单，译员只能操作派给自己的单（上云后由 RLS 兜底）
            const role = self.data.role;
            const sideOk = (role === 'business' && found.businessId === 'me') ||
                (role === 'interpreter' && found.interpreterId === 'me');
            if (!sideOk) {
                self.setData({ order: null, forbidden: true });
                return;
            }
            const timeline = [];
            timeline.push({ label: '商家提交预约', time: found.createdAt });
            if (found.rescheduledAt) {
                timeline.push({ label: '商家改期：' + found.rescheduledFrom + ' → ' + found.serviceDate + '，等待译员重新确认', time: found.rescheduledAt });
            }
            if (found.status === 'accepted') timeline.push({ label: '译员已接单，等待支付定金' });
            if (found.depositPaidAt) timeline.push({ label: '定金已支付，订单生效', time: found.depositPaidAt });
            if (found.status === 'completed') timeline.push({ label: '译员已确认完成，等待支付尾款' });
            if (found.finalPaidAt) timeline.push({ label: '尾款已支付，订单完成', time: found.finalPaidAt });
            if (found.status === 'cancelled') {
                timeline.push({ label: '订单已取消' + (found.cancelReason ? '（' + found.cancelReason + '）' : '') });
                if (found.depositPaidAt && found.refundStatus === 'pending') {
                    timeline.push({ label: '定金 ¥' + (found.refundAmount || found.deposit || 0) + ' 退款处理中' });
                }
                if (found.refundedAt) {
                    timeline.push({ label: '定金 ¥' + (found.refundAmount || found.deposit || 0) + ' 已原路退回', time: found.refundedAt });
                }
            }

            // 完结/取消一句话文案
            let endText = '';
            if (found.status === 'finished') {
                endText = '订单已完成，感谢使用';
            } else if (found.status === 'cancelled') {
                if (found.refundStatus === 'pending') {
                    endText = '订单已取消，定金 ¥' + (found.refundAmount || found.deposit || 0) + ' 退款处理中…';
                } else if (found.refundStatus === 'done') {
                    endText = '订单已取消，定金 ¥' + (found.refundAmount || found.deposit || 0) + ' 已原路退回';
                } else {
                    endText = '订单已取消' + (found.cancelReason ? '：' + found.cancelReason : '');
                }
            }

            // 对方资料：定金支付后联系方式可见
            const profileRows = results[1].data || [];
            let contact = null;
            if (role === 'business' && found.interpreterId) {
                const p = profileRows.find((pr) => pr.ownerId === found.interpreterId && pr.role === 'interpreter');
                contact = p ? {
                    label: '译员联系方式',
                    name: p.name || found.interpreterName,
                    phone: p.phone,
                    callable: /^1\d{10}$/.test(p.phone),
                    extra: [p.school, p.major].filter(Boolean).join(' · '),
                } : null;
            } else if (role === 'interpreter' && found.businessId) {
                const p = profileRows.find((pr) => pr.ownerId === found.businessId && pr.role === 'business');
                contact = p ? {
                    label: '商家联系方式',
                    name: p.name || found.businessName,
                    phone: p.phone || p.contact,
                    callable: /^1\d{10}$/.test(p.phone || p.contact),
                    extra: p.company,
                } : null;
            }

            // 本单互评（本地版双方共用 'me'，用角色区分；上云后用 uid）
            const orderReviews = (results[2].data || []).filter(function (r) {
                return String(r.orderId) === String(self.orderId);
            });
            const myReview = orderReviews.find(function (r) {
                return r.reviewerId === 'me' && r.reviewerRole === role;
            }) || null;
            const counterpartReview = orderReviews.find(function (r) {
                return r.reviewerRole !== role;
            }) || null;

            self.setData({
                order: found,
                dateLabel: friendlyDate(found.serviceDate).label,
                statusLabel: statusText(found.status),
                timeline: timeline,
                contact: contact,
                myReview: myReview,
                myReviewStars: myReview ? starsText(myReview.rating) : '',
                counterpartReview: counterpartReview,
                counterpartReviewStars: counterpartReview ? starsText(counterpartReview.rating) : '',
                depositExpired: found.status === 'deposit_paid' && found.serviceDate < today(),
                endText: endText,
            });

            // 退款在途时，停留本页约 9 秒后自动刷新看结果（本地版模拟；真实支付由回调驱动）
            if (self.refundTimer) {
                clearTimeout(self.refundTimer);
                self.refundTimer = null;
            }
            if (found.status === 'cancelled' && found.refundStatus === 'pending') {
                self.refundTimer = setTimeout(function () {
                    Promise.resolve(sweepPendingRefunds()).then(() => self.loadOrder());
                }, 9000);
            }
        });
    },

    goBackHome() {
        wx.switchTab({ url: '/pages/index/index' });
    },

    // 操作前校验：身份、订单归属与状态机（正式版由服务端校验兜底）
    canAct(kind) {
        const allowed = canChangeOrder(kind, session.getSession(), this.data.order);
        if (!allowed) wx.showToast({ title: '当前身份或订单状态无法执行此操作', icon: 'none' });
        return allowed;
    },

    updateCurrentOrder(patch, order = this.data.order) {
        return orders.update(this.orderId, patch, {
            status: order.status, serviceDate: order.serviceDate,
            businessId: order.businessId, interpreterId: order.interpreterId,
        });
    },

    // 模拟支付：真实微信支付需要商户号资质，接入后替换此处
    simulatePay(kind, order = this.data.order) {
        const self = this;
        const patch = kind === 'deposit'
            ? { status: 'deposit_paid', depositPaidAt: new Date().toISOString() }
            : { status: 'finished', finalPaidAt: new Date().toISOString() };
        this.updateCurrentOrder(patch, order).then(function (result) {
            self.setData({ busy: false });
            if (result.error) {
                wx.showToast({ title: result.error.message || '操作失败', icon: 'none' });
                return;
            }
            if (kind === 'deposit') {
                push(order.interpreterId, 'interpreter', {
                    orderId: self.orderId,
                    title: '定金已支付，订单生效',
                    body: '商家已支付定金 ¥' + order.deposit + '，请按约定时间到场服务',
                });
            } else {
                push(order.interpreterId, 'interpreter', {
                    orderId: self.orderId,
                    title: '尾款已支付，订单完成',
                    body: '尾款 ¥' + (order.price - order.deposit) + ' 已支付，本次收入 ¥' + order.price + ' 已结算',
                });
            }
            wx.showToast({ title: kind === 'deposit' ? '定金支付成功' : '尾款支付成功', icon: 'success' });
            self.loadOrder();
        });
    },

    payDeposit() {
        if (this.data.busy) return;
        if (!this.canAct('deposit')) return;
        const self = this;
        const order = this.data.order;
        wx.showModal({
            title: '支付定金 ¥' + this.data.order.deposit,
            content: '当前为演示流程，点击确定即模拟支付成功。正式版需接入微信支付。',
            confirmText: '模拟支付',
            confirmColor: '#c78d00',
            success: (res) => {
                if (!res.confirm || self.data.busy || !self.canAct('deposit')) return;
                self.setData({ busy: true });
                self.simulatePay('deposit', order);
            },
        });
    },

    payFinal() {
        if (this.data.busy) return;
        if (!this.canAct('final')) return;
        const self = this;
        const order = this.data.order;
        wx.showModal({
            title: '支付尾款 ¥' + (order.price - order.deposit),
            content: '当前为演示流程，点击确定即模拟支付成功。正式版需接入微信支付。',
            confirmText: '模拟支付',
            confirmColor: '#c78d00',
            success: (res) => {
                if (!res.confirm || self.data.busy || !self.canAct('final')) return;
                self.setData({ busy: true });
                self.simulatePay('final', order);
            },
        });
    },

    confirmDone() {
        if (this.data.busy) return;
        if (!this.canAct('done')) return;
        const self = this;
        const order = this.data.order;
        if (order.jobId) {
            this.submitActualHours();
            return;
        }
        wx.showModal({
            title: '确认服务完成？',
            content: '确认后商家将支付尾款。',
            confirmText: '确认完成',
            confirmColor: '#c78d00',
            success: (res) => {
                if (!res.confirm || self.data.busy || !self.canAct('done')) return;
                self.setData({ busy: true });
                self.updateCurrentOrder({ status: 'completed' }, order).then(function (result) {
                    self.setData({ busy: false });
                    if (result.error) {
                        wx.showToast({ title: result.error.message || '操作失败', icon: 'none' });
                        return;
                    }
                    push(self.data.order.businessId, 'business', {
                        orderId: self.orderId,
                        title: '译员已确认完成',
                        body: '服务已完成，请支付尾款 ¥' + (self.data.order.price - self.data.order.deposit),
                    });
                    wx.showToast({ title: '已确认完成', icon: 'success' });
                    self.loadOrder();
                });
            },
        });
    },

    onActualHoursInput(event) {
        this.setData({ actualHoursInput: event.detail.value });
    },

    async submitActualHours() {
        const order = this.data.order;
        if (this.data.busy || !order?.jobId || order.actualHours !== null || !this.canAct('done')) return;
        if (order.serviceDate > today()) {
            wx.showToast({ title: '服务日期未到，暂不能提交工时', icon: 'none' });
            return;
        }
        const hours = Number(this.data.actualHoursInput);
        if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
            wx.showToast({ title: '请输入大于 0 且不超过 24 的工时', icon: 'none' });
            return;
        }
        await this.saveJobHours(order, { actualHours: hours }, '工时已提交，请公司确认', 'business');
    },

    reportJobOrder() {
        wx.showModal({
            title: '记录履约问题',
            editable: true,
            placeholderText: '说明问题，请勿填写私人信息',
            success: ({ confirm, content }) => {
                if (!confirm) return;
                try {
                    require('../../utils/jobs').reportOrder(this.orderId, content);
                    wx.showToast({ title: '已保存在本机，尚未送审', icon: 'none' });
                } catch (error) {
                    wx.showToast({ title: error.message, icon: 'none' });
                }
            },
        });
    },

    confirmJobHours() {
        const order = this.data.order;
        const current = session.getSession();
        if (this.data.busy || !order?.jobId || order.status !== 'deposit_paid' || !(order.actualHours > 0) ||
            !current || current.role !== 'business' || current.userId !== order.businessId) return;
        return this.saveJobHours(order, { status: 'completed', hoursConfirmedAt: new Date().toISOString() },
            '公司已确认工时，等待支付尾款', 'interpreter');
    },

    async saveJobHours(order, patch, message, recipientRole) {
        this.setData({ busy: true });
        try {
            const result = await orders.update(this.orderId, patch, {
                status: 'deposit_paid', actualHours: order.actualHours, serviceDate: order.serviceDate,
                businessId: order.businessId, interpreterId: order.interpreterId,
            });
            if (result.error) throw result.error;
            this.setData({ order: result.data });
            const recipient = recipientRole === 'business' ? order.businessId : order.interpreterId;
            await push(recipient, recipientRole, { orderId: this.orderId, title: message, body: '实际工时 ' + result.data.actualHours + ' 小时' });
            wx.showToast({ title: message, icon: 'none' });
            this.loadOrder();
        } catch (error) {
            wx.showToast({ title: error.message || '工时保存失败，请重试', icon: 'none' });
        } finally {
            this.setData({ busy: false });
        }
    },

    cancelOrder() {
        if (this.data.busy) return;
        if (!this.canAct('cancel')) return;
        const self = this;
        const order = this.data.order;
        const depositPaid = !!order.depositPaidAt;
        wx.showModal({
            title: '取消这个预约？',
            content: depositPaid ? '已付定金 ¥' + this.data.order.deposit + ' 将原路退回，取消后译员将收到通知。' : '取消后译员将收到通知。',
            editable: true,
            placeholderText: '取消原因（选填）',
            confirmText: '取消预约',
            confirmColor: '#c2410c',
            success: (res) => {
                if (!res.confirm || self.data.busy || !self.canAct('cancel')) return;
                self.setData({ busy: true });
                const reason = (res.content || '').trim();
                const patch = {
                    status: 'cancelled',
                    cancelReason: reason,
                    cancelledByRole: 'business',
                };
                // 定金已付 → 进入模拟退款流程（正式版由微信支付退款接口驱动）
                if (depositPaid) {
                    patch.refundStatus = 'pending';
                    patch.refundAmount = self.data.order.deposit;
                }
                self.updateCurrentOrder(patch, order).then(function (result) {
                    self.setData({ busy: false });
                    if (result.error) {
                        wx.showToast({ title: result.error.message || '操作失败', icon: 'none' });
                        return;
                    }
                    push(self.data.order.interpreterId, 'interpreter', {
                        orderId: self.orderId,
                        title: '商家已取消预约',
                        body: '预约已取消' + (reason ? '：' + reason : '') + (depositPaid ? '，定金将原路退回' : ''),
                    });
                    wx.showToast({ title: '已取消', icon: 'none' });
                    self.loadOrder();
                });
            },
        });
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

    goBusinessDetail() {
        if (this.data.order && this.data.order.businessId) {
            wx.navigateTo({ url: '/pages/business-detail/business-detail?ownerId=' + this.data.order.businessId });
        }
    },

    // ---------- 改期（商家，仅待接单/已接单未付定金） ----------
    openReschedule() {
        this.setData({
            rescheduling: !this.data.rescheduling,
            newDate: '',
            rescheduleError: '',
        });
    },

    onNewDateChange(event) {
        this.setData({ newDate: event.detail.value, rescheduleError: '' });
    },

    async submitReschedule() {
        if (this.data.busy) return;
        const self = this;
        const order = this.data.order;
        const date = this.data.newDate;
        const current = session.getSession();
        if (!canChangeOrder('reschedule', current, order)) {
            this.setData({ rescheduleError: '当前订单不能改期' });
            return;
        }
        if (!date) {
            this.setData({ rescheduleError: '请选择新的服务日期' });
            return;
        }
        if (date < today()) {
            this.setData({ rescheduleError: '不能改到过去日期' });
            return;
        }
        if (date === order.serviceDate) {
            this.setData({ rescheduleError: '与原日期相同，无需改期' });
            return;
        }
        this.setData({ busy: true });
        // 复查译员新日期的空闲与冲突（上云后由服务端兜底）
        const precheck = await Promise.all([availability.list(), orders.list()]);
        if (precheck[0].error || precheck[1].error) {
            this.setData({ busy: false, rescheduleError: '预检失败，请重试' });
            return;
        }
        const latest = (precheck[1].data || []).find((item) => String(item.id) === String(this.orderId));
        if (!canChangeOrder('reschedule', current, latest) || latest.status !== order.status ||
            latest.serviceDate !== order.serviceDate) {
            this.setData({ busy: false, rescheduleError: '订单已变更，请刷新后重试' });
            return;
        }
        const stillFree = (precheck[0].data || []).some(function (a) {
            return a.ownerId === order.interpreterId && a.date === date;
        });
        const conflict = (precheck[1].data || []).some(function (o) {
            return o.interpreterId === order.interpreterId &&
                o.serviceDate === date &&
                String(o.id) !== String(self.orderId) &&
                reservesDate(o, true);
        });
        if (!stillFree) {
            this.setData({ busy: false, rescheduleError: '译员新日期没有空闲' });
            return;
        }
        if (conflict) {
            this.setData({ busy: false, rescheduleError: '译员新日期已有其他预约' });
            return;
        }
        // 改期后回到待接单，译员需重新确认
        const updated = await this.updateCurrentOrder({
            serviceDate: date,
            status: 'pending',
            rescheduledFrom: order.serviceDate,
            rescheduledAt: new Date().toISOString(),
        }, order);
        if (updated.error) {
            this.setData({ busy: false, rescheduleError: updated.error.message || '改期失败，请重试' });
            return;
        }
        push(order.interpreterId, 'interpreter', {
            orderId: self.orderId,
            title: '商家申请改期',
            body: '服务日期由 ' + order.serviceDate + ' 改为 ' + date + '，请重新确认是否接单',
        });
        this.setData({ busy: false, rescheduling: false, newDate: '' });
        wx.showToast({ title: '已改期，等译员重新确认', icon: 'none' });
        this.loadOrder();
    },

    callContact() {
        if (this.data.contact && this.data.contact.callable) {
            wx.makePhoneCall({ phoneNumber: this.data.contact.phone });
        }
    },

    onReviewRating(event) {
        this.setData({ reviewRating: Number(event.currentTarget.dataset.rating) });
    },

    onReviewComment(event) {
        this.setData({ reviewComment: event.detail.value });
    },

    async submitReview() {
        if (this.data.submittingReview) return;
        const rating = Number(this.data.reviewRating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            wx.showToast({ title: '请先选择星级', icon: 'none' });
            return;
        }
        const current = session.getSession();
        const order = this.data.order;
        const participant = current && order &&
            (current.role === 'business' ? order.businessId : order.interpreterId) === current.userId;
        if (!participant || order.status !== 'finished') {
            wx.showToast({ title: '无权评价该订单', icon: 'none' });
            return;
        }
        this.setData({ submittingReview: true });
        const existing = await reviews.list();
        if (existing.error || (existing.data || []).some((review) =>
            String(review.orderId) === String(this.orderId) &&
            review.reviewerId === current.userId && review.reviewerRole === current.role
        )) {
            this.setData({ submittingReview: false });
            wx.showToast({ title: existing.error ? '评价读取失败，请重试' : '该订单已评价', icon: 'none' });
            return;
        }
        const created = await reviews.create({
            orderId: this.orderId,
            reviewerId: current.userId,
            reviewerRole: current.role,
            reviewerName: current.name,
            targetId: current.role === 'business' ? order.interpreterId : order.businessId,
            targetRole: current.role === 'business' ? 'interpreter' : 'business',
            rating: rating,
            comment: (this.data.reviewComment || '').trim(),
        });
        if (created.error) {
            this.setData({ submittingReview: false });
            wx.showToast({ title: created.error.message || '提交失败', icon: 'none' });
            return;
        }
        this.setData({ submittingReview: false, reviewRating: 0, reviewComment: '' });
        wx.showToast({ title: '评价成功', icon: 'success' });
        this.loadOrder();
    },
});
