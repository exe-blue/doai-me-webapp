/**
 * Onboarding Steps Index
 */

export { BaseStep, type StepContext } from './BaseStep';
export { HardwareStep } from './HardwareStep';
export { StandardizeStep } from './StandardizeStep';
export { NamingStep } from './NamingStep';
export { AccessibilityStep } from './AccessibilityStep';
export { SecurityStep } from './SecurityStep';
export { AppsStep } from './AppsStep';
export { NetworkStep } from './NetworkStep';
export { AccountStep } from './AccountStep';
export { ReadyStep } from './ReadyStep';

import { OnboardingStep } from '../types';
import { BaseStep } from './BaseStep';
import { HardwareStep } from './HardwareStep';
import { StandardizeStep } from './StandardizeStep';
import { NamingStep } from './NamingStep';
import { AccessibilityStep } from './AccessibilityStep';
import { SecurityStep } from './SecurityStep';
import { AppsStep } from './AppsStep';
import { NetworkStep } from './NetworkStep';
import { AccountStep } from './AccountStep';
import { ReadyStep } from './ReadyStep';

/**
 * 단계 이름으로 단계 인스턴스 생성
 */
export function createStep(stepName: OnboardingStep): BaseStep {
  switch (stepName) {
    case 'hardware':
      return new HardwareStep();
    case 'standardize':
      return new StandardizeStep();
    case 'naming':
      return new NamingStep();
    case 'accessibility':
      return new AccessibilityStep();
    case 'security':
      return new SecurityStep();
    case 'apps':
      return new AppsStep();
    case 'network':
      return new NetworkStep();
    case 'account':
      return new AccountStep();
    case 'ready':
      return new ReadyStep();
    default:
      throw new Error(`Unknown onboarding step: ${stepName}`);
  }
}
