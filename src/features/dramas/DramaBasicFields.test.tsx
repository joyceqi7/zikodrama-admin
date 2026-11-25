import { fireEvent, render, screen } from '@testing-library/react'
import { Form } from 'antd'
import { expect, test, vi } from 'vitest'
import { emptyDramaInput } from '../../domain'
import { DramaBasicFields } from './DramaBasicFields'

test('基础资料保留官方所需信息，更新状态直接展示且不改写已有值', () => {
  const onChange = vi.fn()
  render(<Form layout="vertical"><DramaBasicFields input={{ ...emptyDramaInput(), status: 'completed' }} onChange={onChange} loading={false} cover={<span>封面上传</span>} /></Form>)
  expect(screen.getByRole('textbox', {name:'短剧名称'})).toBeInTheDocument()
  expect(screen.getByRole('textbox', {name:'短剧简介'})).toBeInTheDocument()
  expect(screen.getByRole('combobox', {name:/短剧更新状态/})).toBeVisible()
  expect(screen.queryByRole('button', {name:/更新状态设置/})).not.toBeInTheDocument()
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox', {name:'短剧名称'}), {target:{value:'新的剧名'}})
  expect(onChange).toHaveBeenCalledWith('title','新的剧名')
})
