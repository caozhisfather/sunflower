const assert = require('node:assert/strict');

const storage = new Map();
let definition;
let lastUrl;
let lastToast;
global.wx = {
    getStorageSync: (key) => structuredClone(storage.get(key)),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    navigateTo: ({ url }) => { lastUrl = url; },
    redirectTo: ({ url }) => { lastUrl = url; },
    showToast: ({ title }) => { lastToast = title; },
    showModal: ({ success }) => success({ confirm: true }),
};
global.Page = (config) => { definition = config; };

const { profiles, availability, orders, reviews, notifications, settlements } = require('../sunflower/utils/data');
const { sweepPendingRefunds, sweepPendingSettlements, sweepExpiredOrders } = require('../sunflower/utils/sweep');
const { today, dateAfter } = require('../sunflower/utils/format');
const session = require('../sunflower/utils/session');
const sessionKey = 'sunflower_session_v1';

function useTestIdentity(name, role) {
    // 给每个场景装载独立的角色会话，仅修改测试脚本自己的内存。
    storage.set(sessionKey, { name, role, active: true });
}

function openPage(name) {
    const modulePath = require.resolve('../sunflower/pages/' + name + '/' + name);
    delete require.cache[modulePath];
    require(modulePath);
    return {
        ...definition,
        data: structuredClone(definition.data),
        setData(patch) { Object.assign(this.data, patch); },
    };
}

function navigationQuery() {
    return Object.fromEntries(new URL(lastUrl, 'https://example.invalid').searchParams);
}

function flushPageUpdates() {
    return new Promise((resolve) => setImmediate(resolve));
}

async function testBooking() {
    const date = dateAfter(1);
    useTestIdentity('测试商家', 'business');
    await profiles.create({
        ownerId: 'test_interpreter', role: 'interpreter', name: '测试译员',
        pricePerDay: 300, skills: '展会陪同',
        campusName: '测试校区', campusLat: 22.54, campusLng: 113.95,
    });
    await availability.create({ ownerId: 'test_interpreter', date });
    await profiles.create({
        ownerId: 'over_budget', role: 'interpreter', name: '超预算译员', pricePerDay: 500,
    });
    await availability.create({ ownerId: 'over_budget', date });

    const index = openPage('index');
    const place = { name: '会展中心', address: '测试地址 100%', latitude: 22.55, longitude: 113.95 };
    index.setData({
        pickDate: date, skillFilterMap: { 展会陪同: true }, budget: '400', servicePlace: place, candidateSort: 2,
    });
    index.onShow();
    await flushPageUpdates();
    assert.equal(index.data.pickDate, date);
    assert.equal(index.data.interpreters.length, 1);
    assert.equal(index.data.interpreters[0].match, 100);
    assert.equal(index.data.interpreters[0].distanceLabel, '1.1 km');
    index.goInterpreterDetail({ currentTarget: { dataset: { owner: 'test_interpreter' } } });

    const detail = openPage('interpreter-detail');
    detail.onLoad(navigationQuery());
    await flushPageUpdates();
    detail.goOrderCreate();

    const booking = openPage('order-create');
    booking.onLoad({ ...navigationQuery(), price: '200' });
    assert.equal(booking.data.requiredSkillsMap.展会陪同, true);
    assert.equal(booking.data.locationAddress, place.address);
    await booking.submit();
    assert.equal((await orders.list()).data.length, 0);
    assert.equal(booking.data.price, 300);
    assert.equal(booking.data.submitting, false);
    await booking.submit();

    const [order] = (await orders.list()).data;
    assert.equal(order.requiredSkills, '展会陪同');
    assert.equal(order.price, 300);
    assert.equal(order.deposit, 90);
    assert.equal(order.status, 'pending');
    assert.equal(order.locationLat, place.latitude);
    assert.equal(order.locationName, place.name);
    console.log('通过：技能筛选、日期保留、预约参数传递、报价重新确认和下单');
    return order;
}

async function testAccept(order) {
    // 本机账号固定为 me，使用独立的入站订单测试译员入口。
    const fixture = { ...order, interpreterId: 'me', businessId: 'test_business' };
    delete fixture.id;
    const incoming = (await orders.create(fixture)).data;
    useTestIdentity('测试译员', 'interpreter');
    await profiles.create({
        ownerId: 'me', role: 'interpreter', name: '测试译员', skills: '展会陪同', pricePerDay: 350,
        campusName: '测试校区', campusLat: 22.54, campusLng: 113.95,
    });
    const index = openPage('index');
    index.onShow();
    await flushPageUpdates();
    assert.equal(index.data.pendingTasks[0].belowRate, true);
    assert.equal(index.data.pendingTasks[0].distanceLabel, '1.1 km');
    const task = openPage('task-detail');
    task.onLoad({ id: incoming.id });
    await task.loadOrder();
    assert.equal(task.data.match, 100);
    await task.saveDecision(true, '');
    await assert.rejects(task.saveDecision(false, ''), /已变更/);
    const updated = (await orders.list()).data.find((item) => item.id === incoming.id);
    assert.equal(updated.status, 'accepted');
    console.log('通过：译员技能匹配、接单及旧状态写入拦截');
}

