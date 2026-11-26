// 业务数据访问：profiles / availability / orders
// 默认走本地 storage；cloud-config.enabled 开启后自动切换云端表访问，页面接口不变。
const { createLocalAccess } = require('./db');
const { createTableAccess } = require('./workbuddy-data-access');
const { getCloud, isCloudEnabled } = require('./cloud');

// 云端查询需要显式列清单（与建表字段保持一致）
const TABLE_COLUMNS = {
    profiles: ['id', 'owner_id', 'role', 'name', 'phone', 'school', 'major', 'english_level', 'price_per_day', 'campus_name', 'campus_lat', 'campus_lng', 'intro', 'company', 'contact', 'skills', 'is_demo', 'created_at', 'updated_at'],
    availability: ['id', 'owner_id', 'avail_date', 'created_at', 'updated_at'],
    orders: ['id', 'business_id', 'business_name', 'interpreter_id', 'interpreter_name', 'service_date', 'start_time', 'requirements', 'required_skills', 'location_name', 'location_address', 'location_lat', 'location_lng', 'price', 'deposit', 'status', 'deposit_paid_at', 'final_paid_at', 'cancel_reason', 'cancelled_by_role', 'refund_status', 'refund_amount', 'refunded_at', 'rescheduled_from', 'rescheduled_at', 'created_at', 'updated_at'],
    reviews: ['id', 'order_id', 'reviewer_id', 'reviewer_role', 'reviewer_name', 'target_id', 'target_role', 'rating', 'comment', 'created_at'],
    notifications: ['id', 'user_id', 'role', 'type', 'order_id', 'title', 'body', 'read', 'created_at'],
    settlements: ['id', 'user_id', 'amount', 'status', 'created_at', 'paid_at'],
    favorites: ['id', 'user_id', 'target_id', 'created_at'],
};

// 云模式初始化失败时返回明确错误，避免误写本机数据。
// 注意：rawList / saveAll 是本地版专属方法，页面代码已全部改走 list/create/update/remove，
// 不再使用这两个方法（保留仅供调试）。
const cloud = getCloud();
function createAccess(table, options) {
    if (cloud) {
        return createTableAccess(cloud, Object.assign({ table: table, columns: TABLE_COLUMNS[table] }, options));
    }
    if (isCloudEnabled()) {
        const unavailable = async () => ({
            data: null,
            error: { code: 'CLOUD_UNAVAILABLE', message: '云环境不可用，请检查配置后重试' },
        });
        return { list: unavailable, create: unavailable, update: unavailable, remove: unavailable };
    }
    return createLocalAccess(table, options);
}

function profileFromRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        ownerId: row.owner_id,
        role: row.role,
        name: row.name,
        phone: row.phone || '',
        school: row.school || '',
        major: row.major || '',
        englishLevel: row.english_level || '',
        pricePerDay: row.price_per_day || 0,
        campusName: row.campus_name || '',
        campusLat: row.campus_lat,
        campusLng: row.campus_lng,
        intro: row.intro || '',
        company: row.company || '',
        contact: row.contact || '',
        skills: row.skills || '',
        isDemo: !!row.is_demo,
    };
}

function profileToRow(payload) {
    const row = {};
    // ownerId 本地版显式写入；上云后由服务端 DEFAULT auth.uid() 决定，页面改传真实 uid
    if (payload.ownerId !== undefined && payload.ownerId !== '') row.owner_id = payload.ownerId;
    if (payload.role !== undefined) row.role = payload.role;
    if (payload.name !== undefined && payload.name !== '') row.name = payload.name;
    if (payload.phone !== undefined) row.phone = payload.phone;
    if (payload.school !== undefined) row.school = payload.school;
    if (payload.major !== undefined) row.major = payload.major;
    if (payload.englishLevel !== undefined) row.english_level = payload.englishLevel;
    if (payload.pricePerDay !== undefined) row.price_per_day = payload.pricePerDay;
    if (payload.campusName !== undefined) row.campus_name = payload.campusName;
    if (payload.campusLat !== undefined) row.campus_lat = payload.campusLat;
    if (payload.campusLng !== undefined) row.campus_lng = payload.campusLng;
    if (payload.intro !== undefined) row.intro = payload.intro;
    if (payload.company !== undefined) row.company = payload.company;
    if (payload.contact !== undefined) row.contact = payload.contact;
    if (payload.skills !== undefined) row.skills = payload.skills;
    return row;
}

