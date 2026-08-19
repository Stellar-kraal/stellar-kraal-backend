"""
oracle_bridge/resilience.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~
Retry and back-off utilities for the oracle bridge.

The exponential back-off with jitter implemented here is deliberately kept
simple and self-contained so it can be tested in isolation without any
external dependencies.

Design notes
------------
``compute_backoff`` follows the "full-jitter" variant described in the AWS
Architecture Blog (https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/).
The core formula is::

    raw_delay = min(base_delay * 2 ** attempt, max_delay_seconds)
    jitter     = random.uniform(-raw_delay * jitter_factor,
                                 raw_delay * jitter_factor)
    delay      = max(0.0, raw_delay + jitter)

Key invariants (all enforced by the implementation and verified by the test
suite in oracle-bridge/tests/test_resilience.py — issue #129):

* ``delay >= 0.0``  for every attempt in [0, ∞)
* ``delay <= max_delay_seconds * (1 + jitter_factor)`` for every attempt
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field


@dataclass(frozen=True)
class BackoffConfig:
    """Configuration for :func:`compute_backoff`.

    Attributes
    ----------
    base_delay_seconds:
        Delay for attempt 0 before jitter is applied.  Must be > 0.
    max_delay_seconds:
        Hard ceiling on the deterministic (pre-jitter) delay.  The actual
        returned value may exceed this by at most ``jitter_factor * 100 %``
        if the jitter is positive, but the test suite validates that the
        absolute maximum never exceeds ``max_delay_seconds * (1 + jitter_factor)``.
    jitter_factor:
        Fraction of the raw delay used as the jitter window.  For example,
        ``0.25`` means the delay may be anywhere in
        ``[raw * 0.75, raw * 1.25]`` before the ``max(0.0, …)`` guard.
        Must be in [0.0, 1.0].
    """

    base_delay_seconds: float = 1.0
    max_delay_seconds: float = 60.0
    jitter_factor: float = 0.25

    def __post_init__(self) -> None:
        if self.base_delay_seconds <= 0:
            raise ValueError("base_delay_seconds must be > 0")
        if self.max_delay_seconds <= 0:
            raise ValueError("max_delay_seconds must be > 0")
        if not (0.0 <= self.jitter_factor <= 1.0):
            raise ValueError("jitter_factor must be in [0.0, 1.0]")


def compute_backoff(attempt: int, config: BackoffConfig) -> float:
    """Return the number of seconds to wait before retry number *attempt*.

    Parameters
    ----------
    attempt:
        Zero-based retry attempt counter.  ``attempt=0`` is the delay
        before the first retry; ``attempt=1`` before the second, etc.
        Negative values are treated as 0.
    config:
        :class:`BackoffConfig` instance describing the back-off shape.

    Returns
    -------
    float
        Non-negative delay in seconds, guaranteed to satisfy::

            0.0 <= delay <= config.max_delay_seconds * (1 + config.jitter_factor)
    """
    if attempt < 0:
        attempt = 0

    # Exponential base delay, capped at max_delay_seconds.
    raw_delay = min(config.base_delay_seconds * (2 ** attempt), config.max_delay_seconds)

    # Symmetric jitter: uniform draw from [-window, +window].
    window = raw_delay * config.jitter_factor
    jitter = random.uniform(-window, window)

    # Lower bound: never return a negative delay.
    return max(0.0, raw_delay + jitter)
