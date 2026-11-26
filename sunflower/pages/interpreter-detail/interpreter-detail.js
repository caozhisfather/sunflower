const { profiles, availability, reviews } = require('../../utils/data');
const { friendlyDate, ratingSummary, dateAfter } = require('../../utils/format');
const { parseSkills } = require('../../utils/skills');
const { locationFromQuery } = require('../../utils/service-location');

const STARS_FULL = '★★★★★';

function starsText(rating) {
    const n = Math.max(0, Math.min(5, Number(rating) || 0));
    return STARS_FULL.slice(0, n);
}

Page({
    data: {
        interpreter: null,
        date: '',
        dateLabel: '',
        freeDatesCount: 0,
        ratingAvg: '0.0',
        ratingCount: 0,
        recentReviews: [],
        skills: [],
    },

    onLoad(query) {
        const q = query || {};
        this.ownerId = q.ownerId;
        this.servicePlace = locationFromQuery(q);
        try {
            this.requiredSkills = decodeURIComponent(q.skills || '');
        } catch (error) {
            this.requiredSkills = '';
        }
        // 分享进入（无日期）时默认明天，避免预约页面落到今天
        const date = q.date || dateAfter(1);
        this.setData({ date: date, dateLabel: friendlyDate(date).label });
        this.loadInterpreter();
    },

    loadInterpreter() {
        const self = this;
        Promise.all([profiles.list(), availability.list(), reviews.list()]).then(function (results) {
            const found = results[0].data.find((p) => p.ownerId === self.ownerId && p.role === 'interpreter');
            const freeDates = results[1].data
                .filter(function (a) { return a.ownerId === self.ownerId; })
                .map(function (a) { return a.date; });
            if (!found) {
                self.setData({ interpreter: null });
                return;
            }
            // 该译员收到的评价（商家评译员）
            const targetReviews = (results[2].data || []).filter(function (r) {
                return r.targetId === self.ownerId && r.targetRole === 'interpreter';
            });
            const summary = ratingSummary(targetReviews);
            self.setData({
                interpreter: {
                    ownerId: found.ownerId,
                    name: found.name,
                    phone: found.phone,
                    school: found.school,
                    major: found.major,
                    englishLevel: found.englishLevel,
                    pricePerDay: found.pricePerDay,
                    intro: found.intro,
                    initial: (found.name || '?').slice(0, 1),
                },
                freeDatesCount: freeDates.length,
                skills: parseSkills(found.skills),

                ratingAvg: summary.avg,
                ratingCount: summary.count,
                recentReviews: targetReviews.slice(0, 5).map(function (r) {
                    return {
                        id: r.id,
                        reviewerName: r.reviewerName || '商家',
                        stars: starsText(r.rating),
                        comment: r.comment,
                    };
                }),
            });
        });
    },

    goOrderCreate() {
        const place = this.servicePlace ? '&place=' + encodeURIComponent(JSON.stringify(this.servicePlace)) : '';
        wx.navigateTo({
            url: '/pages/order-create/order-create?ownerId=' + this.ownerId +
                '&date=' + this.data.date +
                '&name=' + encodeURIComponent(this.data.interpreter.name) +
                '&price=' + this.data.interpreter.pricePerDay +
                '&skills=' + encodeURIComponent(this.requiredSkills) + place,
        });
    },

    onShareAppMessage() {
        const it = this.data.interpreter;
        return {
            title: it ? '英语陪同译员 ' + it.name + ' · ¥' + it.pricePerDay + '/天' : 'Sunflower·英语陪同',
            path: '/pages/interpreter-detail/interpreter-detail?ownerId=' + this.ownerId,
        };
    },
});
