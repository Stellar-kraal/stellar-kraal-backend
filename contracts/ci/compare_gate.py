#!/usr/bin/env python3
"""Compare a PR's contract build against the base branch's baseline and
produce (1) a blocking/non-blocking decision and (2) a Markdown PR comment
report, per Issue 38 (contract size / simulation cost / ABI gate).

Any "base" input may be absent -- this happens on the PR that first adds
contracts/ to a repo (no prior baseline exists yet). In that case the
corresponding check is reported as informational-only and never blocks.

Usage:
  compare_gate.py \
    --base-wasm PATH  (optional) --head-wasm PATH \
    --base-cost PATH  (optional) --head-cost PATH \
    --base-abi PATH   (optional) --head-abi PATH \
    --size-threshold-pct 10 --cost-threshold-pct 15 \
    --size-override true|false \
    --out-report PATH --out-summary PATH
"""
import argparse
import json
import os
import sys


def load_json(path):
    if not path or not os.path.exists(path):
        return None
    with open(path) as f:
        content = f.read().strip()
        if not content:
            return None
        return json.loads(content)


def wasm_size(path):
    if not path or not os.path.exists(path):
        return None
    return os.path.getsize(path)


def pct_change(base, head):
    if base in (None, 0):
        return None
    return (head - base) / base * 100.0


def check_size(base_path, head_path, threshold_pct, override):
    head = wasm_size(head_path)
    base = wasm_size(base_path)
    lines = ["### 📦 WASM Size"]
    blocking = False

    if head is None:
        lines.append("- ⚠️ Could not find a built WASM binary for this PR.")
        return blocking, lines, {"head_bytes": None, "base_bytes": base, "delta_pct": None}

    if base is None:
        lines.append(
            f"- ℹ️ No baseline WASM on `main` to compare against (first build). "
            f"Head size: **{head:,} bytes**."
        )
        return blocking, lines, {"head_bytes": head, "base_bytes": None, "delta_pct": None}

    delta = pct_change(base, head)
    sign = "+" if delta >= 0 else ""
    lines.append(
        f"- Base (`main`): **{base:,} bytes** &nbsp;→&nbsp; Head: **{head:,} bytes** "
        f"({sign}{delta:.2f}%)"
    )

    if delta > threshold_pct:
        if override:
            lines.append(
                f"- 🟡 Exceeds the {threshold_pct}% regression threshold, but the "
                f"`contract-size-override` label is present — **not blocking**. "
                f"Make sure the PR description records the justification."
            )
        else:
            lines.append(
                f"- 🔴 **Exceeds the {threshold_pct}% regression threshold — blocking.** "
                f"Add the `contract-size-override` label with a justification in the PR "
                f"description to bypass."
            )
            blocking = True
    else:
        lines.append(f"- ✅ Within the {threshold_pct}% regression threshold.")

    return blocking, lines, {"head_bytes": head, "base_bytes": base, "delta_pct": delta}


def check_cost(base_path, head_path, threshold_pct):
    head = load_json(head_path)
    base = load_json(base_path)
    lines = ["### ⚙️ Simulation Cost (CPU instructions)"]
    blocking = False
    details = {}

    if head is None:
        lines.append("- ⚠️ Could not read the head cost report.")
        return blocking, lines, details

    head_by_name = {r["name"]: r["instructions"] for r in head}

    if base is None:
        lines.append("- ℹ️ No baseline cost report on `main` to compare against (first build).")
        lines.append("")
        lines.append("| Scenario | Head instructions |")
        lines.append("|---|---|")
        for name, cost in sorted(head_by_name.items()):
            lines.append(f"| `{name}` | {cost:,} |")
        details = {"scenarios": {n: {"head": c, "base": None, "delta_pct": None} for n, c in head_by_name.items()}}
        return blocking, lines, details

    base_by_name = {r["name"]: r["instructions"] for r in base}

    lines.append("")
    lines.append("| Scenario | Base | Head | Δ | |")
    lines.append("|---|---|---|---|---|")

    scenario_details = {}
    regressed = []
    for name in sorted(set(head_by_name) | set(base_by_name)):
        h = head_by_name.get(name)
        b = base_by_name.get(name)
        if h is None:
            lines.append(f"| `{name}` | {b:,} | *(removed)* | — | ⚠️ |")
            scenario_details[name] = {"head": None, "base": b, "delta_pct": None}
            continue
        if b is None:
            lines.append(f"| `{name}` | *(new)* | {h:,} | — | ℹ️ |")
            scenario_details[name] = {"head": h, "base": None, "delta_pct": None}
            continue

        delta = pct_change(b, h)
        sign = "+" if delta >= 0 else ""
        flag = "✅"
        if delta > threshold_pct:
            flag = "🔴"
            regressed.append((name, delta))
        lines.append(f"| `{name}` | {b:,} | {h:,} | {sign}{delta:.2f}% | {flag} |")
        scenario_details[name] = {"head": h, "base": b, "delta_pct": delta}

    details = {"scenarios": scenario_details}

    if regressed:
        lines.append("")
        names = ", ".join(f"`{n}` (+{d:.1f}%)" for n, d in regressed)
        lines.append(
            f"- 🔴 **{len(regressed)} scenario(s) exceed the {threshold_pct}% regression "
            f"threshold — blocking:** {names}"
        )
        blocking = True
    else:
        lines.append("")
        lines.append(f"- ✅ All scenarios within the {threshold_pct}% regression threshold.")

    return blocking, lines, details


