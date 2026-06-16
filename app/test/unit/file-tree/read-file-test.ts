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
})
