# 接入方使用示例

本文件只包含接入方可用的 SDK、HTTP 和报告检查示例。
下面的 TypeScript/Java 协议示例都运行在**可信服务端**，例如应用自己的 BFF。
正式浏览器不得使用这些示例持有工作区 Token 或计算 HMAC。浏览器身份、Game Token、
游客会话和作用域绑定见 [authentication.md](authentication.md)。

下面用“种草”场景说明同一组业务字段和调用顺序。真实服务始终用平台权威时间
决定结算区间；接入方不能靠本地 `clientAt` 推导或伪造 `from`/`to`。

## 定义示例

```json
{
  "workspaceId": "hupu.game.farm",
  "definitionVersion": 1,
  "protocolVersion": 1,
  "scopeTypes": ["player"],
  "metrics": [
    {
      "metricId": "coin",
      "precision": 0,
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
      "ruleKey": "cropGrowth",
      "ruleVersion": 3,
      "carrier": "interpreter",
      "phases": [
        {
          "name": "growing",
          "baseRate": "0.01",
          "capacity": "1000000",
          "until": {"kind": "progress", "value": "1.0"}
        },
        {
          "name": "mature",
          "baseRate": "0",
          "capacity": "1000000",
          "until": {"kind": "immortal"}
        }
      ],
      "decay": []
    }
  ]
}
```

示例时间轴：0 分钟播种，30 分钟浇水开始，45 分钟被偷 200，90 分钟浇水结束，
120 分钟玩家回来结算。测试案例的总收益和最终存量由平台黄金报告门禁验证；
接入方不应在客户端重算并覆盖服务端报告。

## 定义门禁

先解析稳定工作区身份，再使用标准 `X-Shaper-Token` 注册。完整来源优先级和名称规则见
[workspace-onboarding.md](workspace-onboarding.md)。

```bash
python3 scripts/resolve-workspace.py
```

工作区与 scope type 使用标准 `X-Shaper-Token`、时间戳和 HMAC 注册：

```bash
SHAPER_TOKEN=... \
  python3 scripts/register-platform.py \
  --workspace hupu.game.farm --display-name '开心农场' \
  --scope-type player --scope-id 1001 \
  --scope-display-name '农场玩家 1001' \
  --request-id provision-farm-v1
```

三个 HTTP 请求统一使用 `SHAPER_TOKEN`，通过 `X-Shaper-Token` 发送；请按
[bff-upstream-auth.md](bff-upstream-auth.md) 添加毫秒时间戳、HMAC 和幂等头。
该变量可通过环境变量提供；未设置时读取技能工作区根目录（兼容技能目录）
的 `credentials.json.shaperToken`。注册接口处于迁移期，服务端暂时不校验凭据
合法性；未来恢复校验时客户端接入方式不变。
命令只输出脱敏 JSON 摘要；不要将 Token 写入定义、示例、日志或浏览器配置。

在技能目录运行零依赖结构预检：

```bash
python3 scripts/check-definition.py path/to/farm-definition.json
```

该输出只表示结构预检通过。正式接入必须通过：

```text
POST /shaper/timeflow/v1/definitions
POST /shaper/timeflow/v1/definitions/1/validate
POST /shaper/timeflow/v1/definitions/1/activate
```

只有平台返回六组场景全部通过后才能激活。
平台 `POST /shaper/timeflow/v1/definitions/{version}/validate` 的完整回放结果。

## TypeScript SDK

当前公共包是 `@hupu/shaper-timeflow-protocol-sdk`，Node.js 18 以上。
入口从包根导出，不引用 `dist` 内部文件。以下客户端只能运行在 BFF 或受信服务端：

如果只安装了本技能，直接从技能内本地包引入：

```bash
pnpm add file:/path/to/skills/shaper-timeflow/sdk/typescript
```

Java 的三个 JAR 和完整坐标见 [../sdk/README.md](../sdk/README.md)。

