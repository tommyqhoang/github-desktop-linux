import { Accounts } from '../../../src/ui/preferences/accounts'
import { Account } from '../../../src/models/account'
import { getDotComAPIEndpoint } from '../../../src/lib/api'

function dotComAccount(id: number, login = `user${id}`): Account {
  return new Account(
    login,
    getDotComAPIEndpoint(),
    '',
    [],
    '',
    id,
    login,
    'free'
  )
}

function createProps(overrides: Partial<any> = {}): any {
  return {
    dotComAccounts: [],
    enterpriseAccounts: [],
    activeAccountByEndpoint: new Map<string, number>(),
    onDotComSignIn: () => {},
    onEnterpriseSignIn: () => {},
    onLogout: () => {},
    onSwitchAccount: () => {},
    ...overrides,
  }
}

function renderToText(element: any): string {
  if (element === null || element === undefined) {
    return ''
  }
  if (typeof element === 'string' || typeof element === 'number') {
    return String(element)
  }
  if (Array.isArray(element)) {
    return element.map(renderToText).join('')
  }
  if (element.props && element.props.children) {
    return renderToText(element.props.children)
  }
  return ''
}

describe('Accounts', () => {
  describe('organization refresh', () => {
    it('does not re-fetch when the account arrays are content-equal but new references', () => {
      const account = dotComAccount(1)
      const accounts = new Accounts(createProps({ dotComAccounts: [account] }))
      const refreshSpy = jest
        .spyOn(accounts as any, 'refreshOrganizations')
        .mockImplementation(() => {})

      // Simulate a background App re-render: App.render() rebuilds the array
      // via accounts.filter(...), handing us a brand-new reference each time
      // even though the underlying account is unchanged.
      accounts.componentWillReceiveProps(
        createProps({ dotComAccounts: [account] })
      )

      expect(refreshSpy).not.toHaveBeenCalled()
    })

    it('re-fetches when the set of accounts actually changes', () => {
      const accounts = new Accounts(
        createProps({ dotComAccounts: [dotComAccount(1)] })
      )
      const refreshSpy = jest
        .spyOn(accounts as any, 'refreshOrganizations')
        .mockImplementation(() => {})

      accounts.componentWillReceiveProps(
        createProps({ dotComAccounts: [dotComAccount(1), dotComAccount(2)] })
      )

      expect(refreshSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('sign-in affordances', () => {
    it('does not render a redundant "Add account" button when signed out', () => {
      const accounts = new Accounts(createProps())
      const text = renderToText(accounts.render())

      expect(text).not.toContain('Add GitHub.com account')
      expect(text).not.toContain('Add GitHub Enterprise account')
    })

    it('renders the "Add account" button once an account is present', () => {
      const accounts = new Accounts(
        createProps({ dotComAccounts: [dotComAccount(1)] })
      )
      const text = renderToText(accounts.render())

      expect(text).toContain('Add GitHub.com account')
    })
  })
})
