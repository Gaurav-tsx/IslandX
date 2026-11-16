import { createHash, createPublicKey, verify } from 'node:crypto'
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
const bytes = readFileSync(join(bundle, installer))
const signature = readFileSync(join(bundle, `${installer}.sig`), 'utf8').trim()
const updaterKey = readFileSync(new URL('../src-tauri/updater.pub', import.meta.url), 'utf8').trim()
const [, encodedKey] = Buffer.from(updaterKey, 'base64').toString().split(/\r?\n/)
const [, encodedSignature, trustedComment, encodedCommentSignature] = Buffer.from(signature, 'base64').toString().split(/\r?\n/)
if (!encodedKey || !encodedSignature || !trustedComment?.startsWith('trusted comment: ') || !encodedCommentSignature) {
  throw new Error('The updater key or signature is malformed.')
}
const comment = trustedComment.slice('trusted comment: '.length)
if (!comment.split('\t').includes(`version:${version}`)) {
  throw new Error('The update signature does not authenticate this version.')
}
const key = Buffer.from(encodedKey, 'base64')
const sig = Buffer.from(encodedSignature, 'base64')
const commentSig = Buffer.from(encodedCommentSignature, 'base64')
if (key.length !== 42 || sig.length !== 74 || commentSig.length !== 64 || sig.subarray(0, 2).toString() !== 'ED'
    || !key.subarray(2, 10).equals(sig.subarray(2, 10))) {
  throw new Error('The signature is incompatible with the updater public key.')
}
const publicKey = createPublicKey({
  key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key.subarray(10)]),
  format: 'der',
  type: 'spki',
})
const digest = createHash('blake2b512').update(bytes).digest()
const fileSig = sig.subarray(10)
if (!verify(null, digest, publicKey, fileSig) || !verify(null, Buffer.concat([fileSig, Buffer.from(comment)]), publicKey, commentSig)) {
  throw new Error('The installer or its signed release metadata failed verification.')
}

const notes = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split(/\r?\n(?=## )/)
  .find(section => section.startsWith(`## ${tag}\n`) || section.startsWith(`## ${tag}\r\n`))
  ?.split(/\r?\n/).slice(1).join('\n').trim()
if (!notes) throw new Error(`Add release notes under ## ${tag} in CHANGELOG.md.`)
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
