import * as React from 'react'
import classNames from 'classnames'

interface IRowProps {
  /** Content rendered inside the component. */
  readonly children?: React.ReactNode

  /** The id of the internal element */
  readonly id?: string

  /** The class name for the internal element. */
  readonly className?: string
}

/**
 * A horizontal row element with app-standard styles.
 *
 * Provide `children` elements for the contents of this row.
 */
export class Row extends React.Component<IRowProps, {}> {
  public render() {
    const className = classNames('row-component', this.props.className)
    return (
      <div id={this.props.id} className={className}>
        {this.props.children}
      </div>
    )
  }
}