const profiles = createAccess('profiles', {
    fromRow: profileFromRow,
    toRow: profileToRow,
    orderBy: { column: 'created_at', ascending: true },
});

function availFromRow(row) {
    if (!row) return null;
    return { id: row.id, ownerId: row.owner_id, date: row.avail_date };
}

function availToRow(payload) {
    const row = {};
    if (payload.ownerId !== undefined && payload.ownerId !== '') row.owner_id = payload.ownerId;
    if (payload.date !== undefined && payload.date !== '') row.avail_date = payload.date;
    return row;
}

const availability = createAccess('availability', {
    fromRow: availFromRow,
    toRow: availToRow,
    orderBy: { column: 'avail_date', ascending: true },
});

function orderFromRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        businessId: row.business_id,
        businessName: row.business_name || '商家',
        interpreterId: row.interpreter_id,
        interpreterName: row.interpreter_name || '',
        serviceDate: row.service_date,
        startTime: row.start_time || '',
        requirements: row.requirements || '',
        requiredSkills: row.required_skills || '',
        locationName: row.location_name || '',
        locationAddress: row.location_address || '',
        locationLat: row.location_lat,
        locationLng: row.location_lng,
        price: row.price,
        deposit: row.deposit,
        jobId: row.job_id,
        jobHours: row.job_hours,
        jobPayUnit: row.job_pay_unit,
        jobRate: row.job_rate,
        jobTerms: row.job_terms,
        jobTravelAllowance: row.job_travel_allowance || 0,
        actualHours: row.actual_hours ?? null,
        hoursConfirmedAt: row.hours_confirmed_at || '',
        status: row.status,
        depositPaidAt: row.deposit_paid_at || '',
        finalPaidAt: row.final_paid_at || '',
        cancelReason: row.cancel_reason || '',
        cancelledByRole: row.cancelled_by_role || '',
        refundStatus: row.refund_status || 'none',
        refundAmount: row.refund_amount,
        refundedAt: row.refunded_at || '',
        rescheduledFrom: row.rescheduled_from || '',
        rescheduledAt: row.rescheduled_at || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at || row.created_at,
    };
}

function orderToRow(payload) {
    const row = {};
    if (payload.businessId !== undefined && payload.businessId !== '') row.business_id = payload.businessId;
    if (payload.businessName !== undefined && payload.businessName !== '') row.business_name = payload.businessName;
    if (payload.interpreterId !== undefined && payload.interpreterId !== '') row.interpreter_id = payload.interpreterId;
    if (payload.interpreterName !== undefined) row.interpreter_name = payload.interpreterName;
    if (payload.serviceDate !== undefined && payload.serviceDate !== '') row.service_date = payload.serviceDate;
    if (payload.startTime !== undefined) row.start_time = payload.startTime;
    if (payload.requirements !== undefined) row.requirements = payload.requirements;
    if (payload.requiredSkills !== undefined) row.required_skills = payload.requiredSkills;
    if (payload.locationName !== undefined) row.location_name = payload.locationName;
    if (payload.locationAddress !== undefined) row.location_address = payload.locationAddress;
    if (payload.locationLat !== undefined) row.location_lat = payload.locationLat;
    if (payload.locationLng !== undefined) row.location_lng = payload.locationLng;
    if (payload.price !== undefined && payload.price !== '') row.price = payload.price;
    if (payload.deposit !== undefined && payload.deposit !== '') row.deposit = payload.deposit;
    if (payload.status !== undefined && payload.status !== '') row.status = payload.status;
    if (payload.actualHours !== undefined) row.actual_hours = payload.actualHours;
    if (payload.hoursConfirmedAt !== undefined) row.hours_confirmed_at = payload.hoursConfirmedAt;
    if (payload.depositPaidAt !== undefined) row.deposit_paid_at = payload.depositPaidAt;
    if (payload.finalPaidAt !== undefined) row.final_paid_at = payload.finalPaidAt;
    if (payload.cancelReason !== undefined) row.cancel_reason = payload.cancelReason;
    if (payload.cancelledByRole !== undefined) row.cancelled_by_role = payload.cancelledByRole;
    if (payload.refundStatus !== undefined && payload.refundStatus !== '') row.refund_status = payload.refundStatus;
    if (payload.refundAmount !== undefined && payload.refundAmount !== '') row.refund_amount = payload.refundAmount;
    if (payload.refundedAt !== undefined) row.refunded_at = payload.refundedAt;
    if (payload.rescheduledFrom !== undefined) row.rescheduled_from = payload.rescheduledFrom;
    if (payload.rescheduledAt !== undefined) row.rescheduled_at = payload.rescheduledAt;
    return row;
}