```ts
import {
  FetchTransport,
  ProtocolClient,
  appliedDigest,
  createHmacSigner,
  type TimeflowSettleReport,
  type PointReport,
  type StreamUpdate,
  type SettleRequest,
  type WindowReport,
} from "@hupu/shaper-timeflow-protocol-sdk";

const token = process.env.SHAPER_TOKEN!;
const baseUrl = (process.env.TIMEFLOW_BASE_URL ?? "https://relay.hupu.com")
  .replace(/\/+$/, "");
// workspaceId 和 SHAPER_TOKEN 来自服务端部署配置/密管；不得下发给浏览器。
// SDK 将其发送为 X-Shaper-Token。
const client = new ProtocolClient({
  transport: new FetchTransport(baseUrl),
  workspaceId: "hupu.game.farm",
  protocolVersion: 1,
  accessToken: token,
  signer: createHmacSigner(token),
});

const T0 = 1_800_000_000_000;
const minute = 60_000;
const scopePath = "/shaper/timeflow/v1/{scopeType}/1001";

const stream: StreamUpdate = {
  streamKey: "crop:101",
  value: "0",
  rate: "0.01",
  phaseIndex: 0,
  capacity: "1000000",
  expectedVersion: 0,
  requestId: "req-farm-stream-1",
};
await client.call(`${scopePath}/stream`, {
  body: stream,
  idempotencyKey: stream.requestId,
});

const window: WindowReport = {
  streamKey: "crop:101",
  stat: "rate",
  op: "mul",
  value: "2",
  startTime: T0 + 30 * minute,
  endTime: T0 + 90 * minute,
  source: "watering",
  requestId: "req-farm-water-1",
};
await client.call(`${scopePath}/windows`, {
  body: window,
  idempotencyKey: window.requestId,
});

const stolen: PointReport = {
  streamKey: "crop:101",
  kind: "stolen",
  eventTime: T0 + 45 * minute,
  ops: [{ op: "ADD", value: "-200" }],
  eventId: "evt-farm-stolen-1",
};
await client.call(`${scopePath}/points`, {
  body: stolen,
  idempotencyKey: stolen.eventId,
});

const settleRequest: SettleRequest = {
  trigger: "login",
  clientAt: T0 + 120 * minute,
};
const settled = await client.call<TimeflowSettleReport, SettleRequest>(
  `${scopePath}/settlements`,
  { body: settleRequest },
);

const report = settled.data;
const digest = await appliedDigest(report);
await client.call(`/shaper/timeflow/v1/settlements/${encodeURIComponent(report.settlementId)}/ack`, {
  body: { settlementId: report.settlementId, appliedDigest: digest },
});
```

`ProtocolClient` 不自动重试。需要对幂等调用重试时用 `withRetry`，
并保证重投复用同一个幂等键。不要给结算请求自行补 `from`/`to`。

## Java 协议 SDK

坐标为 `com.hupu.shaper:shaper-timeflow-protocol-sdk:0.0.1`。
调用方必须实现 `HttpTransport`；以下示例用 JDK 21 `HttpClient`：

未发布到组织 Maven 仓库前，先按 `sdk/README.md` 从技能目录安装本地 JAR。

```java
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hupu.shaper.timeflow.sdk.client.ClientOptions;
import com.hupu.shaper.timeflow.sdk.client.HmacSigner;
import com.hupu.shaper.timeflow.sdk.client.HttpTransport;
import com.hupu.shaper.timeflow.sdk.client.ProtocolClient;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;

public final class FarmSdkExample {
    public static void main(String[] args) throws Exception {
        // 此示例只在 BFF 或受信工作区后端运行，勿打包进 H5。
        String token = System.getenv("SHAPER_TOKEN");
        String configuredBaseUrl = System.getenv("TIMEFLOW_BASE_URL");
        String baseUrl = (configuredBaseUrl == null
                || configuredBaseUrl.isBlank()
                ? "https://relay.hupu.com"
                : configuredBaseUrl).replaceAll("/+$", "");
        HttpClient http = HttpClient.newHttpClient();
        HttpTransport transport = request -> {
            try {
                HttpRequest.Builder builder = HttpRequest.newBuilder(
                        URI.create(baseUrl + request.path()));
                request.headers().forEach(builder::header);
                builder.method(request.method(), request.body() == null
                        ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofString(request.body()));
                HttpResponse<String> response = http.send(
                        builder.build(), HttpResponse.BodyHandlers.ofString());
                return new HttpTransport.Response(
                        response.statusCode(), Map.of(), response.body());
            } catch (Exception failure) {
                throw new IllegalStateException("HTTP transport failed", failure);
            }
        };
        ProtocolClient client = new ProtocolClient(
                new ClientOptions("hupu.game.farm", 1, transport, token,
                        new HmacSigner(token), null, null),
                new ObjectMapper());
        // 调用 client.call(method, path, body, idempotencyKey)。
    }
}
```

Java SDK 返回 Jackson `JsonNode`。需要重试时使用 `RetryPolicy`，只对幂等操作启用。

## 报告检查

```bash
python3 scripts/inspect-settle.py --report report.json
```

脚本只读取报告，不连接平台服务或数据库。遇到 `NEED_RESUME` 时，本次结算未完成，
不得把报告解释成零收益或成功落地。

## 任务、回执与生命周期示例

任务、订阅回执、scope 生命周期和只读 projection 的完整边界见
[management.md](management.md)。玩家 BFF 只映射明确批准的业务动作：

```text
玩家 BFF 经批准的业务动作:
  POST /shaper/timeflow/v1/tasks/{taskKey}/enable
  GET  /shaper/timeflow/v1/{scopeType}/{scopeId}/projections

下游订阅者:
  POST /shaper/timeflow/v1/change-deliveries/{deliveryId}/ack
```
