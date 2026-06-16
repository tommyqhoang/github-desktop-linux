import * as Path from 'path'
import * as FSE from 'fs-extra'
import { setupEmptyRepository } from '../../helpers/repositories'
import { readWorkingDirectory } from '../../../src/lib/file-tree/list-directory'

describe('readWorkingDirectory', () => {
  it('lists root entries, directories first then alpha, hiding .git', async () => {
    const repo = await setupEmptyRepository()
    await FSE.mkdirp(Path.join(repo.path, 'app', 'src'))
    await FSE.mkdirp(Path.join(repo.path, 'docs'))
    await FSE.writeFile(Path.join(repo.path, 'package.json'), '{}')
    await FSE.writeFile(Path.join(repo.path, 'README.md'), '# hi')

    const entries = await readWorkingDirectory(repo, '')
    expect(entries.map(e => e.name)).toEqual([
      'app',
      'docs',
      'package.json',
      'README.md',
    ])
    expect(entries.find(e => e.name === '.git')).toBeUndefined()
    expect(entries[0]).toEqual({ name: 'app', path: 'app', kind: 'directory' })
  })

  it('excludes gitignored entries but keeps untracked non-ignored ones', async () => {
    const repo = await setupEmptyRepository()
    await FSE.writeFile(
      Path.join(repo.path, '.gitignore'),
      'node_modules/\n*.log\n'
    )
    await FSE.mkdirp(Path.join(repo.path, 'node_modules'))
    await FSE.writeFile(Path.join(repo.path, 'debug.log'), 'x')
    await FSE.writeFile(Path.join(repo.path, 'keep.ts'), 'x')

    const entries = await readWorkingDirectory(repo, '')
    const names = entries.map(e => e.name)
    expect(names).toContain('keep.ts')
    expect(names).toContain('.gitignore')
    expect(names).not.toContain('node_modules')
    expect(names).not.toContain('debug.log')
  })

  it('lists a nested directory by relative path', async () => {
    const repo = await setupEmptyRepository()
    await FSE.mkdirp(Path.join(repo.path, 'app', 'src'))
    await FSE.writeFile(Path.join(repo.path, 'app', 'src', 'index.ts'), 'x')

    const entries = await readWorkingDirectory(repo, 'app/src')
    expect(entries.map(e => e.path)).toEqual(['app/src/index.ts'])
  })
})
