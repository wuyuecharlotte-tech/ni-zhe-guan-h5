/**
 * 配置定义（design §4.3）——接入的唯一入口，也是「配置驱动」的输入。协议单一来源：server DTO 与 SDK DTO 都由本 schema 校验。
 */
export interface TimeflowDefinition {
    /**
     * 工作区标识（不透明；平台不解析其内容）
     */
    workspaceId: string;
    /**
     * 单调递增；同版本重放返回同一结果
     */
    definitionVersion: number;
    /**
     * 协议版本；主版本不兼容直接拒绝
     */
    protocolVersion: number;
    /**
     * 工作区声明的作用域类型，例如 member、device、subscription、case
     *
     * @minItems 1
     */
    scopeTypes: [string, ...string[]];
    /**
     * 可观测或计算的数值维度；平台不假定货币、资源或资产语义
     *
     * @minItems 1
     */
    metrics: [
        {
            metricId: string;
            /**
             * 精度 0..6（0 = 整数货币）；precision=0 时按余数跨段累加、段末结转
             */
            precision: number;
            /**
             * 指标上限（字符串十进制或 null）
             */
            cap?: string | null;
            /**
             * 上限执行者与作用域；v1 仅支持 stream（U12）
             */
            capScope?: "stream" | "scope";
            /**
             * 保留字段；v1 拒绝共享指标，跨作用域分配属于下游系统
             */
            shared?: boolean;
            [k: string]: unknown;
        },
        ...{
            metricId: string;
            /**
             * 精度 0..6（0 = 整数货币）；precision=0 时按余数跨段累加、段末结转
             */
            precision: number;
            /**
             * 指标上限（字符串十进制或 null）
             */
            cap?: string | null;
            /**
             * 上限执行者与作用域；v1 仅支持 stream（U12）
             */
            capScope?: "stream" | "scope";
            /**
             * 保留字段；v1 拒绝共享指标，跨作用域分配属于下游系统
             */
            shared?: boolean;
            [k: string]: unknown;
        }[]
    ];
    /**
     * 业务单次结算最大有效离线时长（ms）；实际值取本值与平台硬上限的较小值，超出则封顶
     */
    maxOfflineTime: number;
    /**
     * 流定义：平台不解释流的业务含义，只用它匹配上报的 streamKey
     *
     * @minItems 1
     */
    stream: [
        {
            /**
             * 流匹配模式（如 usage:{id}）
             */
            streamPattern: string;
            /**
             * 资源类型展示名称；仅用于管理和排障
             */
            displayName?: string;
            metricId: string;
            ruleKey: string;
            /**
             * 必须显式声明且能在 rule_registry 解析到不可变实现（禁止默认兜底）
             */
            ruleVersion: number;
            carrier?: "interpreter" | "spi" | "function";
            /**
             * finite stream instances end in a zero-rate terminal phase and require a new streamKey for a new instance; continuous streams remain active
             */
            lifecycle?: "finite" | "continuous";
            artifact?: string | null;
            /**
             * 解释器可执行的全部内容（受限运算：baseRate / capacity / until）
             *
             * @minItems 1
             */
            phases: [
                {
                    name: string;
                    /**
                     * 基础速率（单位/毫秒），字符串十进制
                     */
                    baseRate: string;
                    /**
                     * 相位容量上限（字符串十进制或 null）
                     */
                    capacity?: string | null;
                    /**
                     * 相位终止条件——必须**有界**（设计校验 2）
                     */
                    until: {
                        kind: "progress" | "event" | "immortal";
                        value?: string | number | null;
                    };
                    [k: string]: unknown;
                },
                ...{
                    name: string;
                    /**
                     * 基础速率（单位/毫秒），字符串十进制
                     */
                    baseRate: string;
                    /**
                     * 相位容量上限（字符串十进制或 null）
                     */
                    capacity?: string | null;
                    /**
                     * 相位终止条件——必须**有界**（设计校验 2）
                     */
                    until: {
                        kind: "progress" | "event" | "immortal";
                        value?: string | number | null;
                    };
                    [k: string]: unknown;
                }[]
            ];
            /**
             * 按离线时长衰减的修正（after 毫秒之后生效）
             */
            decay?: {
                stat: "rate" | "capacity";
                op: "add" | "mul";
                value: string;
                after: number;
            }[];
            [k: string]: unknown;
        },
        ...{
            /**
             * 流匹配模式（如 usage:{id}）
             */
            streamPattern: string;
            /**
             * 资源类型展示名称；仅用于管理和排障
             */
            displayName?: string;
            metricId: string;
            ruleKey: string;
            /**
             * 必须显式声明且能在 rule_registry 解析到不可变实现（禁止默认兜底）
             */
            ruleVersion: number;
            carrier?: "interpreter" | "spi" | "function";
            /**
             * finite stream instances end in a zero-rate terminal phase and require a new streamKey for a new instance; continuous streams remain active
             */
            lifecycle?: "finite" | "continuous";
            artifact?: string | null;
            /**
             * 解释器可执行的全部内容（受限运算：baseRate / capacity / until）
             *
             * @minItems 1
             */
            phases: [
                {
                    name: string;
                    /**
                     * 基础速率（单位/毫秒），字符串十进制
                     */
                    baseRate: string;
                    /**
                     * 相位容量上限（字符串十进制或 null）
                     */
                    capacity?: string | null;
                    /**
                     * 相位终止条件——必须**有界**（设计校验 2）
                     */
                    until: {
                        kind: "progress" | "event" | "immortal";
                        value?: string | number | null;
                    };
                    [k: string]: unknown;
                },
                ...{
                    name: string;
                    /**
                     * 基础速率（单位/毫秒），字符串十进制
                     */
                    baseRate: string;
                    /**
                     * 相位容量上限（字符串十进制或 null）
                     */
                    capacity?: string | null;
                    /**
                     * 相位终止条件——必须**有界**（设计校验 2）
                     */
                    until: {
                        kind: "progress" | "event" | "immortal";
                        value?: string | number | null;
                    };
                    [k: string]: unknown;
                }[]
            ];
            /**
             * 按离线时长衰减的修正（after 毫秒之后生效）
             */
            decay?: {
                stat: "rate" | "capacity";
                op: "add" | "mul";
                value: string;
                after: number;
            }[];
            [k: string]: unknown;
        }[]
    ];
    /**
     * 资源上限速查表（metricId → 字符串十进制）
     */
    caps?: {
        [k: string]: string;
    };
    /**
     * 业务自定义定时任务定义（U23 已裁决：去中心化 peer 调度与执行）
     */
    tasks?: {
        taskKey: string;
        /**
         * 任务展示名称；仅用于管理和排障，不参与调度身份
         */
        displayName?: string;
        cron: string;
        timezone?: string;
        enabled?: boolean;
        selector: TaskSelector;
        action: TaskAction;
        maxConcurrency?: number;
        batchSize?: number;
        routeStrategy?: "ROUND_ROBIN" | "FAILOVER" | "BUSY_OVER";
        timeoutMs?: number;
        retryLimit?: number;
        misfirePolicy?: "GRACE" | "SKIP" | "CATCH_UP";
    }[];
    /**
     * Definition-declared ruleData fields that task selectors may reference
     */
    ruleDataFields?: string[];
    /**
     * Optional generic change-event distribution to deployment-bound subscribers.
     */
    delivery?: {
        enabled?: boolean;
        mode?: "shadow" | "live";
        includeSourceStreams?: boolean;
        /**
         * @maxItems 32
         */
        subscribers?: {
            key: string;
            /**
             * 回调订阅展示名称；仅用于管理和排障，不参与订阅身份
             */
            displayName?: string;
            version: number;
            /**
             * @minItems 1
             */
            metrics: [string, ...string[]];
            authoritativeMetrics?: string[];
            /**
             * @minItems 1
             */
            eventKinds: [string, ...string[]];
        }[];
    };
    /**
     * 变化事件类型的展示名称映射；不写入历史事件 payload
     *
     * @maxItems 128
     */
    events?: {
        kind: string;
        displayName: string;
        description?: string;
    }[];
    taskSelector?: TaskSelector;
    taskAction?: TaskAction;
    [k: string]: unknown;
}
export interface TaskSelector {
    scopeType: string;
    streamPattern?: string;
    ruleKey?: string;
    /**
     * @maxItems 64
     */
    phaseIndexIn?: number[];
    /**
     * @maxItems 16
     */
    where?: [] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ] | [
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        },
        {
            field: string;
            op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "prefix";
            value: string;
        }
    ];
    orderBy?: string;
    limit: number;
}
export interface TaskAction {
    kind: "APPLY_WINDOW" | "EMIT_POINT" | "TRIGGER_SETTLE" | "NOTIFY" | "EVICT_CACHE";
    metricId?: string;
    streamKeyTemplate?: string;
    stat?: "rate" | "capacity";
    op?: "add" | "mul";
    value?: string;
    /**
     * APPLY_WINDOW 的持续时间；激活校验要求不超过平台 maxOfflineTime
     */
    durationMs?: number;
    pointKind?: string;
    source?: string;
    idempotency?: string;
    [k: string]: unknown;
}
//# sourceMappingURL=definition.d.ts.map