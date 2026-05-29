from __future__ import annotations

import argparse
import math
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

cache_root = Path(tempfile.gettempdir()) / "plot_las_graphs_cache"
cache_root.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(cache_root / "matplotlib"))
os.environ.setdefault("XDG_CACHE_HOME", str(cache_root))

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt


@dataclass
class CurveTrack:
    source_name: str
    curve_name: str
    curve_unit: str
    depth: np.ndarray
    values: np.ndarray
    depth_label: str


@dataclass
class CurveDescriptor:
    mnemonic: str
    unit: str


@dataclass
class ParsedLasFile:
    depth_curve: CurveDescriptor
    curve_descriptors: list[CurveDescriptor]
    data: np.ndarray
    null_value: float | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read one or more LAS files and save their curves as graph images."
    )
    parser.add_argument(
        "inputs",
        nargs="+",
        help="Path(s) to .las file(s). Each file can contribute one or more curve tracks.",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Output image path. Defaults to <input>_graph.png for one file or las_graphs.png for many.",
    )
    parser.add_argument(
        "-c",
        "--curves",
        nargs="+",
        help="Optional curve mnemonics to plot, for example: --curves GR RHOB NPHI",
    )
    parser.add_argument(
        "--cols",
        type=int,
        default=3,
        help="Number of subplot columns in the output image. Default: 3.",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=200,
        help="Output image DPI. Default: 200.",
    )
    parser.add_argument(
        "--title",
        help="Optional figure title.",
    )
    return parser.parse_args()


def normalize_curve_filter(curves: Iterable[str] | None) -> set[str] | None:
    if not curves:
        return None
    return {curve.strip().upper() for curve in curves if curve.strip()}


def resolve_output_path(input_paths: list[Path], output: str | None) -> Path:
    if output:
        return Path(output).expanduser().resolve()

    if len(input_paths) == 1:
        input_path = input_paths[0]
        return input_path.with_name(f"{input_path.stem}_graph.png")

    return Path.cwd() / "las_graphs.png"


def parse_curve_descriptor(line: str) -> CurveDescriptor | None:
    content = line.split(":", 1)[0].strip()
    if not content or "." not in content:
        return None

    mnemonic_part, remainder = content.split(".", 1)
    mnemonic = mnemonic_part.strip().split()[0] if mnemonic_part.strip() else ""
    unit = remainder.strip().split()[0] if remainder.strip() else ""

    if not mnemonic:
        return None

    return CurveDescriptor(mnemonic=mnemonic, unit=unit)


def parse_null_value(line: str) -> float | None:
    content = line.split(":", 1)[0]
    if "." not in content:
        return None

    _, remainder = content.split(".", 1)
    tokens = remainder.strip().split()
    if not tokens:
        return None

    try:
        return float(tokens[0])
    except ValueError:
        return None


def parse_las_file(input_path: Path) -> ParsedLasFile:
    section = ""
    curve_descriptors: list[CurveDescriptor] = []
    ascii_rows: list[list[float]] = []
    null_value: float | None = None

    with input_path.open("r", encoding="utf-8", errors="ignore") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue

            if line.startswith("~"):
                section = line[1:].split()[0].lower()
                continue

            if section.startswith("curve"):
                descriptor = parse_curve_descriptor(line)
                if descriptor:
                    curve_descriptors.append(descriptor)
                continue

            if section.startswith("well") and line.upper().startswith("NULL."):
                null_value = parse_null_value(line)
                continue

            if section.startswith("ascii"):
                try:
                    ascii_rows.append([float(value) for value in line.split()])
                except ValueError as exc:
                    raise ValueError(f"Invalid numeric row in {input_path}: {line}") from exc

    if not curve_descriptors:
        raise ValueError(f"{input_path} does not define any curve metadata.")

    if not ascii_rows:
        raise ValueError(f"{input_path} does not contain an ASCII data section.")

    data = np.asarray(ascii_rows, dtype=float)
    expected_columns = len(curve_descriptors)
    if data.ndim != 2 or data.shape[1] != expected_columns:
        raise ValueError(
            f"{input_path} has {data.shape[1] if data.ndim == 2 else 'invalid'} data columns, "
            f"but {expected_columns} curve definitions were found."
        )

    return ParsedLasFile(
        depth_curve=curve_descriptors[0],
        curve_descriptors=curve_descriptors,
        data=data,
        null_value=null_value,
    )


