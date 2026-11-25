import { Button, Col, Empty, Flex, Input, Row, Select, Tag, Table, Typography, type TableProps } from 'antd'
import { RefreshCw, ScrollText, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { OperationsApi } from '../../api'
import type { AuditRecord } from '../../domain'
import { toUserMessage } from '../../userMessage'
import { PageHeader, PageStack, SectionHeader } from '../../components/PageHeader'

type ResultFilter = 'all' | 'success' | 'failed'

interface AuditLogProps {
  api: OperationsApi
  notify(message: string, tone?: 'success' | 'error'): void
}

export function AuditLog({ api, notify }: AuditLogProps) {
  const [records, setRecords] = useState<AuditRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [keywordDraft, setKeywordDraft] = useState('')
  const [resultDraft, setResultDraft] = useState<ResultFilter>('all')
  const [keyword, setKeyword] = useState('')
  const [result, setResult] = useState<ResultFilter>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRecords(await api.auditLogs(100))
    } catch (error) {
      notify(toUserMessage(error, '审计日志加载失败，请稍后重试'), 'error')
    } finally {
      setLoading(false)
    }
  }, [api, notify])

  useEffect(() => { void load() }, [load])

  const columns = useMemo<TableProps<AuditRecord>['columns']>(() => [
    { title: '时间', dataIndex: 'createdAt', width: 180, render: formatTime },
    { title: '操作者', dataIndex: 'actorUsername', width: 130, render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
    { title: '应用', dataIndex: 'applicationId', width: 130, render: (value: string | undefined) => <Typography.Text code>{value || '全局'}</Typography.Text> },
    { title: '操作', dataIndex: 'action', render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
    {
      title: '资源',
      render: (_, record) => <>{record.resourceType}{record.resourceId ? <Typography.Text code> · {record.resourceId}</Typography.Text> : null}</>,
    },
    { title: '结果', width: 110, render: (_, record) => <Tag color={record.result === 'success' ? 'success' : 'error'}>{record.result === 'success' ? '成功' : '失败'} · {record.httpStatus}</Tag> },
    { title: 'IP', dataIndex: 'clientIp', width: 150, render: (value: string) => <Typography.Text code>{value || '—'}</Typography.Text> },
  ], [])

  const filtered = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    return records.filter((record) => {
      const text = [record.actorUsername, record.applicationId, record.action, record.resourceType, record.resourceId, record.clientIp].join(' ').toLowerCase()
      return (normalized === '' || text.includes(normalized)) && (result === 'all' || record.result === result)
    })
  }, [keyword, records, result])

  const resetFilters = () => {
    setKeywordDraft('')
    setResultDraft('all')
    setKeyword('')
    setResult('all')
  }

  return (
    <section aria-labelledby="audit-log-title">
      <PageStack>
        <PageHeader eyebrow="查询 RBAC、内容、广告和隐私操作记录。" title="审计日志" id="audit-log-title" actions={<Button size="small" icon={<RefreshCw size={16} />} loading={loading} onClick={() => void load()}>刷新</Button>} />
        <SectionHeader title="操作记录" icon={<ScrollText size={17} />} />
        <Row gutter={[12, 12]} align="middle" aria-label="审计筛选">
          <Col xs={24} md={10}>
            <Input allowClear prefix={<Search size={16} />} aria-label="搜索审计日志" placeholder="搜索操作者、资源或操作" value={keywordDraft} onChange={(event) => setKeywordDraft(event.target.value)} onPressEnter={() => { setKeyword(keywordDraft); setResult(resultDraft) }} />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Select aria-label="审计结果" value={resultDraft} options={[{ value: 'all', label: '全部结果' }, { value: 'success', label: '成功' }, { value: 'failed', label: '失败' }]} onChange={(value) => setResultDraft(value as ResultFilter)} />
          </Col>
          <Col xs={24} sm={12} md={9}>
            <Flex justify="flex-end" gap="small">
              <Button aria-label="重置" onClick={resetFilters}>重置</Button>
              <Button aria-label="查询" type="primary" onClick={() => { setKeyword(keywordDraft); setResult(resultDraft) }}>查询</Button>
            </Flex>
          </Col>
        </Row>
        <Table size="small" rowKey="id" columns={columns} dataSource={filtered} loading={loading} pagination={{ pageSize: 20, showSizeChanger: true }} locale={{ emptyText: <Empty description="暂无审计记录" /> }} scroll={{ x: 900 }} />
      </PageStack>
    </section>
  )
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
