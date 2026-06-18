import { git } from './core'
import { Repository } from '../../models/repository'
import { Blame, IBlameLine } from '../../models/blame'

/** Mutable accumulator for the commit metadata Git reports once per commit. */
interface ICommitInfo {
  author: string
  authorMail: string
  authorTime: number
  summary: string
  previousSha: string | null
}

const HEADER_RE = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/

function stripAngleBrackets(mail: string): string {
  return mail.replace(/^<(.*)>$/, '$1')
}

/**
 * Parse the output of `git blame --porcelain`.
 *
 * The porcelain format emits, for each line, a header
 * (`<sha> <orig-line> <final-line> [<group-size>]`) followed by commit
 * metadata — but the metadata block is suppressed for lines that repeat a
 * commit already seen. We cache each commit's metadata by SHA so repeated
 * lines are filled in from the cache. The line content is the TAB-prefixed
 * line that terminates each entry.
 */
export function parseBlamePorcelain(output: string): Blame {
  const lines = output.split('\n')
  const commits = new Map<string, ICommitInfo>()
  const blame = new Array<IBlameLine>()

  let sha: string | null = null
  let lineNumber = 0
  let info: ICommitInfo | null = null

  for (const line of lines) {
    const header = HEADER_RE.exec(line)
    if (header !== null) {
      sha = header[1]
      lineNumber = parseInt(header[2], 10)
      info = commits.get(sha) ?? {
        author: '',
        authorMail: '',
        authorTime: 0,
        summary: '',
        previousSha: null,
      }
      commits.set(sha, info)
      continue
    }

    if (line.startsWith('\t')) {
      if (sha !== null && info !== null) {
        blame.push({
          sha,
          author: info.author,
          authorMail: info.authorMail,
          authorTime: info.authorTime,
          summary: info.summary,
          previousSha: info.previousSha,
          lineNumber,
          content: line.substring(1),
        })
      }
      continue
    }

    if (info === null) {
      continue
    }

    const space = line.indexOf(' ')
    const key = space === -1 ? line : line.substring(0, space)
    const value = space === -1 ? '' : line.substring(space + 1)

    switch (key) {
      case 'author':
        info.author = value
        break
      case 'author-mail':
        info.authorMail = stripAngleBrackets(value)
        break
      case 'author-time':
        info.authorTime = parseInt(value, 10)
        break
      case 'summary':
        info.summary = value
        break
      case 'previous':
        info.previousSha = value.split(' ', 1)[0]
        break
    }
  }

  return blame
}

/**
 * Run `git blame --porcelain` for a file in the working tree and return the
 * per-line attribution. `commitish` defaults to the working-tree contents.
 */
export async function getBlame(
  repository: Repository,
  filePath: string,
  commitish?: string
): Promise<Blame> {
  const args = ['blame', '--porcelain']
  if (commitish !== undefined && commitish.length > 0) {
    args.push(commitish)
  }
  args.push('--', filePath)

  const result = await git(args, repository.path, 'getBlame')
  return parseBlamePorcelain(result.stdout)
}
