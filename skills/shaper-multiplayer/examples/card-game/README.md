# 卡牌游戏

真实的卡牌 Room。牌库和手牌只在服务端保存，私有手牌通过 targeted `client.send()` 返回，公共 Schema 只同步弃牌和阶段。

```bash
npm install --legacy-peer-deps --install-links=false
npm test
npm run dev    # terminal 1
npm run smoke  # terminal 2
```

## 包边界

```text
client/     # game-specific client scenario; imports the shared client SDK
protocol/   # game-specific messages; imports the shared protocol package
server/     # Room, Schema, and domain rules; imports the shared server SDK
tests/       # domain and integration tests
```

旧示例通过 file 路径引用维护仓库的 `packages/` 源码，不再附带 SDK 压缩包。运行前先在仓库根目录执行 `npm install` 和 `npm run build:sdk`，然后在本示例目录安装依赖。新游戏使用平台源码模板；这些旧示例只用于玩法参考。

# Recipe: card game

## State ownership

服务端把牌库和私有手牌放在公开 Schema 状态之外。它只把某位玩家的手牌发给该客户端，而公开投影只包含阶段和弃牌信息。

## Suggested file map

- `client/src/index.ts`：headless 抽牌、手牌观察和出牌意图。
- `protocol/src/index.ts`：抽牌/出牌 payload 和结果类型。
- `server/src/index.ts`：Room、公开 Schema、私有手牌投递和命令。
- `server/src/domain.ts`：抽牌和出牌规则。
- `tests/domain.test.ts`：私有手牌、牌库耗尽和弃牌不变量。

## Tests

先运行 `npm test` 验证卡牌状态转换，再运行 `npm run dev` 和 `npm run smoke` 验证定向私有状态投递。
