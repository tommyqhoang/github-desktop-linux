import * as React from 'react'
import { CSSTransition } from 'react-transition-group'

interface ICSSTransitionContentsProps {
  /** Prefix for the `-enter`, `-exit`, ... classes added during transitions */
  readonly classNames?: string

  /** How long (ms) the enter and exit transitions run for */
  readonly timeout:
    | number
    | {
        readonly appear?: number
        readonly enter?: number
        readonly exit?: number
      }

  /** Whether to run the enter transition on first mount */
  readonly appear?: boolean

  /** Whether to run the enter transition */
  readonly enter?: boolean

  /** Whether to run the exit transition */
  readonly exit?: boolean

  readonly children?: React.ReactNode
}

/**
 * A `CSSTransition` that animates the DOM element rendered by its child.
 *
 * react-transition-group falls back to `ReactDOM.findDOMNode` to locate the
 * element it animates unless it's given a `nodeRef`, and `findDOMNode` no
 * longer exists in React 19. The child here can be any component (dialogs,
 * banners, ...) so we can't hand it a ref directly; instead the child is
 * wrapped in a layout-neutral `display: contents` element and the transition
 * is pointed at that wrapper's first element, which is the same element
 * `findDOMNode` used to return.
 *
 * Meant to be used as a direct child of a `TransitionGroup`, which injects its
 * lifecycle props (`in`, `onExited`, ...) that are passed through to
 * `CSSTransition` here.
 */
export const CSSTransitionContents: React.FunctionComponent<
  ICSSTransitionContentsProps
> = ({ children, ...transitionProps }) => {
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const nodeRef = React.useMemo(
    () =>
      ({
        get current() {
          return wrapperRef.current?.firstElementChild ?? null
        },
      }) as React.RefObject<HTMLElement>,
    []
  )

  return (
    <CSSTransition {...transitionProps} nodeRef={nodeRef}>
      <div ref={wrapperRef} className="transition-contents">
        {children}
      </div>
    </CSSTransition>
  )
}
