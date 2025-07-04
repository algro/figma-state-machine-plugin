// Main plugin entry point for the State Machine Plugin
/// <reference types="@figma/plugin-typings" />

import { UI_WIDTH, UI_HEIGHT } from './constants';
import { sendMessageToUI, handleError } from './utils';
import { findNestedInstances, groupInstancesByComponent, ComponentInfo } from './component-analyzer';
import { setupVariableCollection, performComprehensiveCleanup } from './variable-manager';
import { createInteraction, setComponentData, getComponentData } from './interaction-manager';
import { getExistingInteractions, cleanupStoredInteractions, Interaction } from './storage';

export interface InitSuccessData {
  selectedInstance: string;
  components: ComponentInfo[];
  existingInteractions: { [componentId: string]: Interaction };
}

// Initialize plugin
figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT });

// Add selection change listener to automatically update UI
figma.on('selectionchange', async () => {
  // Show loading state in UI
  sendMessageToUI('selection-changed', null, 'Analyzing new selection...');
  await initializePlugin();
});

// Main message handler
figma.ui.onmessage = async (msg: { type: string; data?: any }) => {
  try {
    switch (msg.type) {
      case 'init':
        await initializePlugin();
        break;
      case 'create-interaction':
        await createInteraction(msg.data); // msg.data now may include nestedActions
        break;
      case 'get-components':
        sendMessageToUI('components-data', getComponentData());
        break;
      case 'cleanup':
        await performComprehensiveCleanup();
        sendMessageToUI('cleanup-complete', null, 'Comprehensive cleanup completed successfully');
        break;
      case 'cleanup-stored-data':
        await cleanupStoredInteractions(getComponentData());
        sendMessageToUI('cleanup-complete', null, 'Stored interaction data cleaned up successfully');
        break;
      case 'cancel':
        figma.closePlugin();
        break;
      default:
        console.log('Unknown message type:', msg.type);
    }
  } catch (error) {
    handleError(error, 'Message handler');
  }
};

/**
 * Initialize plugin and analyze selection
 */
async function initializePlugin(): Promise<void> {
  try {
    const selection = figma.currentPage.selection;
    
    // Validate selection
    if (selection.length !== 1) {
      sendMessageToUI('error', null, 'Please select exactly one component instance.');
      return;
    }

    const selectedNode = selection[0];
    
    // Check if selected node is a component instance
    if (selectedNode.type !== 'INSTANCE') {
      sendMessageToUI('error', null, 'Selected element must be a component instance.');
      return;
    }

    // Analyze nested instances
    const nestedInstances = findNestedInstances(selectedNode);
    
    if (nestedInstances.length === 0) {
      sendMessageToUI('error', null, 'No nested component instances found in selection.');
      return;
    }

    // Group instances by component
    const componentData = await groupInstancesByComponent(nestedInstances);
    
    // Set component data for other modules
    setComponentData(componentData);
    
    // Create or get variable collection
    await setupVariableCollection();
    
    // Check for existing interactions for each component
    const existingInteractions = await getExistingInteractions(componentData);
    
    // Send success message with component data and existing interactions
    const initData: InitSuccessData = {
      selectedInstance: selectedNode.name,
      components: componentData,
      existingInteractions: existingInteractions
    };
    
    sendMessageToUI('init-success', initData);
    
  } catch (error) {
    handleError(error, 'Initialization failed');
  }
} 