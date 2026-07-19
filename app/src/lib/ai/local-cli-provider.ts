import { execFile, spawn } from 'child_process'
import { userInfo } from 'os'
import { Repository } from '../../models/repository'
import { ICommitMessage } from '../../models/commit-message'
import {
  IAICommitMessageProvider,
  parseAICommitMessageResponse,
} from './commit-message'
import { AICommitMessageProvider } from './commit-message-settings'

const LocalAITimeoutMs = 60_000
const MaxOutputLength = 1024 * 1024
const ShellProbeTimeoutMs = 5_000
const ShellProbeMarker = '__GITHUB_DESKTOP_COMMAND__'

const resolvedCommands = new Map<string, Promise<string>>()

/**
 * Extract the command path from a login-shell probe. Interactive shell startup
 * files are allowed to print output, so the result is identified by a marker.
 */
export function parseResolvedCommand(output: string): string | null {
  const markerIndex = output.lastIndexOf(ShellProbeMarker)
  if (markerIndex === -1) {
    return null
  }

  const path = output
    .slice(markerIndex + ShellProbeMarker.length)
    .split(/\r?\n/, 1)[0]
    .trim()

  return path.length > 0 ? path : null
}

/** Resolve a CLI using the user's login shell instead of Electron's PATH. */
function resolveLocalCLI(command: string): Promise<string> {
  if (__WIN32__) {
    return Promise.resolve(command)
  }

  const cached = resolvedCommands.get(command)
  if (cached !== undefined) {
    return cached
  }

  const resolution = new Promise<string>(resolve => {
    const shell = process.env.SHELL || userInfo().shell || '/bin/sh'
    const script = `command_path=$(command -v -- "$1") && printf '${ShellProbeMarker}%s\\n' "$command_path"`

    execFile(
      shell,
      ['-ilc', script, 'github-desktop', command],
      {
        env: process.env,
        timeout: ShellProbeTimeoutMs,
        maxBuffer: 64 * 1024,
      },
      (_error, stdout) => resolve(parseResolvedCommand(stdout) || command)
    )
  })

  resolvedCommands.set(command, resolution)
  return resolution
}

async function runLocalAI(
  command: string,
  args: ReadonlyArray<string>,
  prompt: string,
  cwd: string
): Promise<string> {
  const resolvedCommand = await resolveLocalCLI(command)

  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, [...args], {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      if (error === undefined) {
        resolve(stdout)
      } else {
        reject(error)
      }
    }

    const timeout = setTimeout(() => {
      child.kill()
      finish(new Error(`${command} timed out after 60 seconds.`))
    }, LocalAITimeoutMs)

    child.on('error', error => {
      const message =
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? `${command} is not installed or is not available on PATH.`
          : `Unable to start ${command}: ${error.message}`
      finish(new Error(message))
    })
    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
      if (stdout.length > MaxOutputLength) {
        child.kill()
        finish(new Error(`${command} returned too much output.`))
      }
    })
    child.stderr.on('data', chunk => {
      if (stderr.length < MaxOutputLength) {
        stderr += chunk.toString()
      }
    })
    child.on('close', code => {
      if (code === 0) {
        finish()
      } else {
        const detail = stderr.trim()
        finish(
          new Error(
            `${command} exited with code ${code ?? 'unknown'}${
              detail.length > 0 ? `: ${detail}` : '.'
            }`
          )
        )
      }
    })

    child.stdin.end(prompt)
  })
}

export function createLocalCLICommitMessageProvider(
  provider: Exclude<AICommitMessageProvider, 'openrouter'>,
  repository: Repository,
  model?: string
): IAICommitMessageProvider {
  return {
    async generate(prompt: string): Promise<ICommitMessage> {
      const modelArgs =
        model === undefined || model.length === 0 ? [] : ['--model', model]
      const output =
        provider === 'codex'
          ? await runLocalAI(
              'codex',
              [
                'exec',
                ...modelArgs,
                '--ephemeral',
                '--sandbox',
                'read-only',
                '--skip-git-repo-check',
                '-',
              ],
              prompt,
              repository.path
            )
          : await runLocalAI(
              'claude',
              [
                '-p',
                ...modelArgs,
                '--output-format',
                'text',
                '--max-turns',
                '1',
                '--tools',
                '',
              ],
              prompt,
              repository.path
            )

      return parseAICommitMessageResponse(output)
    },
  }
}
