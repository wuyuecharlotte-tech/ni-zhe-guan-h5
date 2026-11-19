# 时序定义设计指南

定义是 Timeflow 的唯一配置入口。技能内快照
[definition.schema.json](schema/definition.schema.json) 负责结构；跨字段引用、
容量上限和规则登记等业务语义由平台 `/validate` 验证。

`python3 scripts/check-definition.py` 会先执行快照中的 JSON Schema 子集，
然后再做少量本地跨字段检查。它仍是 **preflight**：成功只表示结构可继续提交，
不表示业务语义和平台回放已通过。

## 1. 一次完整模型

```text
workspace
  -> scopeType: 哪些聚合拥有权威时间和结算
  -> metric: 产出什么数值、精度和上限
  -> stream: 按什么 streamKey 识别一个时序实例
     -> phases: 存量/事件何时改变速率
     -> decay: 离线多久之后修正速率或容量
  -> tasks: 何时选择哪些 scope/stream，执行哪种白名单动作
  -> delivery: 哪些变化量在哪个事件类型下发
  -> events: 业务事件 kind 的注册与展示
```

以下示例同时包含连续流、有限实例、窗口、点事件、decay、定时任务、
结算交付和订阅。它是建模示例，不是自动验证通过的完整业务定义。

```json
{
  "workspaceId": "demo.workspace",
  "definitionVersion": 4,
  "protocolVersion": 1,
  "scopeTypes": ["member", "device"],
  "metrics": [
    {
      "metricId": "coin",
      "precision": 0,
      "cap": "1000000",
      "capScope": "stream",
      "shared": false
    },
    {
      "metricId": "energy",
      "precision": 2,
      "cap": null,
      "capScope": "stream",
      "shared": false
    }
  ],
  "maxOfflineTime": 2592000000,
  "stream": [
    {
      "streamPattern": "crop:{id}",
      "metricId": "coin",
      "ruleKey": "growth",
      "ruleVersion": 1,
      "carrier": "interpreter",
      "lifecycle": "finite",
      "phases": [
        {
          "name": "growing",
          "baseRate": "0.01",
          "capacity": "100",
          "until": {"kind": "progress", "value": "1"}
        },
        {
          "name": "mature",
          "baseRate": "0",
          "until": {"kind": "immortal"}
        }
      ],
      "decay": [
        {"stat": "rate", "op": "mul", "value": "0.5", "after": 604800000}
      ]
    },
    {
      "streamPattern": "regen:{id}",
      "metricId": "energy",
      "ruleKey": "regeneration",
      "ruleVersion": 1,
      "carrier": "interpreter",
      "lifecycle": "continuous",
      "phases": [
        {
          "name": "normal",
          "baseRate": "0.002",
          "capacity": "100",
          "until": {"kind": "immortal"}
        }
      ]
    }
  ],
  "tasks": [
    {
      "taskKey": "dailySettle",
      "displayName": "每日结算",
      "cron": "0 0 2 * * *",
      "timezone": "Asia/Shanghai",
      "enabled": false,
      "selector": {
        "scopeType": "member",
        "streamPattern": "crop:{id}",
        "phaseIndexIn": [0],
        "where": [{"field": "value", "op": "lt", "value": "100"}],
        "orderBy": "stream.value",
        "limit": 500
      },
      "action": {
        "kind": "TRIGGER_SETTLE",
        "source": "DAILY",
        "idempotency": "$taskKey:$streamKey:$bucket(1d)"
      },
      "maxConcurrency": 2,
      "batchSize": 200,
      "routeStrategy": "FAILOVER",
      "timeoutMs": 30000,
      "retryLimit": 3,
      "misfirePolicy": "GRACE"
    }
  ],
  "delivery": {
    "enabled": true,
    "mode": "shadow",
    "includeSourceStreams": true,
    "subscribers": [
      {
        "key": "ledger",
        "displayName": "结算回调",
        "version": 1,
        "metrics": ["coin"],
        "eventKinds": ["settlement.completed"]
      }
    ]
  },
  "events": [
    {"kind": "settlement.completed", "displayName": "结算完成"}
  ]
}
```

## 2. Metrics、stream 和生命周期

- `metricId` 在同一工作区内唯一；流只引用已声明指标。
- `precision` 是 0 到 6 的整数。金额、速率和容量始终写字符串十进制，
  避免 JSON number 的浮点近似。
- `cap` 是容量上限；`capScope=stream` 表示单个流，`capScope=scope` 表示同一
  scope/metric 最多 64 条流。v1 拒绝 `shared=true`。
