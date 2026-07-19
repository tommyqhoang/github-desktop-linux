import { parseResolvedCommand } from '../../src/lib/ai/local-cli-provider'

describe('parseResolvedCommand', () => {
  it('extracts a command path after noisy interactive shell output', () => {
    expect(
      parseResolvedCommand(
        'shell startup message\n__GITHUB_DESKTOP_COMMAND__/home/user/.local/bin/codex\n'
      )
    ).toBe('/home/user/.local/bin/codex')
  })

  it('uses the last marker', () => {
    expect(
      parseResolvedCommand(
        '__GITHUB_DESKTOP_COMMAND__/old/claude\n__GITHUB_DESKTOP_COMMAND__/new/claude\n'
      )
    ).toBe('/new/claude')
  })

  it('returns null when the shell did not find the command', () => {
    expect(parseResolvedCommand('shell startup message\n')).toBeNull()
  })
})
