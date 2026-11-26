// 技能标签体系与双向匹配计算
const SKILL_GROUPS = [
    {
        group: '场景',
        tags: ['商务洽谈', '展会陪同', '工厂参观', '产品发布', '旅游陪同', '会议翻译', '接机接待', '课堂翻译'],
    },
    {
        group: '行业',
        tags: ['外贸', '科技互联网', '医疗健康', '教育培训', '法律', '金融', '制造业', '文创娱乐'],
    },
];

function parseSkills(value) {
    if (!value || typeof value !== 'string') return [];
    return value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function joinSkills(list) {
    return (list || []).join(',');
}

// 匹配度：需求被满足的比例（0-100）；需求为空返回 null（不展示匹配）
// required 兼容两种形态：逗号分隔字符串（订单字段）或标签数组（筛选器）
function matchScore(mySkills, required) {
    const mine = parseSkills(mySkills);
    const req = Array.isArray(required)
        ? required.filter(Boolean)
        : parseSkills(required);
    if (req.length === 0) return null;
    const hit = req.filter(function (s) { return mine.indexOf(s) >= 0; }).length;
    return Math.round((hit / req.length) * 100);
}

// 匹配等级样式：>=80 绿 / >=50 蓝 / 其余橙
function matchClass(score) {
    if (score === null || score === undefined) return '';
    if (score >= 80) return 'chip-finished';
    if (score >= 50) return 'chip-deposit';
    return 'chip-accepted';
}

module.exports = {
    SKILL_GROUPS: SKILL_GROUPS,
    parseSkills: parseSkills,
    joinSkills: joinSkills,
    matchScore: matchScore,
    matchClass: matchClass,
};
