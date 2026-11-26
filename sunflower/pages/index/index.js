const { reservesDate } = require('../../utils/booking-rules');
const session = require('../../utils/session');
const { profiles, availability, orders, reviews, favorites } = require('../../utils/data');
const { friendlyDate, today, dateAfter, ratingSummary, statusText } = require('../../utils/format');
const { SKILL_GROUPS, joinSkills, matchScore, matchClass } = require('../../utils/skills');
const { distanceKm, choosePlace } = require('../../utils/service-location');

Page({
    data: {
        authState: 'checking',
        name: '',
        role: '',
        // 译员端
        pendingTasks: [],
        activeTasks: [],
        taskSort: 0,
        taskSortLabels: ['技能优先', '报酬从高到低', '距离从近到远'],
        studentRate: 0,
        studentCampus: '',
        // 商家端
        pickDate: '',
        firstBookableDate: '',
        dateLabel: '',
        interpreters: [],
        loading: false,
        searched: false,
        favOnly: false,
        budget: '',
        servicePlace: null,
        candidateSort: 0,
        candidateSortLabels: ['技能优先', '报价从低到高', '距离从近到远'],
        // 技能筛选（商家端双向匹配）
        skillGroups: SKILL_GROUPS,
        skillFilterMap: {},
        skillFilterCount: 0,
        registeredRole: '',
    },

    onShow() {
        const current = session.getSession();
        if (!current) {
            const registeredRole = session.getRegisteredRole();
            this.setData({ authState: 'onboard', role: registeredRole, registeredRole, name: session.getLastName() });
            return;
        }
        this.setData({ authState: 'ready', role: current.role, name: current.name, registeredRole: current.role });
        if (current.role === 'interpreter') {
            this.loadTasks();
        } else {
            const date = this.data.pickDate >= today() ? this.data.pickDate : today();
            this.setData({ pickDate: date, firstBookableDate: today(), dateLabel: friendlyDate(date).label });
            this.loadInterpreters();
        }
    },

    onPullDownRefresh() {
        this.onShow();
        setTimeout(function () {
            wx.stopPullDownRefresh();
        }, 400);
    },

    onNameInput(event) {
        this.setData({ name: event.detail.value });
    },

    pickRole(event) {
        if (this.data.registeredRole) return;
        this.setData({ role: event.currentTarget.dataset.role });
    },

    submitOnboard() {
        const { role, name, registeredRole } = this.data;
        if (!name.trim() || !role) {
            wx.showToast({ title: !name.trim() ? '请填写昵称' : '请选择账号类型', icon: 'none' });
            return;
        }
        const enter = () => {
            try {
                const result = session.signIn(name, role);
                if (result.error) throw result.error;
                this.onShow();
            } catch (error) {
                wx.showToast({ title: error.message || '登录失败，请重试', icon: 'none' });
            }
        };
        if (registeredRole) {
            enter();
            return;
        }
        const label = role === 'interpreter' ? '学生账号' : '企业账号';
        wx.showModal({
            title: '确认开通' + label,
            content: '首次开通后会固定账号类型，退出登录后仍使用此身份。',
            confirmText: '确认开通',
            success: ({ confirm }) => { if (confirm) enter(); },
        });
    },

    // ---------- 译员端：任务大厅 ----------
    loadTasks() {
        const self = this;
        Promise.all([orders.list(), profiles.list()]).then(function (results) {
            if (results[0].error || results[1].error) {
                wx.showToast({ title: (results[0].error || results[1].error).message || '加载失败', icon: 'none' });
                return;
            }
            const mine = results[0].data.filter(function (o) { return o.interpreterId === 'me'; });
            // 我的技能（用于与订单需求匹配）
            if (self.data.role !== 'interpreter') return;
            const myProfile = results[1].data.find((p) => p.ownerId === 'me' && p.role === 'interpreter') || {};
            const mySkills = myProfile ? myProfile.skills : '';
            const decorate = function (o) {
                const score = matchScore(mySkills, o.requiredSkills);
                const distance = distanceKm(myProfile.campusLat, myProfile.campusLng, o.locationLat, o.locationLng);
                return {
                    id: o.id,
                    title: o.businessName,
                    dateLabel: friendlyDate(o.serviceDate).label,
                    startTime: o.startTime,
                    price: o.price,
                    jobId: o.jobId,
                    location: o.locationName || o.locationAddress,
                    requirements: o.requirements,
                    belowRate: !o.jobId && myProfile.pricePerDay > 0 && o.price < myProfile.pricePerDay,
                    distance: distance,
                    distanceLabel: distance === null ? '' : distance.toFixed(1) + ' km',
                    status: o.status,
                    statusLabel: statusText(o.status),
                    match: score === null ? -1 : score,
                    matchClass: matchClass(score),
                };
            };
            // 待接单按技能匹配度从高到低排序（无匹配信息的排在后面）
            const pending = mine.filter(function (o) { return o.status === 'pending'; }).map(decorate);
            pending.sort((a, b) => {
                if (self.data.taskSort === 1) return b.price - a.price;
                if (self.data.taskSort === 2) return (a.distance ?? Infinity) - (b.distance ?? Infinity) || b.match - a.match;
                return b.match - a.match;
            });
            self.setData({
                pendingTasks: pending,
                studentRate: myProfile.pricePerDay || 0,
                studentCampus: myProfile.campusName || '',
                activeTasks: mine.filter(function (o) {
                    return ['accepted', 'deposit_paid', 'completed'].indexOf(o.status) >= 0;
                }).map(decorate),
            });
        });
    },

    goTaskDetail(event) {
        wx.navigateTo({ url: '/pages/task-detail/task-detail?id=' + event.currentTarget.dataset.id });
    },

    goAvailability() {
        wx.navigateTo({ url: '/pages/availability/availability' });
    },

    changeTaskSort(event) {
        this.setData({ taskSort: Number(event.detail.value) });
        this.loadTasks();
    },

    goProfileEdit() {
        wx.navigateTo({ url: '/pages/profile-edit/profile-edit' });
    },

    applyBudget(event) {
        const value = String(event.detail.value || '').trim();
        if (value && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
            wx.showToast({ title: '请输入大于 0 的日预算', icon: 'none' });
            this.setData({ budget: '' });
        } else {
            this.setData({ budget: value });
        }
        this.loadInterpreters();
    },

    pickServicePlace() {
        choosePlace(({ name, address, latitude, longitude }) => {
            this.setData({ servicePlace: { name: name || '', address: address || '', latitude, longitude } });
            this.loadInterpreters();
        });
    },

    clearServicePlace() {
        this.setData({ servicePlace: null });
        this.loadInterpreters();
    },

    changeCandidateSort(event) {
        this.setData({ candidateSort: Number(event.detail.value) });
        this.loadInterpreters();
    },

    // ---------- 商家端：预约译员 ----------
    onDateChange(event) {
        this.setData({ pickDate: event.detail.value, dateLabel: friendlyDate(event.detail.value).label });
        this.loadInterpreters();
    },

    loadInterpreters() {
        const self = this;
        const date = this.data.pickDate;
        if (!date) {
            return;
        }
        this.setData({ loading: true });
        const request = {};
        this.interpreterRequest = request;
        Promise.all([profiles.list(), availability.list(), orders.list(), reviews.list(), favorites.list()]).then(function (results) {
            if (self.interpreterRequest !== request || self.data.role !== 'business') return;
            if (results[0].error || results[1].error || results[2].error || results[3].error || results[4].error) {
                self.setData({ loading: false });
                wx.showToast({ title: '筛选失败，请重试', icon: 'none' });
                return;
            }
            const interpreterRows = results[0].data.filter(function (p) {
                return p.role === 'interpreter' && p.ownerId !== 'me';
            });
            const busyFree = {};
            results[1].data.forEach(function (a) {
                if (a.date === date) {
                    busyFree[a.ownerId] = true;
                }
            });
            // 当天已有生效预约的译员直接隐藏，避免重复预约（上云后由服务端兜底）
            const busyOrders = {};
            results[2].data.forEach(function (o) {
                if (o.serviceDate === date && reservesDate(o, true)) {
                    busyOrders[o.interpreterId] = true;
                }
            });
            // 每位译员的评分（商家评译员）
            const ratingByOwner = {};
            results[3].data.forEach(function (r) {
                if (r.targetRole !== 'interpreter') return;
                (ratingByOwner[r.targetId] = ratingByOwner[r.targetId] || []).push(r);
            });
            // 收藏集合（当前商家账号）
            const favSet = {};
            results[4].data.forEach(function (f) {
                if (f.userId === 'me') {
                    favSet[f.targetId] = f.id;
                }
            });
            self.favSet = favSet;
            // 技能匹配：选中的需求技能 vs 译员技能（覆盖比例）
            const skillFilter = Object.keys(self.data.skillFilterMap);
            const scoreFor = function (p) {
                if (skillFilter.length === 0) return -1;
                const score = matchScore(p.skills, skillFilter);
                return score === null ? -1 : score;
            };
            const list = interpreterRows
                .filter(function (p) {
                    if (!busyFree[p.ownerId] || busyOrders[p.ownerId]) return false;
                    if (!(Number(p.pricePerDay) > 0) || (self.data.budget && p.pricePerDay > Number(self.data.budget))) return false;
                    if (self.data.favOnly) return favSet[p.ownerId] !== undefined;
                    return true;
                })
                .map(function (p) {
                    const summary = ratingSummary(ratingByOwner[p.ownerId]);
                    const score = scoreFor(p);
                    const place = self.data.servicePlace || {};
                    const distance = distanceKm(p.campusLat, p.campusLng, place.latitude, place.longitude);
                    return {
                        ownerId: p.ownerId,
                        name: p.name,
                        school: p.school,
                        englishLevel: p.englishLevel,
                        pricePerDay: p.pricePerDay,
                        intro: p.intro,
                        initial: (p.name || '?').slice(0, 1),
                        date: date,
                        ratingAvg: summary.avg,
                        ratingCount: summary.count,
                        fav: favSet[p.ownerId] !== undefined,
                        match: score,
                        distance: distance,
                        distanceLabel: distance === null ? '' : distance.toFixed(1) + ' km',
                        matchClass: matchClass(score),
                    };
                });
            // 选中技能后按匹配度从高到低排序
            list.sort((a, b) => {
                if (self.data.candidateSort === 1) return a.pricePerDay - b.pricePerDay;
                if (self.data.candidateSort === 2) return (a.distance ?? Infinity) - (b.distance ?? Infinity) || b.match - a.match;
                return b.match - a.match;
            });
            self.setData({ loading: false, searched: true, interpreters: list });
        }).catch(function () {
            if (self.interpreterRequest !== request || self.data.role !== 'business') return;
            self.setData({ loading: false });
            wx.showToast({ title: '筛选失败，请重试', icon: 'none' });
        });
    },

    toggleSkillFilter(event) {
        const tag = event.currentTarget.dataset.tag;
        const map = Object.assign({}, this.data.skillFilterMap);
        if (map[tag]) {
            delete map[tag];
        } else {
            map[tag] = true;
        }
        this.setData({
            skillFilterMap: map,
            skillFilterCount: Object.keys(map).length,
        });
        this.loadInterpreters();
    },

    clearSkillFilter() {
        this.setData({ skillFilterMap: {}, skillFilterCount: 0 });
        this.loadInterpreters();
    },

    goInterpreterDetail(event) {
        if (this.data.loading) return;
        const ownerId = event.currentTarget.dataset.owner;
        const interpreter = this.data.interpreters.find((item) => item.ownerId === ownerId);
        if (!interpreter || interpreter.date !== this.data.pickDate) return;
        const skills = encodeURIComponent(joinSkills(Object.keys(this.data.skillFilterMap)));
        const place = this.data.servicePlace ? '&place=' + encodeURIComponent(JSON.stringify(this.data.servicePlace)) : '';
        wx.navigateTo({ url: '/pages/interpreter-detail/interpreter-detail?ownerId=' + ownerId + '&date=' + this.data.pickDate + '&skills=' + skills + place });
    },

    toggleFavOnly() {
        this.setData({ favOnly: !this.data.favOnly });
        this.loadInterpreters();
    },

    toggleFavorite(event) {
        if (this.data.role !== 'business') return;
        // 防连点：上一次收藏操作未完成前忽略新的点击
        if (this.favBusy) return;
        this.favBusy = true;
        const ownerId = event.currentTarget.dataset.owner;
        const self = this;
        const done = function () { self.favBusy = false; };
        const existing = (this.favSet && this.favSet[ownerId]) || null;
        const setHeart = function (fav) {
            // 只看收藏时取消收藏，卡片直接移出列表
            const list = self.data.interpreters
                .filter(function (i) {
                    return fav || !self.data.favOnly || i.ownerId !== ownerId;
                })
                .map(function (i) {
                    if (i.ownerId !== ownerId) return i;
                    return Object.assign({}, i, { fav: fav });
                });
            self.setData({ interpreters: list });
        };
        if (existing) {
            favorites.remove(existing).then(function (r) {
                done();
                if (r.error) return;
                delete self.favSet[ownerId];
                setHeart(false);
            });
        } else {
            favorites.create({ userId: 'me', targetId: ownerId }).then(function (r) {
                done();
                if (r.error) {
                    wx.showToast({ title: r.error.message || '收藏失败', icon: 'none' });
                    return;
                }
                self.favSet[ownerId] = r.data.id;
                setHeart(true);
            });
        }
    },

    goOrders() {
        wx.switchTab({ url: '/pages/orders/orders' });
    },

    onShareAppMessage() {
        return {
            title: 'Sunflower·英语陪同 — 大学生英语陪同兼职平台',
            path: '/pages/index/index',
        };
    },

    onShareTimeline() {
        return { title: 'Sunflower·英语陪同 — 大学生英语陪同兼职平台' };
    },
});
