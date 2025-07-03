// TypeScript interfaces and types for the State Machine Plugin
/// <reference types="@figma/plugin-typings" />

export interface ComponentInfo {
  id: string;
  name: string;
  instances: InstanceNode[];
  states: string[];
  properties: { [key: string]: string[] };
}

export interface ConditionalRule {
  id: number;
  condition: string;
  action: string;
}

export interface Interaction {
  id: string;
  component: string;
  primaryAction: string;
  conditionalRules: ConditionalRule[];
}

export interface PluginMessage {
  type: string;
  data?: any;
  message?: string;
}

export interface InitSuccessData {
  selectedInstance: string;
  components: ComponentInfo[];
  existingInteractions: { [componentId: string]: Interaction };
}

export interface VariableBindingResult {
  instanceVars: Variable[];
  originalStates: string[];
}

export interface PropertyAnalysisResult {
  actualPropertyName: string | null;
  isVariantProperty: boolean;
} 