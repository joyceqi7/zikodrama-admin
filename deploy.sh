#!/usr/bin/env bash
set -e

# 完整读取部署函数后再更新仓库，避免执行中混用新旧脚本。
deploy_main() {
  # 测试使用独立 Dockerfile；应用配置由对应环境文件负责。
  cd "$(dirname "$0")"
  project_root=$(pwd)
  case "${1:-test}" in
    test|staging) environment=staging; branch=test; dockerfile=Dockerfile.staging; default_port=5174 ;;
    prod|production) environment=production; branch=main; dockerfile=Dockerfile; default_port=5175 ;;
    *) echo "用法: bash deploy.sh [test|prod]" >&2; exit 1 ;;
  esac
  if [ "$#" -gt 1 ]; then
    echo "用法: bash deploy.sh [test|prod]" >&2
    return 1
  fi

  if [ "${DRAMA_ADMIN_DEPLOY_REEXEC:-}" != 1 ]; then
    printf '>>> 拉取 %s 分支...\n' "$branch"
    git fetch origin "$branch"
    git checkout "$branch"
    git pull --ff-only origin "$branch"
    # 拉取后重新读取最新脚本，内部标记保证只拉取一次。
    DRAMA_ADMIN_DEPLOY_REEXEC=1 exec bash "$project_root/deploy.sh" "$environment"
  fi
  unset DRAMA_ADMIN_DEPLOY_REEXEC

  app_name=drama-admin
  container_name="$app_name-$environment"
  host_port=${DEPLOY_PORT:-$default_port}
  bind_address=${DEPLOY_BIND_ADDRESS:-0.0.0.0}
  commit=$(git rev-parse HEAD)
  version="$(git rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)"
  image="$app_name:$environment-$version"

  # 构建成功后才停止旧容器；依赖安装或编译失败不会中断现有服务。
  docker build -f "$dockerfile" \
    --build-arg "RELEASE_ID=$version" \
    --build-arg "BUILD_COMMIT=$commit" \
    -t "$image" -t "$app_name:$environment-latest" .

  docker stop "$container_name" 2>/dev/null || true
  docker rm "$container_name" 2>/dev/null || true
  docker run -d --name "$container_name" --restart unless-stopped \
    --log-driver json-file --log-opt max-size=20m --log-opt max-file=3 \
    -p "$bind_address:$host_port:80" "$image"

  # 只清理当前环境的历史版本，保留最近 5 个不同镜像。
  docker image ls "$app_name" --format '{{.Tag}} {{.ID}}' \
    | awk -v prefix="$environment-" 'index($1, prefix) == 1 && $1 != prefix "latest" { if (!($2 in rank)) rank[$2] = ++count; if (rank[$2] > 5) print $1 }' \
    | while IFS= read -r tag; do
        docker image rm "$app_name:$tag" 2>/dev/null || true
      done

  printf '容器已启动：%s\n镜像：%s\n访问端口：%s\n' "$container_name" "$image" "$host_port"
  printf '公网入口与同源 API 转发由 drama-nginx 独立管理。\n'
}

deploy_main "$@"
