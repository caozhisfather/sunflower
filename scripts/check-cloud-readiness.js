const fs = require('node:fs');
const path = require('node:path');
const project = require('../project.config.json');
const cloud = require('../sunflower/utils/cloud-config');

function check(label, ready, detail) {
    console.log((ready ? '通过' : '待配置') + ' · ' + label + ' · ' + detail);
    return ready;
}

function hasHttpsEndpoint(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
        return false;
    }
}

const sdk = path.join(__dirname, '..', project.miniprogramRoot,
    'miniprogram_npm', '@tencent-ai', 'workbuddy-cloud-sdk', 'miniprogram.js');
const results = [
    check('项目 AppID 格式', /^wx[0-9a-f]{16}$/i.test(project.appid), '读取外层 Sunflower 项目配置，归属需在微信平台确认'),
    check('云 SDK 构建产物', fs.existsSync(sdk), '检查小程序目录里的 miniprogram_npm'),
    check('测试环境地址', hasHttpsEndpoint(cloud.endpoint), '需要有效的 HTTPS 云地址'),
    check('客户端发布密钥', typeof cloud.publishableKey === 'string' && Boolean(cloud.publishableKey.trim()),
        '仅检查是否已配置'),
];
console.log('云模式 · ' + (cloud.enabled ? '已启用' : '关闭，当前使用本地模式'));
if (results.includes(false)) process.exitCode = 1;
