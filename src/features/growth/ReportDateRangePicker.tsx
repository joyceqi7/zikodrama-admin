import { DatePicker, Flex, Typography } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import zhCN from 'antd/es/date-picker/locale/zh_CN'

/** ReportDateRangePicker 联动选择 UTC 起止日期，限制首尾包含在内最多 90 天。 */
export function ReportDateRangePicker({ id, from, to, onChange }: {
  /** 页面内日期输入标识前缀。 */
  id: string
  /** UTC 开始日期字符串，清空时为空。 */
  from: string
  /** UTC 结束日期字符串，包含当天。 */
  to: string
  /** 完整范围确认或清空时一起更新两个日期，避免半选触发查询。 */
  onChange: (from: string, to: string) => void
}) {
  const hidden = { position: 'absolute' as const, width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }
  return <Flex vertical gap={4} style={{ maxWidth: '100%' }}>
    <Typography.Text>日期范围（UTC）</Typography.Text>
    <label htmlFor={`${id}-from`} style={hidden}>开始日期（UTC）</label>
    <label htmlFor={`${id}-to`} style={hidden}>结束日期（UTC）</label>
    <DatePicker.RangePicker id={{ start: `${id}-from`, end: `${id}-to` }}
      value={from && to ? [dayjs(from).locale('zh-cn'), dayjs(to).locale('zh-cn')] : null}
      locale={zhCN} format="YYYY-MM-DD" inputReadOnly placeholder={['开始日期', '结束日期']}
      style={{ width: 300, maxWidth: '100%' }}
      disabledDate={(date, info) => date.format('YYYY-MM-DD') > new Date().toISOString().slice(0, 10) || Boolean(info.from && Math.abs(date.startOf('day').diff(info.from.startOf('day'), 'day')) > 89)}
      onChange={dates => onChange(dates?.[0]?.format('YYYY-MM-DD') ?? '', dates?.[1]?.format('YYYY-MM-DD') ?? '')} />
  </Flex>
}