def check_abi(base_path, head_path):
    head = load_json(head_path)
    base = load_json(base_path)
    lines = ["### 🔌 ABI Compatibility (entry points)"]
    blocking = False
    details = {}

    if head is None:
        lines.append("- ⚠️ Could not read the head ABI extract.")
        return blocking, lines, details

    if base is None:
        lines.append(
            f"- ℹ️ No baseline ABI on `main` to compare against (first build). "
            f"{len(head)} entry point(s) found."
        )
        details = {"removed": [], "changed": [], "added": sorted(head.keys())}
        return blocking, lines, details

    removed = sorted(set(base) - set(head))
    added = sorted(set(head) - set(base))
    changed = sorted(name for name in (set(base) & set(head)) if base[name] != head[name])

    details = {"removed": removed, "added": added, "changed": changed}

    if not removed and not changed:
        lines.append(f"- ✅ No removed or changed entry points.")
        if added:
            lines.append(f"- ℹ️ Added: {', '.join(f'`{n}`' for n in added)}")
        return blocking, lines, details

    if removed:
        lines.append(f"- 🔴 **Removed entry point(s) — blocking:** {', '.join(f'`{n}`' for n in removed)}")
        blocking = True
    if changed:
        lines.append(
            f"- 🔴 **Entry point(s) with a changed parameter count — blocking (possible "
            f"rename/signature change):** {', '.join(f'`{n}`' for n in changed)}"
        )
        blocking = True
    if added:
        lines.append(f"- ℹ️ Added: {', '.join(f'`{n}`' for n in added)}")

    return blocking, lines, details


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base-wasm")
    p.add_argument("--head-wasm", required=True)
    p.add_argument("--base-cost")
    p.add_argument("--head-cost", required=True)
    p.add_argument("--base-abi")
    p.add_argument("--head-abi", required=True)
    p.add_argument("--size-threshold-pct", type=float, default=10.0)
    p.add_argument("--cost-threshold-pct", type=float, default=15.0)
    p.add_argument("--size-override", default="false")
    p.add_argument("--out-report", required=True)
    p.add_argument("--out-summary", required=True)
    args = p.parse_args()

    override = args.size_override.strip().lower() in ("1", "true", "yes")

    size_blocking, size_lines, size_details = check_size(
        args.base_wasm, args.head_wasm, args.size_threshold_pct, override
    )
    cost_blocking, cost_lines, cost_details = check_cost(
        args.base_cost, args.head_cost, args.cost_threshold_pct
    )
    abi_blocking, abi_lines, abi_details = check_abi(args.base_abi, args.head_abi)

    blocking = size_blocking or cost_blocking or abi_blocking

    report = ["## Contract Size / Cost / ABI Gate", ""]
    if blocking:
        report.append("**🔴 This PR has one or more blocking findings — see below.**")
    else:
        report.append("**✅ No blocking findings.**")
    report.append("")
    report += size_lines
    report.append("")
    report += cost_lines
    report.append("")
    report += abi_lines
    report.append("")
    report.append(
        "<sub>Generated by `.github/workflows/contracts-ci.yml` — "
        "size/cost baselines are `main` at the PR's merge-base commit.</sub>"
    )

    with open(args.out_report, "w") as f:
        f.write("\n".join(report) + "\n")

    summary = {
        "blocking": blocking,
        "size_blocking": size_blocking,
        "cost_blocking": cost_blocking,
        "abi_blocking": abi_blocking,
        "size": size_details,
        "cost": cost_details,
        "abi": abi_details,
    }
    with open(args.out_summary, "w") as f:
        json.dump(summary, f, indent=2)

    print("\n".join(report))
    sys.exit(0)


if __name__ == "__main__":
    main()
