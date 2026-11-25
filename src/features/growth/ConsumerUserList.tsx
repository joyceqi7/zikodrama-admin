import { Alert, Button, Empty, Flex, Form, Input, Select, Table, Typography, type TableProps } from 'antd'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { OperationsApi } from '../../api'
import type { ConsumerUser, ConsumerUserPage, ConsumerUserQuery } from '../../consumerUsers'
import { reportOperationFailure } from '../../operationErrors'
import { PageHeader, PageStack } from '../../components/PageHeader'

interface ConsumerUserListProps {
  // api 提供已认证的用户查询接口。
  api: OperationsApi
  // applicationId 指定所属应用；外壳切换应用时重建页面并重置筛选。
  applicationId: string
  // applicationName 是当前小程序名称；无名称权限或尚未加载时回退展示所属应用 ID。
  applicationName?: string
  // applicationFilter 是外壳提供的应用选择控件。
  applicationFilter?: ReactNode
  // notify 展示已安全映射的错误提示。
  notify(message: string, tone?: 'success' | 'error'): void
}

// ConsumerUserList 提供观众分页、精确搜索和刷新；迟到响应不能覆盖当前查询。
export function ConsumerUserList({ api, applicationId, applicationName, applicationFilter, notify }: ConsumerUserListProps) {
  const columns: TableProps<ConsumerUser>['columns'] = [
    { title: '用户 ID', dataIndex: 'id', width: 260, render: (id: string) => <Typography.Text code>{id}</Typography.Text> },
    { title: '所属小程序', dataIndex: 'applicationId', width: 180, render: (value: string) => value === applicationId ? applicationName || value : value },
    { title: '注册时间', dataIndex: 'createdAt', width: 220, render: (value: string) => {
      const date = new Date(value)
      return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
    } },
  ]
  const [query, setQuery] = useState<ConsumerUserQuery>({ pageSize: 20 })
  const [cursors, setCursors] = useState<string[]>([''])
  const [userId, setUserId] = useState('')
  const [validation, setValidation] = useState('')
  const [result, setResult] = useState<ConsumerUserPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    setResult(null)
    setFailure('')
    if (!applicationId) { setLoading(false); return }
    setLoading(true)
    void api.listConsumerUsers(query, applicationId).then((next) => {
      if (active) setResult(next)
    }).catch((error: unknown) => {
      const message = reportOperationFailure('加载观众用户列表失败', error)
      if (active) { setFailure(message); notify(message, 'error') }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, applicationId, query, refresh, notify])

  const resetPage = (next: ConsumerUserQuery) => {
    setCursors([''])
    setResult(null)
    setQuery(next)
  }

  const search = () => {
    const value = userId.trim()
    if (value && (!/^[1-9]\d{0,19}$/.test(value) || BigInt(value) > 18446744073709551615n)) {
      setValidation('请输入有效的完整用户 ID')
      return
    }
    setValidation('')
    resetPage({ pageSize: query.pageSize, userId: value })
  }

  return <section aria-labelledby="consumer-users-title" aria-busy={loading}>
    <PageStack>
      <PageHeader title="用户列表" id="consumer-users-title" eyebrow="查看小程序观众用户，按应用筛选或输入完整用户 ID 搜索。" actions={<Button size="small" icon={<RefreshCw size={16} />} loading={loading} disabled={!applicationId} onClick={() => { resetPage({ pageSize: query.pageSize, userId: query.userId }); setRefresh((value) => value + 1) }}>刷新</Button>} />
      <Form onFinish={search}>
        <Flex gap="middle" wrap align="end">
          {applicationFilter}
          <Flex vertical gap={4}>
            <label htmlFor="consumer-user-id">用户 ID</label>
            <Input id="consumer-user-id" value={userId} placeholder="输入完整用户 ID" maxLength={20} inputMode="numeric" allowClear onChange={(event) => { setUserId(event.target.value); setValidation('') }} aria-invalid={!!validation} aria-describedby={validation ? 'consumer-user-id-error' : undefined} />
          </Flex>
          <Button type="primary" htmlType="submit" disabled={!applicationId}>查询</Button>
          <Button onClick={() => { setUserId(''); setValidation(''); resetPage({ pageSize: query.pageSize }) }}>重置</Button>
        </Flex>
        {validation && <Typography.Paragraph id="consumer-user-id-error" type="danger" role="alert">{validation}</Typography.Paragraph>}
      </Form>
      {failure && <Alert type="error" showIcon title={failure} action={<Button size="small" onClick={() => setRefresh((value) => value + 1)}>重试</Button>} />}
      <Table<ConsumerUser> size="small" rowKey="id" columns={columns} dataSource={result?.items ?? []} loading={loading} scroll={{ x: 660 }}
        locale={{ emptyText: <Empty description={!applicationId ? '请先选择应用' : failure ? '用户列表加载失败，请重试' : loading ? '正在加载用户…' : query.userId ? '未找到匹配用户' : '该应用暂无用户'} /> }}
        pagination={false} />
      <Flex gap="middle" align="center" justify="end" wrap aria-label="用户列表分页">
        <Typography.Text role="status">第 {cursors.length} 页 · 本页 {result?.items.length ?? 0} 条</Typography.Text>
        <Select aria-label="每页条数" value={query.pageSize} disabled={loading || !applicationId} options={[20, 50, 100].map((value) => ({ value, label: `${value} 条/页` }))} onChange={(pageSize) => resetPage({ pageSize, userId: query.userId })} />
        <Button disabled={loading || cursors.length === 1 || !applicationId} onClick={() => {
          const previous = cursors.slice(0, -1)
          setCursors(previous)
          setResult(null)
          setQuery({ ...query, cursor: previous.at(-1) || undefined })
        }}>上一页</Button>
        <Button disabled={loading || !result?.hasMore || !result.nextCursor || !applicationId} onClick={() => {
          if (!result?.nextCursor) return
          setCursors((current) => [...current, result.nextCursor])
          setQuery({ ...query, cursor: result.nextCursor })
          setResult(null)
        }}>下一页</Button>
      </Flex>
    </PageStack>
  </section>
}
