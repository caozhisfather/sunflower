const { reservesDate } = require('../../utils/booking-rules');
const session = require('../../utils/session');
const { orders, availability, profiles } = require('../../utils/data');
const { today, depositOf, friendlyDate } = require('../../utils/format');
const { SKILL_GROUPS, parseSkills, joinSkills } = require('../../utils/skills');
const { choosePlace, locationFromQuery } = require('../../utils/service-location');

Page({
    data: {
        interpreterName: '',
        price: 0,
        deposit: 0,
        date: '',
        dateLabel: '',
        startTime: '09:00',
        requirements: '',
        locationName: '',
        locationAddress: '',
        locationLat: 0,
        locationLng: 0,
        // 订单所需技能（用于译员端匹配展示）
        skillGroups: SKILL_GROUPS,
        requiredSkillsMap: {},
        submitting: false,
        formError: '',
        invalid: false,
    },

    onLoad(query) {
        const q = query || {};
        this.ownerId = q.ownerId || '';
        const price = Number(q.price || 0);
        const date = q.date || today();
        let skills = q.skills || '';
        try {
            skills = decodeURIComponent(skills);
        } catch (error) {
            skills = '';
        }
        const requestedSkills = parseSkills(skills);
        const requiredSkillsMap = {};
        SKILL_GROUPS.forEach(function (group) {
            group.tags.forEach(function (tag) {
                if (requestedSkills.includes(tag)) requiredSkillsMap[tag] = true;
            });
        });
        let interpreterName = '译员';
        try {
            interpreterName = decodeURIComponent(q.name || '译员');
        } catch (e) {
            // 昵称含未编码字符（如 %）时 decode 会抛异常，退回原值
            interpreterName = q.name || '译员';
        }
        // 直接进入页面或参数被篡改时禁止提交：必须有译员、有效报价、且日期未过期
        this.setData({
            interpreterName: interpreterName,
            price: price,
            deposit: depositOf(price),
            date: date,
            requiredSkillsMap: requiredSkillsMap,
            invalid: !(this.ownerId !== '' && Number.isFinite(price) && price > 0 && date >= today()),
        });
        this.setData({ dateLabel: friendlyDate(this.data.date).label });
        const place = locationFromQuery(q);
        if (place) this.setServicePlace(place);
    },

    onTimeChange(event) {
        this.setData({ startTime: event.detail.value });
    },

    chooseLocation() {
        choosePlace((place) => this.setServicePlace(place));
    },

    setServicePlace(place) {
        this.setData({
            locationName: place.name || '',
            locationAddress: place.address || '',
            locationLat: place.latitude,
            locationLng: place.longitude,
        });
    },

    clearLocation() {
        this.setData({ locationName: '', locationAddress: '', locationLat: 0, locationLng: 0 });
    },

    toggleRequiredSkill(event) {
        const tag = event.currentTarget.dataset.tag;
        const map = Object.assign({}, this.data.requiredSkillsMap);
        if (map[tag]) {
            delete map[tag];
        } else {
            map[tag] = true;
        }
        this.setData({ requiredSkillsMap: map });
    },

    onRequirementsInput(event) {
        this.setData({ requirements: event.detail.value });
    },

    async submit() {
        if (this.data.submitting) return;
        if (this.data.invalid) {
            wx.showToast({ title: '预约信息不完整，请返回重新选择', icon: 'none' });
            return;
        }
        const current = session.getSession();
        if (!current || current.role !== 'business') {
            wx.showToast({ title: '请以商家身份操作', icon: 'none' });
            return;
        }
        this.setData({ submitting: true, formError: '' });
        try {
            await this.createOrder(current);
        } catch (error) {
            console.error('预约提交失败', error);
            this.setData({ submitting: false, formError: '提交失败，请重试' });
        }
    },

    async createOrder(current) {
        // 提交前复查：该译员当天仍空闲、且没有其他生效预约（上云后由服务端最终裁决）
        const ownerId = this.ownerId;
        const date = this.data.date;
        const [freeDates, existingOrders, candidates] = await Promise.all([
            availability.list(), orders.list(), profiles.list(),
        ]);
        if (freeDates.error || existingOrders.error || candidates.error) {
            this.setData({ submitting: false, formError: '预检失败，请重试' });
            return;
        }
        const interpreter = (candidates.data || []).find(function (profile) {
            return profile.ownerId === ownerId && profile.role === 'interpreter';
        });
        const price = Number(interpreter && interpreter.pricePerDay);
        if (!Number.isFinite(price) || price <= 0) {
            this.setData({ submitting: false, formError: '该译员暂无有效报价，请返回重新选择' });
            return;
        }
        if (price !== this.data.price) {
            this.setData({
                submitting: false,
                interpreterName: interpreter.name,
                price: price,
                deposit: depositOf(price),
                formError: '报价已更新，请核对金额后再次提交',
            });
            return;
        }
        const stillFree = date >= today() && (freeDates.data || []).some(function (a) {
            return a.ownerId === ownerId && a.date === date;
        });
        const conflict = (existingOrders.data || []).some(function (o) {
            return o.interpreterId === ownerId &&
                o.serviceDate === date &&
                reservesDate(o, true);
        });
        if (!stillFree) {
            this.setData({ submitting: false, formError: '该译员当天已不可预约，请返回重新筛选' });
            return;
        }
        if (conflict) {
            this.setData({ submitting: false, formError: '该译员当天已有预约，请换个日期' });
            return;
        }
        const created = await orders.create({
            businessId: current.userId,
            businessName: current.name,
            interpreterId: this.ownerId,
            interpreterName: interpreter.name,
            serviceDate: this.data.date,
            startTime: this.data.startTime,
            requirements: (this.data.requirements || '').trim(),
            requiredSkills: joinSkills(Object.keys(this.data.requiredSkillsMap)),
            locationName: this.data.locationName,
            locationAddress: this.data.locationAddress,
            locationLat: this.data.locationLat,
            locationLng: this.data.locationLng,
            price: price,
            deposit: depositOf(price),
            status: 'pending',
        });
        if (created.error) {
            this.setData({ submitting: false, formError: created.error.message || '提交失败，请重试' });
            return;
        }
        wx.showToast({ title: '预约已提交', icon: 'success' });
        setTimeout(function () {
            wx.redirectTo({ url: '/pages/order-detail/order-detail?id=' + created.data.id });
        }, 500);
    },
});
