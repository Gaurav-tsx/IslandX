import { createHash } from 'node:crypto'
import { mkdirSync, copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repository = process.env.GITHUB_REPOSITORY || 'Gaurav-tsx/IslandX'
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const tag = `v${version}`
const [bundleArg, outputArg] = process.argv.slice(2)
const bundle = resolve(bundleArg || 'src-tauri/target/release/bundle/nsis')
const output = resolve(outputArg || '.devtools/release-assets')
const entries = readdirSync(bundle)
const installer = entries.find(file => file.includes(`_${version}_`) && file.endsWith('_x64-setup.exe'))
if (!installer) throw new Error(`Could not find the x64 NSIS installer for ${tag} in ${bundle}.`)
const signature = readFileSync(join(bundle, `${installer}.sig`), 'utf8').trim()
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) throw new Error('The update signature is invalid.')
if (Buffer.from(signature, 'base64').toString().match(/\bversion:(\S+)/)?.[1] !== version) {
  throw new Error('The update signature does not authenticate this version.')
}

const notes = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split(/\r?\n(?=## )/)
  .find(section => section.startsWith(`## ${tag}\n`) || section.startsWith(`## ${tag}\r\n`))
  ?.split(/\r?\n/).slice(1).join('\n').trim()
if (!notes) throw new Error(`Add release notes under ## ${tag} in CHANGELOG.md.`)
const bytes = readFileSync(join(bundle, installer))
const checksum = createHash('sha256').update(bytes).digest('hex')
mkdirSync(output, { recursive: true })
copyFileSync(join(bundle, installer), join(output, installer))
writeFileSync(join(output, `${installer}.sig`), signature + '\n')
writeFileSync(join(output, 'SHA256SUMS.txt'), `${checksum}  ${installer}\n`)
writeFileSync(join(output, 'release-notes.md'), notes + '\n')
writeFileSync(join(output, 'latest.json'), JSON.stringify({
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(installer)}`,
    },
  },
}, null, 2) + '\n')
console.log(`${installer} · ${(bytes.length / 1_000_000).toFixed(2)} MB`)
