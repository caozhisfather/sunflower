const jobs = require('../../utils/jobs');
const session = require('../../utils/session');
const { profiles } = require('../../utils/data');
const { today, friendlyDate } = require('../../utils/format');
const { SKILL_GROUPS, joinSkills, matchScore } = require('../../utils/skills');
const { choosePlace, distanceKm } = require('../../utils/service-location');

const PAY_LABELS = { hour: '小时', half: '半天', day: '天' };
const APP_LABELS = { applied: '待处理', withdrawn: '已撤回', hired: '已录用', rejected: '未录用', full: '名额已满', closed: '招聘已结束' };

function emptyForm() {
    return {
        title: '', serviceDate: today(), startTime: '09:00', hours: '', rate: '', slots: '1',
        payMode: 2, locationName: '', requirements: '', terms: '', travelAllowance: '',
    };
}

Page({
    data: {
        role: '', tab: 'list', today: '', form: {}, place: null, error: '',
        payModes: ['按小时', '按半天', '按全天'], skillGroups: SKILL_GROUPS, skills: {},
        keyword: '', minPay: '', maxKm: '', results: [], available: false,
        fromTime: '', untilTime: '', withAllowance: false, minHourly: '',
    },

    onLoad(query = {}) {
        this.setData({ form: emptyForm(), today: today() });
        const current = session.getSession();
        if (current && current.role === 'business' && query.tab === 'publish') this.setData({ tab: 'publish' });
    },

    async onShow() {
        const current = session.getSession();
        this.setData({ role: current ? current.role : '' });
        this.profile = null;
        this.refresh();
        if (current && current.role === 'interpreter') {
            const result = await profiles.list();
            this.profile = (result.data || []).find((profile) =>
                profile.ownerId === current.userId && profile.role === current.role);
            this.refresh();
        }
    },

    refresh() {
        try {
            const student = this.data.role === 'interpreter';
            const mine = this.data.tab === 'mine';
            const profile = this.profile || {};
            const keyword = this.data.keyword.trim().toLowerCase();
            const minPay = Number(this.data.minPay);
            const maxKm = Number(this.data.maxKm);
            const results = jobs.list().map((job) => {
                const distance = distanceKm(profile.campusLat, profile.campusLng, job.locationLat, job.locationLng);
                const application = job.applications[job.applications.length - 1];
                const match = matchScore(profile.skills, job.requiredSkills);
                const [hour, minute] = job.startTime.split(':').map(Number);
                const hourly = (job.total - (job.travelAllowance || 0)) / job.hours;
                return {
                    ...job, application, distance, match,
                    hourly, hourlyLabel: hourly.toFixed(2), endMinutes: hour * 60 + minute + job.hours * 60,
                    dateLabel: friendlyDate(job.serviceDate).label,
                    payLabel: '¥' + job.rate + '/' + PAY_LABELS[job.payUnit],
                    distanceLabel: distance === null ? '距离待确认' : '距校区直线 ' + distance.toFixed(1) + ' km',
                    statusLabel: job.open ? '剩余 ' + job.slotsLeft + ' 个名额' : '已结束',
                    applicationLabel: application && (application.status === 'applied' && !job.open
                        ? '岗位已结束' : APP_LABELS[application.status]),
                    applications: job.applications.map((item) => ({
                        ...item, label: APP_LABELS[item.status], match: matchScore(item.skills, job.requiredSkills),
                    })),
                };
            }).filter((job) => {
                if (!student) return true;
                if (mine) return Boolean(job.application);
                if (this.data.tab === 'blocked') return job.blocked;
                const [untilHour, untilMinute] = (this.data.untilTime || '24:00').split(':').map(Number);
                return job.open && !job.blocked && (!minPay || job.total >= minPay) &&
                    (!maxKm || (job.distance !== null && job.distance <= maxKm)) &&
                    (!this.data.fromTime || job.startTime >= this.data.fromTime) &&
                    job.endMinutes <= untilHour * 60 + untilMinute &&
                    (!this.data.withAllowance || job.travelAllowance > 0) &&
                    (!Number(this.data.minHourly) || job.hourly >= Number(this.data.minHourly)) &&
                    (!keyword || [job.title, job.businessName, job.locationName, job.requiredSkills, job.requirements]
                        .join(' ').toLowerCase().includes(keyword));
            });
            this.setData({ results, available: true });
        } catch (error) {
            this.setData({ results: [], available: false, error: error.message });
        }
    },

    selectTab(event) {
        this.setData({ tab: event.currentTarget.dataset.tab, error: '' });
        this.refresh();
    },

    field(event) {
        const name = event.currentTarget.dataset.field;
        const value = event.detail.value;
        const patch = { ['form.' + name]: value, error: '' };
        if (name === 'locationName') patch.place = null;
        this.setData(patch);
    },

    filter(event) {
        this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
        this.refresh();
    },

    clearTimeFilter() {
        this.setData({ fromTime: '', untilTime: '' });
        this.refresh();
    },

    toggleAllowance() {
        this.setData({ withAllowance: !this.data.withAllowance });
        this.refresh();
    },

    toggleSkill(event) {
        const skill = event.currentTarget.dataset.skill;
        const skills = { ...this.data.skills };
        if (skills[skill]) delete skills[skill];
        else skills[skill] = true;
        this.setData({ skills });
    },

    chooseLocation() {
        choosePlace(({ name, address, latitude, longitude }) => {
            this.setData({
                place: { latitude, longitude, address },
                'form.locationName': name || address || '',
            });
        });
    },

    run(operation, success) {
        this.setData({ error: '' });
        try {
            const result = operation();
            if (success) success(result);
            this.refresh();
        } catch (error) {
            this.setData({ error: error.message });
            wx.showToast({ title: error.message, icon: 'none' });
        }
    },

    publish() {
        this.run(() => jobs.publish({
            ...this.data.form, place: this.data.place, requiredSkills: joinSkills(Object.keys(this.data.skills)),
        }), () => {
            this.setData({ tab: 'list', form: emptyForm(), place: null, skills: {} });
            wx.showToast({ title: '岗位已发布', icon: 'success' });
        });
    },

    apply(event) {
        this.run(() => jobs.apply(event.currentTarget.dataset.id), () => {
            this.setData({ tab: 'mine' });
            wx.showToast({ title: '申请已提交', icon: 'success' });
        });
    },

    withdraw(event) {
        this.run(() => jobs.withdraw(event.currentTarget.dataset.id));
    },

    hire(event) {
        const id = event.currentTarget.dataset.id;
        wx.showModal({
            title: '确认录用',
            content: '系统将按岗位的报酬、工时和地点生成订单，并通知学生。',
            success: ({ confirm }) => {
                if (confirm) this.run(() => jobs.hire(id), (orderId) => this.openOrder(orderId));
            },
        });
    },

    reject(event) {
        const id = event.currentTarget.dataset.id;
        wx.showModal({
            title: '标记为未录用',
            content: '学生将收到未录用通知。',
            success: ({ confirm }) => { if (confirm) this.run(() => jobs.reject(id)); },
        });
    },

    report(event) {
        const id = event.currentTarget.dataset.id;
        wx.showModal({
            title: '记录岗位问题',
            editable: true,
            placeholderText: '说明问题，请勿填写私人信息',
            success: ({ confirm, content }) => {
                if (confirm) this.run(() => jobs.report(id, content),
                    () => wx.showToast({ title: '已保存在本机，尚未送审', icon: 'none' }));
            },
        });
    },

    toggleBlock(event) {
        const { id, blocked } = event.currentTarget.dataset;
        this.run(() => jobs.setBlocked(id, !blocked));
    },

    close(event) {
        const id = event.currentTarget.dataset.id;
        wx.showModal({
            title: '结束招聘',
            content: '结束后停止接受申请和录用。已生成的订单仍可在订单消息中查看。',
            success: ({ confirm }) => {
                if (confirm) this.run(() => jobs.close(id));
            },
        });
    },

    goOrder(event) {
        this.openOrder(event.currentTarget.dataset.id);
    },

    openOrder(id) {
        wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + id });
    },
});
