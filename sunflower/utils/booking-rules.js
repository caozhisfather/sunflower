const RESERVED_STATUSES = ['pending', 'accepted', 'deposit_paid', 'completed'];
const ACTION_RULES = {
    accept: { role: 'interpreter', states: ['pending'] },
    reject: { role: 'interpreter', states: ['pending'] },
    done: { role: 'interpreter', states: ['deposit_paid'] },
    deposit: { role: 'business', states: ['accepted'] },
    final: { role: 'business', states: ['completed'] },
    cancel: { role: 'business', states: ['pending', 'accepted', 'deposit_paid'] },
    reschedule: { role: 'business', states: ['pending', 'accepted'] },
};

function reservesDate(order, includePending) {
    return RESERVED_STATUSES.includes(order.status) && (includePending || order.status !== 'pending');
}

function canChangeOrder(action, account, order) {
    const rule = ACTION_RULES[action];
    if (!rule || !account || !order || account.role !== rule.role) return false;
    const ownerId = rule.role === 'business' ? order.businessId : order.interpreterId;
    return ownerId === account.userId && rule.states.includes(order.status);
}

module.exports = { reservesDate, canChangeOrder };
