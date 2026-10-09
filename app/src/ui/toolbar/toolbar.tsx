import * as React from 'react'

interface IToolbarProps {
  /** Content rendered inside the component. */
  readonly children?: React.ReactNode

  readonly id?: string
}

/** The main application toolbar component. */
export class Toolbar extends React.Component<IToolbarProps, {}> {
  public render() {
    return (
      <div id={this.props.id} className="toolbar">
        {this.props.children}
      </div>
    )
  }
}
