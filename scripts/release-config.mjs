import { readFileSync, writeFileSync } from 'node:fs'

const repository = process.env.GITHUB_REPOSITORY || 'Gaurav-tsx/IslandX'
if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid GitHub repository name.')
const fallback = `https://github.com/${repository}/releases/latest/download/latest.json`
const endpoint = new URL(process.env.ISLANDX_UPDATE_ENDPOINT || fallback)
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
  throw new Error('ISLANDX_UPDATE_ENDPOINT must be an HTTPS URL without embedded credentials.')
}
const pubkey = readFileSync(new URL('../src-tauri/updater.pub', import.meta.url), 'utf8').trim()
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(pubkey) || !Buffer.from(pubkey, 'base64').toString().includes('minisign public key:')) {
  throw new Error('The Tauri updater public key is invalid.')
}
const config = {
  bundle: { createUpdaterArtifacts: true },
  plugins: {
    updater: {
      pubkey,
      endpoints: [endpoint.href],
      windows: { installMode: 'passive' },
      requireSignedVersion: true,
    },
  },
}
writeFileSync(new URL('../.islandx-release.json', import.meta.url), JSON.stringify(config, null, 2) + '\n')