- `streamPattern` 匹配已存在的流键，例如 `crop:{id}` 匹配 `crop:101`；
  它是定义匹配规则，不是客户端 URL 模板。
- `finite` 实例需要新的 `streamKey` 才能重新开始，终止相位速率必须为 0。
- 首次进入终止相位时平台固化为 `terminated`，保存 `terminalAt` 与来源；
  同一实例后续结算不能改写终态时间。`legacy_unknown` 仅供旧数据兼容。
- `continuous` 流可以长期存在；末相位不等于实例已结束，但状态和相位也必须显式。
- 当前解释器定义只接受 `carrier="interpreter"`。SPI carrier 需要平台已登记
  不可变规则工件并完成隔离加载。

### 资源变体、基础速率和临时窗口

平台不解释业务概念，但资源定义仍需要让实例、基础速率和生命周期保持可解释。
按下面的边界区分四个层次：

| 概念 | 含义 |
|---|---|
| 业务资源族 | 同一产品概念下的变体集合，例如“作物” |
| 平台资源类型 | 一个 `streamPattern`、`ruleKey` 和 `phases` 的组合 |
| 流实例 | 一个独立 `streamKey` 对应的状态 |
| 业务周期 | 一个 `finite` 实例从开始到终态的区间 |

`streamPattern` 是资源类型的匹配规则，不是单个实例；`displayName` 只用于展示和
排障，不承担业务身份。一个模式可以匹配多个实例，但一个 `finite` 实例结束一个
业务周期后不能复用原键重新开始，必须使用新的 `streamKey`。

#### 默认选择：固有速率分别定义

如果业务变体有稳定、固有且不同的基础演化速率，分别为每个变体定义模式、规则和
阶段。下面的三个线性示例把成长值明确建模为 `0..100` 的百分比进度，精度为 2，
进度阈值 `until.value` 为 `"1"`：

```json
{
  "workspaceId": "example.farm",
  "definitionVersion": 1,
  "protocolVersion": 1,
  "scopeTypes": ["player"],
  "metrics": [
    {"metricId": "grow", "precision": 2, "cap": "100", "capScope": "stream", "shared": false}
  ],
  "maxOfflineTime": 2592000000,
  "stream": [
    {
      "streamPattern": "cropCarrot:{id}",
      "displayName": "胡萝卜",
      "metricId": "grow",
      "ruleKey": "cropGrowthCarrot",
      "ruleVersion": 1,
      "carrier": "interpreter",
      "lifecycle": "finite",
      "phases": [
        {"name": "growing", "baseRate": "0.000833", "capacity": "100",
         "until": {"kind": "progress", "value": "1"}},
        {"name": "mature", "baseRate": "0", "until": {"kind": "immortal"}}
      ],
      "decay": []
    },
    {
      "streamPattern": "cropCorn:{id}",
      "displayName": "玉米",
      "metricId": "grow",
      "ruleKey": "cropGrowthCorn",
      "ruleVersion": 1,
      "carrier": "interpreter",
      "lifecycle": "finite",
      "phases": [
        {"name": "growing", "baseRate": "0.000333", "capacity": "100",
         "until": {"kind": "progress", "value": "1"}},
        {"name": "mature", "baseRate": "0", "until": {"kind": "immortal"}}
      ],
      "decay": []
    },
    {
      "streamPattern": "cropMelon:{id}",
      "displayName": "西瓜",
      "metricId": "grow",
      "ruleKey": "cropGrowthMelon",
      "ruleVersion": 1,
      "carrier": "interpreter",
      "lifecycle": "finite",
      "phases": [
        {"name": "growing", "baseRate": "0.000167", "capacity": "100",
         "until": {"kind": "progress", "value": "1"}},
        {"name": "mature", "baseRate": "0", "until": {"kind": "immortal"}}
      ],
      "decay": []
    }
  ]
}
```

在 `precision=2` 时，每秒进度分别约为 0.833、0.333、0.167。上述速率按
`100 / 目标毫秒数` 保留六位小数，因此理论周期分别是约 2、5、10 分钟
（实际按分段时长积分并在段末向下取整，结算分段会带来微小时间偏差）；
实际值以容量达到阈值后的平台相位推进为准。它们使用不同的 `ruleKey`，因为同一
`ruleKey@ruleVersion` 不能承载不同 phases 内容；若只改规则语义则发布新版本，
但不能在同一个定义中把同一规则键解析到多个版本或不同内容。

#### 先声明资源值刻度

平台把 `value`、`baseRate` 和 `capacity` 当作同一“指标单位”的十进制数值，但不
定义单位、满值刻度或展示比例。项目必须为每个 `metricId` 明确资源值契约：

