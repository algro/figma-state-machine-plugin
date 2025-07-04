// Storage module for handling client storage operations
/// <reference types="@figma/plugin-typings" />

import { ComponentInfo } from './component-analyzer';
import { STORAGE_KEY_PREFIX } from './constants';

export interface Interaction {
  id: string;
  component: string;
  primaryAction: string;
  conditionalRules: ConditionalRule[];
}

export interface ConditionalRule {
  id: number;
  condition: string;
  action: string;
  targetComponent?: string; // New: specify which component this rule affects
}

/**
 * Store interaction data in client storage
 */
export async function storeInteractionData(interactionData: Interaction): Promise<void> {
  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${interactionData.component}`;
    await figma.clientStorage.setAsync(storageKey, JSON.stringify(interactionData));
  } catch (error) {
    console.error('Error storing interaction data:', error);
  }
}

/**
 * Retrieve interaction data from client storage
 */
export async function retrieveInteractionData(componentId: string): Promise<Interaction | null> {
  try {
    const storageKey = `${STORAGE_KEY_PREFIX}${componentId}`;
    const storedData = await figma.clientStorage.getAsync(storageKey);
    if (storedData) {
      const interactionData = JSON.parse(storedData);
      return interactionData;
    }
  } catch (error) {
    console.error('Error retrieving interaction data:', error);
  }
  return null;
}

/**
 * Clean up stored interaction data for current components
 */
export async function cleanupStoredInteractions(components: ComponentInfo[]): Promise<void> {
  try {
    for (const component of components) {
      const storageKey = `${STORAGE_KEY_PREFIX}${component.id}`;
      await figma.clientStorage.deleteAsync(storageKey);
    }
  } catch (error) {
    console.error('Error cleaning up stored interactions:', error);
  }
}

/**
 * Get all existing interactions for a list of components
 */
export async function getExistingInteractions(
  components: ComponentInfo[]
): Promise<{ [componentId: string]: Interaction }> {
  const existingInteractions: { [componentId: string]: Interaction } = {};
  
  for (const component of components) {
    const existingInteraction = await retrieveInteractionData(component.id);
    if (existingInteraction) {
      existingInteractions[component.id] = existingInteraction;
    }
  }
  
  return existingInteractions;
} 