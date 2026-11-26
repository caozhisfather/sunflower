const { loadDb, saveDb, nextId } = require('./db');
const { orderToRow } = require('./data');
const { getSession } = require('./session');
const { isCloudEnabled } = require('./cloud');
const { today, depositOf } = require('./format');
const { reservesDate } = require('./booking-rules');
const { SKILL_GROUPS, parseSkills, joinSkills } = require('./skills');
const { distanceKm } = require('./service-location');

function account(role) {
    if (isCloudEnabled()) throw new Error('岗位大厅暂仅支持本地演示');
    const current = getSession();
    if (!current || (role && current.role !== role)) throw new Error('当前身份无法执行此操作');
    return current;
}

function find(rows, id) {
    return rows.find((row) => String(row.id) === String(id));
}

function commit(db) {
    if (!saveDb(db)) throw new Error('保存失败，请重试');
}

function publish(form) {
    const current = account('business');
    const title = String(form.title || '').trim();
    const requirements = String(form.requirements || '').trim();
    const locationName = String(form.locationName || '').trim();
    const serviceDate = form.serviceDate;
    const hours = Number(form.hours);
    const rate = Number(form.rate);
    const slots = Number(form.slots);
    const travelAllowance = Number(form.travelAllowance || 0);
    const time = form.startTime;
    const payUnit = ['hour', 'half', 'day'][form.payMode];
    const date = new Date(serviceDate + 'T00:00:00Z');
    if (!title || !requirements || !locationName) throw new Error('请填写岗位名称、工作内容和服务地点');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== serviceDate || serviceDate < today()) throw new Error('请选择有效的服务日期');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
        !Number.isFinite(hours) || hours <= 0 || hours > 24) throw new Error('请填写有效的开始时间和预计工时');
    const [hour, minute] = time.split(':').map(Number);
    if (hour + minute / 60 + hours > 24) throw new Error('每个岗位的服务时间须在同一天内');
    if (!payUnit || !Number.isFinite(rate) || rate < 1 || !Number.isInteger(slots) || slots < 1 || slots > 100) {
        throw new Error('薪资至少 1 元，招聘人数须为 1–100 的整数');
    }
    if (!Number.isFinite(travelAllowance) || travelAllowance < 0) throw new Error('请填写有效的交通补贴');
    const total = Math.round((rate * (payUnit === 'hour' ? hours : 1) + travelAllowance) * 100) / 100;
    if (!Number.isFinite(total) || total <= 0) throw new Error('请核对薪资和工时');
    const selected = parseSkills(form.requiredSkills);
    const skills = SKILL_GROUPS.flatMap((group) => group.tags).filter((tag) => selected.includes(tag));
    const place = form.place;
    const validPlace = place && distanceKm(place.latitude, place.longitude, place.latitude, place.longitude) !== null;
    const db = loadDb();
    const job = {
        id: nextId(db), businessId: current.userId, businessName: current.name,
        title, requirements, serviceDate, startTime: time, hours, slots, rate, payUnit, total, travelAllowance,
        locationName, locationAddress: validPlace ? place.address || '' : '',
        locationLat: validPlace ? place.latitude : null, locationLng: validPlace ? place.longitude : null,
        requiredSkills: joinSkills(skills), terms: String(form.terms || '').trim(), status: 'open',
    };
    db.jobs.push(job);
    commit(db);
    return job;
}

function remaining(job, applications) {
    return job.slots - applications.filter((app) => app.jobId === job.id && app.status === 'hired').length;
}

function notifyApplicant(db, app, title, body, orderId) {
    db.notifications.push({
        id: nextId(db), user_id: app.interpreterId, role: 'interpreter', type: 'order',
        ...(orderId ? { order_id: orderId } : {}),
        title, body, read: 0, created_at: new Date().toISOString(),
    });
}

function resolveWaiting(db, job, status, title) {
    db.applications.filter((app) => app.jobId === job.id && app.status === 'applied').forEach((app) => {
        app.status = status;
        notifyApplicant(db, app, title, job.title);
    });
}

function openJob(db, id) {
    const job = find(db.jobs, id);
    if (!job || job.status !== 'open' || job.serviceDate < today() || remaining(job, db.applications) <= 0) {
        throw new Error('岗位已结束或名额已满');
    }
    return job;
}

function apply(jobId) {
    const current = account('interpreter');
    const db = loadDb();
    const job = openJob(db, jobId);
    if (db.jobSafety.some((entry) => entry.userId === current.userId && entry.businessId === job.businessId && entry.kind === 'block')) {
        throw new Error('请先解除对此发布方的屏蔽');
    }
    const duplicate = db.applications.some((app) =>
        app.jobId === job.id && app.interpreterId === current.userId && app.status !== 'withdrawn'
    );
    if (duplicate) throw new Error('该岗位已申请');
    const application = {
        id: nextId(db), jobId: job.id, interpreterId: current.userId, interpreterName: current.name,
        status: 'applied',
    };
    db.applications.push(application);
    commit(db);
    return application;
}

function withdraw(applicationId) {
    const current = account('interpreter');
    const db = loadDb();
    const app = find(db.applications, applicationId);
    if (!app || app.interpreterId !== current.userId || app.status !== 'applied') throw new Error('该申请无法撤回');
    app.status = 'withdrawn';
    commit(db);
}

