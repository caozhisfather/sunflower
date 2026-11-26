// 首次启动写入演示数据，让两个身份都能立即体验完整流程。
// 演示数据带 is_demo 标记；接入云服务后由真实数据取代。
const { loadDb, saveDb } = require('./db');

function demoInterpreters() {
    return [
        {
            id: 1,
            owner_id: 'demo_1',
            role: 'interpreter',
            name: '李晓阳',
            phone: '138****0001',
            school: '深圳大学',
            major: '英语翻译',
            english_level: '专八 · CATTI 三级笔译',
            price_per_day: 400,
            intro: '做过 6 次展会陪同，口语流利，熟悉商务接待流程。',
            skills: '商务洽谈,展会陪同,接机接待,外贸',
            company: '',
            contact: '',
            is_demo: true,
            created_at: '2026-10-01T09:00:00.000Z',
        },
        {
            id: 2,
            owner_id: 'demo_2',
            role: 'interpreter',
            name: '王雨桐',
            phone: '138****0002',
            school: '广东外语外贸大学',
            major: '商务英语',
            english_level: '雅思 7.5 · 专八',
            price_per_day: 350,
            intro: '外贸公司实习半年，擅长展会展位翻译与客户陪同。',
            skills: '商务洽谈,展会陪同,会议翻译,外贸',
            company: '',
            contact: '',
            is_demo: true,
            created_at: '2026-10-01T09:05:00.000Z',
        },
        {
            id: 3,
            owner_id: 'demo_3',
            role: 'interpreter',
            name: '陈志豪',
            phone: '138****0003',
            school: '中山大学',
            major: '国际经济与贸易',
            english_level: '六级 590 · 口语流利',
            price_per_day: 300,
            intro: '性价比之选，可陪同商务考察与工厂参观，理工背景。',
            skills: '工厂参观,接机接待,外贸,制造业',
            company: '',
            contact: '',
            is_demo: true,
            created_at: '2026-10-01T09:10:00.000Z',
        },
    ];
}

function demoBusinessProfiles() {
    return [
        {
            id: 4,
            owner_id: 'demo_b1',
            role: 'business',
            name: '宏图外贸（演示）',
            phone: '',
            school: '',
            major: '',
            english_level: '',
            price_per_day: 0,
            intro: '外贸出口为主，主营消费电子，常有海外客户来访，需要陪同翻译与接待。',
            company: '深圳宏图外贸有限公司',
            contact: '138****0011',
            is_demo: true,
            created_at: '2026-10-01T09:20:00.000Z',
        },
        {
            id: 5,
            owner_id: 'demo_b2',
            role: 'business',
            name: '星野科技（演示）',
            phone: '',
            school: '',
            major: '',
            english_level: '',
            price_per_day: 0,
            intro: '智能硬件创业公司，发布会与海外客户接待较多，需要口语流利的陪同译员。',
            company: '星野科技（深圳）有限公司',
            contact: '138****0012',
            is_demo: true,
            created_at: '2026-10-01T09:25:00.000Z',
        },
        {
            id: 6,
            owner_id: 'demo_b3',
            role: 'business',
            name: '启航跨境（演示）',
            phone: '',
            school: '',
            major: '',
            english_level: '',
            price_per_day: 0,
            intro: '跨境电商物流服务商，不定期接待海外合作方，看厂与洽谈场景为主。',
            company: '启航跨境物流（深圳）有限公司',
            contact: '138****0013',
            is_demo: true,
            created_at: '2026-10-01T09:30:00.000Z',
        },
    ];
}

function buildDates() {
    const owners = ['demo_1', 'demo_2', 'demo_3'];
    const dates = [];
    let nid = 0;
    for (let offset = 1; offset <= 30; offset += 1) {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        const dateValue = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        owners.forEach(function (owner) {
            nid += 1;
            dates.push({ id: nid, owner_id: owner, avail_date: dateValue });
        });
    }
    return dates;
}

