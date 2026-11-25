import { Alert, Button, Card, Col, Flex, Input, Modal, Row, Table, Typography, type TableProps } from 'antd'
import { useEffect, useState } from 'react'
import type { CarouselDrama, CarouselTargets } from '../../homepage'
import { reportOperationFailure } from '../../operationErrors'

interface Props {
  /** title 描述本次添加或更换的栏目。 */
  title: string
  /** configured 保留全部已添加的短剧，并从可选栏排除这些短剧。 */
  configured: CarouselDrama[]
  /** loadTargets 读取当前页面固定渠道的线上候选。 */
  loadTargets(query: string, cursor: string): Promise<CarouselTargets>
  /** capacity 是本次允许加入的剩余名额。 */
  capacity: number
  /** single 在更换栏目关联短剧时只允许选中一部。 */
  single?: boolean
  /** submitting 提交期间保留当前选择并禁止重复操作。 */
  submitting?: boolean
  /** submitError 在保存失败后提示原因，并保留所选短剧。 */
  submitError?: string
  /** onConfirm 传回本次选中的线上短剧，调用方负责更新草稿或保存。 */
  onConfirm(dramas: CarouselDrama[]): void
  /** onClose 关闭弹窗并丢弃本次尚未确认的选择。 */
  onClose(): void
}

/** DramaSelectionModal 沿用授权短剧的分栏样式，按游标翻页并保留本次选中的短剧。 */
export function DramaSelectionModal({ title, configured, loadTargets, capacity, single, submitting, submitError, onConfirm, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [cursors, setCursors] = useState([''])
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState<CarouselTargets>()
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<CarouselDrama[]>([])
  const cursor = cursors[cursors.length - 1]
  const nextCursor = page?.nextCursor
  const loading = !page && !error
  const configuredIds = new Set(configured.map(drama => drama.id))
  const candidates = page?.items.filter(drama => !configuredIds.has(drama.id)) ?? []
  const selectedIds = selected.map(drama => drama.id)
  const blocked = submitting || loading || !!error || !selected.length || selected.length > capacity

  useEffect(() => {
    let active = true
    setPage(undefined)
    setError('')
    void loadTargets(query, cursor).then(result => {
      if (active) setPage(result)
    }).catch(cause => {
      if (active) setError(reportOperationFailure('读取可添加的上线短剧失败', cause))
    })
    return () => { active = false }
  }, [loadTargets, query, cursor, attempt])

  const search = (value: string) => {
    setQuery(value.trim())
    setCursors([''])
  }

  const columns: TableProps<CarouselDrama>['columns'] = [{
    title: '短剧', dataIndex: 'title',
    render: (name: string) => <Typography.Text strong style={{ overflowWrap: 'anywhere' }}>{name}</Typography.Text>,
  }]
  const candidateColumns: TableProps<CarouselDrama>['columns'] = [{
    ...columns[0],
    render: (name: string, drama) => {
      const info = page?.metadata?.[drama.id]
      return <Flex vertical gap={2}>
        <Typography.Text strong style={{ overflowWrap: 'anywhere' }}>{name}</Typography.Text>
        {info && <Typography.Text type="secondary">v{info.version} · {info.applications} 个有效应用</Typography.Text>}
      </Flex>
    },
  }]

  return <Modal open title={title} width={960} onCancel={() => !submitting && onClose()}
    onOk={() => { if (!blocked) onConfirm(selected) }}
    okText={single ? '确认选择' : `添加所选（${selected.length}）`}
    okButtonProps={{ disabled: blocked }} confirmLoading={submitting} cancelText="取消"
    cancelButtonProps={{ disabled: submitting, 'aria-label': '取消' }}
    closable={!submitting} keyboard={!submitting} mask={{ closable: !submitting }}
    styles={{ body: { maxHeight: 'calc(100dvh - 210px)', overflowY: 'auto' } }}>
    <Flex vertical gap="middle">
      <Input.Search aria-label="搜索已上线短剧" placeholder="搜索短剧名称" maxLength={120} allowClear enterButton="搜索"
        disabled={submitting} onSearch={search} onChange={event => { if (!event.target.value && query) search('') }} />
      <Typography.Text type="secondary">
        {single ? '选择一部短剧作为新的关联内容。' : `本次已选 ${selected.length} 部，最多可添加 ${capacity} 部。`}
      </Typography.Text>
      {submitError && <Alert type="error" showIcon title={submitError} />}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card size="small" title="可添加短剧">
            <Flex vertical gap="small">
              {error ? <Alert type="error" showIcon title={error} action={<Button onClick={() => setAttempt(value => value + 1)}>重试</Button>} /> :
                <Table<CarouselDrama> size="small" rowKey="id" columns={candidateColumns} dataSource={candidates}
                  loading={loading} pagination={false} scroll={{ y: 300 }}
                  locale={{ emptyText: loading ? '正在加载短剧' : '本页没有可添加的短剧' }}
                  rowSelection={{
                    type: single ? 'radio' : 'checkbox',
                    selectedRowKeys: selectedIds,
                    preserveSelectedRowKeys: true,
                    // 表头批量勾选也遵守栏目剩余容量，保留跨页选择顺序。
                    onChange: (_keys, rows) => setSelected(rows.slice(0, capacity)),
                    getCheckboxProps: drama => ({
                      'aria-label': `选择 ${drama.title}`,
                      disabled: submitting || loading || (!single && selected.length >= capacity && !selectedIds.includes(drama.id)),
                    }),
                  }} />}
              {(cursors.length > 1 || nextCursor) && <Flex justify="space-between" align="center" gap="small" wrap>
                <Button size="small" disabled={submitting || loading || cursors.length === 1} onClick={() => setCursors(values => values.slice(0, -1))}>上一页</Button>
                <Typography.Text type="secondary">第 {cursors.length} 页</Typography.Text>
                <Button size="small" disabled={submitting || loading || !nextCursor} onClick={() => { if (nextCursor) setCursors(values => [...values, nextCursor]) }}>下一页</Button>
              </Flex>}
            </Flex>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title={`已添加短剧（${configured.length}）`}>
            <Table<CarouselDrama> size="small" rowKey="id" columns={columns} dataSource={configured} scroll={{ y: 300 }}
              pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }} locale={{ emptyText: '尚未添加短剧' }} />
          </Card>
        </Col>
      </Row>
    </Flex>
  </Modal>
}
