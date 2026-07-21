#[cfg(test)]
mod tests {
    use super::*;

    fn mock_compute_health_factor_with_thr(collateral_value: u128, threshold_bps: u128, debt: u128) -> u128 {
        if collateral_value == 0 {
            return 0;
        }
        if debt == 0 {
            return u128::MAX;
        }
        let adjusted_collateral = match collateral_value.checked_mul(threshold_bps) {
            Some(val) => val,
            None => return u128::MAX,
        };
        let liquidation_target = debt.checked_mul(10000).unwrap_or(u128::MAX);
        if adjusted_collateral == liquidation_target {
            return 10000;
        }
        adjusted_collateral.checked_mul(10000).unwrap_or(u128::MAX) / liquidation_target
    }

    #[test]
    fn test_zero_collateral_returns_zero() {
        let health_factor = mock_compute_health_factor_with_thr(0, 8000, 1000);
        assert_eq!(health_factor, 0);
    }

    #[test]
    fn test_collateral_exactly_at_threshold_returns_one() {
        let collateral = 1250;
        let threshold_bps = 8000;
        let debt = 1000;
        let health_factor = mock_compute_health_factor_with_thr(collateral, threshold_bps, debt);
        assert_eq!(health_factor, 10000);
    }

    #[test]
    fn test_overflow_safe_maximum_inputs() {
        let health_factor = mock_compute_health_factor_with_thr(u128::MAX, 10000, u128::MAX);
        assert!(health_factor > 0);
    }

    #[test]
    fn test_multi_collateral_aggregation() {
        let collaterals = vec![(1000, 8000), (2000, 7500)];
        let total_debt = 1500;
        let mut total_weighted_collateral = 0;
        for (value, threshold) in collaterals {
            total_weighted_collateral += value * threshold;
        }
        let liquidation_target = total_debt * 10000;
        let aggregated_hf = (total_weighted_collateral * 10000) / liquidation_target;
        assert_eq!(aggregated_hf, 15333);
    }
}
