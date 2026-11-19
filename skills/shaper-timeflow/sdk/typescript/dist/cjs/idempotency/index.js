"use strict";
/**
 * 幂等模块（design §7.1 / §7.5 / §10.6 / ADR-36）。
 *
 * **边界（最容易写错的地方）**：幂等键由调用方生成并**原样重放**。
 * SDK 绝不「内部随机生成一个键、发出去就丢掉」——那样重试会生成第二个键，
 * 幂等直接失效（design §10.6 明确禁止）。
 *
 * 因此本模块的形态是：
 * 1. `IdempotencyStore`：键的**持久化**定义（调用方可见可存），SDK 只依赖接口；
 * 2. `MemoryIdempotencyStore`：进程内实现，用于测试与短生命周期场景；
 * 3. `deriveIdempotencyKey`：**可复现**的键派生（同输入同键）——
 *    当调用方还没有键时用它先算一个，算出来的键进 store，重投时取出原键。
 *
 * 保留期（ADR-36）：上报 ≥7 天、结算永久。SDK 不实现过期淘汰，
 * 只在接口上要求实现方满足该不等式（本地队列保留期必须**短于**服务端保留期）。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryIdempotencyStore = void 0;
exports.identityOf = identityOf;
exports.deriveIdempotencyKey = deriveIdempotencyKey;
exports.resolveIdempotencyKey = resolveIdempotencyKey;
exports.registerIdempotencyKey = registerIdempotencyKey;
/** 进程内实现：用于测试与单进程短生命周期接入。 */
class MemoryIdempotencyStore {
    keys = new Map();
    async get(identity) {
        return this.keys.get(identity);
    }
    async putIfAbsent(identity, key) {
        const existing = this.keys.get(identity);
        if (existing !== undefined) {
            return existing;
        }
        this.keys.set(identity, key);
        return key;
    }
    /** 测试辅助：当前键数量。 */
    get size() {
        return this.keys.size;
    }
}
exports.MemoryIdempotencyStore = MemoryIdempotencyStore;
/**
 * 把 `IdempotencyInput` 压成一个稳定的 identity 字符串。
 *
 * 用长度前缀拼接而不是直接 `join(":")`：否则 `["a:b","c"]` 与 `["a","b:c"]`
 * 会撞成同一个 identity，两个不同的业务动作共用一个键。
 */
function identityOf(input) {
    const encoded = input.parts.map((part) => `${part.length}:${part}`).join("|");
    return `${input.scope}#${encoded}`;
}
/**
 * **可复现**的幂等键派生：同输入必得同键（AC10 前半）。
 *
 * 纯字符串哈希（FNV-1a 64 位）而非 `crypto.randomUUID()`：
 * 键必须可复现，否则「重投拿到同一键」无从谈起。
 *
 * **注意**：这里的可复现性只在「调用方还没生成键」时用来兜底。
 * 一旦键进了 store，后续重投一律从 store 取原键（见 `resolveIdempotencyKey`）。
 * 哈希不是密码学安全的——它不需要是：幂等键只需要唯一与稳定，
 * 防篡改由 `X-Signature`（HMAC）负责，两者职责不同（design §10.2）。
 */
function deriveIdempotencyKey(input) {
    const identity = identityOf(input);
    return `idem-${fnv1a64Hex(identity)}`;
}
/**
 * 取键：**先查 store，命中即原样返回；未命中才派生并写入**。
 *
 * 这是 SDK 提供给调用方的唯一取键入口，也是「持久化重放」的实现点：
 * - 首次调用：派生键 → 写入 store → 返回；
 * - 重投调用（同 `input`）：命中 → 返回**同一个键**，store 里键数量不变。
 */
async function resolveIdempotencyKey(input, store) {
    const identity = identityOf(input);
    const existing = await store.get(identity);
    if (existing !== undefined) {
        return existing;
    }
    return store.putIfAbsent(identity, deriveIdempotencyKey(input));
}
/**
 * 调用方**已持有**键时的解析：把它登记进 store 并返回同一个键。
 *
 * 用于「键由接入方业务系统生成」（如 `eventId` 来自业务库主键）的场景——
 * 此时 SDK 不派生，只保证重投拿到的是同一个键。
 */
async function registerIdempotencyKey(input, key, store) {
    return store.putIfAbsent(identityOf(input), key);
}
/** FNV-1a 64 位（BigInt 实现，跨平台一致；避免 32 位哈希的碰撞率）。 */
function fnv1a64Hex(value) {
    const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
    const FNV_PRIME = 0x100000001b3n;
    const MASK = 0xffffffffffffffffn;
    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= BigInt(value.charCodeAt(i));
        hash = (hash * FNV_PRIME) & MASK;
    }
    return hash.toString(16).padStart(16, "0");
}
//# sourceMappingURL=index.js.map