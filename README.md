# Discord Class Updater

Discord ships obfuscated CSS class names like `messagesPopoutWrap__432f4`, and the hash on the end changes whenever the underlying code does. Any theme that selects on those classes quietly stops working when that happens.

This action rewrites the outdated class names in your theme files to their current ones, using a changelist of renames. Run it on a schedule and your theme keeps up on its own.

> [!NOTE]
> Fork of [Metro420yt/class-update](https://github.com/Metro420yt/class-update). The original ran on the now-deprecated `node20`, and its changelist url had gone dead.

## Usage

```yml
name: Update Classes

on:
  schedule:
    - cron: "0 */24 * * *"
  workflow_dispatch:

jobs:
  classUpdate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - id: update
        uses: refact0r/class-update@v3
        with:
          folder: src
          ext: css

      # only commit if something actually changed
      - uses: EndBug/add-and-commit@v10
        if: ${{steps.update.outputs.totalChanges > 0}}
        with:
          default_author: github_actions
          message: "chore: update classes"
          fetch: true
```

If your theme is compiled, run the build step between the two, gated on the same `if:`.

### Inputs

| input | default | description |
| --- | --- | --- |
| `folder` | `themes` | folder holding your theme files, searched recursively |
| `ext` | `css` | file extension to target |
| `diff` | [SyndiShanX's changelist](https://codeberg.org/SyndiShanX/Update-Classes) | url or repo-relative path to a changelist |

### Outputs

| output | description |
| --- | --- |
| `totalChanges` | number of class names that were replaced |
| `changed` | whether any file changed |

## The changelist

A changelist is a plain text file of old and new class names on alternating lines:

```
messagesPopoutWrap_e8b59c
messagesPopoutWrap__432f4
```

The default is [SyndiShanX/Update-Classes](https://codeberg.org/SyndiShanX/Update-Classes), which moved to Codeberg after the GitHub repo was deleted. Its raw url points at the `pages` branch — that's the repo's default branch, and `main`/`master` don't exist, so they'll 404.

Because it's a history rather than a snapshot, a class can be renamed several times over the years. The action follows each rename to the end of its chain, so a theme that's several updates behind catches up in one run. Class names are matched as whole tokens, so a rename for `content_c9f72d` won't touch `.xcontent_c9f72d`.

If the changelist can't be fetched, the run fails rather than silently doing nothing.

## Credits

- inspired by [ClassUpdate from Saltssaumure](https://github.com/Saltssaumure/ClassUpdate)
- changelist maintained by [SyndiShanX](https://codeberg.org/SyndiShanX)
- original action by [Metro420yt](https://github.com/Metro420yt)
