# 管理后台 Docker 部署

后台工程只构建和发布业务容器，服务器需要 Git、Docker 和 Bash。统一入口由独立 Docker 工程 [drama-nginx](../../drama-nginx/README.md) 管理；后台部署不再安装网关配置，也不要求执行账号有管理宿主机 Nginx 的权限。容器内的 Nginx 负责静态页面、安全响应头和缓存。

## 构建与端口

| 环境 | 命令 | Git 分支 | Dockerfile | 宿主机端口 | 容器 |
| --- | --- | --- | --- | --- | --- |
| 测试 | `bash deploy.sh test` | `test` | `Dockerfile.staging` | 5174 | `drama-admin-staging` |
| 生产 | `bash deploy.sh prod` | `main` | `Dockerfile` | 5175 | `drama-admin-production` |

容器均监听 80，默认发布到所有网络接口。`DEPLOY_PORT` 和 `DEPLOY_BIND_ADDRESS` 可覆盖宿主机端口和绑定地址；覆盖后须同时调整 `drama-nginx` 的回源地址并独立发布网关。

测试后台地址仍为 `http://101.47.11.18`。网关容器通过 host 网络将页面请求转发到 `127.0.0.1:5174`，将同源 `/admin/` 请求直接转发到 `127.0.0.1:18080`。API 域名 `https://testservice.tkdrama.site` 也由同一网关管理。后台静态容器不再配置 API 代理。

## 从原入口迁移

首次切换必须先发布 `drama-nginx`，再发布新版后台。网关先构建 Docker 镜像，并通过只读挂载工程 `certs/` 验证配置；成功后停止旧宿主机 Nginx 服务并启动独立网关容器。旧站点文件保留，启动失败会尝试恢复原入口；细节及证书准备见网关工程 README。旧后台镜像可以通过新网关使用，新后台镜像需要网关负责 `/admin/` 转发。

后台构建不再生成 `.deploy/gateway.conf`，镜像也不携带 `/opt/drama/gateway.conf`。迁移后使用新版部署脚本，旧脚本会重新安装旧入口配置并启动宿主机 Nginx，与网关容器争用端口。回退到旧网关前，应先恢复包含 API 代理的旧后台镜像。

## 应用配置

`.env.staging` 和 `.env.production` 纳入 Git，只维护浏览器 API Origin。测试 `VITE_API_BASE_URL=http://101.47.11.18`，生产应填实际后台 HTTPS Origin，由网关提供同源 API 转发。域名匹配、证书及内网回源统一在 `drama-nginx` 配置，后台已移除 `ADMIN_SERVER_NAME` 和 `ADMIN_API_PROXY_TARGET`。

构建生成 `dist/config.js`、`dist/version.json` 和容器静态 Nginx 配置；修改浏览器 API 地址或环境后重新构建。MySQL、Redis、BytePlus 长期密钥和管理员 JWT 签名密钥不属于后台配置，不能放入前端产物。

Docker 构建沿用锁文件安装依赖。静态资源保留 gzip 预压缩，HTML 要求重新校验，配置文件禁止缓存，带哈希的资源长期缓存。入口 Nginx 使用 HTTP/1.1 回源，保留客户端 gzip 协商。

## 发布行为

```bash
bash deploy.sh test
bash deploy.sh prod
```

`staging` 等同于 `test`，`production` 等同于 `prod`，省略参数默认测试环境。部署入口只保留项目根目录的 `deploy.sh`。

脚本获取并切换到环境分支，再执行 `git pull --ff-only`；拉取后重新执行最新脚本，只拉取一次，并把实际提交号写入镜像版本信息。Git 或构建失败不停止现有容器。首次从不支持自动拉取的旧版本升级时，先手动 `git pull --ff-only`。

构建成功后停止、删除旧容器并启动新镜像，容器自动重启，日志轮转，每个环境保留最近 5 个不同版本镜像。该过程会短暂中断，不自动回滚；Docker 启动命令失败会返回非零状态。容器 `/health` 只验证静态服务，不代表后端 API 或登录成功。业务发布不修改或重载统一入口。

## 验证

```bash
bash -n deploy.sh
node --test scripts/tests/deploy.node-test.mjs
npx pnpm@11.11.0 build:staging
```

部署测试在临时仓库通过命令替身验证分支、自更新、端口、失败保护及镜像清理，并确保业务部署不调用网关安装或服务管理命令。网关工程的真实 Nginx 测试可携带本次后台构建产物：

```bash
DRAMA_ADMIN_DIST="$PWD/dist" DRAMA_ADMIN_NGINX_CONF="$PWD/.deploy/default.conf" \
  python3 ../drama-nginx/scripts/verify_gateway.py
```

此验证覆盖页面、gzip 与模拟 API 转发。服务器发布后仍需通过公开入口验证实际登录，`/version.json` 的 `commit` 应对应本次提交；生产真实域名和证书需由部署环境提供。
