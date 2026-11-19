# 规则开发

规则是工作区发布的 Java 纯函数。技能内
`sdk/rule-sdk/shaper-timeflow-rule-sdk-0.0.1.jar` 包含生产
`com.hupu.shaper.timeflow.rulesdk` SPI、内核和 `LocalReplayRunner`；
不要再手写第二份 `Rule` 或第二份积分算法。

## 1. 当前 SPI

```java
package com.hupu.shaper.timeflow.rulesdk;

public interface Rule {
    List<RuleDelta> integrate(
            RuleStreamView stream,
            RuleModifierView modifiers,
            long segmentDurationMs,
            RuleContextView context);
}
```

只读视图：

| 类型 | 字段 / 用途 |
|---|---|
| `RuleStreamView` | `streamKey`, `metricId`, `ruleKey`, `value`, `phaseIndex`, `capacity`, `precision`, `lastUpdateTime` |
| `RuleModifierView` | `rateMultiplier`, `rateAddend`, `capacityOverride` |
| `RuleContextView` | 平台注入的 `clock`, `randomValue` |
| `RuleDelta` | `metricId`, `produced`, `capped`, `netChange` |

规则返回理论增量；平台在同一内核中统一施加容量截断。规则不能用
`kernel.StreamState`、`kernel.ModifierSet`、`kernel.SettleContext` 或
`kernel.Delta` 作为 SPI 签名；这些是内核内部类型。

## 2. 最小可编译规则

最小实现如下，只需规则 JAR 编译：

```java
package workspace.rules;

import com.hupu.shaper.timeflow.rulesdk.*;
import java.math.BigDecimal;
import java.util.List;

public final class GrowthRule implements Rule {
    @Override
    public List<RuleDelta> integrate(RuleStreamView stream, RuleModifierView modifiers,
                                     long segmentDurationMs, RuleContextView context) {
        BigDecimal rate = new BigDecimal("0.01")
                .multiply(modifiers.rateMultiplier())
                .add(modifiers.rateAddend());
        BigDecimal produced = rate.multiply(BigDecimal.valueOf(segmentDurationMs));
        return List.of(new RuleDelta(stream.metricId(), produced,
                BigDecimal.ZERO, produced));
    }
}
```

不要读取 `System.currentTimeMillis()`、`Instant.now()`、环境变量、数据库或网络；
需要平台时间和固定随机值时要显式使用传入的 `RuleContextView`。

## 3. 本地编译与回放

用 `javac` 编译并运行自己的规则测试：

```bash
RULES=sdk/rule-sdk/shaper-timeflow-rule-sdk-0.0.1.jar
javac -cp "$RULES" -d /tmp/rule-classes \
  src/main/java/workspace/rules/GrowthRule.java
```

在自有测试中可调用规则 SDK 的 `LocalReplayRunner`：

```java
SettleReport report = new LocalReplayRunner()
        .run("local-growth-1", input, rules, new GrowthRule());
```

生产或预发布必须以平台 `POST .../definitions/{version}/validate` 的六组
`passed=true` 结果作为激活依据。

`RuleSet` 仍用于提供规则 phase/metadata；第二个参数只是供本地内核调用的 SPI
实现。生产服务通过 `SpiRuleInvoker` 和 workspace 隔离类加载器加载同一个接口。
回放测试至少比较两个字段：`netChange` 和 `effectiveDuration`，并对相同输入
比较完整 `SettleReport`，确认 receipt replay 不漂移。

## 4. Purity gate

`RulePurityGuard` 扫描规则源码，禁止：

- `java.io`、`java.nio.file` 等文件 IO；
- `java.net`、`java.sql`、`javax.sql`；
- `Instant.now`、`LocalDateTime.now`；
- `new Random(...)`、`Math.random`、`UUID.randomUUID`。

```java
List<String> violations = new RulePurityGuard().violations(ruleSourcePath);
if (!violations.isEmpty()) throw new IllegalStateException(violations.toString());
```

它是安全底线，不替代 review。尤其不要通过反射、动态类加载或调用未扫描的 helper
绕过限制。

## 5. 版本升级验收

修改规则时必须：

1. 新建 `ruleVersion`，保留旧版本的可回放语义。
2. 用技能内 JAR 编译示例并重复运行本地回放；同一 `settlementId` 的完整报告相等。
3. 覆盖至少一个 linear、一个 window、一个 point 和一个 phase transition；
   检查 `produced = netChange + capped`。
4. 用平台 `/shaper/timeflow/v1/definitions/{version}/validate` 跑六组场景，全部通过后激活。
5. 记录旧 scope 的 phase、value、capacity 迁移影响；不能只验证空 scope。
6. 若使用 SPI artifact，确认 JAR 来自允许位置、SHA-256 与 class 一致，并由
   workspace 隔离加载器加载成功。

旧规则 JAR 只包含 `LocalReplayRunner`、`Rule` 和纯度检查、不包含
`RuleStreamView`/`RuleDelta` 时，必须用当前 SDK 重建；不要继续用旧接口写兼容层，
因为服务端加载器会拒绝不实现当前 `rulesdk.Rule` 的类。
