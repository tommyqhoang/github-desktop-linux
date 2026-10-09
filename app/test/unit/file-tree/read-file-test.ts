import * as Path from 'path'
import * as FSE from 'fs-extra'
import { setupEmptyRepository } from '../../helpers/repositories'
import { readFileForViewer } from '../../../src/lib/file-tree/read-file'

describe('readFileForViewer', () => {
  it('reads UTF-8 text content', async () => {
    const repo = await setupEmptyRepository()
    await FSE.writeFile(Path.join(repo.path, 'a.txt'), 'hello\nworld\n')

    const result = await readFileForViewer(repo, 'a.txt')
    expect(result).toEqual({
      content: 'hello\nworld\n',
      isBinary: false,
      tooLarge: false,
    })
  })

  it('flags binary files and returns empty content', async () => {
    const repo = await setupEmptyRepository()
    await FSE.writeFile(
      Path.join(repo.path, 'bin'),
      Buffer.from([0x68, 0x00, 0x69])
    )

    const result = await readFileForViewer(repo, 'bin')
    expect(result.isBinary).toBe(true)
    expect(result.content).toBe('')
  })

  it('flags files over the size cap', async () => {
    const repo = await setupEmptyRepository()
    const big = 'a'.repeat(2 * 1024 * 1024 + 1)
    await FSE.writeFile(Path.join(repo.path, 'big.txt'), big)

    const result = await readFileForViewer(repo, 'big.txt')
    expect(result.tooLarge).toBe(true)
    expect(result.content).toBe('')
  })

  it('strips a UTF-8 BOM', async () => {
    const repo = await setupEmptyRepository()
    await FSE.writeFile(
      Path.join(repo.path, 'bom.txt'),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hi')])
    )
    const result = await readFileForViewer(repo, 'bom.txt')
    expect(result.content).toBe('hi')
  })

  it('decodes UTF-16LE and UTF-16BE files with a BOM instead of calling them binary', async () => {
    const repo = await setupEmptyRepository()
    const le = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('héllo', 'utf16le'),
    ])
    await FSE.writeFile(Path.join(repo.path, 'le.txt'), le)
    const be = Buffer.from(le.subarray(2))
    be.swap16()
    await FSE.writeFile(
      Path.join(repo.path, 'be.txt'),
      Buffer.concat([Buffer.from([0xfe, 0xff]), be])
    )
    const a = await readFileForViewer(repo, 'le.txt')
    const b = await readFileForViewer(repo, 'be.txt')
    expect(a).toEqual({ content: 'héllo', isBinary: false, tooLarge: false })
    expect(b.content).toBe('héllo')
    expect(b.isBinary).toBe(false)
  })

  it('refuses to read a symlink that points outside the repository', async () => {
    const repo = await setupEmptyRepository()
    const outside = await setupEmptyRepository()
    await FSE.writeFile(Path.join(outside.path, 'secret.txt'), 'secret')
    await FSE.symlink(
      Path.join(outside.path, 'secret.txt'),
      Path.join(repo.path, 'link.txt')
    )
    await expect(readFileForViewer(repo, 'link.txt')).rejects.toThrow(
      'This link points outside the repository'
    )
  })

  it('still reads a symlink that stays inside the repository', async () => {
    const repo = await setupEmptyRepository()
    await FSE.writeFile(Path.join(repo.path, 'real.txt'), 'ok')
    await FSE.symlink('real.txt', Path.join(repo.path, 'link.txt'))
    const result = await readFileForViewer(repo, 'link.txt')
    expect(result.content).toBe('ok')
  })
})
