// 本地数据访问层：与云端 createTableAccess 相同的 { data, error } 接口，
// 之后接入云服务时把这里换成 createTableAccess(cloud, ...) 即可，页面不用改。
const DB_KEY = 'sunflower_db_v1';
const TABLES = ['profiles', 'availability', 'orders', 'reviews', 'notifications', 'settlements', 'favorites', 'jobs', 'applications', 'jobSafety'];

function loadDb() {
    const raw = wx.getStorageSync(DB_KEY);
    if (raw && typeof raw === 'object') {
        // 老版本存储缺新表时补空表，而不是清空重建（升级不丢数据）
        let changed = false;
        TABLES.forEach(function (t) {
            if (!Array.isArray(raw[t])) {
                raw[t] = [];
                changed = true;
            }
        });
        if (typeof raw.seq !== 'number') {
            raw.seq = 1000;
            changed = true;
        }
        // 老数据回填 id（早期种子行无 id 字段，update/remove 依赖 id）
        TABLES.forEach(function (t) {
            raw[t].forEach(function (row) {
                if (row && typeof row === 'object' && (row.id === undefined || row.id === null || row.id === '')) {
                    raw.seq += 1;
                    row.id = raw.seq;
                    changed = true;
                }
            });
        });
        if (changed) {
            saveDb(raw);
        }
        return raw;
    }
    const fresh = { seq: 1000 };
    TABLES.forEach((table) => { fresh[table] = []; });
    saveDb(fresh);
    return fresh;
}

function saveDb(db) {
    try {
        wx.setStorageSync(DB_KEY, db);
        return true;
    } catch (e) {
        return false;
    }
}

function nextId(db) {
    db.seq += 1;
    return db.seq;
}

function identity(value) {
    return value;
}

function invalidId(id) {
    return id === undefined || id === null || id === '';
}

// orderBy: { column, ascending }
function createLocalAccess(table, options) {
    const config = options || {};
    const fromRow = config.fromRow || identity;
    const toRow = config.toRow || identity;
    const orderBy = config.orderBy;

    function sortRows(rows) {
        if (!orderBy || !orderBy.column) {
            return rows;
        }
        const column = orderBy.column;
        const ascending = orderBy.ascending !== false;
        return rows.slice().sort(function (a, b) {
            const av = a[column];
            const bv = b[column];
            if (av === bv) return 0;
            const less = av === undefined || av === null || av < bv;
            return (less ? -1 : 1) * (ascending ? 1 : -1);
        });
    }

    return {
        list() {
            const db = loadDb();
            return Promise.resolve({
                data: sortRows(db[table]).map(fromRow),
                error: null,
            });
        },

        create(payload) {
            const db = loadDb();
            const row = toRow(payload);
            if (!row || typeof row !== 'object' || Object.keys(row).length === 0) {
                return Promise.resolve({ data: null, error: { code: 'INVALID_PAYLOAD', message: '没有可提交的字段' } });
            }
            const stored = Object.assign({ id: nextId(db), created_at: new Date().toISOString() }, row);
            db[table].push(stored);
            if (!saveDb(db)) {
                return Promise.resolve({ data: null, error: { code: 'CLIENT_EXCEPTION', message: '本地存储写入失败' } });
            }
            return Promise.resolve({ data: fromRow(stored), error: null });
        },

        update(id, patch, expected) {
            if (invalidId(id)) {
                return Promise.resolve({ data: null, error: { code: 'INVALID_ID', message: '缺少记录 id' } });
            }
            const db = loadDb();
            const row = toRow(patch);
            if (!row || Object.keys(row).length === 0) {
                return Promise.resolve({ data: null, error: { code: 'INVALID_PAYLOAD', message: '没有可提交的字段' } });
            }
            const target = db[table].find(function (r) { return String(r.id) === String(id); });
            if (!target) {
                return Promise.resolve({ data: null, error: { code: 'NOT_FOUND_OR_FORBIDDEN', message: '记录不存在或无权修改' } });
            }
            if (expected && Object.entries(toRow(expected)).some(([key, value]) => (target[key] ?? null) !== value)) {
                return Promise.resolve({ data: null, error: { code: 'STALE_RECORD', message: '记录已变更，请刷新后重试' } });
            }
            Object.assign(target, row, { updated_at: new Date().toISOString() });
            if (!saveDb(db)) {
                return Promise.resolve({ data: null, error: { code: 'CLIENT_EXCEPTION', message: '本地存储写入失败' } });
            }
            return Promise.resolve({ data: fromRow(target), error: null });
        },

        remove(id) {
            if (invalidId(id)) {
                return Promise.resolve({ data: null, error: { code: 'INVALID_ID', message: '缺少记录 id' } });
            }
            const db = loadDb();
            const before = db[table].length;
            db[table] = db[table].filter(function (r) { return String(r.id) !== String(id); });
            if (db[table].length === before) {
                return Promise.resolve({ data: null, error: { code: 'NOT_FOUND_OR_FORBIDDEN', message: '记录不存在或无权删除' } });
            }
            if (!saveDb(db)) {
                return Promise.resolve({ data: null, error: { code: 'CLIENT_EXCEPTION', message: '本地存储写入失败' } });
            }
            return Promise.resolve({ data: { removed: 1 }, error: null });
        },

        // 本地版提供的直接读取，供复杂查询使用
        rawList() {
            return loadDb()[table];
        },

        saveAll(rows) {
            const db = loadDb();
            db[table] = rows;
            return saveDb(db);
        },
    };
}

module.exports = { createLocalAccess, loadDb, saveDb, nextId };
