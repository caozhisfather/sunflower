const session = require('../../utils/session');
const { profiles } = require('../../utils/data');
const { today } = require('../../utils/format');
const { SKILL_GROUPS, parseSkills, joinSkills } = require('../../utils/skills');
const { choosePlace } = require('../../utils/service-location');

Page({
    data: {
        role: '',
        // 通用
        name: '',
        phone: '',
        intro: '',
        // 译员
        school: '',
        major: '',
        englishLevel: '',
        pricePerDay: '',
        campusName: '',
        campusLat: null,
        campusLng: null,
        // 商家
        company: '',
        contact: '',
        // 技能标签（译员必填，用于双向匹配）
        skillGroups: SKILL_GROUPS,
        skillMap: {},
        submitting: false,
        formError: '',
        isDemo: false,
    },

    onShow() {
        const current = session.getSession();
        if (!current) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            setTimeout(function () { wx.navigateBack(); }, 800);
            return;
        }
        this.setData({ role: current.role, name: current.name, formError: '' });
        this.loadProfile();
    },

    loadProfile() {
        const self = this;
        profiles.list().then(function (result) {
            const mine = (result.data || []).find((p) => p.ownerId === 'me' && p.role === self.data.role);
            if (!mine) {
                return;
            }
            const skillMap = {};
            parseSkills(mine.skills).forEach(function (s) { skillMap[s] = true; });
            self.setData({
                name: mine.name,
                phone: mine.phone,
                intro: mine.intro,
                school: mine.school,
                major: mine.major,
                englishLevel: mine.englishLevel,
                pricePerDay: mine.pricePerDay ? String(mine.pricePerDay) : '',
                campusName: mine.campusName,
                campusLat: mine.campusLat ?? null,
                campusLng: mine.campusLng ?? null,
                company: mine.company,
                contact: mine.contact,
                skillMap: skillMap,
                isDemo: false,
            });
        });
    },

    bindField(event) {
        const field = event.currentTarget.dataset.field;
        const patch = {};
        patch[field] = event.detail.value;
        patch.formError = '';
        this.setData(patch);
    },

    chooseCampus() {
        choosePlace(({ name, latitude, longitude }) => {
            this.setData({ campusName: name, campusLat: latitude, campusLng: longitude });
        });
    },

    clearCampus() {
        this.setData({ campusName: '', campusLat: null, campusLng: null });
    },

    toggleSkill(event) {
        const tag = event.currentTarget.dataset.tag;
        const map = Object.assign({}, this.data.skillMap);
        if (map[tag]) {
            delete map[tag];
        } else {
            map[tag] = true;
        }
        this.setData({ skillMap: map, formError: '' });
    },

    async submit() {
        if (this.data.submitting) return;
        const role = this.data.role;
        const name = (this.data.name || '').trim();
        if (!name) {
            this.setData({ formError: '请填写姓名/昵称' });
            return;
        }
        this.setData({ submitting: true, formError: '' });
        const payload = {
            ownerId: 'me', // 上云后替换为 auth.uid() 或移除（由服务端 DEFAULT 写入）
            role: role,
            name: name,
            phone: (this.data.phone || '').trim(),
            intro: (this.data.intro || '').trim(),
            skills: joinSkills(Object.keys(this.data.skillMap)),
        };
        if (role === 'interpreter') {
            const price = Number(this.data.pricePerDay);
            if (!Number.isFinite(price) || price <= 0) {
                this.setData({ submitting: false, formError: '请填写有效的日报价（元/天）' });
                return;
            }
            // 外语学院学生必须填写技能标签（双向匹配的基础）
            if (Object.keys(this.data.skillMap).length === 0) {
                this.setData({ submitting: false, formError: '请至少选择 1 个技能标签（场景/行业）' });
                return;
            }
            Object.assign(payload, {
                school: (this.data.school || '').trim(),
                major: (this.data.major || '').trim(),
                englishLevel: (this.data.englishLevel || '').trim(),
                pricePerDay: price,
                campusName: this.data.campusName,
                campusLat: this.data.campusLat,
                campusLng: this.data.campusLng,
            });
        } else {
            Object.assign(payload, {
                company: (this.data.company || '').trim(),
                contact: (this.data.contact || '').trim(),
            });
        }
        // 通过数据访问层保存（本地/云端同一接口）
        const list = await profiles.list();
        if (list.error) {
            this.setData({ submitting: false, formError: '资料读取失败，请重试' });
            return;
        }
        const existing = (list.data || []).find((p) => p.ownerId === 'me' && p.role === role);
        const saved = existing
            ? await profiles.update(existing.id, payload)
            : await profiles.create(payload);
        if (saved.error) {
            this.setData({ submitting: false, formError: saved.error.message || '保存失败，请重试' });
            return;
        }
        session.updateSession({ name: name });
        this.setData({ submitting: false, isDemo: false });
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(function () { wx.navigateBack(); }, 600);
    },
});
