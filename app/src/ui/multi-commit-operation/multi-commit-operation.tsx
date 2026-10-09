import * as React from 'react'
import { assertNever } from '../../lib/fatal-error'
import { MultiCommitOperationKind } from '../../models/multi-commit-operation'
import { Squash } from './squash'
import { IMultiCommitOperationProps } from './base-multi-commit-operation'
import { Merge } from './merge'
import { Reorder } from './reorder'
import { CherryPick } from './cherry-pick'
import { Rebase } from './rebase'

/**
 * The operation components are declared `abstract` because each one leaves
 * the step handlers it never reaches unimplemented. React's typings only accept
 * concrete constructors as JSX element types, so view them as plain components.
 */
const asComponent = (operation: unknown) =>
  operation as React.ComponentType<IMultiCommitOperationProps>

const CherryPickView = asComponent(CherryPick)
const RebaseView = asComponent(Rebase)
const MergeView = asComponent(Merge)
const SquashView = asComponent(Squash)
const ReorderView = asComponent(Reorder)

/** A component for managing the views of a multi commit operation. */
export class MultiCommitOperation extends React.Component<IMultiCommitOperationProps> {
  public render() {
    const { kind } = this.props.state.operationDetail
    switch (kind) {
      case MultiCommitOperationKind.CherryPick:
        return <CherryPickView {...this.props} />
      case MultiCommitOperationKind.Rebase:
        return <RebaseView {...this.props} />
      case MultiCommitOperationKind.Merge:
        return (
          <MergeView
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            state={this.props.state}
            conflictState={this.props.conflictState}
            emoji={this.props.emoji}
            workingDirectory={this.props.workingDirectory}
            askForConfirmationOnForcePush={
              this.props.askForConfirmationOnForcePush
            }
            accounts={this.props.accounts}
            cachedRepoRulesets={this.props.cachedRepoRulesets}
            openFileInExternalEditor={this.props.openFileInExternalEditor}
            resolvedExternalEditor={this.props.resolvedExternalEditor}
            openRepositoryInShell={this.props.openRepositoryInShell}
          />
        )
      case MultiCommitOperationKind.Squash:
        return (
          <SquashView
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            state={this.props.state}
            conflictState={this.props.conflictState}
            emoji={this.props.emoji}
            workingDirectory={this.props.workingDirectory}
            askForConfirmationOnForcePush={
              this.props.askForConfirmationOnForcePush
            }
            accounts={this.props.accounts}
            cachedRepoRulesets={this.props.cachedRepoRulesets}
            openFileInExternalEditor={this.props.openFileInExternalEditor}
            resolvedExternalEditor={this.props.resolvedExternalEditor}
            openRepositoryInShell={this.props.openRepositoryInShell}
          />
        )
      case MultiCommitOperationKind.InteractiveRebase:
      case MultiCommitOperationKind.Reorder:
        return (
          <ReorderView
            repository={this.props.repository}
            dispatcher={this.props.dispatcher}
            state={this.props.state}
            conflictState={this.props.conflictState}
            emoji={this.props.emoji}
            workingDirectory={this.props.workingDirectory}
            askForConfirmationOnForcePush={
              this.props.askForConfirmationOnForcePush
            }
            accounts={this.props.accounts}
            cachedRepoRulesets={this.props.cachedRepoRulesets}
            openFileInExternalEditor={this.props.openFileInExternalEditor}
            resolvedExternalEditor={this.props.resolvedExternalEditor}
            openRepositoryInShell={this.props.openRepositoryInShell}
          />
        )
      default:
        return assertNever(
          kind,
          `Unknown multi commit operation kind of ${kind}.`
        )
    }
  }
}
