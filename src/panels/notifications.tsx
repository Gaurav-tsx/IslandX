import { PanelHeading, WindowsLink } from '../ui'

export default function Notifications() {
  return <>
    <PanelHeading title="Notifications" />
    <p className="brief">IslandX’s desktop installer has no Windows package identity. Use Windows Notification Center to review and dismiss notifications.</p>
    <WindowsLink page="notifications">Windows notification settings</WindowsLink>
  </>
}
