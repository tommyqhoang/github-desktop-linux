/**
 * The subset of a react-virtualized `Grid` or `List` instance needed to find
 * its DOM node. Both expose their scrolling container as an (undocumented but
 * long-stable) instance field, which replaces `ReactDOM.findDOMNode` that no
 * longer exists in React 19.
 */
interface IVirtualizedInstance {
  /** Present on `Grid` */
  readonly _scrollingContainer?: HTMLElement | null

  /** Present on `List`, which renders a `Grid` */
  readonly Grid?: IVirtualizedInstance | null
}

/**
 * Get the DOM element that scrolls for the given react-virtualized `Grid` or
 * `List`, or null if it's not mounted (yet).
 */
export function getVirtualizedElement(
  instance: object | null | undefined
): HTMLElement | null {
  const candidate = instance as IVirtualizedInstance | null | undefined
  return (
    candidate?._scrollingContainer ??
    candidate?.Grid?._scrollingContainer ??
    null
  )
}
