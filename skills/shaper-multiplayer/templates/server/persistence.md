# SDK 持久化适配器骨架

新项目从 [完整游戏模板](../game/README.md) 起步，复用 [getRdb](../game/server/runtime/cloudbase-pg.js)。平台注入 CloudBase 环境 ID、地域和 API Key；标准与旧 TCP 迁移要求见 [持久化](../../references/persistence.md)。

下面示范一次 RPC 原子记录奖励；它不是包含余额变更的完整结算。需要余额、库存联动时将所有操作放进同一个函数，并补充并发与回滚验收。玩家身份、奖励金额必须由可信服务端决定。

## 版本化迁移

通过项目迁移入口执行一次，不在 Room 启动或请求路径建表。示例按 CloudBase 的 service_role 设计，部署前确认实际运行身份与该角色的映射并验证授权。

```sql
CREATE TABLE public.reward_ledger (
  game_id text NOT NULL,
  actor_id text NOT NULL,
  command_id text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, actor_id, command_id)
);
ALTER TABLE public.reward_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reward_ledger FROM PUBLIC;
GRANT SELECT, INSERT ON public.reward_ledger TO service_role;
CREATE POLICY reward_ledger_service ON public.reward_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE FUNCTION public.record_reward(
  p_game_id text, p_actor_id text, p_command_id text, p_amount integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE inserted_count integer;
BEGIN
  INSERT INTO public.reward_ledger (game_id, actor_id, command_id, amount)
  VALUES (p_game_id, p_actor_id, p_command_id, p_amount)
  ON CONFLICT (game_id, actor_id, command_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.record_reward(text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_reward(text, text, text, integer) TO service_role;
```

## 服务端适配器

```js
import { getRdb } from '../runtime/cloudbase-pg.js';

export async function writeReward({ gameId, actorId, commandId, amount }) {
  const { data, error } = await getRdb().rpc('record_reward', {
    p_game_id: gameId,
    p_actor_id: actorId,
    p_command_id: commandId,
    p_amount: amount,
  });
  if (error) throw new Error('PERSISTENCE_WRITE_FAILED');
  if (typeof data !== 'boolean') throw new Error('PERSISTENCE_RESPONSE_INVALID');
  return data; // true=本次写入；false=已记录相同命令
}
```

从异步权威命令调用并等待结果，成功后确认奖励。超时使用同一个 commandId 重试，不生成新幂等键。真实验收包括首次写入、相同命令重试不重复写入、非法金额回滚以及未授权玩家被 Room 拒绝；读库成功不能代替这些检查。