async function testCalendar() {
    await availability.create({ ownerId: 'me', date: dateAfter(-1) });
    await availability.create({ ownerId: 'me', date: today() });
    await availability.create({ ownerId: 'me', date: dateAfter(1) });
    const calendar = openPage('availability');
    calendar.onLoad();
    calendar.loadAvailability();
    await flushPageUpdates();
    assert.equal(calendar.data.selectedCount, 2);

    const remove = availability.remove;
    const failingId = calendar.availMap[dateAfter(1)];
    try {
        availability.remove = (id) => id === failingId
            ? Promise.reject(new Error('模拟删除失败'))
            : remove(id);
        calendar.clearAll();
        await flushPageUpdates();
        assert.equal(calendar.data.selectedCount, 1);
        assert.equal(calendar.data.busy, false);
        assert.equal(calendar.availMap[dateAfter(1)], failingId);
        assert.match(lastToast, /清除失败/);
    } finally {
        availability.remove = remove;
    }
    console.log('通过：日历排除过去日期、部分失败后保留对应日期');
}

async function testOrderDetail(order) {
    useTestIdentity('测试商家', 'business');
    const detail = openPage('order-detail');
    detail.onLoad({ id: order.id });
    detail.onShow();
    await flushPageUpdates();
    const newDate = dateAfter(4);
    await availability.create({ ownerId: order.interpreterId, date: newDate });
    detail.setData({ newDate, reviewRating: 5 });

    await detail.submitReview();
    assert.equal((await reviews.list()).data.length, 0);
    await orders.update(order.id, { status: 'accepted' });
    await detail.submitReschedule();
    assert.match(detail.data.rescheduleError, /已变更/);
    detail.loadOrder();
    await flushPageUpdates();
    await detail.submitReschedule();
    await flushPageUpdates();
    assert.equal(detail.data.order.status, 'pending');
    assert.equal(detail.data.order.serviceDate, newDate);
    assert.equal(detail.data.order.rescheduledFrom, order.serviceDate);
    assert.ok((await notifications.list()).data.some((notice) =>
        String(notice.orderId) === String(order.id) && notice.title === '商家申请改期'
    ));

    await orders.update(order.id, { status: 'accepted' });
    detail.loadOrder();
    await flushPageUpdates();
    const confirmImmediately = wx.showModal;
    let confirmPayment;
    wx.showModal = ({ success }) => { confirmPayment = success; };
    try {
        detail.payDeposit();
        await orders.update(order.id, { status: 'pending' });
        confirmPayment({ confirm: true });
        await flushPageUpdates();
        assert.match(lastToast, /已变更/);
        assert.equal((await orders.list()).data.find((item) => item.id === order.id).status, 'pending');
    } finally {
        wx.showModal = confirmImmediately;
    }
    await orders.update(order.id, { status: 'accepted' });
    detail.loadOrder();
    await flushPageUpdates();
    detail.payDeposit();
    await flushPageUpdates();
    assert.equal(detail.data.order.status, 'deposit_paid');

    await orders.update(order.id, { status: 'completed' });
    detail.loadOrder();
    await flushPageUpdates();
    detail.payFinal();
    await flushPageUpdates();
    assert.equal(detail.data.order.status, 'finished');

    detail.setData({ reviewRating: 5 });
    await detail.submitReview();
    detail.setData({ reviewRating: 4 });
    await detail.submitReview();
    const receivedReviews = (await reviews.list()).data;
    assert.equal(receivedReviews.length, 1);
    assert.equal(receivedReviews[0].rating, 5);
    console.log('通过：改期与通知、模拟定金和尾款、评价资格和重复评价拦截');
}