function demoTasks() {
    function after(days) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    const now = new Date().toISOString();
    return [
        {
            id: 9001,
            business_id: 'demo_b1',
            business_name: '宏图外贸（演示）',
            interpreter_id: 'me',
            interpreter_name: '',
            service_date: after(3),
            start_time: '09:00',
            requirements: '陪同接待来访客户，工厂参观 + 商务洽谈，需要懂外贸流程。',
            required_skills: '商务洽谈,外贸,工厂参观',
            location_name: '深圳国际会展中心',
            location_address: '深圳市宝安区福海街道展城路1号',
            location_lat: 22.6783,
            location_lng: 113.7749,
            price: 400,
            deposit: 120,
            status: 'pending',
            deposit_paid_at: '',
            final_paid_at: '',
            created_at: now,
            updated_at: now,
        },
        {
            id: 9002,
            business_id: 'demo_b2',
            business_name: '星野科技（演示）',
            interpreter_id: 'me',
            interpreter_name: '',
            service_date: after(6),
            start_time: '13:30',
            requirements: '产品发布会现场陪同，帮外国合作方做口头翻译与引导。',
            required_skills: '产品发布,科技互联网,会议翻译',
            location_name: '深圳湾科技生态园',
            location_address: '深圳市南山区高新南环路',
            location_lat: 22.5293,
            location_lng: 113.9484,
            price: 350,
            deposit: 105,
            status: 'pending',
            deposit_paid_at: '',
            final_paid_at: '',
            created_at: now,
            updated_at: now,
        },
    ];
}

function demoReviews() {
    return [
        {
            id: 1,
            order_id: 99001,
            reviewer_id: 'demo_b1',
            reviewer_role: 'business',
            reviewer_name: '宏图外贸',
            target_id: 'demo_1',
            target_role: 'interpreter',
            rating: 5,
            comment: '口语很流利，接待外宾很专业，全程没有冷场，下次还约！',
            created_at: '2026-10-20T08:00:00.000Z',
        },
        {
            id: 2,
            order_id: 99002,
            reviewer_id: 'demo_b2',
            reviewer_role: 'business',
            reviewer_name: '星野科技',
            target_id: 'demo_1',
            target_role: 'interpreter',
            rating: 4,
            comment: '专业度高，展会现场帮了大忙，提前半小时到场很加分。',
            created_at: '2026-10-25T10:30:00.000Z',
        },
        {
            id: 3,
            order_id: 99003,
            reviewer_id: 'demo_b1',
            reviewer_role: 'business',
            reviewer_name: '宏图外贸',
            target_id: 'demo_2',
            target_role: 'interpreter',
            rating: 5,
            comment: '外贸术语很熟，陪同谈判超出预期，性价比很高。',
            created_at: '2026-10-22T09:15:00.000Z',
        },
        {
            id: 4,
            order_id: 99004,
            reviewer_id: 'demo_b3',
            reviewer_role: 'business',
            reviewer_name: '启航跨境',
            target_id: 'demo_3',
            target_role: 'interpreter',
            rating: 4,
            comment: '理工背景沟通顺畅，工厂参观讲解到位，很守时。',
            created_at: '2026-10-18T14:00:00.000Z',
        },
        // 译员评价商家（商家主页展示）
        {
            id: 5,
            order_id: 99005,
            reviewer_id: 'demo_1',
            reviewer_role: 'interpreter',
            reviewer_name: '李晓阳',
            target_id: 'demo_b1',
            target_role: 'business',
            rating: 5,
            comment: '商家对接人很专业，行程安排清晰，尾款结算及时。',
            created_at: '2026-10-26T06:00:00.000Z',
        },
        {
            id: 6,
            order_id: 99006,
            reviewer_id: 'demo_2',
            reviewer_role: 'interpreter',
            reviewer_name: '王雨桐',
            target_id: 'demo_b2',
            target_role: 'business',
            rating: 5,
            comment: '沟通顺畅，需求明确，提前发来了产品资料，准备起来很轻松。',
            created_at: '2026-10-24T07:30:00.000Z',
        },
    ];
}

