import { AudioControls } from './audio-controls'
import { PanelHeading, WindowsLink } from '../ui'

export default function Audio() {
  return <>
    <PanelHeading title="Audio"><WindowsLink page="sound">Change audio device</WindowsLink></PanelHeading>
    <AudioControls />
  </>
}
