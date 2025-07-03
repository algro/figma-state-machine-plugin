// Interaction manager module for handling interaction creation and management
/// <reference types="@figma/plugin-typings" />

import { Interaction, ComponentInfo } from './types';
import { RESET_TO_INITIAL } from './constants';
import { extractPropertyValue, sendMessageToUI } from './utils';
import { 
  setupVariableCollection, 
  createInteractionVariables, 
  createAndBindVariables, 
  cleanupExistingInteraction 
} from './variable-manager';
import { findVariantProperty } from './component-analyzer';
import { storeInteractionData } from './storage';

let componentData: ComponentInfo[] = [];
const interactions: Interaction[] = [];

/**
 * Set component data for interaction management
 */
export function setComponentData(data: ComponentInfo[]): void {
  componentData = data;
}

/**
 * Get current component data
 */
export function getComponentData(): ComponentInfo[] {
  return componentData;
}

/**
 * Create interaction and corresponding variables
 */
export async function createInteraction(interactionData: Interaction): Promise<void> {
  try {
    await setupVariableCollection();
    
    // Clean up any existing interaction with the same ID
    await cleanupExistingInteraction(interactionData.id);
    
    // Create variables for this interaction
    const { primaryVar, conditionalVars } = await createInteractionVariables(interactionData);
    
    // Store the interaction
    interactions.push(interactionData);
    
    // Store interaction data in client storage for persistence
    await storeInteractionData(interactionData);
    
    // Apply variables and prototype links to instances
    await applyInteractionToInstances(interactionData, primaryVar, conditionalVars);
    
    const componentName = componentData.find(c => c.id === interactionData.component)?.name || 'Unknown Component';
    sendMessageToUI('interaction-created', null, `Interaction created successfully for ${componentName}`);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendMessageToUI('error', null, `Failed to create interaction: ${message}`);
  }
}

/**
 * Apply interaction to component instances
 */
async function applyInteractionToInstances(
  interaction: Interaction, 
  _primaryVar: Variable, 
  _conditionalVars: Variable[]
): Promise<void> {
  try {
    // Find the component
    const component = componentData.find(c => c.id === interaction.component);
    if (!component) return;
    
    // Parse the primary action to get property and value  
    const [primaryProp, primaryValue] = interaction.primaryAction.split('=');
    
    // Find the actual VARIANT property name for the component
    const { actualPropertyName, isVariantProperty } = await findVariantProperty(primaryProp, component.instances);
    
    // Create and bind variables for this interaction (only if we have a valid variant property)
    let instanceVars: Variable[] = [];
    let originalStates: string[] = [];
    
    if (actualPropertyName && isVariantProperty) {
      const result = await createAndBindVariables(interaction, component, actualPropertyName, primaryProp);
      instanceVars = result.instanceVars;
      originalStates = result.originalStates;
    }
    
    // Clean up existing reactions on all instances first
    for (let i = 0; i < component.instances.length; i++) {
      const instance = component.instances[i];
      try {
        await instance.setReactionsAsync([]);
      } catch (error) {
        console.error(`Failed to clear reactions on instance ${i + 1}:`, error);
      }
    }
    
    // Apply reactions to each instance
    for (let i = 0; i < component.instances.length; i++) {
      const instance = component.instances[i];
      
      try {
        if (actualPropertyName && isVariantProperty && instanceVars.length > 0) {
          await applyVariableBasedReactions(
            instance, 
            i, 
            interaction, 
            component, 
            instanceVars, 
            originalStates, 
            primaryProp, 
            primaryValue
          );
        } else {
          // Create basic click interaction without state management
          const reaction = {
            trigger: { type: 'ON_CLICK' as const },
            actions: []
          };
          
          await instance.setReactionsAsync([reaction]);
        }
        
      } catch (reactionError) {
        console.error(`Failed to apply reaction to ${instance.name}:`, reactionError);
      }
    }
    
  } catch (error) {
    console.error('Error applying interaction to instances:', error);
  }
}

/**
 * Apply variable-based reactions to an instance
 */
async function applyVariableBasedReactions(
  instance: InstanceNode,
  instanceIndex: number,
  interaction: Interaction,
  component: ComponentInfo,
  instanceVars: Variable[],
  originalStates: string[],
  primaryProp: string,
  primaryValue: string
): Promise<void> {
  // Create variable-based actions for state management
  const actions = [
    // Action 1: Set this instance to primary action value
    {
      type: 'SET_VARIABLE' as const,
      variableId: instanceVars[instanceIndex].id,
      variableValue: {
        resolvedType: 'STRING' as const,
        type: 'STRING' as const,
        value: String(primaryValue)
      }
    }
  ];
  
  // Action 2: Process conditional rules for other instances
  const ruleMap = new Map<string, string>();
  let mainResetValue: string | null = null;
  
  for (const rule of interaction.conditionalRules) {
    if (!rule.condition || !rule.action || !rule.condition.includes('=')) {
      continue;
    }
    
    const [conditionProp, conditionValue] = rule.condition.split('=');
    const actionValue = rule.action;
    
    if ((conditionProp === primaryProp || conditionProp.toLowerCase() === primaryProp.toLowerCase())) {
      ruleMap.set(conditionValue, actionValue);
      
      if (conditionValue === primaryValue) {
        mainResetValue = actionValue;
      }
    }
  }
  
  // Apply rules to other instances
  for (let j = 0; j < component.instances.length; j++) {
    if (instanceIndex === j) continue; // Skip the clicked instance
    
    const otherInstance = component.instances[j];
    
    // Get current value of other instance
    let currentInstanceValue = '';
    if (otherInstance.componentProperties && otherInstance.componentProperties[primaryProp]) {
      const propValue = otherInstance.componentProperties[primaryProp];
      currentInstanceValue = extractPropertyValue(propValue);
    }
    
    // Determine target value based on rules
    let targetValue: string = originalStates[j]; // Default to original state
    let ruleApplied = false;
    
    // Check if there's a specific rule for this instance's current state
    if (ruleMap.has(currentInstanceValue)) {
      const ruleAction = ruleMap.get(currentInstanceValue)!;
      
      if (ruleAction === RESET_TO_INITIAL) {
        targetValue = originalStates[j];
        ruleApplied = true;
      } else if (ruleAction.includes('=')) {
        const [actionProp, actionValue] = ruleAction.split('=');
        if (actionProp === primaryProp || actionProp.toLowerCase() === primaryProp.toLowerCase()) {
          targetValue = actionValue;
          ruleApplied = true;
        }
      }
    } 
    
    // If no specific rule matched, check if there's a main reset rule
    if (!ruleApplied && mainResetValue) {
      if (mainResetValue === RESET_TO_INITIAL) {
        targetValue = originalStates[j];
        ruleApplied = true;
      } else if (mainResetValue.includes('=')) {
        const [actionProp, actionValue] = mainResetValue.split('=');
        if (actionProp === primaryProp || actionProp.toLowerCase() === primaryProp.toLowerCase()) {
          targetValue = actionValue;
          ruleApplied = true;
        }
      }
    }
    
    // Final fallback: reset to original state
    if (!ruleApplied) {
      targetValue = originalStates[j];
    }
    
    actions.push({
      type: 'SET_VARIABLE' as const,
      variableId: instanceVars[j].id,
      variableValue: {
        resolvedType: 'STRING' as const,
        type: 'STRING' as const,
        value: String(targetValue)
      }
    });
  }
  
  // Create the reaction for this instance
  const reaction = {
    trigger: { type: 'ON_CLICK' as const },
    actions: actions
  };
  
  // Apply the reaction to this instance
  await instance.setReactionsAsync([reaction]);
} 