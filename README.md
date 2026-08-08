> [!NOTE]
> fork of [Metro420yt/class-update](https://github.com/Metro420yt/class-update), updated because the action broke:
> - it ran on `node20`, which github actions has [deprecated](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)
> - its default changelist (`SyndiShanX/Update-Classes` on github) was deleted, so every run failed with `bad response 404`
>
> see [changes in this fork](#changes-in-this-fork).

## Inputs

Add a step like this to your workflow:

```yml
- uses: refact0r/class-update@v2
  with:
    # folder that has your theme files
    # Default: themes
    folder: 'src'

    # file extension to target
    # Default: css
    ext: scss

    # one or more (newline or comma separated) urls/relative paths to a changelist.
    # two formats are accepted:
    #   - old & new class names on alternating lines (SyndiShanX's Changes.txt)
    #   - a json object of "oldClass": "newClass"
    # sources are applied in order, and a source that can't be read is skipped.
    # Default: the two sources listed below
    diff: './changes.txt'
```

### Default changelists

Both are used by default, in this order, because they cover different things:

| source | format | covers |
| --- | --- | --- |
| [SyndiShanX/Update-Classes](https://codeberg.org/SyndiShanX/Update-Classes) (codeberg) | `Changes.txt` | the full rename history, so a theme that's years behind still catches up |
| [fedeericodl/discord-update-classnames](https://github.com/fedeericodl/discord-update-classnames) (`data` branch) | `classNamesMap.json` | current names, scraped from the discord client and updated automatically every couple hours |

Since one dead source only produces a warning now, the action keeps working if either one goes away.


## Outputs

The action provides these outputs:

- `totalChanges`: the total number of classes that were replaced

> For more info on how to use outputs, see ["Context and expression syntax"](https://docs.github.com/en/free-pro-team@latest/actions/reference/context-and-expression-syntax-for-github-actions).

## Examples
<details>
<summary><h3>Webhook Trigger</h3></summary>

> <a href="https://github.com/Metro420yt/Discord-comfy/blob/master/.github/workflows/classUpdate.yml" style="color: #919894">🔗 this is a workflow i use for a fork</a>

```yml
name: Update Classes

on:
  workflow_dispatch: # manually trigger
  repository_dispatch: # trigger by webhook (example below)
    types: [update_class] # id for webhook to target

jobs:
  classUpdate:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - id: update
        uses: refact0r/class-update@v2
        with:
          folder: stuff
          ext: scss

      - uses: gha-utilities/sass-build@v0.6.0 #compile scss files
        if: ${{steps.update.outputs.changed}} #skip if no class changes
        with:
          source: ./app.scss
          destination: ./betterdiscord/main.css
          outputStyle: expanded
      - uses: EndBug/add-and-commit@v9
        if: ${{steps.update.outputs.changed}} #skip if no class changes
        with:
          default_author: github_actions
          message: "chore: update classes"
          fetch: true
```


This example runs when [SyndiShanX's Changes.txt](https://codeberg.org/SyndiShanX/Update-Classes/raw/branch/pages/Changes.txt) updates, but you can ignore the first step if using a different trigger

im using [make.com](https://make.com) since they have a free tier and for demonstration purposes

[make.com blueprint](https://gist.github.com/Metro420yt/a3cc2687adb2313966c2f339bd43d246#file-make-blueprint-json)
> make sure to set up a schedule, i wouldnt try and make it run more than once per hour to stay under the 1000 operations/month


- using an rss feed parser, have it check [this feed](https://codeberg.org/SyndiShanX/Update-Classes/rss/branch/pages/Changes.txt) for new items (commits)
- when a new commit is made, send a POST request to `https://api.github.com/repos/<YOUR_REPO>/dispatches` with this info ([docs](https://docs.github.com/en/webhooks/webhook-events-and-payloads#repository_dispatch))
  - headers:
    - Accept: application/vnd.github+json <sub>(might not need, idk)</sub>
    - Content-Type: application/json
    - Authorization: `Bearer <YOUR_TOKEN>` (see [here](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#about-personal-access-tokens))
  - body:
    - `{"event_type": "<YOUR_DISPATCH_ID>"}`

</details>

<!-- <details>
<summary><h3>CRON Job</h3></summary>  -->
<!-- TODO -->
<!-- </details> -->


---
## Changes in this fork

- runs on `node24` instead of the deprecated `node20`
- the dead `SyndiShanX` github changelist is replaced by its [codeberg](https://codeberg.org/SyndiShanX/Update-Classes) home, plus an auto-updated second source
- `diff` takes **multiple sources**, and a source that 404s is a warning instead of a hard failure — the run continues on whatever's left, and only fails if *nothing* can be read
- pairs whose old or new side is more than one class (eg an element that *gained* a class, `message__9a9f9` -> `message__9a9f9 text-md/medium__9a9f9`) are skipped instead of being pasted into your selector, where they'd silently turn `.message__9a9f9` into a descendant selector and break the rule
- classes are matched as whole tokens, so `.xcontent_c9f72d` is no longer clobbered by a rule for `content_c9f72d`
- escaped slashes in discord's typography classes (`.text-sm\/medium_cf4812`) are handled
- rename chains are resolved up front, so files get one pass instead of one pass per pair — with ~118k pairs across both sources a run takes about two seconds
- a relative `diff` path now resolves against your repo, not the action's own folder

## Credits
>- inspired by [ClassUpdate from Saltssaumure](https://github.com/Saltssaumure/ClassUpdate)
>- changelist maintained by [SyndiShanX](https://codeberg.org/SyndiShanX) ([repo](https://codeberg.org/SyndiShanX/Update-Classes))
>- class map maintained by [fedeericodl](https://github.com/fedeericodl) ([repo](https://github.com/fedeericodl/discord-update-classnames))
>- class name history maintained by [itmesarah](https://github.com/itmesarah) ([repo](itmesarah))
>- README.md based on [EndBug/add-and-commit](https://github.com/EndBug/add-and-commit/blob/v9/README.md)