| 契约项 | 必须说明的内容 |
|---|---|
| 业务语义 | 进度、余额、累计产量、库存、经验或其他 |
| 单位与满值 | 1 或 100 表示满进度，还是某个业务累计值 |
| `precision` | 平台保存与积分精度 |
| 初始值和终态值 | 合法起点及 `finite` 实例预期终值 |
| 容量语义 | 是成长阈值、仓储上限还是其他业务限制 |
| 展示换算 | 平台值如何转为界面显示值 |
| 事件与报表 | 使用平台刻度还是显式转换后的业务值 |

比例进度可使用 `capacity="1"`、`precision=6`；百分比进度可使用
`capacity="100"`、`precision=2`。这两种只是常见选择，不是平台强制。累计资源也
可以使用 100000 等业务容量，但必须说明它代表累计产量或仓储上限，不能与成长
百分比横向比较。

区分容量来源：

- 指标 `cap` 是 metric 声明的通用上限；
- `phases[].capacity` 是相位上限，决定 `progress` 阈值；
- `stream.capacity` 是实例容量，可在创建时上报；
- 三者单位必须一致，超出当前容量时只进入 `capped`，不能自行换算。

`DECIMAL(18,6)` 是平台存储范围，不是业务推荐刻度。

#### 共享基础速率时使用临时窗口

若三种变体共享同一个基础成长速率，而外部操作只临时改变速度，保留一个
宽泛模式和一项基础规则：

```text
streamKey: {instanceId}
baseRate: 1/ms
临时修正: POST /windows {stat:"rate", op:"mul", value:"2", startTime, endTime}
```

窗口是有开始和结束时间的修正，不是另一种资源类型。不要永久或人为拉长窗口来
代替固有基础速率；否则资源定义无法表达真实身份，统计和迁移也会依赖窗口历史。

#### 选择原则

| 需求 | 采用 | 备注 |
|---|---|---|
| 每个变体有固定的不同基础速率 | 分别声明 `streamPattern + ruleKey + phases` | 推荐用于可预期的基础成长周期 |
| 变体共享基础速率，只临时加速/减速 | 单一模式 + `windows` | 与农场示例一致；窗口有时间范围 |
| 实例运行时需按动态业务状态计算 | SPI 规则 | 仅在解释器无法表达时使用 |
| 同一有限实例进入下一周期 | 新 `streamKey` | 不能复活或回退旧实例 |

这些是建模选择：平台不识别“胡萝卜”或“玉米”的业务含义，也不会因为共用模式
自行判定资源身份错误；但工作区应在定义或 BFF 中保持可审计的资源映射。

#### 从目标周期反推速率

对于从 0 开始、线性阶段、容量 `C`、进度阈值 `p`、无窗口的情况：

```text
目标周期(ms) = C × p / baseRate
baseRate = C × p / 目标周期(ms)
```

例如百分比刻度 `C=100`、`p=1`、目标 2 分钟，则目标毫秒数为 120000，
`baseRate = 100 / 120000 ≈ 0.000833333`（单位/毫秒）；与前面的 2 分钟示例采用
相同的计算口径。该计算只用于
定义初稿和评审，最终周期与状态以平台相位推进、报告和生命周期事实为准。

#### 定义与运行实例的核对

定义中新增专用模式后，必须核对实际 `streamKey` 是否匹配它，而不是只看定义是否
已激活。若旧宽泛模式仍承载活跃实例，专用模式可能只是“已声明但未使用”；应先将
新周期写入专用键，等存量有限实例终止或 scope 关闭后，再发布移除旧模式的更高
定义版本。历史结算和终止实例应保留只读证据。

## 3. Phases、事件和时间窗

`baseRate` 单位是 **每个毫秒**。`"0.01"` 表示每秒 10 单位，
`"0.000001"` 表示每秒 0.001 单位。不要混用秒/分钟。

`until.kind` 的语义：

| kind | 何时推进 |
|---|---|
| `progress` | 当前存量达到容量阈值；`value` 是正数比例，通常为 `"1"` |
| `event` | 平台接受带 `transition` 的白名单点事件时推进 |
| `immortal` | 终止相位；必须是最后一个相位 |

时间窗来自 `POST /shaper/timeflow/v1/{scopeType}/{scopeId}/windows`，是 `rate` 或 `capacity`
的 `add`/`mul` 修正，带开始和结束的 UTC 毫秒。窗口会切成独立积分段；
不能在规则代码里再实现一份窗口逻辑。点事件来自 `/points`，可执行合法的
`ADD`/`SET` 或相位 transition；事件时间必须落在可接受的推进点之后。

