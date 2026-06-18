import * as path from 'path'
import { readFile, writeFile } from 'fs-extra'

import { Repository } from '../../../src/models/repository'
import {
  getSubmodules,
  listSubmodules,
  parseSubmoduleStatus,
  resetSubmodulePaths,
  syncSubmodules,
  updateSubmodules,
} from '../../../src/lib/git/submodule'
import { SubmoduleWorkDirState } from '../../../src/models/submodule'
import { checkoutBranch, getBranches } from '../../../src/lib/git'
import { setupFixtureRepository } from '../../helpers/repositories'

describe('git/submodule', () => {
  describe('listSubmodules', () => {
    it('returns the submodule entry', async () => {
      const testRepoPath = await setupFixtureRepository('submodule-basic-setup')
      const repository = new Repository(testRepoPath, -1, null, false)
      const result = await listSubmodules(repository)
      expect(result).toHaveLength(1)
      expect(result[0].sha).toBe('c59617b65080863c4ca72c1f191fa1b423b92223')
      expect(result[0].path).toBe('foo/submodule')
      expect(result[0].describe).toBe('first-tag~2')
    })

    it('returns the expected tag', async () => {
      const testRepoPath = await setupFixtureRepository('submodule-basic-setup')
      const repository = new Repository(testRepoPath, -1, null, false)

      const submodulePath = path.join(testRepoPath, 'foo', 'submodule')
      const submoduleRepository = new Repository(submodulePath, -1, null, false)

      const branches = await getBranches(
        submoduleRepository,
        'refs/remotes/origin/feature-branch'
      )

      if (branches.length === 0) {
        throw new Error(`Could not find branch: feature-branch`)
      }

      await checkoutBranch(submoduleRepository, branches[0], null)

      const result = await listSubmodules(repository)
      expect(result).toHaveLength(1)
      expect(result[0].sha).toBe('14425bb2a4ee361af7f789a81b971f8466ae521d')
      expect(result[0].path).toBe('foo/submodule')
      expect(result[0].describe).toBe('heads/feature-branch')
    })
  })

  describe('resetSubmodulePaths', () => {
    it('update submodule to original commit', async () => {
      const testRepoPath = await setupFixtureRepository('submodule-basic-setup')
      const repository = new Repository(testRepoPath, -1, null, false)

      const submodulePath = path.join(testRepoPath, 'foo', 'submodule')
      const submoduleRepository = new Repository(submodulePath, -1, null, false)

      const branches = await getBranches(
        submoduleRepository,
        'refs/remotes/origin/feature-branch'
      )

      if (branches.length === 0) {
        throw new Error(`Could not find branch: feature-branch`)
      }

      await checkoutBranch(submoduleRepository, branches[0], null)

      let result = await listSubmodules(repository)
      expect(result[0].describe).toBe('heads/feature-branch')

      await resetSubmodulePaths(repository, ['foo/submodule'])

      result = await listSubmodules(repository)
      expect(result[0].describe).toBe('first-tag~2')
    })

    it('eliminate submodule dirty state', async () => {
      const testRepoPath = await setupFixtureRepository('submodule-basic-setup')
      const repository = new Repository(testRepoPath, -1, null, false)

      const submodulePath = path.join(testRepoPath, 'foo', 'submodule')

      const filePath = path.join(submodulePath, 'README.md')
      await writeFile(filePath, 'changed', { encoding: 'utf8' })

      await resetSubmodulePaths(repository, ['foo/submodule'])

      const result = await readFile(filePath, { encoding: 'utf8' })
      expect(result).toBe('# submodule-test-case')
    })
  })

  describe('parseSubmoduleStatus', () => {
    it('parses an up-to-date submodule', () => {
      const output =
        ' 1eaabe34fc6f486367a176207420378f587d3b48 vendor/lib (v2.16.0)\n'
      const entries = parseSubmoduleStatus(output)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({
        sha: '1eaabe34fc6f486367a176207420378f587d3b48',
        path: 'vendor/lib',
        describe: 'v2.16.0',
        state: SubmoduleWorkDirState.UpToDate,
      })
    })

    it('marks an uninitialized submodule (leading "-") with no describe', () => {
      const output = '-1eaabe34fc6f486367a176207420378f587d3b48 vendor/lib\n'
      const entries = parseSubmoduleStatus(output)
      expect(entries).toHaveLength(1)
      expect(entries[0].state).toBe(SubmoduleWorkDirState.Uninitialized)
      expect(entries[0].describe).toBe('')
    })

    it('marks an out-of-date submodule (leading "+")', () => {
      const output =
        '+1eaabe34fc6f486367a176207420378f587d3b48 vendor/lib (v2.0.0-2-gabcdef)\n'
      const entries = parseSubmoduleStatus(output)
      expect(entries[0].state).toBe(SubmoduleWorkDirState.OutOfDate)
    })

    it('marks a conflicted submodule (leading "U")', () => {
      const output =
        'U1eaabe34fc6f486367a176207420378f587d3b48 vendor/lib (heads/main)\n'
      const entries = parseSubmoduleStatus(output)
      expect(entries[0].state).toBe(SubmoduleWorkDirState.Conflicted)
    })

    it('parses multiple submodules', () => {
      const output = [
        ' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa a (v1)',
        '-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb b',
        '+cccccccccccccccccccccccccccccccccccccccc c (v2)',
      ].join('\n')
      const entries = parseSubmoduleStatus(output)
      expect(entries.map(e => e.path)).toEqual(['a', 'b', 'c'])
      expect(entries.map(e => e.state)).toEqual([
        SubmoduleWorkDirState.UpToDate,
        SubmoduleWorkDirState.Uninitialized,
        SubmoduleWorkDirState.OutOfDate,
      ])
    })

    it('returns an empty array for empty output', () => {
      expect(parseSubmoduleStatus('')).toEqual([])
    })
  })

  describe('getSubmodules', () => {
    it('reports the repository submodule with its work-dir state', async () => {
      const testRepoPath = await setupFixtureRepository('submodule-basic-setup')
      const repository = new Repository(testRepoPath, -1, null, false)
      const result = await getSubmodules(repository)
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('foo/submodule')
      expect(result[0].state).toBe(SubmoduleWorkDirState.UpToDate)
    })
  })

  describe('updateSubmodules / syncSubmodules', () => {
    it('updating then syncing leaves the submodule up to date', async () => {
      const testRepoPath = await setupFixtureRepository('submodule-basic-setup')
      const repository = new Repository(testRepoPath, -1, null, false)

      await updateSubmodules(repository)
      await syncSubmodules(repository)

      const result = await getSubmodules(repository)
      expect(result[0].state).toBe(SubmoduleWorkDirState.UpToDate)
    })
  })
})
