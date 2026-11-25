import { Col, Form, Input, InputNumber, Row, Select } from 'antd'
import type { ReactNode } from 'react'
import { originalAudioLanguageOptions } from '../../audioLanguages'
import type { DramaInput, DramaMetadataReference } from '../../domain'

interface DramaBasicFieldsProps {
  // Input 是编辑中的剧目资料，官方 ID 与审核状态不属于手填内容。
  input: DramaInput
  // OnChange 只更新指定字段，不覆盖分集和已保存的媒资信息。
  onChange: <K extends keyof DramaInput>(key: K, value: DramaInput[K]) => void
  // Metadata 提供官方剧目类型、标签和更新状态选项。
  metadata?: DramaMetadataReference
  // Loading 表示参考数据正在加载。
  loading: boolean
  // Cover 复用父页面的封面上传、重试和进度管理。
  cover: ReactNode
}

// DramaBasicFields 直接展示内容库所需的基础资料和更新状态。
export function DramaBasicFields({ input, onChange, metadata, loading, cover }: DramaBasicFieldsProps) {
  return (
    <section aria-label="短剧信息">
      <Row gutter={[32, 16]}>
        <Col xs={24} md={7}>{cover}</Col>
        <Col xs={24} md={17}>
          <Form.Item label="短剧名称" htmlFor="drama-title" required>
            <Input id="drama-title" aria-label="短剧名称" aria-required maxLength={255} value={input.title} onChange={event => onChange('title', event.target.value)} placeholder="请输入短剧名称" />
          </Form.Item>
          <Form.Item label="短剧简介" htmlFor="drama-description" required>
            <Input.TextArea id="drama-description" aria-label="短剧简介" aria-required rows={3} maxLength={2000} showCount value={input.description} onChange={event => onChange('description', event.target.value)} placeholder="简要介绍剧情" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="原始语言" htmlFor="drama-language" required>
                <Select id="drama-language" showSearch optionFilterProp="label" value={input.language} options={originalAudioLanguageOptions} onChange={language => onChange('language', language)} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="剧目类型" htmlFor="drama-type" required>
                <Select id="drama-type" loading={loading} value={input.dramaType} options={metadata?.dramaTypes} onChange={type => onChange('dramaType', type)} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item label="官方标签" htmlFor="drama-tag-ids" extra="选择 1～3 个标签">
                <Select id="drama-tag-ids" mode="multiple" showSearch optionFilterProp="label" maxCount={3} maxTagCount="responsive" loading={loading} value={input.tagIds} options={metadata?.tags.map(tag => ({ value: tag.id, label: tag.officialName }))} onChange={tags => onChange('tagIds', tags)} placeholder="选择内容标签" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="上线年份" htmlFor="drama-year" required>
                <InputNumber id="drama-year" min={1900} max={2100} value={input.year} onChange={year => onChange('year', year ?? 0)} styles={{ root: { width: '100%' } }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="短剧更新状态" htmlFor="drama-status" extra="确认全部剧集已上传后，可标记为已完结。">
            <Select id="drama-status" loading={loading} value={input.status} options={metadata?.statuses} onChange={status => onChange('status', status)} />
          </Form.Item>
        </Col>
      </Row>
    </section>
  )
}
