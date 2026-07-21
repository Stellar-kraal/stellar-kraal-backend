/**
 * src/monitoring/rules/index.ts
 */

import { monitorConfig } from '../config';
import { AnomalyRule } from '../types';
import { createLargeValueRule } from './largeValue.rule';
import { createOracleDeviationRule } from './oracleDeviation.rule';
import { createUnauthorizedEntryPointRule } from './unauthorizedEntryPoint.rule';
import { createVolumeSpikeRule } from './volumeSpike.rule';

export function createDefaultRules(config: typeof monitorConfig = monitorConfig): AnomalyRule[] {
  return [
    createLargeValueRule(config),
    createOracleDeviationRule(config),
    createUnauthorizedEntryPointRule(config),
    createVolumeSpikeRule(config),
  ];
}

export * from './largeValue.rule';
export * from './oracleDeviation.rule';
export * from './unauthorizedEntryPoint.rule';
export * from './volumeSpike.rule';
