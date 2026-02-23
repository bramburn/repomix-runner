import React from 'react';
import { Text } from '@fluentui/react-components';

const BATCH_INPUT_PER_MTOK = 7.5;
const BATCH_OUTPUT_PER_MTOK = 37.5;

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

export function estimateBatchCost(
  inputTokens: number,
  outputTokens: number = Math.round(inputTokens * 0.2)
): number {
  const inputCost = (inputTokens / 1_000_000) * BATCH_INPUT_PER_MTOK;
  const outputCost = (outputTokens / 1_000_000) * BATCH_OUTPUT_PER_MTOK;
  return inputCost + outputCost;
}

interface CostEstimatorProps {
  inputTokens: number;
  outputTokens?: number;
}

export const CostEstimator: React.FC<CostEstimatorProps> = ({ inputTokens, outputTokens }) => {
  const estimatedOutput = outputTokens ?? Math.round(inputTokens * 0.2);
  const total = estimateBatchCost(inputTokens, estimatedOutput);

  return (
    <Text size={200} style={{ opacity: 0.8 }}>
      Est. cost {formatUsd(total)} ({inputTokens.toLocaleString()} in /{' '}
      {estimatedOutput.toLocaleString()} out)
    </Text>
  );
};
