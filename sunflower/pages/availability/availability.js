const session = require('../../utils/session');
const { availability } = require('../../utils/data');
const { today } = require('../../utils/format');

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function pad(n) {
    return n < 10 ? '0' + n : '' + n;
}

function dateStrOf(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// 生成某月的日历格子（前后月补齐，固定 6 行 42 格）
function buildMonthDays(year, month, mine) {
    const todayStr = today();
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    // 前月补齐（恒不可选）
    for (let i = startWeekday - 1; i >= 0; i -= 1) {
        const d = new Date(year, month, -i);
        days.push({
            date: dateStrOf(d),
            day: d.getDate(),
            inMonth: false,
            isPast: true,
            isToday: false,
            selected: false,
        });
    }
    // 本月
    for (let d = 1; d <= daysInMonth; d += 1) {
        const date = year + '-' + pad(month + 1) + '-' + pad(d);
        days.push({
            date: date,
            day: d,
            inMonth: true,
            isPast: date < todayStr,
            isToday: date === todayStr,
            selected: !!mine[date],
        });
    }
    // 后月补齐到 42 格
    let next = 1;
    while (days.length < 42) {
        const d = new Date(year, month + 1, next);
        next += 1;
        days.push({
            date: dateStrOf(d),
            day: d.getDate(),
            inMonth: false,
            isPast: false,
            isToday: false,
            selected: false,
        });
    }
    return days;
}

Page({
    data: {
        weekdays: WEEKDAYS,
        viewYear: 0,
        viewMonth: 0, // 0-11
        monthLabel: '',
        canGoPrev: false,
        days: [],
        selectedCount: 0,
        busy: false,
    },

    onLoad() {
        const now = new Date();
        this.viewYear = now.getFullYear();
        this.viewMonth = now.getMonth();
    },

    onShow() {
        const current = session.getSession();
        if (!current || current.role !== 'interpreter') {
            wx.showToast({ title: '请以译员身份使用此功能', icon: 'none' });
            setTimeout(function () { wx.navigateBack(); }, 800);
            return;
        }
        this.loadAvailability();
    },

    loadAvailability() {
        const self = this;
        availability.list().then(function (result) {
            const mine = {};
            if (result.error) throw result.error;
            const firstBookableDate = today();
            (result.data || []).forEach(function (a) {
                if (a.ownerId === 'me' && a.date >= firstBookableDate) {
                    mine[a.date] = a.id;
                }
            });
            self.availMap = mine;
            self.applyView();
            self.setData({ selectedCount: Object.keys(mine).length });
        }).catch(function () {
            wx.showToast({ title: '空闲时间加载失败，请重新进入', icon: 'none' });
        });
    },

    applyView() {
        const mine = this.availMap || {};
        const now = new Date();
        this.setData({
            monthLabel: this.viewYear + '年' + (this.viewMonth + 1) + '月',
            canGoPrev: this.viewYear > now.getFullYear() ||
                (this.viewYear === now.getFullYear() && this.viewMonth > now.getMonth()),
            days: buildMonthDays(this.viewYear, this.viewMonth, mine),
        });
    },

    prevMonth() {
        if (!this.data.canGoPrev) return;
        const d = new Date(this.viewYear, this.viewMonth - 1, 1);
        this.viewYear = d.getFullYear();
        this.viewMonth = d.getMonth();
        this.applyView();
    },

    nextMonth() {
        const d = new Date(this.viewYear, this.viewMonth + 1, 1);
        this.viewYear = d.getFullYear();
        this.viewMonth = d.getMonth();
        this.applyView();
    },

    toggleDay(event) {
        if (this.data.busy || !this.availMap) return;
        const index = event.currentTarget.dataset.index;
        const day = this.data.days[index];
        if (!day || !day.inMonth || day.isPast) {
            return;
        }
        const self = this;
        const date = day.date;
        const existing = (this.availMap && this.availMap[date]) || null;
        this.setData({ busy: true });
        const job = existing
            ? availability.remove(existing)
            : availability.create({ ownerId: 'me', date: date });
        job.then(function (result) {
            if (result.error) {
                wx.showToast({ title: result.error.message || '操作失败', icon: 'none' });
                return;
            }
            if (existing) {
                delete self.availMap[date];
            } else {
                self.availMap[date] = result.data && result.data.id;
            }
            self.applyView();
            self.setData({ selectedCount: Object.keys(self.availMap).length });
        }).catch(function () {
            wx.showToast({ title: '操作失败，请重试', icon: 'none' });
        }).finally(function () {
            self.setData({ busy: false });
        });
    },

    markMonth() {
        if (this.data.busy || !this.availMap) return;
        const self = this;
        const targets = this.data.days.filter(function (d) {
            return d.inMonth && !d.isPast && !(self.availMap && self.availMap[d.date]);
        });
        if (targets.length === 0) {
            wx.showToast({ title: '本月可约日期已全选', icon: 'none' });
            return;
        }
        this.setData({ busy: true });
        Promise.allSettled(targets.map(function (d) {
            return availability.create({ ownerId: 'me', date: d.date });
        })).then(function (results) {
            let failed = 0;
            results.forEach(function (r, i) {
                if (r.status === 'fulfilled' && !r.value.error) {
                    self.availMap[targets[i].date] = r.value.data.id;
                } else {
                    failed += 1;
                }
            });
            self.setData({ busy: false, selectedCount: Object.keys(self.availMap).length });
            wx.showToast({ title: failed ? '有 ' + failed + ' 天保存失败，可重试' : '已全选本月可约日期', icon: 'none' });
            self.applyView();
        });
    },

    clearAll() {
        if (this.data.busy || !this.availMap) return;
        const self = this;
        wx.showModal({
            title: '清空可预约日期？',
            content: '清空后商家将筛不到你。',
            confirmText: '清空',
            confirmColor: '#c2410c',
            success: (res) => {
                if (!res.confirm || self.data.busy) return;
                self.setData({ busy: true });
                const dates = Object.keys(self.availMap);
                Promise.allSettled(dates.map(function (date) {
                    return availability.remove(self.availMap[date]);
                })).then(function (results) {
                    let failed = 0;
                    results.forEach(function (r, i) {
                        if (r.status === 'fulfilled' && !r.value.error) {
                            delete self.availMap[dates[i]];
                        } else {
                            failed += 1;
                        }
                    });
                    self.setData({ busy: false, selectedCount: failed });
                    wx.showToast({ title: failed ? '有 ' + failed + ' 天清除失败，可重试' : '已清空', icon: 'none' });
                    self.applyView();
                });
            },
        });
    },
});
