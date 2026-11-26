const { profiles, reviews } = require('../../utils/data');
const { ratingSummary } = require('../../utils/format');

const STARS_FULL = '★★★★★';

function starsText(rating) {
    const n = Math.max(0, Math.min(5, Number(rating) || 0));
    return STARS_FULL.slice(0, n);
}

Page({
    data: {
        business: null,
        ratingAvg: '0.0',
        ratingCount: 0,
        recentReviews: [],
    },

    onLoad(query) {
        this.ownerId = (query || {}).ownerId;
        this.load();
    },

    load() {
        const self = this;
        Promise.all([profiles.list(), reviews.list()]).then(function (results) {
            const found = results[0].data.find(function (p) {
                return p.ownerId === self.ownerId && p.role === 'business';
            });
            if (!found) {
                self.setData({ business: null });
                return;
            }
            // 译员评价商家的记录
            const target = (results[1].data || []).filter(function (r) {
                return r.targetId === self.ownerId && r.targetRole === 'business';
            });
            const summary = ratingSummary(target);
            self.setData({
                business: {
                    name: found.name,
                    company: found.company,
                    contact: found.contact,
                    intro: found.intro,
                    initial: (found.name || found.company || '?').slice(0, 1),
                    callable: /^1\d{10}$/.test(found.contact),
                },
                ratingAvg: summary.avg,
                ratingCount: summary.count,
                recentReviews: target.slice(0, 5).map(function (r) {
                    return {
                        id: r.id,
                        reviewerName: r.reviewerName || '译员',
                        stars: starsText(r.rating),
                        comment: r.comment,
                    };
                }),
            });
        });
    },

    callContact() {
        const b = this.data.business;
        if (b && b.callable) {
            wx.makePhoneCall({ phoneNumber: b.contact });
        }
    },
});
