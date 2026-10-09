import * as React from 'react'
import { createRoot } from 'react-dom/client'

import { CrashApp } from './crash-app'

if (!process.env.TEST_ENV) {
  /* This is the magic trigger for webpack to go compile
   * our sass into css and inject it into the DOM. */
  require('./styles/crash.scss')
}

document.body.classList.add(`platform-${process.platform}`)

const container = document.createElement('div')
container.id = 'desktop-crash-container'
document.body.appendChild(container)

createRoot(container).render(<CrashApp />)
