import { render } from 'react-dom'
import ChatWidget from './ChatWidget.jsx'

const container = document.createElement('div')
container.id = 'ebam-widget-root'
container.style.cssText = 'position:fixed;bottom:0;right:0;z-index:2147483647;pointer-events:none;'
document.body.appendChild(container)

const inner = document.createElement('div')
inner.style.pointerEvents = 'all'
container.appendChild(inner)

render(<ChatWidget />, inner)
