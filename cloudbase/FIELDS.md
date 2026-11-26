# Sunflower 云数据库字段表

## 粘贴到哪里

使用团队的 **CloudBase PostgreSQL 测试环境**，在腾讯云 CloudBase 控制台选择该环境，进入「数据库 → SQL 编辑器」。打开 [schema.sql](./schema.sql)，复制全文到编辑器执行一次。脚本在同一事务里创建 11 张空表、约束、索引和更新时间触发器。若目标已有同名表，脚本会失败并回滚。请用项目自己的空测试环境。

如果你的界面只有「集合管理」或「Document 编辑器」，它是文档型入口，不能粘贴 PostgreSQL 脚本。文档型数据库从集合导入 JSON 或 CSV，导入的是记录。下列字段是结构定义，无需创建假记录占位。MySQL 的 SQL 窗口也需要另一份脚本。

建完后将下列查询粘贴到同一 SQL 编辑器，应该看到所有 11 张表，且「行级安全」均为 `true`。

```sql
select tablename as "表名", rowsecurity as "行级安全"
from pg_catalog.pg_tables
where schemaname = 'public' and tablename in (
  'accounts', 'profiles', 'availability', 'jobs', 'applications', 'orders',
  'reviews', 'notifications', 'settlements', 'favorites', 'job_safety'
)
order by tablename;
```

## 字段速查

金额统一为人民币元，使用 `numeric(12,2)`。业务日期用 `date`，预约开始时间用 `time(0)`，操作时间用 `timestamptz`。账号 ID 为 UUID，其余记录主键为自增 bigint。可空字段写 SQL `NULL`。每张表都有自动生成的 `id` 和 `created_at`，列有 `updated_at` 的表会在更新时维护该字段。完整类型、默认值和可空性以 SQL 为准。

| 表名 | 业务字段 | 用途 |
| --- | --- | --- |
| `accounts` | `wechat_appid`, `wechat_openid`, `role`, `status`, `updated_at` | 微信身份与固定账号类型。由服务端根据微信上下文创建。 |
| `profiles` | `owner_id`, `role`, `name`, `phone`, `school`, `major`, `english_level`, `price_per_day`, `campus_name`, `campus_lat`, `campus_lng`, `intro`, `company`, `contact`, `skills`, `is_demo`, `updated_at` | 学生或企业资料。公开列表只应返回展示字段。 |
| `availability` | `owner_id`, `avail_date`, `updated_at` | 学生空闲日期。同一账号同日一条。 |
| `jobs` | `business_id`, `business_name`, `title`, `requirements`, `service_date`, `start_time`, `hours`, `slots`, `rate`, `pay_unit`, `travel_allowance`, `total`, `location_name`, `location_address`, `location_lat`, `location_lng`, `required_skills`, `terms`, `status`, `updated_at` | 公开岗位。总薪资由数据库按计薪方式、工时和补贴生成。 |
| `applications` | `job_id`, `interpreter_id`, `interpreter_name`, `status`, `order_id`, `updated_at` | 申请及录用结果。撤回后可重新申请。录用申请必须指向对应岗位和学生的订单。 |
| `orders` | `business_id`, `business_name`, `interpreter_id`, `interpreter_name`, `service_date`, `start_time`, `requirements`, `required_skills`, `location_name`, `location_address`, `location_lat`, `location_lng`, `price`, `deposit`, `status`, `deposit_paid_at`, `final_paid_at`, `cancel_reason`, `cancelled_by_role`, `refund_status`, `refund_amount`, `refunded_at`, `rescheduled_from`, `rescheduled_at`, `job_id`, `job_hours`, `job_pay_unit`, `job_rate`, `job_terms`, `job_travel_allowance`, `actual_hours`, `hours_confirmed_at`, `updated_at` | 直接预约及录用订单、薪资快照、工时和模拟支付状态。同一学生同日最多一笔占用档期的订单。 |
| `reviews` | `order_id`, `reviewer_id`, `reviewer_role`, `reviewer_name`, `target_id`, `target_role`, `rating`, `comment` | 订单双方评价。每方每单最多一条，评分 1–5。 |
| `notifications` | `user_id`, `role`, `type`, `order_id`, `title`, `body`, `read` | 站内消息。未关联订单时 `order_id` 可空，`read` 为 0 或 1。 |
| `settlements` | `user_id`, `amount`, `status`, `paid_at` | 学生结算申请，预留失败状态。 |
| `favorites` | `user_id`, `target_id` | 企业收藏的学生，组合唯一。 |
| `job_safety` | `kind`, `user_id`, `role`, `business_id`, `job_id`, `order_id`, `detail`, `status`, `updated_at` | 岗位问题、履约争议和屏蔽。处理队列仅供授权人员。 |

## 接入时需要对齐的约定

- `interpreter` 对应学生，`business` 对应企业。首次开通后由服务端维持类型。企业开通、账号停用、查看举报及争议应使用授权后台接口。
- 本机身份 `me`、演示资料和模拟订单不导入测试云库。云端账号 ID 由服务端分配，服务端按当前微信身份确定记录归属。
- 现有本地岗位和申请使用驼峰字段，云表使用下划线字段。云端接入时要映射字段，例如 `jobId → job_id`，`travelAllowance → travel_allowance`，本机 `jobSafety → job_safety`。`total` 为生成列，写岗位时不提交该字段。
- 前端当前只显示 `HH:mm`。云端 API 要将数据库的 `time` 转成该格式，并把未填写的日期、时间戳和坐标转成 `null`。对外返回岗位或通知时，由服务端选择允许公开的字段。
- 脚本默认启用 RLS、撤销公共及常见客户端角色的表权限。建表后用云函数接入；由云函数校验调用身份、记录归属及订单状态，录用事务中检查名额、档期、重复操作并写入订单、申请状态和通知。
- 本脚本用于建库。真实登录、云函数部署和支付对账仍是后续接入工作，前端当前仍读本机数据。

官方参考：[CloudBase PostgreSQL 快速体验](https://docs.cloudbase.net/database/postgresql/quickstart) · [文档型数据库导入](https://docs.cloudbase.net/database/manage)
