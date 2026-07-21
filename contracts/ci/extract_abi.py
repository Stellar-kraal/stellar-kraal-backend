#!/usr/bin/env python3
"""Extract public contract entry-point signatures from a Soroban contract's
`#[contractimpl]` impl block.

Source-level (no stellar-cli / WASM introspection needed): finds the single
`#[contractimpl] impl <Type> { ... }` block, walks matching braces to find
its extent, then collects every `pub fn` name plus a crude parameter count.
This is sufficient to catch removed or renamed entry points, which is what
the contract CI gate's ABI check is scoped to (see Issue #36 acceptance
criteria) -- it is not a full type-level ABI diff.

Usage: extract_abi.py <path/to/lib.rs>
Prints a JSON object {fn_name: arg_count} to stdout, sorted by key.
"""
import json
import re
import sys


def extract(path: str) -> dict:
    with open(path) as f:
        src = f.read()

    marker = re.search(r"#\[contractimpl\]\s*\nimpl\s+\w+\s*\{", src)
    if not marker:
        print(f"::error::No #[contractimpl] impl block found in {path}", file=sys.stderr)
        sys.exit(1)

    start = marker.end() - 1  # position of the opening brace
    depth = 0
    end = None
    for i in range(start, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end is None:
        print(f"::error::Unbalanced braces while scanning impl block in {path}", file=sys.stderr)
        sys.exit(1)

    body = src[start:end]

    entries = {}
    for m in re.finditer(r"pub fn\s+(\w+)\s*\(([^;{]*?)\)", body, re.DOTALL):
        name, args = m.group(1), m.group(2)
        arg_count = 0 if args.strip() == "" else len([a for a in args.split(",") if a.strip()])
        entries[name] = arg_count

    return entries


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: extract_abi.py <path/to/lib.rs>", file=sys.stderr)
        sys.exit(2)
    print(json.dumps(extract(sys.argv[1]), sort_keys=True, indent=2))