function hire(applicationId) {
    const current = account('business');
    const db = loadDb();
    const app = find(db.applications, applicationId);
    if (!app || app.status !== 'applied') throw new Error('该申请已处理');
    const job = openJob(db, app.jobId);
    if (job.businessId !== current.userId) throw new Error('无权处理该申请');
    if (db.jobSafety.some((entry) => entry.userId === app.interpreterId && entry.businessId === job.businessId && entry.kind === 'block')) {
        throw new Error('该申请当前不可录用');
    }
    const conflict = db.orders.some((order) => order.interpreter_id === app.interpreterId &&
        order.service_date === job.serviceDate && reservesDate(order, true));
    if (conflict) throw new Error('该学生当天已有预约');

    const orderId = nextId(db);
    const order = orderToRow({
        businessId: job.businessId, businessName: job.businessName,
        interpreterId: app.interpreterId, interpreterName: app.interpreterName,
        serviceDate: job.serviceDate, startTime: job.startTime, requirements: job.title + '\n' + job.requirements,
        requiredSkills: job.requiredSkills, locationName: job.locationName, locationAddress: job.locationAddress,
        locationLat: job.locationLat, locationLng: job.locationLng, price: job.total,
        deposit: Math.min(job.total, depositOf(job.total)), status: 'accepted',
    });
    const createdAt = new Date().toISOString();
    db.orders.push({
        ...order, id: orderId, created_at: createdAt, updated_at: createdAt,
        job_id: job.id, job_hours: job.hours, job_pay_unit: job.payUnit, job_rate: job.rate,
        job_terms: job.terms, job_travel_allowance: job.travelAllowance || 0, actual_hours: null,
    });
    app.status = 'hired';
    app.orderId = orderId;
    notifyApplicant(db, app, '兼职申请已录用', job.title + ' · 等待公司支付定金', orderId);
    if (remaining(job, db.applications) === 0) resolveWaiting(db, job, 'full', '岗位名额已满');
    commit(db);
    return orderId;
}

function reject(applicationId) {
    const current = account('business');
    const db = loadDb();
    const app = find(db.applications, applicationId);
    if (!app || app.status !== 'applied') throw new Error('该申请已处理');
    const job = openJob(db, app.jobId);
    if (job.businessId !== current.userId) throw new Error('无权处理该申请');
    app.status = 'rejected';
    notifyApplicant(db, app, '兼职申请未录用', job.title);
    commit(db);
}

function close(jobId) {
    const current = account('business');
    const db = loadDb();
    const job = find(db.jobs, jobId);
    if (!job || job.businessId !== current.userId || job.status !== 'open') throw new Error('该岗位无法关闭');
    job.status = 'closed';
    resolveWaiting(db, job, 'closed', '岗位已结束招聘');
    commit(db);
}

function list() {
    const current = account();
    const db = loadDb();
    const expired = db.jobs.filter((job) => job.status === 'open' && job.serviceDate < today());
    if (expired.length) {
        expired.forEach((job) => {
            job.status = 'closed';
            resolveWaiting(db, job, 'closed', '岗位已过期');
        });
        commit(db);
    }
    const student = current.role === 'interpreter';
    return db.jobs.filter((job) => student || job.businessId === current.userId).map((job) => {
        const slotsLeft = remaining(job, db.applications);
        const open = job.status === 'open' && job.serviceDate >= today() && slotsLeft > 0;
        const applications = db.applications.filter((app) => app.jobId === job.id &&
            (!student || app.interpreterId === current.userId)).map((app) => {
            if (student) return app;
            const profile = db.profiles.find((row) => row.owner_id === app.interpreterId && row.role === 'interpreter');
            const hasConflict = db.orders.some((order) => order.interpreter_id === app.interpreterId &&
                order.service_date === job.serviceDate && reservesDate(order, true));
            return { ...app, school: profile?.school || '', skills: profile?.skills || '',
                intro: profile?.intro || '', hasConflict };
        });
        const blocked = student && db.jobSafety.some((entry) =>
            entry.kind === 'block' && entry.userId === current.userId && entry.businessId === job.businessId);
        return { ...job, slotsLeft, open, applications, blocked };
    }).reverse();
}

function report(jobId, reason) {
    const current = account('interpreter');
    const db = loadDb();
    const job = find(db.jobs, jobId);
    const detail = String(reason || '').trim().slice(0, 300);
    if (!job || !detail) throw new Error('请填写问题说明');
    db.jobSafety.push({
        id: nextId(db), kind: 'report', userId: current.userId, jobId: job.id,
        detail, createdAt: new Date().toISOString(),
    });
    commit(db);
}

function reportOrder(orderId, reason) {
    const current = account();
    const db = loadDb();
    const order = find(db.orders, orderId);
    const ownerId = current.role === 'business' ? order?.business_id : order?.interpreter_id;
    const detail = String(reason || '').trim().slice(0, 300);
    if (!order?.job_id || ownerId !== current.userId || !detail) throw new Error('请填写问题说明');
    db.jobSafety.push({
        id: nextId(db), kind: 'dispute', userId: current.userId, role: current.role,
        jobId: order.job_id, orderId: order.id, detail, createdAt: new Date().toISOString(),
    });
    commit(db);
}

function setBlocked(jobId, blocked) {
    const current = account('interpreter');
    const db = loadDb();
    const job = find(db.jobs, jobId);
    if (!job) throw new Error('岗位不存在');
    db.jobSafety = db.jobSafety.filter((row) =>
        row.kind !== 'block' || row.userId !== current.userId || row.businessId !== job.businessId);
    if (blocked) db.jobSafety.push({
        id: nextId(db), kind: 'block', userId: current.userId, businessId: job.businessId,
    });
    commit(db);
}

module.exports = { publish, apply, withdraw, hire, reject, close, list, report, reportOrder, setBlocked };
