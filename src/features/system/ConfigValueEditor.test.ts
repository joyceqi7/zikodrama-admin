import { expect, test } from 'vitest'
import { configFields, configValue } from './configValueForm'

test('嵌套配置往返保留数组、空值、数字字符串和安全的特殊字段名', () => {
  const original = JSON.parse('{"text":"001","enabled":false,"count":0,"items":[1,"two",null,{"nested":[]}],"empty":{},"__proto__":{"value":true}}')
  expect(configValue(configFields(original))).toEqual(original)
})

test('重复字段和空数字不能静默覆盖或转为零', () => {
  const fields = configFields({one: 1, two: 2})
  fields[1].name = 'one'
  expect(() => configValue(fields)).toThrow('重复')
  fields[1].name = 'two'
  fields[1].value = null
  expect(() => configValue(fields)).toThrow('有效数字')
})
