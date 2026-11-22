# Renderer dependencies

The whiteboard, motion and training renderers, music mixing and the intro and
outro join run as Python scripts and need three packages: `numpy`, `Pillow` and
`imageio-ffmpeg` (which carries the FFmpeg binary). They are pinned to exact
versions with a hash for every release file, so a changed or swapped upload on
the package index cannot reach the Docker image or CI.

| File | Role |
|---|---|
| [`scripts/requirements-render.in`](../scripts/requirements-render.in) | What to edit: the packages and the version ranges allowed |
| [`scripts/requirements-render.txt`](../scripts/requirements-render.txt) | Compiled from it: exact versions and SHA-256 hashes. Never edit by hand |

## Install

```bash
python -m pip install --require-hashes -r scripts/requirements-render.txt
```

The Docker image (`--build-arg WITH_PYTHON=true`) and the `render-checks` job in
CI use the same command. With `--require-hashes` pip refuses a file whose hash is
not listed, and refuses any package that is not pinned.

## Refresh the lock file

Dependabot proposes updates weekly (the `pip` entry in
`.github/dependabot.yml`) and rewrites both files. To refresh by hand, for
example after changing a range in the `.in` file:

```bash
python -m pip install pip-tools
pip-compile --generate-hashes --no-emit-index-url --strip-extras --newline lf \
  --output-file scripts/requirements-render.txt scripts/requirements-render.in
```

Then check that the hashes cover the platforms you run on. The lock file lists
every wheel of each pinned release, so these should all succeed:

```bash
python -m pip download --no-deps --require-hashes --only-binary=:all: \
  --platform manylinux_2_28_x86_64 --python-version 3.11 --implementation cp --abi cp311 \
  -r scripts/requirements-render.txt -d /tmp/wheels
```

and run `npm run check:motion` and `npm run check:training` with the new
versions. numpy is held below 2.5 because the Docker image's Debian 12 base ships
Python 3.11 and numpy 2.5 needs 3.12; raise the range when the base image moves
to a newer Python.
