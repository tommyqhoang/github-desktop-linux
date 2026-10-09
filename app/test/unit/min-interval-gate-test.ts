import { MinIntervalGate } from '../../src/lib/min-interval-gate'

describe('MinIntervalGate', () => {
  it('lets the first attempt through', () => {
    expect(new MinIntervalGate<number>(3000).tryPass(1, 0)).toBe(true)
  })

  it('blocks attempts inside the interval and allows them after it', () => {
    const gate = new MinIntervalGate<number>(3000)
    expect(gate.tryPass(1, 0)).toBe(true)
    expect(gate.tryPass(1, 1)).toBe(false)
    expect(gate.tryPass(1, 2999)).toBe(false)
    expect(gate.tryPass(1, 3000)).toBe(true)
  })

  it('measures the interval from the last pass, not the last attempt', () => {
    const gate = new MinIntervalGate<number>(3000)
    gate.tryPass(1, 0)
    // Blocked attempts must not push the window forward, or a steady stream
    // of events would starve the action forever.
    expect(gate.tryPass(1, 2000)).toBe(false)
    expect(gate.tryPass(1, 2900)).toBe(false)
    expect(gate.tryPass(1, 3000)).toBe(true)
  })

  it('tracks keys independently', () => {
    const gate = new MinIntervalGate<number>(3000)
    expect(gate.tryPass(1, 0)).toBe(true)
    expect(gate.tryPass(2, 1)).toBe(true)
    expect(gate.tryPass(1, 2)).toBe(false)
  })

  it('reset lets the next attempt through', () => {
    const gate = new MinIntervalGate<number>(3000)
    gate.tryPass(1, 0)
    gate.reset(1)
    expect(gate.tryPass(1, 1)).toBe(true)
  })

  it('defaults to the current time', () => {
    const gate = new MinIntervalGate<string>(60_000)
    expect(gate.tryPass('k')).toBe(true)
    expect(gate.tryPass('k')).toBe(false)
  })
})
