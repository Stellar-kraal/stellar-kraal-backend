"""
oracle-bridge/tests/test_resilience.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Parameterised tests for ``oracle_bridge.resilience.compute_backoff``.

All tests use ``random.seed(42)`` before each invocation so results are
fully deterministic and reproducible across environments.

Acceptance criteria (issue #129)
---------------------------------
1. A parametrized test over attempts 0–20 verifies
   ``compute_backoff(attempt, config) >= 0.0``.

2. A test verifies the result never exceeds
   ``config.max_delay_seconds * (1 + config.jitter_factor)``.

3. Tests use ``random.seed(42)`` for reproducibility.

4. All existing resilience tests pass (this file must not break anything).

Run with::

    python -m pytest oracle-bridge/tests/test_resilience.py -v

or, from the oracle-bridge directory::

    python -m pytest tests/test_resilience.py -v

Closes #129
"""

from __future__ import annotations

import math
import random
import sys
import os

import pytest

# ---------------------------------------------------------------------------
# Make oracle_bridge importable when pytest is invoked from any working dir.
# ---------------------------------------------------------------------------
_ORACLE_BRIDGE_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ORACLE_BRIDGE_ROOT not in sys.path:
    sys.path.insert(0, _ORACLE_BRIDGE_ROOT)

from oracle_bridge.resilience import BackoffConfig, compute_backoff  # noqa: E402

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

DEFAULT_CONFIG = BackoffConfig(
    base_delay_seconds=1.0,
    max_delay_seconds=60.0,
    jitter_factor=0.25,
)

# A config with maximum jitter so upper-bound tests are meaningful.
HIGH_JITTER_CONFIG = BackoffConfig(
    base_delay_seconds=1.0,
    max_delay_seconds=60.0,
    jitter_factor=1.0,
)

# A zero-jitter config: the result should equal the deterministic cap exactly.
ZERO_JITTER_CONFIG = BackoffConfig(
    base_delay_seconds=2.0,
    max_delay_seconds=30.0,
    jitter_factor=0.0,
)


# ---------------------------------------------------------------------------
# AC-1: delay >= 0.0 for every attempt in [0, 20]
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("attempt", range(0, 21))
def test_compute_backoff_non_negative_default_config(attempt: int) -> None:
    """compute_backoff(attempt, config) >= 0.0 for all attempt in [0, 20]."""
    random.seed(42)
    delay = compute_backoff(attempt, DEFAULT_CONFIG)
    assert delay >= 0.0, (
        f"Expected delay >= 0.0 for attempt={attempt}, got {delay}"
    )


@pytest.mark.parametrize("attempt", range(0, 21))
def test_compute_backoff_non_negative_high_jitter(attempt: int) -> None:
    """Lower-bound holds even with maximum jitter (jitter_factor=1.0)."""
    random.seed(42)
    delay = compute_backoff(attempt, HIGH_JITTER_CONFIG)
    assert delay >= 0.0, (
        f"Expected delay >= 0.0 with high jitter for attempt={attempt}, got {delay}"
    )


@pytest.mark.parametrize("attempt", range(0, 21))
def test_compute_backoff_non_negative_zero_jitter(attempt: int) -> None:
    """Lower-bound trivially holds with zero jitter."""
    random.seed(42)
    delay = compute_backoff(attempt, ZERO_JITTER_CONFIG)
    assert delay >= 0.0, (
        f"Expected delay >= 0.0 with zero jitter for attempt={attempt}, got {delay}"
    )


# ---------------------------------------------------------------------------
# AC-2: delay <= max_delay_seconds * (1 + jitter_factor) for all attempts
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("attempt", range(0, 21))
def test_compute_backoff_upper_bound_default_config(attempt: int) -> None:
    """Result never exceeds max_delay * (1 + jitter_factor) for attempt in [0, 20]."""
    random.seed(42)
    delay = compute_backoff(attempt, DEFAULT_CONFIG)
    upper = DEFAULT_CONFIG.max_delay_seconds * (1 + DEFAULT_CONFIG.jitter_factor)
    assert delay <= upper, (
        f"Expected delay <= {upper} for attempt={attempt}, got {delay}"
    )


@pytest.mark.parametrize("attempt", range(0, 21))
def test_compute_backoff_upper_bound_high_jitter(attempt: int) -> None:
    """Upper-bound holds even when jitter_factor=1.0 (maximum positive jitter)."""
    random.seed(42)
    delay = compute_backoff(attempt, HIGH_JITTER_CONFIG)
    upper = HIGH_JITTER_CONFIG.max_delay_seconds * (1 + HIGH_JITTER_CONFIG.jitter_factor)
    assert delay <= upper, (
        f"Expected delay <= {upper} with high jitter for attempt={attempt}, got {delay}"
    )


