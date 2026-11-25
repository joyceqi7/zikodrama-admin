import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

// 模拟 Git、Docker 和宿主机 Nginx 边界，不操作真实仓库、服务或系统配置。
const fake = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DEPLOY_TEST_CALLS, JSON.stringify(args)+'\\n');
if (args[0] === 'build' && process.env.DRAMA_ADMIN_DEPLOY_REEXEC) process.exit(91);
if (args[0] === 'build' && process.env.FAIL_BUILD) process.exit(1);
if (args[0] === 'run' && process.env.FAIL_RUN) process.exit(1);
if (args[0] === 'image' && args[1] === 'ls') {
 process.stdout.write('staging-latest id1\\nstaging-v1 id1\\nstaging-v2 id2\\nstaging-alias id2\\nstaging-v3 id3\\nstaging-v4 id4\\nstaging-v5 id5\\nstaging-v6 id6\\nproduction-v7 id7\\n');
}
`

function run(t, environment = 'test', flags = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), 'drama-admin deploy-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const bin = resolve(directory, 'bin')
  mkdirSync(bin)
  const project = resolve(directory, 'project with spaces')
  mkdirSync(project)
  writeFileSync(resolve(project, 'deploy.sh'), readFileSync('deploy.sh'))
  writeFileSync(resolve(project, 'updated-deploy.sh'), readFileSync(resolve('deploy.sh'), 'utf8').replace('app_name=drama-admin', 'app_name=drama-admin-updated'))
  const gitFake = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DEPLOY_TEST_CALLS, JSON.stringify(['git', ...args])+'\\n');
if (args[0] === process.env.FAIL_GIT) process.exit(1);
const revisionFile = path.join(process.env.DEPLOY_TEST_PROJECT, 'revision');
if (args[0] === 'pull') {
 fs.writeFileSync(revisionFile, 'b'.repeat(40));
 if (process.env.REPLACE_DEPLOY) fs.copyFileSync(path.join(process.env.DEPLOY_TEST_PROJECT, 'updated-deploy.sh'), path.join(process.env.DEPLOY_TEST_PROJECT, 'deploy.sh'));
}
if (args[0] === 'rev-parse') {
 const revision = fs.existsSync(revisionFile) ? fs.readFileSync(revisionFile, 'utf8') : 'a'.repeat(40);
 process.stdout.write(args.includes('--short') ? revision.slice(0, 7) : revision);
}
`
  writeFileSync(resolve(bin, 'git'), gitFake, { mode: 0o755 })
  writeFileSync(resolve(bin, 'docker'), fake, { mode: 0o755 })
  const gatewayFake = `#!${process.execPath}
const fs = require('node:fs');
const name = require('node:path').basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DEPLOY_TEST_CALLS, JSON.stringify([name, ...args])+'\\n');
process.stderr.write('应用部署不应管理宿主机网关\\n');
process.exit(90);
`
  for (const name of ['install', 'nginx', 'systemctl']) writeFileSync(resolve(bin, name), gatewayFake, { mode: 0o755 })
  const callsFile = resolve(directory, 'calls.jsonl')
  writeFileSync(callsFile, '')
  const env = { ...process.env, DEPLOY_PORT: '', DEPLOY_BIND_ADDRESS: '', ...flags, PATH: `${bin}:${process.env.PATH}`, DEPLOY_TEST_CALLS: callsFile, DEPLOY_TEST_PROJECT: project }
  delete env.DRAMA_ADMIN_DEPLOY_REEXEC
  const args = Array.isArray(environment) ? environment : [environment]
  const result = spawnSync('bash', [resolve(project, 'deploy.sh'), ...args], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 15000,
    env,
  })
  const calls = readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  return { result, calls }
}

for (const [environment, branch, file, port] of [['test', 'test', 'Dockerfile.staging', '5174'], ['staging', 'test', 'Dockerfile.staging', '5174'], ['prod', 'main', 'Dockerfile', '5175'], ['production', 'main', 'Dockerfile', '5175'], [[], 'test', 'Dockerfile.staging', '5174']]) {
  test(`${environment} 使用对应 Dockerfile 并将宿主机端口映射到 Nginx 80`, t => {
    const { result, calls } = run(t, environment)
    assert.equal(result.status, 0, result.stderr)
    const build = calls.find(call => call[0] === 'build')
    assert.deepEqual(calls.slice(0, 3), [['git', 'fetch', 'origin', branch], ['git', 'checkout', branch], ['git', 'pull', '--ff-only', 'origin', branch]])
    assert.equal(calls.filter(call => call[0] === 'git' && call[1] === 'pull').length, 1)
    assert.equal(calls.filter(call => call[0] === 'build').length, 1)
    assert.ok(build.includes('BUILD_COMMIT=' + 'b'.repeat(40)))
    assert.equal(build[build.indexOf('-f') + 1], file)
    const start = calls.find(call => call[0] === 'run')
    assert.equal(start[start.indexOf('-p') + 1], `0.0.0.0:${port}:80`)
    assert.ok(calls.findIndex(call => call[0] === 'build') < calls.findIndex(call => call[0] === 'stop'))
  })
}