```text
0:00  建立 crop:101，phase 0
0:30  应用 rate x2 窗口
0:45  点事件 ADD -200
1:30  窗口结束
2:00  结算
```

## 4. Decay 和 tasks

`decay[]` 的每条记录在本次权威结算起点之后 `after` 毫秒开始生效：

```json
{"stat": "rate", "op": "mul", "value": "0.5", "after": 604800000}
```

上面表示离线 7 天后，速率乘 0.5，直到本次有效区间结束。`after=0`
立即生效。锚点是本次结算起点，不是上次流更新时间。

任务只从激活定义读取，不维护第二份任务定义表：

- `cron` 是 6 段 Spring Cron，`timezone` 默认 `Asia/Shanghai`。
- `selector.scopeType` 必填；`scopeId` 由任务执行选择，不能来自浏览器。
- `where.op` 支持 `eq/ne/lt/lte/gt/gte/in/prefix`。
- 动作只支持 `APPLY_WINDOW`、`EMIT_POINT`、`TRIGGER_SETTLE`、`NOTIFY`、
  `EVICT_CACHE`。
- 除 `EVICT_CACHE` 外必须有稳定 `idempotency`；`APPLY_WINDOW.durationMs`
  不能超过平台 `maxOfflineTime`。
- 当前执行器只替换 `$taskKey`、`$streamKey` 和 `$bucket(<s|m|h|d|w>)`；
  不要使用未实现的 `$scopeId` 等占位符，否则它会作为字面量参与幂等键计算。
- `routeStrategy` 为 `ROUND_ROBIN/FAILOVER/BUSY_OVER`，
  `misfirePolicy` 为 `GRACE/SKIP/CATCH_UP`。

任务运行、暂停恢复和运行记录见 [management.md](management.md)。

## 5. Delivery 与 events

`delivery.mode` 是 `shadow` 或 `live`。`shadow` 只记录事件和 delivery，
不发起外部回调；`live` 才按绑定投递。每个 subscriber 的 `key` 和 `version`
唯一，`metrics` 至少一项，`eventKinds` 至少一项。

`includeSourceStreams` 控制是否把来源流变化包含在变化集合；明细由平台按
订阅过滤条件生成。定义不能写 endpoint、secret、JAR 路径或 class 名，
这些由受信订阅配置决定。下游 ACK/NACK 与投递状态见
[management.md](management.md)。

`events[]` 是激活定义的业务事件类型注册表：
`POST /shaper/timeflow/v1/{scopeType}/{scopeId}/business-events`
的 `kind` 必须在此声明，未声明的类型会被拒绝。登记事实使用稳定 `eventId` 幂等；
同键同载荷返回重放结果，同键不同载荷冲突。该事实可用于审计、查询和展示，但不是
`points`、`windows` 或结算输入，不能直接改变流值或收益。

### 业务事件候选判断

`windows` 和 `points` 记录效果，`business-events` 记录可选的事实。三者不能
互相替代，业务事件不进入结算输入。候选判断、项目 payload schema、时间/标识语义、
可靠性、消费者和验收见 [event-modeling.md](event-modeling.md)。

## 6. 时间、版本和迁移

- 所有平台时间戳是 UTC 毫秒；业务任务时区只用于 cron 解释。
- 结算的 `from`/`to` 由平台 scope 权威时间决定，客户端不能决定或倒退。
- `definitionVersion` 不可变。只调整 JSON 对象键顺序仍是同一版本；
  改语义、速率、相位、decay、任务或交付过滤条件必须升版本。
- 同一 ruleKey 在一个定义里不能同时引用多个 ruleVersion；新版本必须表达
  完整规则语义，不能依赖缺失时默认兜底。
- 迁移时先针对存量 scope 的 phase、value、capacity 和正在进行的时间窗回放；
  再检查任务及 delivery 过滤条件。不要假设升版会重写历史流相位。
- `finite` 改 `continuous`、终止相位改变或 task 身份改变都属于业务迁移，
  不能只改显示名称。`displayName` 是可选的管理展示，不参与身份。

## 7. 提交和验证

```bash
python3 scripts/check-definition.py definition.json
```

本地输出 `schema preflight passed` 后，依次：

```text
POST /shaper/timeflow/v1/definitions
POST /shaper/timeflow/v1/definitions/{version}/validate
POST /shaper/timeflow/v1/definitions/{version}/activate
```

平台 `/validate` 必须通过 `passed:true` 和六组固定回放：
`1h`、`1d`、`30d`、`window`、`segment-equivalence`、`receipt-replay`。
本地 preflight 不验证规则登记、业务指标引用、scope cap 流数量或平台回放。
