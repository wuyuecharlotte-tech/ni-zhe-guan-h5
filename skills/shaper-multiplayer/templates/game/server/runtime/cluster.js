import { RedisDriver } from "@colyseus/redis-driver";
import { RedisPresence } from "@colyseus/redis-presence";
function integer(value, name) {
    if (value === undefined || value === "")
        return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535)
        throw new Error(`${name} must be an integer from 0 to 65535`);
    return parsed;
}
function firstNonEmpty(...values) {
    for (const value of values)
        if (value)
            return value;
    return "";
}
/**
 * Single resolution point for the Redis namespace. Precedence:
 * `config.namespace` → `config.keyPrefix` (alias) → `REDIS_NAMESPACE` → `REDIS_KEY_PREFIX` → `""`.
 * An empty result is the supported degenerate path: keys and channels stay exactly as before.
 */
export function namespacePrefix(config = {}) {
    return firstNonEmpty(config.namespace, config.keyPrefix, process.env.REDIS_NAMESPACE, process.env.REDIS_KEY_PREFIX);
}
/** Prefix a Pub/Sub channel name. Identity when `namespace` is empty. */
export function namespaceChannel(namespace, channel) {
    return namespace ? `${namespace}${channel}` : channel;
}
/** Strip the namespace from a channel name returned by Redis. Identity when absent. */
export function stripNamespace(namespace, channel) {
    return namespace !== "" && channel.startsWith(namespace) ? channel.slice(namespace.length) : channel;
}
export function redisOptions(config = {}) {
    const url = new URL(config.url ?? process.env.REDIS_URL ?? "");
    if (!["redis:", "rediss:"].includes(url.protocol))
        throw new Error("REDIS_URL must use redis:// or rediss://");
    if (!url.hostname)
        throw new Error("REDIS_URL must include a hostname");
    const port = integer(url.port || "6379", "Redis port");
    const pathDb = url.pathname && url.pathname !== "/" ? integer(url.pathname.slice(1), "Redis database") : undefined;
    const db = config.db ?? integer(process.env.REDIS_DB, "REDIS_DB") ?? pathDb;
    if (db !== undefined && db > 15)
        throw new Error("REDIS_DB must be between 0 and 15");
    const password = config.password ?? process.env.REDIS_PASSWORD ?? (url.password ? decodeURIComponent(url.password) : undefined);
    const options = { host: url.hostname, port, db };
    if (url.username)
        options.username = decodeURIComponent(url.username);
    if (password)
        options.password = password;
    if (url.protocol === "rediss:")
        options.tls = {};
    const namespace = namespacePrefix(config);
    if (namespace)
        options.keyPrefix = namespace;
    return options;
}
/**
 * `RedisPresence` with namespaced Pub/Sub channels.
 *
 * ioredis `keyPrefix` only rewrites keys, never channels (nor the `PUBSUB CHANNELS`
 * pattern), so channels have to be prefixed by hand. Only the four channel methods are
 * overridden; every key method is inherited and covered by `keyPrefix`.
 *
 * `subscribe`/`unsubscribe` delegate to `super` with the prefixed topic, so the base
 * class registers the prefixed name and re-subscribes it verbatim after a reconnect.
 * `channels()` queries with the prefixed pattern but returns bare names, because core's
 * `healthCheckAllProcesses()` strips a fixed `p:` prefix from each result — returning
 * prefixed names would mark every live process as dead and amplify destructive health checks.
 */
export class NamespacedPresence extends RedisPresence {
    namespace;
    constructor(namespace, options, clusterOptions) {
        super(options, clusterOptions);
        this.namespace = namespace;
    }
    async subscribe(topic, callback) {
        return super.subscribe(namespaceChannel(this.namespace, topic), callback);
    }
    async unsubscribe(topic, callback) {
        return super.unsubscribe(namespaceChannel(this.namespace, topic), callback);
    }
    async publish(topic, data) {
        return super.publish(namespaceChannel(this.namespace, topic), data);
    }
    async channels(pattern = "*") {
        const channels = await super.channels(namespaceChannel(this.namespace, pattern));
        return channels.map((channel) => stripNamespace(this.namespace, channel));
    }
}
export function createClusterServices(config = {}) {
    const namespace = namespacePrefix(config);
    if (!namespace)
        throw new Error("REDIS_NAMESPACE is required for cluster isolation");
    const redis = redisOptions(config);
    return { redis, namespace, presence: new NamespacedPresence(namespace, redis), driver: new RedisDriver(redis) };
}
/** Build the Colyseus options shared by every process in a Redis-backed cluster. */
export function createClusterServerOptions(options) {
    const { redis: _redis, ...serverOptions } = options;
    const publicAddress = serverOptions.publicAddress ?? process.env.SHAPER_PUBLIC_ADDRESS;
    if (!publicAddress)
        throw new Error("SHAPER_PUBLIC_ADDRESS or publicAddress is required for clustered deployment");
    const services = createClusterServices(options.redis);
    return { ...serverOptions, publicAddress, presence: services.presence, driver: services.driver };
}
