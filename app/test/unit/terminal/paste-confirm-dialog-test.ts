import { PasteConfirmDialog } from '../../../src/ui/terminal/paste-confirm-dialog'

// ---------------------------------------------------------------------------
// Tree-walking helpers (same pattern used across terminal tests)
// ---------------------------------------------------------------------------

function collectStrings(node: any, out: string[] = []): string[] {
  if (node === null || node === undefined || node === false) {
    return out
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectStrings(child, out)
    }
    return out
  }
  if (typeof node === 'object' && node.props) {
    collectStrings(node.props.children, out)
  }
  return out
}

function findByType(node: any, tag: string): any {
  if (node === null || node === undefined || node === false) {
    return null
  }
  if (Array.isArray(node)) {
    for (const c of node) {
      const h = findByType(c, tag)
      if (h) {
        return h
      }
    }
    return null
  }
  if (typeof node === 'object' && node.props) {
    if (node.type === tag) {
      return node
    }
    return findByType(node.props.children, tag)
  }
  return null
}

function findAllByType(node: any, tag: string, out: any[] = []): any[] {
  if (node === null || node === undefined || node === false) {
    return out
  }
  if (Array.isArray(node)) {
    for (const c of node) {
      findAllByType(c, tag, out)
    }
    return out
  }
  if (typeof node === 'object' && node.props) {
    if (node.type === tag) {
      out.push(node)
    }
    findAllByType(node.props.children, tag, out)
  }
  return out
}

// ---------------------------------------------------------------------------

describe('PasteConfirmDialog', () => {
  it('shows line count in title', () => {
    const tree: any = (PasteConfirmDialog as any)({
      text: 'a\nb\nc\nd',
      onConfirm: jest.fn(),
      onCancel: jest.fn(),
    })
    const texts = collectStrings(tree)
    expect(texts.join(' ')).toMatch(/4 lines/)
  })

  it('"Paste anyway" calls onConfirm with the full text', () => {
    const onConfirm = jest.fn()
    const text = 'line1\nline2\nline3'
    const tree: any = (PasteConfirmDialog as any)({
      text,
      onConfirm,
      onCancel: jest.fn(),
    })
    const buttons = findAllByType(tree, 'button')
    const pasteBtn = buttons.find((b: any) =>
      collectStrings(b.props.children).join('').toLowerCase().includes('paste')
    )
    expect(pasteBtn).toBeDefined()
    pasteBtn.props.onClick()
    expect(onConfirm).toHaveBeenCalledWith(text)
  })

  it('Cancel calls onCancel', () => {
    const onCancel = jest.fn()
    const tree: any = (PasteConfirmDialog as any)({
      text: 'x\ny',
      onConfirm: jest.fn(),
      onCancel,
    })
    const buttons = findAllByType(tree, 'button')
    const cancelBtn = buttons.find((b: any) =>
      collectStrings(b.props.children).join('').toLowerCase().includes('cancel')
    )
    expect(cancelBtn).toBeDefined()
    cancelBtn.props.onClick()
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows preview limited to 6 lines and a "more" line for large pastes', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n')
    const tree: any = (PasteConfirmDialog as any)({
      text: lines,
      onConfirm: jest.fn(),
      onCancel: jest.fn(),
    })
    const pre = findByType(tree, 'pre')
    expect(pre).not.toBeNull()
    const texts = collectStrings(tree)
    expect(texts.join(' ')).toMatch(/4 more/)
  })
})

describe('PasteConfirmDialog accessibility', () => {
  const render = (over: any = {}): any =>
    (PasteConfirmDialog as any)({
      text: 'x\ny',
      onConfirm: jest.fn(),
      onCancel: jest.fn(),
      ...over,
    })

  it('is labelled by its title', () => {
    const tree = render()
    const id = tree.props['aria-labelledby']
    expect(id).toBeTruthy()
    expect(findByType(tree, 'h3').props.id).toBe(id)
  })

  it('does not autofocus the risky "Paste anyway" button', () => {
    const buttons = findAllByType(render(), 'button')
    expect(buttons.every((b: any) => !b.props.autoFocus)).toBe(true)
  })

  it('Escape cancels without bubbling', () => {
    const onCancel = jest.fn()
    const tree = render({ onCancel })
    const preventDefault = jest.fn()
    const stopPropagation = jest.fn()
    tree.props.onKeyDown({ key: 'Escape', preventDefault, stopPropagation })
    expect(onCancel).toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalled()
    expect(stopPropagation).toHaveBeenCalled()
  })

  it('focuses Cancel on mount, traps Tab, and restores focus on unmount', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const root = document.createElement('div')
    root.innerHTML =
      '<button class="paste-confirm-dialog__cancel">Cancel</button><button class="paste-confirm-dialog__confirm">Paste</button>'
    document.body.appendChild(root)
    const tree = render()

    tree.ref(root)
    const [cancel, confirm] = Array.from(root.querySelectorAll('button'))
    expect(document.activeElement).toBe(cancel)

    // Tab on the last button wraps to the first.
    confirm.focus()
    const wrap = { preventDefault: jest.fn() }
    tree.props.onKeyDown({
      key: 'Tab',
      shiftKey: false,
      currentTarget: root,
      ...wrap,
    })
    expect(wrap.preventDefault).toHaveBeenCalled()
    expect(document.activeElement).toBe(cancel)

    // Shift+Tab on the first wraps to the last.
    const back = { preventDefault: jest.fn() }
    tree.props.onKeyDown({
      key: 'Tab',
      shiftKey: true,
      currentTarget: root,
      ...back,
    })
    expect(document.activeElement).toBe(confirm)

    tree.ref(null)
    expect(document.activeElement).toBe(opener)
    root.remove()
    opener.remove()
  })
})
