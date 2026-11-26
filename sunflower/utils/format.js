// 订单状态与通用格式化
const STATUS_MAP = {
    pending: '待接单',
    accepted: '待付定金',
    deposit_paid: '待服务',
    completed: '待付尾款',
    finished: '已完成',
    cancelled: '已取消',
};

function statusText(status) {
    return STATUS_MAP[status] || status || '';
}

function pad(value) {
    return value < 10 ? '0' + value : '' + value;
}

function dateStr(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function today() {
    return dateStr(new Date());
}

function dateAfter(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return dateStr(d);
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// '2026-11-15' → { md: '11月15日', week: '周六', label: '11月15日 周六' }
function friendlyDate(dateStrValue) {
    const d = new Date(dateStrValue + 'T00:00:00');
    if (isNaN(d.getTime())) {
        return { md: dateStrValue || '', week: '', label: dateStrValue || '' };
    }
    const md = (d.getMonth() + 1) + '月' + d.getDate() + '日';
    const week = '周' + WEEKDAYS[d.getDay()];
    const t = today();
    let prefix = '';
    if (dateStrValue === t) {
        prefix = '今天 · ';
    } else if (dateStrValue === dateAfter(1)) {
        prefix = '明天 · ';
    }
    return { md: md, week: week, label: prefix + md + ' ' + week };
}

function depositOf(price) {
    return Math.ceil((Number(price) || 0) * 0.3);
}

// 评价汇总：{ avg: '4.8', count: 12 }；无评价时 { avg: '0.0', count: 0 }
function ratingSummary(reviews) {
    const rows = Array.isArray(reviews) ? reviews : [];
    if (rows.length === 0) {
        return { avg: '0.0', count: 0 };
    }
    const sum = rows.reduce(function (s, r) { return s + Number(r.rating || 0); }, 0);
    return { avg: (sum / rows.length).toFixed(1), count: rows.length };
}

module.exports = {
    statusText: statusText,
    today: today,
    dateAfter: dateAfter,
    friendlyDate: friendlyDate,
    depositOf: depositOf,
    ratingSummary: ratingSummary,
};
