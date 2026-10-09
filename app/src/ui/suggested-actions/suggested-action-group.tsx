import * as React from 'react'

import { TransitionGroup } from 'react-transition-group'
import { CSSTransitionContents } from '../lib/css-transition-contents'

interface ISuggestedActionGroup {
  readonly children?: React.ReactNode

  /**
   * `primary` groups are visually distinct from `normal`
   * ones for emphasis. Defaults to `normal`.
   */
  type?: 'normal' | 'primary'

  /**
   * What animation, if any, should be applied to the group.
   * `replace` animation should only be used with a single
   * component at once.
   */
  transitions?: 'replace'

  /**
   * Pass `false` to skip enter/exit transitions, which
   * can be useful during initial component loading. Only used
   * if `transitions` is also included.
   *
   * Defaults to `true` (enabled transitions)
   */
  enableTransitions?: boolean
}

/**
 * Wraps a list of suggested action components with extra styling
 * and animations.
 */
export const SuggestedActionGroup: React.FunctionComponent<
  ISuggestedActionGroup
> = props => {
  const cn = 'suggested-action-group ' + (props.type ? props.type : 'normal')
  if (props.transitions === 'replace') {
    const enableTransitions =
      props.enableTransitions !== undefined ? props.enableTransitions : true
    // The single child is swapped for the next one with an enter/exit
    // animation (see the `replace-*` rules in _suggested-action-group.scss).
    const child = React.Children.only(props.children)
    return (
      <TransitionGroup
        className={cn + ' replace-container'}
        enter={enableTransitions}
        exit={enableTransitions}
      >
        <CSSTransitionContents
          key={
            React.isValidElement(child) ? (child.key ?? undefined) : undefined
          }
          classNames={props.transitions}
          timeout={{ enter: 750, exit: 500 }}
        >
          {child}
        </CSSTransitionContents>
      </TransitionGroup>
    )
  }
  return <div className={cn}>{props.children}</div>
}