async function testRefundAndSettlement(order) {
    const { id, ...fixture } = order;
    const refundable = (await orders.create({
        ...fixture, status: 'deposit_paid', depositPaidAt: new Date().toISOString(),
    })).data;
    useTestIdentity('测试商家', 'business');
    const detail = openPage('order-detail');
    detail.onLoad({ id: refundable.id });
    detail.onShow();
    await flushPageUpdates();
    detail.cancelOrder();
    await flushPageUpdates();
    assert.equal(detail.data.order.status, 'cancelled');
    assert.equal(detail.data.order.refundStatus, 'pending');
    detail.onUnload();

    const service = (await orders.create({ ...fixture, interpreterId: 'me', status: 'deposit_paid' })).data;
    useTestIdentity('测试译员', 'interpreter');
    const serviceDetail = openPage('order-detail');
    serviceDetail.onLoad({ id: service.id });
    serviceDetail.onShow();
    await flushPageUpdates();
    serviceDetail.confirmDone();
    await flushPageUpdates();
    assert.equal(serviceDetail.data.order.status, 'completed');
    await orders.update(service.id, { status: 'finished' });

    const income = openPage('income');
    income.onShow();
    await flushPageUpdates();
    assert.equal(income.data.balance, 300);
    await income.requestSettlement();
    await income.requestSettlement();
    await flushPageUpdates();
    assert.equal(income.data.balance, 0);
    assert.equal((await settlements.list()).data.length, 1);
    income.onUnload();

    const now = Date.now;
    try {
        Date.now = () => now() + 10000;
        await sweepPendingRefunds();
        await Promise.all([sweepPendingSettlements(), sweepPendingSettlements()]);
    } finally {
        Date.now = now;
    }
    const refunded = (await orders.list()).data.find((item) => item.id === refundable.id);
    assert.equal(refunded.refundStatus, 'done');
    assert.equal(refunded.refundAmount, 90);
    assert.equal((await settlements.list()).data[0].status, 'done');

    const inbox = openPage('notifications');
    inbox.onShow();
    await flushPageUpdates();
    const paidNotices = inbox.data.list.filter((item) => item.title === '结算到账');
    assert.equal(paidNotices.length, 1);
    await inbox.openItem({ currentTarget: { dataset: { id: paidNotices[0].id } } });
    await flushPageUpdates();
    assert.equal(inbox.data.list.find((item) => item.id === paidNotices[0].id).read, 1);
    await inbox.markAll();
    await flushPageUpdates();
    assert.ok(inbox.data.list.every((item) => item.read));

    const expired = (await orders.create({ ...fixture, serviceDate: dateAfter(-1) })).data;
    sweepExpiredOrders();
    await flushPageUpdates();
    assert.equal((await orders.list()).data.find((item) => item.id === expired.id).status, 'cancelled');
    console.log('通过：取消、模拟退款、确认完工、结算防重、通知已读和过期处理');
}

async function main() {
    testFixedIdentity();
    const order = await testBooking();
    await testAccept(order);
    await testCalendar();
    await testOrderDetail(order);
    await testRefundAndSettlement(order);
    await testPublicJobs();
    testCloudSessionIsolation();
}

function testFixedIdentity() {
    assert.equal(session.getRegisteredRole(), '');
    assert.equal(session.signIn('固定学生', 'interpreter').data.role, 'interpreter');
    assert.equal(session.signIn('固定企业', 'business').error.code, 'ROLE_LOCKED');
    assert.equal(session.updateSession({ role: 'business' }).error.code, 'ROLE_LOCKED');
    session.signOut();
    assert.equal(session.getSession(), null);
    assert.equal(session.getRegisteredRole(), 'interpreter');
    assert.equal(session.getLastName(), '固定学生');
    const login = openPage('index');
    login.onShow();
    login.pickRole({ currentTarget: { dataset: { role: 'business' } } });
    assert.equal(login.data.role, 'interpreter');
    assert.equal(session.signIn('固定企业', 'business').error.code, 'ROLE_LOCKED');
    assert.equal(session.signIn('固定学生', 'interpreter').data.role, 'interpreter');

    storage.set(sessionKey, { name: '旧版企业', role: 'business' });
    assert.equal(session.getSession().role, 'business');
    session.signOut();
    assert.equal(session.getRegisteredRole(), 'business');
    assert.equal(session.signIn('测试学生', 'interpreter').error.code, 'ROLE_LOCKED');
    console.log('通过：首次固定身份、退出重登限制及旧版账号兼容');
}

function testCloudSessionIsolation() {
    const { config } = require('../sunflower/utils/cloud');
    const enabled = config.enabled;
    try {
        config.enabled = true;
        assert.equal(session.getSession(), null);
        assert.equal(session.getLastName(), '');
        assert.equal(session.signIn('测试角色', 'business').error.code, 'CLOUD_SIGN_IN_REQUIRED');
        assert.throws(() => require('../sunflower/utils/jobs').list(), /仅支持本地演示/);
    } finally {
        config.enabled = enabled;
    }
    assert.ok(session.getSession());
    console.log('通过：开启云模式时隔离本地演示账号和岗位数据');
}

