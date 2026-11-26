// 云环境配置：拿到 WorkBuddy 云凭据后填写，并把 enabled 改为 true。
// 注意：仅改这里不会完成上云——还需：服务端建表 + RLS、
// 'me' → auth.uid() 迁移、availability / profile-edit 两页重写（见 README「接入云服务」）。
// enabled 为 false 时整个云链路不加载，本地版行为与之前完全一致。
module.exports = {
    enabled: false,
    endpoint: '',            // 云服务地址，例如 https://xxx.workbuddy.ai
    publishableKey: '',      // 云环境发布密钥
    oauthRelayBaseUrl: '',   // 可选：微信 OAuth 中转地址
    workBuddyOAuthClientId: '', // 可选：微信 OAuth 客户端 ID
};
