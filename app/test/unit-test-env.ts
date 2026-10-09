const environmentVariables = {
  // setting commit information so that tests don't need to rely on global config
  GIT_AUTHOR_NAME: 'Joe Bloggs',
  GIT_AUTHOR_EMAIL: 'joe.bloggs@somewhere.com',
  GIT_COMMITTER_NAME: 'Joe Bloggs',
  GIT_COMMITTER_EMAIL: 'joe.bloggs@somewhere.com',
  // signalling to dugite to use the bundled Git environment
  TEST_ENV: '1',
  HOME: '',
  USERPROFILE: '',
}

// HOME is blanked above, so a global safe.directory entry is never read. CI
// containers run as a different user than owns the test fixtures, which makes
// git refuse submodule operations ("dubious ownership") without this.
const ciGitConfig = process.env.CI
  ? {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'safe.directory',
      GIT_CONFIG_VALUE_0: '*',
    }
  : {}

process.env = { ...process.env, ...environmentVariables, ...ciGitConfig }