async function testPublicJobs() {
    const jobs = require('../sunflower/utils/jobs');
    const date = dateAfter(15);
    const form = {
        title: '会展陪同', requirements: '协助现场英语沟通', serviceDate: date, startTime: '10:00',
        hours: '3.5', rate: '80', slots: '1', payMode: '0', terms: '交通补贴另计',
        locationName: '会展中心', requiredSkills: '展会陪同',
        place: { latitude: 22.55, longitude: 113.95, address: '测试地址' },
    };
    useTestIdentity('测试公司', 'business');
    assert.throws(() => jobs.publish({ ...form, hours: '23' }), /同一天/);
    const job = jobs.publish(form);
    assert.equal(job.total, 280);
    const conflictJob = jobs.publish({ ...form, title: '同日另一岗位' });
    const rejectedJob = jobs.publish({ ...form, title: '测试未录用', travelAllowance: '20' });
    assert.equal(rejectedJob.total, 300);

    useTestIdentity('测试学生', 'interpreter');
    const hub = openPage('jobs');
    hub.onLoad();
    await hub.onShow();
    hub.setData({ keyword: '会展陪同', maxKm: '2', minPay: '250' });
    hub.refresh();
    assert.equal(hub.data.results.length, 1);
    assert.equal(hub.data.results[0].distanceLabel, '距校区直线 1.1 km');
    assert.equal(hub.data.results[0].match, 100);
    const withdrawn = jobs.apply(job.id);
    assert.throws(() => jobs.apply(job.id), /已申请/);
    assert.throws(() => jobs.hire(withdrawn.id), /身份/);
    jobs.withdraw(withdrawn.id);
    const application = jobs.apply(job.id);
    const conflictApplication = jobs.apply(conflictJob.id);
    const rejectedApplication = jobs.apply(rejectedJob.id);
    jobs.report(rejectedJob.id, '测试问题');
    jobs.setBlocked(rejectedJob.id, true);
    assert.equal(jobs.list().find((item) => item.id === job.id).blocked, true);
    useTestIdentity('测试公司', 'business');
    assert.throws(() => jobs.hire(application.id), /不可录用/);
    useTestIdentity('测试学生', 'interpreter');
    jobs.setBlocked(rejectedJob.id, false);

    useTestIdentity('测试公司', 'business');
    jobs.reject(rejectedApplication.id);
    const write = wx.setStorageSync;
    try {
        wx.setStorageSync = () => { throw new Error('模拟写入失败'); };
        assert.throws(() => jobs.hire(application.id), /保存失败/);
    } finally {
        wx.setStorageSync = write;
    }
    assert.equal(jobs.list().find((item) => item.id === job.id).slotsLeft, 1);
    assert.equal((await orders.list()).data.some((item) => item.jobId === job.id), false);
    const orderId = jobs.hire(application.id);
    assert.throws(() => jobs.hire(application.id), /已处理/);
    assert.throws(() => jobs.hire(conflictApplication.id), /当天已有预约/);
    jobs.close(conflictJob.id);
    const hired = (await orders.list()).data.find((item) => item.id === orderId);
    assert.equal(hired.status, 'accepted');
    assert.equal(hired.price, 280);
    assert.equal(hired.jobHours, 3.5);
    assert.equal(hired.jobPayUnit, 'hour');
    assert.equal(hired.jobTerms, form.terms);
    assert.equal(hired.locationAddress, form.place.address);
    assert.equal((await notifications.list()).data.filter((item) => item.orderId === orderId).length, 1);
    const messages = (await notifications.list()).data;
    assert.ok(messages.some((item) => item.title === '兼职申请未录用'));
    assert.ok(messages.some((item) => item.title === '岗位已结束招聘'));

    useTestIdentity('测试学生', 'interpreter');
    assert.throws(() => jobs.apply(job.id), /名额已满/);
    assert.throws(() => jobs.apply(conflictJob.id), /已结束/);
    assert.equal(jobs.list().find((item) => item.id === job.id).applications.at(-1).orderId, orderId);
    await orders.update(orderId, { status: 'deposit_paid' });
    const detail = openPage('order-detail');
    detail.onLoad({ id: orderId });
    detail.onShow();
    await flushPageUpdates();
    detail.setData({ actualHoursInput: '4' });
    await detail.submitActualHours();
    assert.equal(detail.data.order.actualHours, null);
    await orders.update(orderId, { serviceDate: today() });
    detail.loadOrder();
    await flushPageUpdates();
    await detail.submitActualHours();
    assert.equal(detail.data.order.actualHours, 4);
    assert.equal(detail.data.order.status, 'deposit_paid');
    await detail.confirmJobHours();
    assert.equal(detail.data.order.status, 'deposit_paid');
    useTestIdentity('测试公司', 'business');
    await detail.confirmJobHours();
    assert.equal(detail.data.order.status, 'completed');
    assert.ok(detail.data.order.hoursConfirmedAt);
    assert.equal(detail.data.order.price, 280);
    jobs.reportOrder(orderId, '测试履约争议');
    console.log('通过：岗位筛选、申请结果通知、屏蔽、录用防重、档期冲突、订单快照和双方工时确认');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