def load_curve_tracks(input_path: Path, curve_filter: set[str] | None) -> list[CurveTrack]:
    parsed = parse_las_file(input_path)
    depth = parsed.data[:, 0].astype(float)
    depth_label = build_axis_label(parsed.depth_curve.mnemonic, parsed.depth_curve.unit)

    tracks: list[CurveTrack] = []
    for column_index, curve in enumerate(parsed.curve_descriptors[1:], start=1):
        curve_name = curve.mnemonic.strip()
        if curve_filter and curve_name.upper() not in curve_filter:
            continue

        values = parsed.data[:, column_index].astype(float)
        values = values.copy()
        if parsed.null_value is not None:
            values[np.isclose(values, float(parsed.null_value), equal_nan=False)] = np.nan
        values[~np.isfinite(values)] = np.nan

        if np.isnan(values).all():
            continue

        tracks.append(
            CurveTrack(
                source_name=input_path.stem,
                curve_name=curve_name,
                curve_unit=(curve.unit or "").strip(),
                depth=depth,
                values=values,
                depth_label=depth_label,
            )
        )

    return tracks


def build_axis_label(mnemonic: str, unit: str | None) -> str:
    unit = (unit or "").strip()
    if unit:
        return f"{mnemonic} ({unit})"
    return mnemonic


def plot_tracks(
    tracks: list[CurveTrack],
    output_path: Path,
    cols: int,
    dpi: int,
    title: str | None,
) -> None:
    if not tracks:
        raise ValueError("No plottable curves were found in the provided LAS file(s).")

    cols = max(1, cols)
    rows = math.ceil(len(tracks) / cols)
    fig, axes = plt.subplots(
        rows,
        cols,
        figsize=(4.5 * cols, 9 * rows),
        sharey=True,
        squeeze=False,
    )

    color_cycle = plt.rcParams["axes.prop_cycle"].by_key().get("color", ["#1f77b4"])
    axes_flat = axes.flatten()

    for index, track in enumerate(tracks):
        axis = axes_flat[index]
        axis.plot(
            track.values,
            track.depth,
            linewidth=1.1,
            color=color_cycle[index % len(color_cycle)],
        )
        axis.set_title(f"{track.source_name}: {track.curve_name}", fontsize=11)
        axis.set_xlabel(build_axis_label(track.curve_name, track.curve_unit))
        axis.grid(True, linestyle="--", alpha=0.35)
        axis.invert_yaxis()

        if index % cols == 0:
            axis.set_ylabel(track.depth_label)

    for axis in axes_flat[len(tracks) :]:
        axis.remove()

    if title:
        fig.suptitle(title, fontsize=14)
        fig.tight_layout(rect=(0, 0, 1, 0.97))
    else:
        fig.tight_layout()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=dpi, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    args = parse_args()
    input_paths = [Path(path).expanduser().resolve() for path in args.inputs]
    curve_filter = normalize_curve_filter(args.curves)
    output_path = resolve_output_path(input_paths, args.output)

    tracks: list[CurveTrack] = []
    for input_path in input_paths:
        if input_path.suffix.lower() != ".las":
            raise ValueError(f"{input_path} is not a .las file.")
        if not input_path.exists():
            raise FileNotFoundError(f"LAS file not found: {input_path}")
        tracks.extend(load_curve_tracks(input_path, curve_filter))

    if curve_filter and not tracks:
        raise ValueError(
            "None of the requested curves were found in the provided LAS file(s): "
            + ", ".join(sorted(curve_filter))
        )

    plot_tracks(
        tracks=tracks,
        output_path=output_path,
        cols=args.cols,
        dpi=args.dpi,
        title=args.title,
    )
    print(f"Saved graph image to: {output_path}")


if __name__ == "__main__":
    main()
