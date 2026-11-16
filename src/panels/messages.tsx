import { MessageCircle } from 'lucide-react'
import { launchSite, PanelHeading } from '../ui'

const chats = [
  { name: 'WhatsApp', url: 'https://web.whatsapp.com' },
  { name: 'Discord', url: 'https://discord.com/app' },
  { name: 'Telegram', url: 'https://web.telegram.org' },
]

export default function Messages() {
  return <>
    <PanelHeading title="Messages" />
    <div className="tile-grid">{chats.map(chat => <button className="tile" key={chat.url} onClick={() => launchSite(chat.url, true)}>
      <MessageCircle size={18} />{chat.name}
    </button>)}</div>
  </>
}
