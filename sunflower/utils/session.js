// 本地轻量身份：填昵称 + 选身份（译员/商家）。数据仅存本机。
const { isCloudEnabled } = require('./cloud');
const KEY = 'sunflower_session_v1';
// 兼容旧版曾单独保存的昵称。
const NAME_KEY = 'sunflower_last_name_v1';

const ROLES = ['interpreter', 'business'];

function getRegisteredRole() {
    if (isCloudEnabled()) return '';
    const account = wx.getStorageSync(KEY);
    return account && ROLES.includes(account.role) ? account.role : '';
}

function getSession() {
    if (isCloudEnabled()) return null;
    const session = wx.getStorageSync(KEY);
    if (session && session.active !== false && session.name && ROLES.includes(session.role)) {
        return {
            userId: 'me',
            name: session.name,
            role: session.role,
        };
    }
    return null;
}

function signIn(name, role) {
    if (isCloudEnabled()) {
        return { data: null, error: { code: 'CLOUD_SIGN_IN_REQUIRED', message: '云端登录尚未接入，请使用本地演示模式' } };
    }
    if (ROLES.indexOf(role) < 0) {
        return { data: null, error: { code: 'INVALID_ROLE', message: '请选择身份' } };
    }
    const registeredRole = getRegisteredRole();
    if (registeredRole && registeredRole !== role) {
        return { data: null, error: { code: 'ROLE_LOCKED', message: '账号类型已确定，请使用原身份登录' } };
    }
    const trimmed = (name || '').trim();
    if (!trimmed) {
        return { data: null, error: { code: 'INVALID_NAME', message: '请填写昵称' } };
    }
    const session = { userId: 'me', name: trimmed, role: role };
    wx.setStorageSync(KEY, { name: trimmed, role, active: true });
    return { data: session, error: null };
}

// 下次登录时回填原账号昵称。
function getLastName() {
    if (isCloudEnabled()) return '';
    const saved = wx.getStorageSync(KEY);
    return (saved && saved.name) || wx.getStorageSync(NAME_KEY) || '';
}

function updateSession(patch) {
    const current = getSession();
    if (!current) {
        return { data: null, error: { code: 'NOT_SIGNED_IN', message: '尚未登录' } };
    }
    if (patch.role !== undefined && patch.role !== current.role) {
        return { data: null, error: { code: 'ROLE_LOCKED', message: '账号类型已确定' } };
    }
    const name = patch.name === undefined ? current.name : String(patch.name).trim();
    if (!name) return { data: null, error: { code: 'INVALID_NAME', message: '请填写昵称' } };
    const next = { ...current, name };
    wx.setStorageSync(KEY, { name, role: current.role, active: true });
    return { data: next, error: null };
}

function signOut() {
    const current = getSession();
    if (current) wx.setStorageSync(KEY, { name: current.name, role: current.role, active: false });
    return { data: { removed: true }, error: null };
}

module.exports = {
    getSession: getSession,
    signIn: signIn,
    updateSession: updateSession,
    signOut: signOut,
    getLastName: getLastName,
    getRegisteredRole: getRegisteredRole,
};
