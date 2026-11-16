import { AudioControls } from './audio-controls'
import { PanelHeading, WindowsLink } from '../ui'

export default function Controls() {
  return <>
    <PanelHeading title="Controls" />
    <AudioControls />
    <div className="row">
      <WindowsLink page="display">Display</WindowsLink>
      <WindowsLink page="wifi">Wi-Fi</WindowsLink>
      <WindowsLink page="bluetooth">Bluetooth</WindowsLink>
      <WindowsLink page="notifications">Do not disturb</WindowsLink>
    </div>
  </>
}
