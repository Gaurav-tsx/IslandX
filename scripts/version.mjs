import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const { version } = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const lines = read('src-tauri/Cargo.toml')
const cargoLock = read('src-tauri/Cargo.lock')
const expected = process.argv[2]

if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error(`Expected an x.y.z Windows release version, received ${version}`)
}
const cargo = lines.match(/^version = "([^"]+)"/m)?.[1]
const cargoLocked = cargoLock.match(/name = "islandx"\r?\nversion = "([^"]+)"/)?.[1]
if ([cargo, cargoLocked, lock.version, lock.packages[''].version].some(value => value !== version)) {
  throw new Error('package.json, package-lock.json, Cargo.toml and Cargo.lock must agree.')
}
if (expected && expected !== `v${version}`) {
  throw new Error(`Release tag ${expected} does not match v${version}.`)
}
console.log(`IslandX v${version}`)