function demoNotifications() {
    const now = new Date().toISOString();
    return [
        {
            id: 1,
            user_id: 'me',
            role: 'interpreter',
            type: 'system',
            order_id: '',
            title: '欢迎使用 Sunflower',
            body: '完善空闲时间设置，商家才能在搜索时找到你',
            read: 0,
            created_at: now,
        },
        {
            id: 2,
            user_id: 'me',
            role: 'business',
            type: 'system',
            order_id: '',
            title: '演示订单已就绪',
            body: '切换到译员身份可查看 2 条预约请求，体验完整接单流程',
            read: 0,
            created_at: now,
        },
    ];
}

function ensureSeed() {
    const { isCloudEnabled } = require('./cloud');
    if (isCloudEnabled()) {
        // 云端环境不写本地演示数据，由服务端建表/迁移脚本提供
        return;
    }
    const db = loadDb();
    if (db.profiles.length > 0 || db.orders.length > 0) {
        // 老数据回填：演示评价（让评分展示不空）+ 一次性演示通知（notif_seeded 标记防重复）
        // + 演示商家资料（商家主页入口有内容）
        let changed = false;
        if (!Array.isArray(db.reviews) || db.reviews.length === 0) {
            db.reviews = demoReviews();
            changed = true;
        } else {
            // 增量补充：老数据可能没有「译员评价商家」的记录（商家主页展示用）
            const hasBusinessReviews = db.reviews.some(function (r) {
                return r.target_role === 'business';
            });
            if (!hasBusinessReviews) {
                db.reviews = db.reviews.concat(demoReviews().filter(function (r) {
                    return r.target_role === 'business';
                }));
                changed = true;
            }
        }
        if (!db.notif_seeded) {
            db.notifications = demoNotifications();
            db.notif_seeded = true;
            changed = true;
        }
        const hasDemoBusiness = db.profiles.some(function (p) {
            return p.role === 'business' && p.owner_id !== 'me';
        });
        if (!hasDemoBusiness) {
            db.profiles = db.profiles.concat(demoBusinessProfiles());
            changed = true;
        }
        // 老数据补技能字段（演示译员 + 演示订单）
        const demoSkillMap = {
            demo_1: '商务洽谈,展会陪同,接机接待,外贸',
            demo_2: '商务洽谈,展会陪同,会议翻译,外贸',
            demo_3: '工厂参观,接机接待,外贸,制造业',
        };
        db.profiles.forEach(function (p) {
            if (demoSkillMap[p.owner_id] && !p.skills) {
                p.skills = demoSkillMap[p.owner_id];
                changed = true;
            }
        });
        const demoOrderSkills = { 9001: '商务洽谈,外贸,工厂参观', 9002: '产品发布,科技互联网,会议翻译' };
        db.orders.forEach(function (o) {
            if (demoOrderSkills[o.id] && !o.required_skills) {
                o.required_skills = demoOrderSkills[o.id];
                changed = true;
            }
        });
                // 演示译员的未来空闲日期过期后自动重建（保留用户自己的 'me' 记录），
        // 否则商家端玩久了会筛不到任何译员
        const demoOwners = ['demo_1', 'demo_2', 'demo_3'];
        const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        const now = new Date();
        const todayStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
        const hasFutureDemoAvail = db.availability.some(function (a) {
            return demoOwners.indexOf(a.owner_id) >= 0 && a.avail_date >= todayStr;
        });
        if (!hasFutureDemoAvail) {
            db.availability = db.availability
                .filter(function (a) { return demoOwners.indexOf(a.owner_id) < 0; })
                .concat(buildDates());
            changed = true;
        }
        if (changed) {
            saveDb(db);
        }
        return;
    }
    db.profiles = demoInterpreters().concat(demoBusinessProfiles());
    db.availability = buildDates();
    db.orders = demoTasks();
    db.reviews = demoReviews();
    db.notifications = demoNotifications();
    db.notif_seeded = true;
    saveDb(db);
}

module.exports = { ensureSeed: ensureSeed };