for (const stage of ['fetch', 'checkout', 'pull']) {
  test(`Git ${stage} 失败不构建或停止现有容器`, t => {
    const { result, calls } = run(t, 'test', { FAIL_GIT: stage })
    assert.notEqual(result.status, 0)
    assert.ok(!calls.some(call => ['build', 'stop', 'rm', 'run', 'install'].includes(call[0])))
  })
}

test('拉取覆盖正在执行的入口后使用新脚本，且只构建一次', t => {
  const { result, calls } = run(t, 'test', { REPLACE_DEPLOY: '1' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(calls.filter(call => call[0] === 'git' && call[1] === 'pull').length, 1)
  const builds = calls.filter(call => call[0] === 'build')
  assert.equal(builds.length, 1)
  assert.ok(builds[0].includes('drama-admin-updated:staging-latest'))
})

for (const args of [['invalid'], ['test', 'extra']]) {
  test(`无效参数 ${args.join(' ')} 不修改仓库或容器`, t => {
    const { result, calls } = run(t, args)
    assert.notEqual(result.status, 0)
    assert.deepEqual(calls, [])
  })
}

test('构建失败不停止或删除当前容器', t => {
  const { result, calls } = run(t, 'test', { FAIL_BUILD: '1' })
  assert.notEqual(result.status, 0)
  assert.ok(!calls.some(call => ['stop', 'rm', 'run'].includes(call[0])))
})

test('启动失败返回非零状态，不报告容器已启动', t => {
  const { result } = run(t, 'test', { FAIL_RUN: '1' })
  assert.notEqual(result.status, 0)
  assert.ok(!result.stdout.includes('容器已启动'))
})

test('只清理当前环境第六个及更旧的镜像，同镜像别名不重复计数', t => {
  const { result, calls } = run(t)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(calls.filter(call => call[0] === 'image' && call[1] === 'rm'), [['image', 'rm', 'drama-admin:staging-v6']])
})

test('允许覆盖绑定地址和宿主机端口', t => {
  const { result, calls } = run(t, 'test', { DEPLOY_PORT: '9000', DEPLOY_BIND_ADDRESS: '127.0.0.1' })
  assert.equal(result.status, 0, result.stderr)
  const start = calls.find(call => call[0] === 'run')
  assert.equal(start[start.indexOf('-p') + 1], '127.0.0.1:9000:80')
})


for (const environment of ['test', 'production']) {
  test(`${environment} 部署只更新业务容器，不调用宿主机 Nginx 或安装入口配置`, t => {
    const { result, calls } = run(t, environment)
    assert.equal(result.status, 0, result.stderr)
    assert.ok(!calls.some(call => ['install', 'nginx', 'systemctl', 'cp'].includes(call[0])))
    assert.ok(result.stdout.includes('drama-nginx'))
  })
}

// Docker 使用 npm ci，部署验证须检测 npm 锁文件中的直接依赖声明是否同步。
test('Docker 安装依赖所用 npm 锁文件与 package.json 声明一致', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
  for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    assert.deepEqual(lock.packages[''][kind] ?? {}, manifest[kind] ?? {}, `${kind} 未同步到 package-lock.json`)
  }
})

// Alpine 构建依赖 musl 原生绑定，锁文件须覆盖目标架构并与 Rolldown 同版。
test('Docker 显式安装构建和可选依赖并检查 Rolldown 原生绑定', () => {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
  const rolldown = lock.packages['node_modules/rolldown']
  for (const arch of ['x64', 'arm64']) {
    const name = `@rolldown/binding-linux-${arch}-musl`
    assert.equal(lock.packages[`node_modules/${name}`]?.version, rolldown.optionalDependencies[name])
  }
  for (const file of ['Dockerfile', 'Dockerfile.staging']) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /npm ci --include=dev --include=optional/)
    assert.ok(source.includes("await import('rolldown')"))
  }
})