const orders = createAccess('orders', {
    fromRow: orderFromRow,
    toRow: orderToRow,
    orderBy: { column: 'updated_at', ascending: false },
});

function reviewFromRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        orderId: row.order_id,
        reviewerId: row.reviewer_id,
        reviewerRole: row.reviewer_role,
        reviewerName: row.reviewer_name || '',
        targetId: row.target_id,
        targetRole: row.target_role,
        rating: row.rating,
        comment: row.comment || '',
        createdAt: row.created_at,
    };
}

function reviewToRow(payload) {
    const row = {};
    if (payload.orderId !== undefined && payload.orderId !== '') row.order_id = payload.orderId;
    if (payload.reviewerId !== undefined && payload.reviewerId !== '') row.reviewer_id = payload.reviewerId;
    if (payload.reviewerRole !== undefined && payload.reviewerRole !== '') row.reviewer_role = payload.reviewerRole;
    if (payload.reviewerName !== undefined) row.reviewer_name = payload.reviewerName;
    if (payload.targetId !== undefined && payload.targetId !== '') row.target_id = payload.targetId;
    if (payload.targetRole !== undefined && payload.targetRole !== '') row.target_role = payload.targetRole;
    if (payload.rating !== undefined && payload.rating !== '') row.rating = payload.rating;
    if (payload.comment !== undefined) row.comment = payload.comment;
    return row;
}

const reviews = createAccess('reviews', {
    fromRow: reviewFromRow,
    toRow: reviewToRow,
    orderBy: { column: 'created_at', ascending: false },
});

function notificationFromRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        userId: row.user_id,
        role: row.role,
        type: row.type || '',
        orderId: row.order_id,
        title: row.title || '',
        body: row.body || '',
        read: row.read === 1 || row.read === true ? 1 : 0,
        createdAt: row.created_at,
    };
}

function notificationToRow(payload) {
    const row = {};
    if (payload.userId !== undefined && payload.userId !== '') row.user_id = payload.userId;
    if (payload.role !== undefined && payload.role !== '') row.role = payload.role;
    if (payload.type !== undefined && payload.type !== '') row.type = payload.type;
    if (payload.orderId !== undefined && payload.orderId !== '') row.order_id = payload.orderId;
    if (payload.title !== undefined && payload.title !== '') row.title = payload.title;
    if (payload.body !== undefined && payload.body !== '') row.body = payload.body;
    if (payload.read !== undefined) row.read = payload.read ? 1 : 0;
    return row;
}

const notifications = createAccess('notifications', {
    fromRow: notificationFromRow,
    toRow: notificationToRow,
    orderBy: { column: 'created_at', ascending: false },
});

// 结算单：译员申请提现（本地模拟到账，正式版接微信企业付款）
function settlementFromRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        userId: row.user_id,
        amount: row.amount,
        status: row.status || 'pending',
        createdAt: row.created_at,
        paidAt: row.paid_at || '',
    };
}

function settlementToRow(payload) {
    const row = {};
    if (payload.userId !== undefined && payload.userId !== '') row.user_id = payload.userId;
    if (payload.amount !== undefined && payload.amount !== '') row.amount = payload.amount;
    if (payload.status !== undefined && payload.status !== '') row.status = payload.status;
    if (payload.paidAt !== undefined) row.paid_at = payload.paidAt;
    return row;
}

const settlements = createAccess('settlements', {
    fromRow: settlementFromRow,
    toRow: settlementToRow,
    orderBy: { column: 'created_at', ascending: false },
});

// 收藏译员（商家端）
function favoriteFromRow(row) {
    if (!row) return null;
    return { id: row.id, userId: row.user_id, targetId: row.target_id, createdAt: row.created_at };
}

function favoriteToRow(payload) {
    const row = {};
    if (payload.userId !== undefined && payload.userId !== '') row.user_id = payload.userId;
    if (payload.targetId !== undefined && payload.targetId !== '') row.target_id = payload.targetId;
    return row;
}

const favorites = createAccess('favorites', {
    fromRow: favoriteFromRow,
    toRow: favoriteToRow,
    orderBy: { column: 'created_at', ascending: false },
});

module.exports = {
    profiles: profiles,
    availability: availability,
    orders: orders,
    orderToRow: orderToRow,
    reviews: reviews,
    notifications: notifications,
    settlements: settlements,
    favorites: favorites,
};
