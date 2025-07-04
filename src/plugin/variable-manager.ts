// Variable manager module for handling Figma variables creation and management
/// <reference types="@figma/plugin-typings" />

import { ComponentInfo } from './component-analyzer';
import { Interaction } from './storage';
import { VARIABLE_COLLECTION_NAME } from './constants';
import { extractPropertyValue } from './utils';

export interface VariableBindingResult {
  instanceVars: Variable[];
  originalStates: string[];
}

let variableCollection: VariableCollection | null = null;

/**
 * Setup variable collection for state management
 */
export async function setupVariableCollection(): Promise<void> {
  try {
    // Check if collection already exists
    const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
    variableCollection = existingCollections.find(c => c.name === VARIABLE_COLLECTION_NAME) || null;
    
    if (!variableCollection) {
      variableCollection = figma.variables.createVariableCollection(VARIABLE_COLLECTION_NAME);
    }
    
  } catch (error) {
    console.error('Error setting up variable collection:', error);
  }
}

/**
 * Get the current variable collection
 */
export function getVariableCollection(): VariableCollection | null {
  return variableCollection;
}

/**
 * Create and bind variables for component instances
 */
export async function createAndBindVariables(
  interaction: Interaction,
  component: ComponentInfo,
  actualPropertyName: string,
  primaryProp: string
): Promise<VariableBindingResult> {
  if (!variableCollection) {
    throw new Error('Variable collection not initialized');
  }

  const instanceVars: Variable[] = [];
  const originalStates: string[] = [];
  
  for (let i = 0; i < component.instances.length; i++) {
    const instance = component.instances[i];
    
    // Create a unique variable for this instance
    const instanceVar = figma.variables.createVariable(
      `${interaction.id}_instance_${i}_${primaryProp}`, 
      variableCollection, 
      'STRING'
    );
    
    // Get and store the original state of this instance
    let originalState = '';
    if (instance.componentProperties && instance.componentProperties[actualPropertyName]) {
      const propValue = instance.componentProperties[actualPropertyName];
      originalState = extractPropertyValue(propValue);
    }
    
    originalStates.push(originalState);
    
    // Set initial value to original state
    instanceVar.setValueForMode(variableCollection.defaultModeId, originalState);
    instanceVars.push(instanceVar);
    
    // Bind the variable to the variant property
    try {
      const variableAlias = figma.variables.createVariableAlias(instanceVar);
      const properties: {[key: string]: any} = {};
      properties[actualPropertyName] = variableAlias;
      instance.setProperties(properties);
    } catch (bindError) {
      console.error(`Failed to bind variable to instance ${i + 1}:`, bindError);
    }
  }

  return { instanceVars, originalStates };
}

/**
 * Comprehensive cleanup of orphaned variables and broken assignments
 */
export async function performComprehensiveCleanup(): Promise<void> {
  try {
    const allVariables = await figma.variables.getLocalVariablesAsync();
    const allCollections = await figma.variables.getLocalVariableCollectionsAsync();
    
    // Find our state management collection
    const stateCollection = allCollections.find(c => c.name === VARIABLE_COLLECTION_NAME);
    
    if (!stateCollection) {
      return;
    }
    
    // Get all variables in our collection
    const stateVariables = allVariables.filter(v => v.variableCollectionId === stateCollection.id);
    
    if (stateVariables.length === 0) {
      return;
    }
    
    // Find all variables that are actually in use by collecting all variable IDs from reactions
    const variablesInUse = new Set<string>();
    
    // Check all nodes in the document for reactions that use our variables
    const allNodes = figma.currentPage.findAll();
    for (const node of allNodes) {
      if ('reactions' in node && node.reactions) {
        for (const reaction of node.reactions) {
          if (reaction.actions) {
            for (const action of reaction.actions) {
              if (action.type === 'SET_VARIABLE' && action.variableId) {
                variablesInUse.add(action.variableId);
              }
            }
          }
        }
      }
    }
    
    // Remove only orphaned variables (those not referenced by any reactions)
    let removedCount = 0;
    for (const variable of stateVariables) {
      if (!variablesInUse.has(variable.id)) {
        try {
          variable.remove();
          removedCount++;
        } catch (error) {
          console.error(`Failed to remove variable "${variable.name}":`, error);
        }
      }
    }
    
    console.log(`Removed ${removedCount} orphaned variables`);
    
  } catch (error) {
    console.error('Error during comprehensive cleanup:', error);
  }
}

/**
 * Clean up existing variables for a specific interaction
 */
export async function cleanupExistingInteraction(interactionId: string): Promise<void> {
  if (!variableCollection) return;
  
  try {
    const existingVariables = await figma.variables.getLocalVariablesAsync();
    
    for (const variable of existingVariables) {
      if (variable.variableCollectionId === variableCollection.id && 
          variable.name.startsWith(interactionId)) {
        variable.remove();
      }
    }
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

/**
 * Create variables for an interaction
 */
export async function createInteractionVariables(
  interactionData: Interaction
): Promise<{ primaryVar: Variable; conditionalVars: Variable[] }> {
  if (!variableCollection) {
    throw new Error('Variable collection not initialized');
  }

  const interactionId = interactionData.id;
  const primaryVarName = `${interactionId}_primary`;
  
  // Create boolean variable for primary action
  const primaryVar = figma.variables.createVariable(primaryVarName, variableCollection, 'BOOLEAN');
  
  // Set default value
  primaryVar.setValueForMode(variableCollection.defaultModeId, false);
  
  // Create variables for conditional rules
  const conditionalVars: Variable[] = [];
  for (let i = 0; i < interactionData.conditionalRules.length; i++) {
    const conditionalVarName = `${interactionId}_conditional_${i}`;
    const conditionalVar = figma.variables.createVariable(conditionalVarName, variableCollection, 'BOOLEAN');
    conditionalVar.setValueForMode(variableCollection.defaultModeId, false);
    conditionalVars.push(conditionalVar);
  }

  return { primaryVar, conditionalVars };
} 