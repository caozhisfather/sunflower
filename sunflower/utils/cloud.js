// 云客户端唯一实例：cloud-config.enabled 开启后才懒加载 SDK 并初始化。
// 未开启或初始化失败时返回 null，由数据层按配置决定如何处理。
const config = require('./cloud-config');

let instance = null;

function isCloudEnabled() {
    return config.enabled === true;
}

function getCloud() {
    if (!isCloudEnabled()) {
        return null;
    }
    if (instance) {
        return instance;
    }
    if (!config.endpoint || !config.publishableKey) {
        console.error('[Sunflower] cloud config 不完整：需要 endpoint 与 publishableKey');
        return null;
    }
    try {
        // 构建产物：miniprogram_npm/@tencent-ai/workbuddy-cloud-sdk/miniprogram.js
        const sdk = require('../miniprogram_npm/@tencent-ai/workbuddy-cloud-sdk/miniprogram.js');
        instance = sdk.createMiniProgramWorkBuddyCloud({
            endpoint: config.endpoint,
            publishableKey: config.publishableKey,
            oauthRelayBaseUrl: config.oauthRelayBaseUrl || undefined,
            workBuddyOAuthClientId: config.workBuddyOAuthClientId || undefined,
        });
    } catch (e) {
        console.error('[Sunflower] cloud init failed:', e && e.message);
        return null;
    }
    return instance;
}

module.exports = { getCloud: getCloud, isCloudEnabled: isCloudEnabled, config: config };
