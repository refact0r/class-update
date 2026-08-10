import { debug, error, ExitCode, getInput, isDebug, setOutput } from '@actions/core'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

var __root = dirname(import.meta.dirname)
const doDebug = isDebug()

const options = {
    folder: 'themes',
    ext: 'css',
    diff: 'https://codeberg.org/SyndiShanX/Update-Classes/raw/branch/pages/Changes.txt'
} satisfies Record<string, string>

for (const key in options) {
    const value = getInput(key) as string
    if (value) options[key as keyof typeof options] = value
}

if (!options.ext.startsWith('.')) options.ext = '.' + options.ext

// class names can contain letters, digits, _, - and / (discord's typography classes, eg
// `text-sm/medium_a25714`). in css a `/` has to be escaped, so `\` is matched too and
// stripped before looking a token up
const tokenRegex = /[A-Za-z_][A-Za-z0-9_\-\\/]*/g



const targetFolder = join(process.cwd(), options.folder) // [ ]: maybe do resolve()
debug(`target: ${targetFolder}`)
if (!existsSync(targetFolder)) {
    error(`folder doesnt exist ${options.folder} (${targetFolder})`)
    process.exit(ExitCode.Failure)
}
const files = getFiles(targetFolder)


const pairs = getPairs(await readDiff(options.diff))
const stats: { [key: string]: number } = {}
for (let i = 0; files.length > i; i++) {
    // one pass per file instead of one pass per pair, so a class thats already been
    // replaced is never replaced again, and 79k pairs stay cheap
    files[i].txt = files[i].txt.replace(tokenRegex, token => {
        const escaped = token.includes('\\')
        const newClass = pairs.get(escaped ? token.replaceAll('\\', '') : token)
        if (!newClass) return token

        if (stats[files[i].file]) stats[files[i].file]++
        else stats[files[i].file] = 1

        return escaped ? newClass.replaceAll('/', '\\/') : newClass
    })
}

const total = Object.values(stats).reduce((total, num) => total += num, 0)
setOutput('totalChanges', total)
setOutput('changed', total > 0)

if (doDebug) {
    debug(`${total} changes`)
    for (const file in stats) debug(`  ${stats[file]} ${file}`)
}

files.forEach(({ file, txt }) => {
    if (stats[file] > 0) writeFileSync(join(targetFolder, file), txt)
})



async function readDiff(source: string): Promise<string> {
    if (source.startsWith('http')) {
        debug(`fetching diff: ${source}`)
        const resp = await fetch(source).catch(err => {
            error(`couldnt fetch diff source: ${source}\n  ${err}`)
            process.exit(ExitCode.Failure)
        })
        if (!resp.ok) {
            error(`bad response\n  ${resp.status} ${resp.url}`)
            process.exit(ExitCode.Failure)
        }
        return await resp.text()
    }

    // check the workspace first, the actions own folder second (old behavior)
    for (const path of [join(process.cwd(), source), join(__root, source)]) {
        if (!existsSync(path)) continue
        debug(`using local diff source: ${path}`)
        return readFileSync(path, 'utf8')
    }

    error(`invalid diff value: ${source}`)
    process.exit(ExitCode.Failure)
}

/**
 * the changelist is old & new class names on alternating lines, and its a history, so a
 * class can get renamed more than once (a -> b, then b -> c). following each rename to a
 * name that never gets renamed again is what lets a theme catch up in one pass
 */
function getPairs(file: string): Map<string, string> {
    const lines = file.split('\n').map(line => line.trim())

    const final = new Map<string, string>() // original -> current
    const byCurrent = new Map<string, string[]>() // current -> originals pointing at it

    for (let i = 0; lines.length > i; i += 2) {
        const oldClass = lines[i]
        const newClass = lines[i + 1]
        // a class name is a single token, so anything with whitespace is malformed
        if (!oldClass || !newClass || oldClass === newClass) continue
        if (/\s/.test(oldClass) || /\s/.test(newClass)) continue

        const origs = byCurrent.get(oldClass) ?? []
        if (!final.has(oldClass)) origs.push(oldClass)

        for (const orig of origs) final.set(orig, newClass)
        byCurrent.delete(oldClass)

        const existing = byCurrent.get(newClass)
        if (existing) existing.push(...origs)
        else byCurrent.set(newClass, origs)
    }

    // the changelist isnt perfectly ordered, so a rename can land on a name an earlier
    // line already renamed. one more pass settles those
    for (const [oldClass, newClass] of final) {
        const seen = new Set([oldClass])
        var current = newClass
        while (final.has(current) && !seen.has(current)) {
            seen.add(current)
            current = final.get(current)!
        }

        // a chain can lead back to where it started (a -> b -> a)
        if (current === oldClass) final.delete(oldClass)
        else final.set(oldClass, current)
    }

    debug(`${final.size} pairs`)
    return final
}

function getFiles(path: string) {
    const files = (readdirSync(path, { recursive: true }) as string[])
        .filter((f: string) => f.endsWith(options.ext))

    debug(`found ${files.length} files`)
    if (doDebug) files.forEach(f => debug('  ' + f))

    return files.map(f => ({ file: f, txt: readFileSync(join(path, f), 'utf8') })) as Array<{ file: string, txt: string }>
}
