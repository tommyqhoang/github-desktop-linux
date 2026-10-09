import { API } from '../../../../src/lib/api'

describe('API workflow run methods', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('fetchWorkflowRuns', () => {
    it('fetches workflow runs for a branch', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      const requestSpy = jest.spyOn(api as any, 'request').mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          total_count: 1,
          workflow_runs: [
            {
              id: 123,
              workflow_id: 456,
              cancel_url:
                'https://api.github.com/repos/owner/name/actions/runs/123/cancel',
              created_at: '2026-05-17T10:00:00Z',
              logs_url:
                'https://api.github.com/repos/owner/name/actions/runs/123/logs',
              name: 'CI',
              rerun_url:
                'https://api.github.com/repos/owner/name/actions/runs/123/rerun',
              check_suite_id: 789,
              event: 'push',
              head_branch: 'main',
              head_sha: 'abc123',
              run_number: 1,
              status: 'completed',
              conclusion: 'success',
              updated_at: '2026-05-17T10:05:00Z',
              run_started_at: '2026-05-17T10:01:00Z',
              html_url: 'https://github.com/owner/name/actions/runs/123',
              jobs_url:
                'https://api.github.com/repos/owner/name/actions/runs/123/jobs',
              path: '.github/workflows/ci.yml',
              pull_requests: [],
            },
          ],
        }),
        headers: new Headers(),
      })

      const result = await api.fetchWorkflowRuns('owner', 'name', 'main')
      expect(result).not.toBeNull()
      expect(result?.workflow_runs.length).toBe(1)
      expect(result?.workflow_runs[0].id).toBe(123)
      expect(requestSpy).toHaveBeenCalledWith(
        'GET',
        'repos/owner/name/actions/runs?branch=main'
      )
    })

    it('includes workflow_id and status in query when provided', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      const requestSpy = jest.spyOn(api as any, 'request').mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ total_count: 0, workflow_runs: [] }),
        headers: new Headers(),
      })

      await api.fetchWorkflowRuns(
        'owner',
        'name',
        'main',
        'ci.yml',
        'completed'
      )
      expect(requestSpy).toHaveBeenCalledWith(
        'GET',
        'repos/owner/name/actions/runs?branch=main&workflow_id=ci.yml&status=completed'
      )
    })

    it('returns null on 404', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockResolvedValue({
        status: 404,
        ok: false,
        headers: new Headers(),
      })

      const result = await api.fetchWorkflowRuns('owner', 'name', 'main')
      expect(result).toBeNull()
    })
  })

  describe('dispatchWorkflowRun', () => {
    it('triggers workflow dispatch with correct body', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      const requestSpy = jest.spyOn(api as any, 'request').mockResolvedValue({
        status: 204,
        ok: true,
        headers: new Headers(),
      })

      await api.dispatchWorkflowRun('owner', 'name', 123, 'main', {
        foo: 'bar',
      })
      expect(requestSpy).toHaveBeenCalledWith('POST', expect.any(String), {
        body: { ref: 'main', inputs: { foo: 'bar' } },
      })
    })

    it('throws on non-204 response', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockResolvedValue({
        status: 403,
        ok: false,
        headers: new Headers(),
      })
      await expect(
        api.dispatchWorkflowRun('owner', 'name', 123, 'main')
      ).rejects.toThrow(/HTTP 403/)
    })

    it('propagates network errors', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockRejectedValue(new Error('network'))

      await expect(
        api.dispatchWorkflowRun('owner', 'name', 123, 'main')
      ).rejects.toThrow('network')
    })
  })

  describe('cancelWorkflowRun', () => {
    it('cancels a workflow run', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockResolvedValue({
        status: 202,
        ok: true,
        headers: new Headers(),
      })

      await expect(
        api.cancelWorkflowRun('owner', 'name', 123)
      ).resolves.toBeUndefined()
    })

    it('throws on non-202 response', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockResolvedValue({
        status: 409,
        ok: false,
        headers: new Headers(),
      })
      await expect(api.cancelWorkflowRun('owner', 'name', 123)).rejects.toThrow(
        /HTTP 409/
      )
    })

    it('propagates network errors', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockRejectedValue(new Error('network'))

      await expect(api.cancelWorkflowRun('owner', 'name', 123)).rejects.toThrow(
        'network'
      )
    })
  })

  describe('fetchWorkflows', () => {
    it('fetches workflows', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          total_count: 1,
          workflows: [
            {
              id: 1,
              name: 'CI',
              path: '.github/workflows/ci.yml',
              state: 'active',
            },
          ],
        }),
        headers: new Headers(),
      })

      const result = await api.fetchWorkflows('owner', 'name')
      expect(result).not.toBeNull()
      expect(result?.workflows.length).toBe(1)
      expect(result?.workflows[0].name).toBe('CI')
    })
  })

  describe('fetchWorkflowRunJobs', () => {
    const job = (id: number) => ({ id, name: `job-${id}`, steps: [] })
    const page = (ids: number[], total: number) => ({
      status: 200,
      ok: true,
      json: async () => ({ total_count: total, jobs: ids.map(job) }),
      headers: new Headers(),
    })
    const failure = (status: number) => ({
      status,
      ok: false,
      json: async () => ({ message: 'nope' }),
      headers: new Headers(),
    })
    const range = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) => from + i)

    it('requests the maximum page size', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      const requestSpy = jest
        .spyOn(api as any, 'request')
        .mockResolvedValue(page([1], 1))

      await api.fetchWorkflowRunJobs('owner', 'name', 42)

      expect(requestSpy.mock.calls[0][1]).toBe(
        'repos/owner/name/actions/runs/42/jobs?per_page=100&page=1'
      )
    })

    it('returns a single page without asking for more', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      const requestSpy = jest
        .spyOn(api as any, 'request')
        .mockResolvedValue(page(range(1, 3), 3))

      const result = await api.fetchWorkflowRunJobs('owner', 'name', 42)

      expect(result?.jobs.map(j => j.id)).toEqual([1, 2, 3])
      expect(requestSpy).toHaveBeenCalledTimes(1)
    })

    it('walks every page of a large matrix run', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      const requestSpy = jest
        .spyOn(api as any, 'request')
        .mockResolvedValueOnce(page(range(1, 100), 230))
        .mockResolvedValueOnce(page(range(101, 200), 230))
        .mockResolvedValueOnce(page(range(201, 230), 230))

      const result = await api.fetchWorkflowRunJobs('owner', 'name', 42)

      expect(result?.jobs).toHaveLength(230)
      expect(result?.total_count).toBe(230)
      expect(requestSpy.mock.calls.map(c => c[1])).toEqual([
        'repos/owner/name/actions/runs/42/jobs?per_page=100&page=1',
        'repos/owner/name/actions/runs/42/jobs?per_page=100&page=2',
        'repos/owner/name/actions/runs/42/jobs?per_page=100&page=3',
      ])
    })

    it('stops when a page comes back empty even if the total is larger', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      const requestSpy = jest
        .spyOn(api as any, 'request')
        .mockResolvedValueOnce(page(range(1, 100), 500))
        .mockResolvedValueOnce(page([], 500))

      const result = await api.fetchWorkflowRunJobs('owner', 'name', 42)

      expect(result?.jobs).toHaveLength(100)
      expect(requestSpy).toHaveBeenCalledTimes(2)
    })

    it('never loops past the page ceiling', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      const requestSpy = jest
        .spyOn(api as any, 'request')
        .mockResolvedValue(page(range(1, 100), 1_000_000))

      await api.fetchWorkflowRunJobs('owner', 'name', 42)

      expect(requestSpy).toHaveBeenCalledTimes(10)
    })

    it.each([[0], [401], [403], [429], [500]])(
      'returns null (a failure, not "no jobs") when the first page fails with %s',
      async status => {
        const api = new API('https://api.github.com', 'fake-token')
        jest.spyOn(api as any, 'request').mockResolvedValue(failure(status))

        expect(await api.fetchWorkflowRunJobs('owner', 'name', 42)).toBeNull()
      }
    )

    it('returns null when the request itself throws', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockRejectedValue(new Error('offline'))

      expect(await api.fetchWorkflowRunJobs('owner', 'name', 42)).toBeNull()
    })

    it('keeps the jobs already gathered when a later page fails', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest
        .spyOn(api as any, 'request')
        .mockResolvedValueOnce(page(range(1, 100), 230))
        .mockResolvedValueOnce(failure(500))

      const result = await api.fetchWorkflowRunJobs('owner', 'name', 42)

      expect(result?.jobs).toHaveLength(100)
    })

    it('treats a run that genuinely has no jobs as an empty list, not a failure', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockResolvedValue(page([], 0))

      const result = await api.fetchWorkflowRunJobs('owner', 'name', 42)

      expect(result).not.toBeNull()
      expect(result?.jobs).toEqual([])
    })
  })
})
