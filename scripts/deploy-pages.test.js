import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'bun:test'

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'beat-tube deployment-'))
  temporaryDirectories.push(root)
  const env = {
    PATH: process.env.PATH,
    HOME: root,
    GIT_CONFIG_GLOBAL: join(root, '.gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  }
  const run = (command, args, cwd = root, overrides = {}) => {
    const result = spawnSync(command, args, { cwd, env: { ...env, ...overrides }, encoding: 'utf8' })
    if (result.status !== 0)
      throw new Error(`${command} failed: ${result.stderr || result.error}`)
    return result.stdout.trim()
  }
  run('git', ['config', '--global', 'user.name', 'Default Identity'])
  run('git', ['config', '--global', 'user.email', 'default@example.test'])
  return { root, run }
}

test('deployment uses gh-pages and the supplied Git identity without changing master', () => {
  const { root, run } = fixture()
  const source = join(root, 'source')
  const remote = join(root, 'pages.git')
  run('git', ['init', '-q', '--initial-branch=master', source])
  mkdirSync(join(source, 'scripts'))
  cpSync(join(import.meta.dir, 'deploy-pages.sh'), join(source, 'scripts/deploy-pages.sh'))
  writeFileSync(join(source, '.gitignore'), 'dist/\n')
  writeFileSync(join(source, 'index.html'), 'fixture homepage\n')
  run('git', ['add', '.'], source)
  run('git', ['commit', '-qm', 'Initial fixture'], source)
  run('git', ['branch', 'gh-pages'], source)
  run('git', ['clone', '-q', '--bare', source, remote])
  const master = run('git', ['rev-parse', 'master'], remote)

  // Only the build is stubbed; cloning, committing and pushing use real Git
  // against a disposable local repository. Nothing contacts GitHub.
  const bin = join(root, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'bun'), '#!/bin/sh\nmkdir -p dist\nprintf "fixture site\\n" > dist/index.html\n', { mode: 0o755 })
  const overrides = {
    PATH: `${bin}:${process.env.PATH}`,
    DEPLOY_REPO: remote,
    GIT_AUTHOR_NAME: 'Test Author',
    GIT_AUTHOR_EMAIL: 'author@example.test',
    GIT_COMMITTER_NAME: 'Test Committer',
    GIT_COMMITTER_EMAIL: 'committer@example.test',
  }
  run('bash', ['scripts/deploy-pages.sh'], source, overrides)
  expect(run('git', ['log', 'gh-pages', '-1', '--format=%an <%ae>%n%cn <%ce>'], remote))
    .toBe('Test Author <author@example.test>\nTest Committer <committer@example.test>')
  expect(run('git', ['show', 'gh-pages:index.html'], remote)).toBe('fixture site')
  expect(run('git', ['show', 'master:index.html'], remote)).toBe('fixture homepage')
  expect(run('git', ['rev-parse', 'master'], remote)).toBe(master)
  const head = run('git', ['rev-parse', 'gh-pages'], remote)
  expect(run('bash', ['scripts/deploy-pages.sh'], source, overrides)).toContain('No GitHub Pages changes to deploy.')
  expect(run('git', ['rev-parse', 'gh-pages'], remote)).toBe(head)
})