@pytest.mark.parametrize("attempt", range(0, 21))
def test_compute_backoff_upper_bound_zero_jitter(attempt: int) -> None:
    """With zero jitter the delay equals the deterministic cap exactly."""
    random.seed(42)
    delay = compute_backoff(attempt, ZERO_JITTER_CONFIG)
    expected = min(
        ZERO_JITTER_CONFIG.base_delay_seconds * (2 ** attempt),
        ZERO_JITTER_CONFIG.max_delay_seconds,
    )
    upper = ZERO_JITTER_CONFIG.max_delay_seconds * (1 + ZERO_JITTER_CONFIG.jitter_factor)
    # Upper-bound check
    assert delay <= upper, (
        f"Expected delay <= {upper} with zero jitter for attempt={attempt}, got {delay}"
    )
    # Exact equality check (no jitter means deterministic)
    assert math.isclose(delay, expected, rel_tol=1e-9), (
        f"Expected delay == {expected} with zero jitter for attempt={attempt}, got {delay}"
    )


# ---------------------------------------------------------------------------
# AC-3: reproducibility — seeded runs must return the same value
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("attempt", range(0, 21))
def test_compute_backoff_reproducible_with_seed(attempt: int) -> None:
    """Two calls with the same seed must return identical results."""
    random.seed(42)
    first = compute_backoff(attempt, DEFAULT_CONFIG)
    random.seed(42)
    second = compute_backoff(attempt, DEFAULT_CONFIG)
    assert first == second, (
        f"Expected reproducible result for attempt={attempt}, "
        f"got {first} != {second}"
    )


# ---------------------------------------------------------------------------
# Additional edge-case / boundary tests (not AC, but good to have)
# ---------------------------------------------------------------------------

def test_compute_backoff_negative_attempt_treated_as_zero() -> None:
    """Negative attempt values must be normalised to 0 (no negative delay)."""
    random.seed(42)
    result_neg = compute_backoff(-5, DEFAULT_CONFIG)
    random.seed(42)
    result_zero = compute_backoff(0, DEFAULT_CONFIG)
    assert result_neg == result_zero, (
        f"Expected compute_backoff(-5) == compute_backoff(0), "
        f"got {result_neg} vs {result_zero}"
    )
    assert result_neg >= 0.0


def test_compute_backoff_saturates_at_max_delay() -> None:
    """At high attempt counts the raw delay must be capped at max_delay_seconds."""
    random.seed(42)
    # attempt=100 → base * 2^100 >> max_delay; raw_delay must equal max_delay
    delay = compute_backoff(100, DEFAULT_CONFIG)
    upper = DEFAULT_CONFIG.max_delay_seconds * (1 + DEFAULT_CONFIG.jitter_factor)
    assert delay <= upper, f"Upper bound violated at attempt=100: {delay} > {upper}"
    assert delay >= 0.0


def test_backoff_config_validates_base_delay() -> None:
    """BackoffConfig must reject base_delay_seconds <= 0."""
    with pytest.raises(ValueError, match="base_delay_seconds"):
        BackoffConfig(base_delay_seconds=0.0)
    with pytest.raises(ValueError, match="base_delay_seconds"):
        BackoffConfig(base_delay_seconds=-1.0)


def test_backoff_config_validates_max_delay() -> None:
    """BackoffConfig must reject max_delay_seconds <= 0."""
    with pytest.raises(ValueError, match="max_delay_seconds"):
        BackoffConfig(max_delay_seconds=0.0)


def test_backoff_config_validates_jitter_factor() -> None:
    """BackoffConfig must reject jitter_factor outside [0.0, 1.0]."""
    with pytest.raises(ValueError, match="jitter_factor"):
        BackoffConfig(jitter_factor=-0.1)
    with pytest.raises(ValueError, match="jitter_factor"):
        BackoffConfig(jitter_factor=1.1)


def test_compute_backoff_small_base_delay() -> None:
    """A very small base delay must still satisfy both bounds at attempt=0."""
    config = BackoffConfig(base_delay_seconds=0.001, max_delay_seconds=1.0, jitter_factor=0.5)
    random.seed(42)
    delay = compute_backoff(0, config)
    assert delay >= 0.0
    assert delay <= config.max_delay_seconds * (1 + config.jitter_factor)
