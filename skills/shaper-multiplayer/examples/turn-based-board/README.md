# 回合制棋盘

真实的回合 Room。服务端检查玩家、回合号和合法移动，客户端只提交移动意图。

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

# Recipe: turn-based board

## State ownership

服务端拥有棋盘、当前回合、移动合法性和回合计时。客户端提交坐标意图，并渲染结果的公开棋盘状态。

## Suggested file map

- `client/src/index.ts`：headless 加入和移动请求。
- `protocol/src/index.ts`：移动 payload 和结果类型。
- `server/src/index.ts`：Room、棋盘 Schema 和命令路由。
- `server/src/domain.ts`：合法移动和回合转换规则。
- `tests/domain.test.ts`：回合顺序、边界和占位单元不变量。

## Tests

先运行 `npm test` 验证纯回合规则，再运行 `npm run dev` 和 `npm run smoke` 验证一次真实的 Colyseus 移动。
