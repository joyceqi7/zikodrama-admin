import { Alert, Button, Card, Col, Flex, Input, Modal, Row, Table, Tag, Typography, type TableProps } from 'antd'
import { useEffect, useState } from 'react'
import type { ApplicationDramaAuthorizationItem, ApplicationDramaAuthorizationQuery, OperationsApi } from '../../api'
import type { Application } from '../../applications'
import { reportOperationFailure } from '../../operationErrors'

interface Props {
  // api 按应用分别读取未授权与已有授权流程的短剧，并提交明确选择。
  api: OperationsApi
  // application 是本次授权的明确目标，弹窗打开期间不随外壳应用筛选变化。
  application: Application
  // onClose 关闭弹窗并丢弃尚未提交的选择。
  onClose(): void
  // notify 展示平台确认的授权数量。
  notify(message: string, tone?: 'success' | 'error'): void
}

const pageSize = 20

// useAuthorizationPage 分别维护两栏分页；旧请求返回时不覆盖新的搜索结果。
function useAuthorizationPage(api: OperationsApi, applicationId: string, view: ApplicationDramaAuthorizationQuery['view'], page: number, query: string, revision: number) {
  const [state, setState] = useState<{ items: ApplicationDramaAuthorizationItem[]; total: number; loading: boolean; error: string }>({ items: [], total: 0, loading: true, error: '' })
  useEffect(() => {
    let active = true
    setState((current) => ({ ...current, loading: true, error: '' }))
    void api.listApplicationDramaAuthorizations(applicationId, { page, pageSize, query, view }).then((result) => {
      if (active) setState({ items: result.items, total: result.total, loading: false, error: '' })
    }).catch((cause) => {
      if (!active) return
      setState({ items: [], total: 0, loading: false, error: reportOperationFailure(`load ${view} application drama authorizations failed`, cause) })
    })
    return () => { active = false }
  }, [api, applicationId, view, page, query, revision])
  return state
}

const statusLabels: Record<ApplicationDramaAuthorizationItem['status'], string> = {
  none: '未授权', owner: '发布方', pending: '处理中', authorized: '已授权', failed: '自动重试中', attention_required: '需人工处理',
}

// ApplicationDramaAuthorizationModal 分栏展示真实授权状态，只有未授权栏可跨页选择并提交。
export function ApplicationDramaAuthorizationModal({ api, application, onClose, notify }: Props) {
  const [availablePage, setAvailablePage] = useState(1)
  const [trackedPage, setTrackedPage] = useState(1)
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [selectedIDs, setSelectedIDs] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const available = useAuthorizationPage(api, application.id, 'available', availablePage, query, revision)
  const tracked = useAuthorizationPage(api, application.id, 'tracked', trackedPage, query, revision)
  const blocked = available.loading || tracked.loading || !!available.error || !!tracked.error

  const submit = async () => {
    if (saving || blocked || selectedIDs.length === 0 || selectedIDs.length > 1000) return
    setSaving(true)
    setError('')
    try {
      const result = await api.authorizeApplicationDramas(application.id, selectedIDs)
      notify(result.authorizedCount > 0 ? `已将 ${result.authorizedCount} 部短剧完成授权` : '所选短剧已授权')
      onClose()
    } catch (cause) {
      setError(reportOperationFailure('authorize application dramas failed', cause))
    } finally {
      setSaving(false)
    }
  }

  const availableColumns: TableProps<ApplicationDramaAuthorizationItem>['columns'] = [
    { title: '短剧', dataIndex: 'title', key: 'title', render: (title: string) => <Typography.Text strong>{title}</Typography.Text> },
  ]
  const trackedColumns: TableProps<ApplicationDramaAuthorizationItem>['columns'] = [
    { title: '短剧', dataIndex: 'title', key: 'title', render: (title: string) => <Typography.Text strong>{title}</Typography.Text> },
    { title: '状态', key: 'status', width: 112, render: (_, item) => <Tag color={item.status === 'authorized' ? 'green' : item.status === 'owner' ? 'blue' : ['failed', 'attention_required'].includes(item.status) ? 'red' : undefined}>{statusLabels[item.status]}</Tag> },
  ]

  return <Modal
    open
    title={`为 ${application.name} 授权短剧`}
    width={960}
    onCancel={saving ? undefined : onClose}
    onOk={() => void submit()}
    okText={`授权所选（${selectedIDs.length}）`}
    okButtonProps={{ disabled: blocked || selectedIDs.length === 0 || selectedIDs.length > 1000 }}
    confirmLoading={saving}
    cancelText="取消"
  >
    <Flex vertical gap="middle">
      <Flex wrap gap="small">
        <Input.Search
          aria-label="搜索已上线短剧"
          placeholder="搜索短剧名称"
          style={{ flex: '1 1 240px' }}
          maxLength={200}
          allowClear
          onSearch={(value) => { setAvailablePage(1); setTrackedPage(1); setQuery(value.trim()) }}
          onChange={(event) => { if (!event.target.value && query) { setAvailablePage(1); setTrackedPage(1); setQuery('') } }}
        />
        <Button disabled={saving} onClick={() => setRevision((value) => value + 1)}>刷新状态</Button>
      </Flex>
      <Typography.Text type="secondary">从未授权栏选择短剧；授权状态栏展示已授权、处理中及失败状态。已选择 {selectedIDs.length} 部。</Typography.Text>
      {selectedIDs.length > 1000 && <Alert type="warning" showIcon title="每次最多选择 1000 部短剧" />}
      {error && <Alert type="error" showIcon title={error} />}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card size="small" title={`未授权短剧（${available.total}）`}>
            {available.error ? <Alert type="error" showIcon title={available.error} action={<Button aria-label="重试加载未授权短剧" onClick={() => setRevision((value) => value + 1)}>重试</Button>} /> : <Table<ApplicationDramaAuthorizationItem>
              size="small"
              rowKey="id"
              loading={available.loading}
              dataSource={available.items}
              columns={availableColumns}
              rowSelection={{ selectedRowKeys: selectedIDs, preserveSelectedRowKeys: true, onChange: (keys) => setSelectedIDs(keys.map(String)), getCheckboxProps: (record) => ({ 'aria-label': `选择 ${record.title}` }) }}
              pagination={{ current: availablePage, pageSize, total: available.total, showSizeChanger: false, onChange: setAvailablePage, hideOnSinglePage: true }}
              scroll={{ y: 320 }}
              locale={{ emptyText: query ? '没有匹配的未授权短剧' : '暂无未授权短剧' }}
            />}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title={`授权状态（${tracked.total}）`}>
            {tracked.error ? <Alert type="error" showIcon title={tracked.error} action={<Button aria-label="重试加载授权状态" onClick={() => setRevision((value) => value + 1)}>重试</Button>} /> : <Table<ApplicationDramaAuthorizationItem>
              size="small"
              rowKey="id"
              loading={tracked.loading}
              dataSource={tracked.items}
              columns={trackedColumns}
              pagination={{ current: trackedPage, pageSize, total: tracked.total, showSizeChanger: false, onChange: setTrackedPage, hideOnSinglePage: true }}
              scroll={{ y: 320 }}
              locale={{ emptyText: query ? '没有匹配的授权记录' : '暂无授权记录' }}
            />}
          </Card>
        </Col>
      </Row>
    </Flex>
  </Modal>
}
