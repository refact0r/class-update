import { debug, error, ExitCode, getInput, isDebug, setOutput, warning } from '@actions/core'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

var __root = dirname(import.meta.dirname)
const doDebug = isDebug()

const options = {
    folder: 'themes',
    ext: 'css',
    diff: [
        'https://raw.githubusercontent.com/fedeericodl/discord-update-classnames/data/classNamesMap.json',
        'https://codeberg.org/SyndiShanX/Update-Classes/raw/branch/pages/Changes.txt'
    ].join('\n')
} satisfies Record<string, string>

for (const key in options) {
    const value = getInput(key) as string
    if (value) options[key as keyof typeof options] = value
}

if (!options.ext.startsWith('.')) options.ext = '.' + options.ext

// class names can contain letters, digits, _, - and / (discord's typography classes, eg `text-sm/medium_a25714`).
// in css a `/` has to be escaped, so `\` is matched too and stripped before looking a token up
const tokenRegex = /[A-Za-z_][A-Za-z0-9_\-\\/]*/g



const targetFolder = join(process.cwd(), options.folder) // [ ]: maybe do resolve()
debug(`target: ${targetFolder}`)
if (!existsSync(targetFolder)) {
    error(`folder doesnt exist ${options.folder} (${targetFolder})`)
    process.exit(ExitCode.Failure)
}
const files = getFiles(targetFolder)


const pairs = await getPairs(options.diff)
const stats: { [key: string]: number } = {}
for (let i = 0; files.length > i; i++) {
    // one pass per file instead of one pass per pair, so a class thats already been
    // replaced is never replaced again, and 100k+ pairs stay cheap
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



async function getPairs(diffInput: string): Promise<Map<string, string>> {
    const sources = diffInput.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
    if (sources.length === 0) {
        error('no diff source given')
        process.exit(ExitCode.Failure)
    }

    const raw: Array<[string, string]> = []
    var loaded = 0
    for (const source of sources) {
        const file = await read(source)
        // one dead source shouldnt kill the run when another one still works
        if (file === null) continue

        loaded++
        raw.push(...(file.trimStart().startsWith('{') ? parseMap(file, source) : parseLines(file)))
    }

    if (loaded === 0) {
        error(`no diff source could be read (tried ${sources.length})`)
        process.exit(ExitCode.Failure)
    }
    if (loaded < sources.length) warning(`only ${loaded}/${sources.length} diff sources could be read`)

    const pairs = compose(raw)
    debug(`${raw.length} pairs -> ${pairs.size} after resolving chains`)
    if (pairs.size === 0) warning('no usable class pairs in diff source(s)')

    return pairs
}

/** returns the file contents, or null if the source couldnt be read */
async function read(source: string): Promise<string | null> {
    if (source.startsWith('http')) {
        debug(`fetching diff: ${source}`)
        try {
            const resp = await fetch(source)
            if (!resp.ok) {
                warning(`bad response\n  ${resp.status} ${resp.url}`)
                return null
            }
            return await resp.text()
        } catch (err) {
            warning(`couldnt fetch diff source: ${source}\n  ${err}`)
            return null
        }
    }

    // check the workspace first, the actions own folder second (old behavior)
    for (const path of [join(process.cwd(), source), join(__root, source)]) {
        if (!existsSync(path)) continue
        debug(`using local diff source: ${path}`)
        return readFileSync(path, 'utf8')
    }

    warning(`invalid diff value: ${source}`)
    return null
}

/**
 * a changelist is a history, so a class can get renamed more than once (a -> b, then b -> c).
 * applying the pairs in order collapses those chains, which is what lets a theme thats years
 * behind catch up in one run. this precomputes that so the files only need a single pass
 */
function compose(raw: Array<[string, string]>): Map<string, string> {
    const final = new Map<string, string>() // original -> current
    const byCurrent = new Map<string, string[]>() // current -> originals pointing at it

    for (const [oldClass, newClass] of raw) {
        if (!oldClass || !newClass || oldClass === newClass) continue
        // a pair is only a rename we can apply if both sides are a single class name.
        // the sources have some entries that map one class onto several (eg an element that
        // gained a class), which cant be expressed as a token swap in a stylesheet
        if (/\s/.test(oldClass) || /\s/.test(newClass)) {
            if (doDebug) debug(`  skipping multi-class pair: ${oldClass} -> ${newClass}`)
            continue
        }

        const origs = byCurrent.get(oldClass) ?? []
        if (!final.has(oldClass)) origs.push(oldClass)

        for (const orig of origs) final.set(orig, newClass)
        byCurrent.delete(oldClass)

        const existing = byCurrent.get(newClass)
        if (existing) existing.push(...origs)
        else byCurrent.set(newClass, origs)
    }

    // the sources overlap but stop at different points in history, so one can hand back a
    // name the other still renames. following every result to a name nobody renames again
    // picks up those extra hops, and means the sources dont have to be listed in any
    // particular order to get the newest name
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

    return final
}

/** json object of `"oldClass": "newClass"` */
function parseMap(file: string, source: string): Array<[string, string]> {
    var parsed: unknown
    try {
        parsed = JSON.parse(file)
    } catch (err) {
        warning(`diff source isnt valid json: ${source}\n  ${err}`)
        return []
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        warning(`diff source should be a json object of old->new class names: ${source}`)
        return []
    }

    return Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
}

/** old & new class names on alternating lines */
function parseLines(file: string): Array<[string, string]> {
    const split = file.split('\n').map(line => line.trim())

    const pairs: Array<[string, string]> = []
    for (let i = 0; split.length > i; i += 2) pairs.push([split[i], split[i + 1]])

    return pairs
}

function getFiles(path: string) {
    const files = (readdirSync(path, { recursive: true }) as string[])
        .filter((f: string) => f.endsWith(options.ext))

    debug(`found ${files.length} files`)
    if (doDebug) files.forEach(f => debug('  ' + f))

    return files.map(f => ({ file: f, txt: readFileSync(join(path, f), 'utf8') })) as Array<{ file: string, txt: string }>
}
