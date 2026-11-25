import { expect, test } from 'vitest'
import { applicationAdUnitsError, parseRewardedAdUnits } from './applicationAdUnits'

test('多激励配单插屏可启用，缺失或超限仍拒绝', () => {
  const units = { rewardedVideo: ['9007199254740993', 'reward-b'], interstitial: ['interstitial'] }
  expect(applicationAdUnitsError(units)).toBe('')
  expect(applicationAdUnitsError({ ...units, rewardedVideo: [] })).not.toBe('')
  expect(applicationAdUnitsError({ ...units, rewardedVideo: Array.from({ length: 21 }, (_, i) => String(i)) })).not.toBe('')
  expect(applicationAdUnitsError({ ...units, interstitial: ['a', 'b'] })).not.toBe('')
  expect(parseRewardedAdUnits(' 9007199254740993 \r\nreward-b\nreward-b\n')).toEqual(units.rewardedVideo)
})
