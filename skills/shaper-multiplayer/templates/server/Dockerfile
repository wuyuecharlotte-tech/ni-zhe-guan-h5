# 边界草稿：代码包（源码）部署的容器构建骨架。
#
# 这是泛化后的版本，不是可直接构建的产物。复制后按游戏实际的 workspace 布局调整
# COPY 行与 CMD，并对照上游 v0.18.0 skill 核对该游戏的启动脚本名。
#
# 为什么必须有它：代码包（源码）部署是容器型产物。上传物不含 node_modules，
# 依赖（含持久化驱动）由云端按 package.json 安装；没有 Dockerfile 会被按函数型处理。
# 部署顺序、环境变量与开通后验收见 ../../references/cloudbase-run.md，
# 持久化驱动的依赖要求见 ../../references/persistence.md。
FROM node:22-bookworm-slim

WORKDIR /app

# 只复制清单与源码：不带上 node_modules、dist、产物或本地 env 文件。
# 各 workspace 的清单必须先于源码复制，npm 才能在安装时解析整棵 workspace。
COPY package.json ./
COPY sdk sdk
COPY client/package.json client/package.json
COPY protocol/package.json protocol/package.json
COPY protocol/src protocol/src
COPY server/package.json server/package.json
COPY server/src server/src
# 只在使用版本化迁移的持久化表时需要；没有持久化时删掉这一行。
COPY server/migrations server/migrations

RUN npm install --legacy-peer-deps --ignore-scripts

# 云托管要求监听 0.0.0.0 与 PORT（云托管上用 3000）。
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# 用 workspace 目录名而不是硬编码包名，避免把示例的包名一起抄走。
# 把 start 换成游戏服务端 package.json 里真正对外启动的脚本：示例里
# co-op-pve 用 `dev`（tsx 直跑源码），生产更适合加一个 `start`。
CMD ["npm", "--workspace", "server", "run", "start"]
