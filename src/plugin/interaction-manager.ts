// Interaction manager module for handling interaction creation and management
/// <reference types="@figma/plugin-typings" />

import { ComponentInfo } from './component-analyzer';
import { Interaction, ConditionalRule } from './storage';
import { RESET_TO_INITIAL } from './constants';
import { extractPropertyValue, sendMessageToUI } from './utils';
import { 
  setupVariableCollection, 
  createInteractionVariables, 
  createAndBindVariables, 
  cleanupExistingInteraction 
} from './variable-manager';
import { findVariantProperty, PropertyAnalysisResult } from './component-analyzer';
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
export async function createInteraction(interactionData: any): Promise<void> {
  try {
    await setupVariableCollection();
    await cleanupExistingInteraction(interactionData.id);
    // Handle main interaction as before
    const { primaryVar, conditionalVars } = await createInteractionVariables(interactionData);
    interactions.push(interactionData);
    await storeInteractionData(interactionData);
    await applyInteractionToInstances(interactionData, primaryVar, conditionalVars);
    // Handle nested actions (multi-target)
    if (interactionData.nestedActions && Array.isArray(interactionData.nestedActions)) {
      for (const nestedAction of interactionData.nestedActions) {
        const nestedComponent = componentData.find(c => c.id === nestedAction.componentId);
        if (!nestedComponent) continue;
        // Create a fake interaction object for the nested component
        const fakeInteraction = {
          id: `${interactionData.id}_nested_${nestedComponent.id}`,
          component: nestedComponent.id,
          primaryAction: nestedAction.action,
          conditionalRules: []
        };
        const { primaryVar: nestedPrimaryVar, conditionalVars: nestedConditionalVars } = await createInteractionVariables(fakeInteraction);
        await applyInteractionToInstances(fakeInteraction, nestedPrimaryVar, nestedConditionalVars);
      }
    }
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
  interaction: any, // Changed to any to support nestedActions
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
  
  // Process conditional rules for other components
  for (const rule of interaction.conditionalRules || []) {
    if (!rule.condition || !rule.action || !rule.targetComponent || !rule.condition.includes('=')) {
      continue;
    }
    
    const [conditionProp, conditionValue] = rule.condition.split('=');
    
    // Check if this rule's condition matches the current instance state
    let currentInstanceValue = '';
    if (instance.componentProperties && instance.componentProperties[conditionProp]) {
      const propValue = instance.componentProperties[conditionProp];
      currentInstanceValue = extractPropertyValue(propValue);
    }
    
    if (currentInstanceValue === conditionValue) {
      // This rule should be applied - find the target component
      const targetComponent = componentData.find(c => c.id === rule.targetComponent);
      if (!targetComponent) continue;
      
      // For cross-component actions, we need to create variables for the target component
      // and then set those variables. This is a simplified approach.
      try {
        // Parse the action
        let targetValue = rule.action;
        if (rule.action === RESET_TO_INITIAL) {
          targetValue = 'default'; // Simplified - you'll need proper original state tracking
        } else if (rule.action.includes('=')) {
          const [actionProp, actionValue] = rule.action.split('=');
          targetValue = actionValue;
        }
        
        // For now, we'll create a simple variable-based action
        // In a full implementation, you'd need to create and bind variables for the target component
        console.log(`Would set ${targetComponent.name} to ${targetValue} when ${component.name} is ${conditionValue}`);
        
        // TODO: Implement proper variable creation and binding for cross-component actions
        // This requires creating variables for the target component and binding them to its properties
        
      } catch (error) {
        console.error(`Failed to apply cross-component rule to ${targetComponent.name}:`, error);
      }
    }
  }
  
  // Create the reaction for this instance
  const reaction = {
    trigger: { type: 'ON_CLICK' as const },
    actions: actions
  };
  
  // Apply the reaction to this instance
  await instance.setReactionsAsync([reaction]);
} 