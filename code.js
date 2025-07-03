"use strict";
// Dynamic State Handler Plugin for Figma
// This plugin manages state transitions between component variants
// Utility function to extract string value from component property
function extractPropertyValue(propValue) {
    if (typeof propValue === 'string') {
        return propValue;
    }
    if (propValue && typeof propValue === 'object') {
        const objValue = propValue;
        if ('value' in objValue) {
            return String(objValue.value);
        }
        if ('name' in objValue) {
            return String(objValue.name);
        }
        return String(propValue);
    }
    return String(propValue);
}
// Constants for better maintainability
const RESET_TO_INITIAL = 'RESET_TO_INITIAL';
const DEBUG_INSTANCE_INDEX = 16; // For debugging specific instance (Instance 17)
let componentData = [];
let interactions = [];
let variableCollection = null;
// Initialize plugin
figma.showUI(__html__, { width: 800, height: 600 });
// Add selection change listener to automatically update UI
figma.on('selectionchange', async () => {
    // Show loading state in UI
    figma.ui.postMessage({
        type: 'selection-changed',
        message: 'Analyzing new selection...'
    });
    await initializePlugin();
});
// Main message handler
figma.ui.onmessage = async (msg) => {
    switch (msg.type) {
        case 'init':
            await initializePlugin();
            break;
        case 'create-interaction':
            await createInteraction(msg.data);
            break;
        case 'get-components':
            figma.ui.postMessage({ type: 'components-data', data: componentData });
            break;
        case 'cleanup':
            await performComprehensiveCleanup();
            figma.ui.postMessage({
                type: 'cleanup-complete',
                message: 'Comprehensive cleanup completed successfully'
            });
            break;
        case 'cleanup-stored-data':
            await cleanupStoredInteractions();
            figma.ui.postMessage({
                type: 'cleanup-complete',
                message: 'Stored interaction data cleaned up successfully'
            });
            break;
        case 'cancel':
            figma.closePlugin();
            break;
        default:
            console.log('Unknown message type:', msg.type);
    }
};
// Initialize plugin and analyze selection
async function initializePlugin() {
    try {
        const selection = figma.currentPage.selection;
        // Validate selection
        if (selection.length !== 1) {
            figma.ui.postMessage({
                type: 'error',
                message: 'Please select exactly one component instance.'
            });
            return;
        }
        const selectedNode = selection[0];
        // Check if selected node is a component instance
        if (selectedNode.type !== 'INSTANCE') {
            figma.ui.postMessage({
                type: 'error',
                message: 'Selected element must be a component instance.'
            });
            return;
        }
        // Analyze nested instances
        const nestedInstances = findNestedInstances(selectedNode);
        if (nestedInstances.length === 0) {
            figma.ui.postMessage({
                type: 'error',
                message: 'No nested component instances found in selection.'
            });
            return;
        }
        // Group instances by component
        componentData = await groupInstancesByComponent(nestedInstances);
        // Create or get variable collection
        await setupVariableCollection();
        // Check for existing interactions for each component
        const existingInteractions = {};
        for (const component of componentData) {
            const existingInteraction = await retrieveInteractionData(component.id);
            if (existingInteraction) {
                existingInteractions[component.id] = existingInteraction;
            }
        }
        // Send success message with component data and existing interactions
        figma.ui.postMessage({
            type: 'init-success',
            data: {
                selectedInstance: selectedNode.name,
                components: componentData,
                existingInteractions: existingInteractions
            }
        });
    }
    catch (error) {
        figma.ui.postMessage({
            type: 'error',
            message: `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
    }
}
// Find all nested component instances
function findNestedInstances(node) {
    const instances = [];
    function traverse(node) {
        if (node.type === 'INSTANCE') {
            instances.push(node);
        }
        if ('children' in node) {
            for (const child of node.children) {
                traverse(child);
            }
        }
    }
    // Start traversal from children (exclude the main selected instance)
    if ('children' in node) {
        for (const child of node.children) {
            traverse(child);
        }
    }
    return instances;
}
// Group instances by their component
async function groupInstancesByComponent(instances) {
    const componentMap = new Map();
    for (const instance of instances) {
        const mainComponent = await instance.getMainComponentAsync();
        if (!mainComponent)
            continue;
        // Check if this component is part of a component set
        const componentSet = mainComponent.parent;
        let groupingId;
        let groupingName;
        if (componentSet && componentSet.type === 'COMPONENT_SET') {
            // Group by component set (all variants together)
            groupingId = componentSet.id;
            groupingName = componentSet.name;
        }
        else {
            // Fallback to individual component (non-variant components)
            groupingId = mainComponent.id;
            groupingName = mainComponent.name;
        }
        if (!componentMap.has(groupingId)) {
            componentMap.set(groupingId, {
                id: groupingId,
                name: groupingName,
                instances: [],
                states: [],
                properties: {}
            });
        }
        const componentInfo = componentMap.get(groupingId);
        componentInfo.instances.push(instance);
        // Extract states from component properties
        if (instance.componentProperties && componentSet && componentSet.type === 'COMPONENT_SET') {
            const componentSetNode = componentSet;
            for (const [propName, propValue] of Object.entries(instance.componentProperties)) {
                if (!componentInfo.properties[propName]) {
                    componentInfo.properties[propName] = [];
                }
                // Get all possible values for this property from the component set
                if (componentSetNode.componentPropertyDefinitions) {
                    const propDef = componentSetNode.componentPropertyDefinitions[propName];
                    if (propDef && propDef.type === 'VARIANT' && propDef.variantOptions) {
                        // Add all variant options for this property
                        propDef.variantOptions.forEach(option => {
                            componentInfo.properties[propName].push(option);
                        });
                    }
                }
            }
        }
    }
    const result = Array.from(componentMap.values());
    return result;
}
// Setup variable collection for state management
async function setupVariableCollection() {
    try {
        // Check if collection already exists
        const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
        variableCollection = existingCollections.find(c => c.name === 'state-machine') || null;
        if (!variableCollection) {
            variableCollection = figma.variables.createVariableCollection('state-machine');
        }
    }
    catch (error) {
        console.error('Error setting up variable collection:', error);
    }
}
// Comprehensive cleanup of orphaned variables and broken assignments
async function performComprehensiveCleanup() {
    try {
        const allVariables = await figma.variables.getLocalVariablesAsync();
        const allCollections = await figma.variables.getLocalVariableCollectionsAsync();
        // Find our state management collection
        const stateCollection = allCollections.find(c => c.name === 'state-machine');
        if (!stateCollection) {
            return;
        }
        // Get all variables in our collection
        const stateVariables = allVariables.filter(v => v.variableCollectionId === stateCollection.id);
        if (stateVariables.length === 0) {
            return;
        }
        // Find all variables that are actually in use by collecting all variable IDs from reactions
        const variablesInUse = new Set();
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
                }
                catch (error) {
                    console.error(`Failed to remove variable "${variable.name}":`, error);
                }
            }
        }
        // Clear the interactions array since we're starting fresh
        interactions.length = 0;
    }
    catch (error) {
        console.error('Error during comprehensive cleanup:', error);
    }
}
// Clean up stored interaction data for current components
async function cleanupStoredInteractions() {
    try {
        for (const component of componentData) {
            const storageKey = `interaction_${component.id}`;
            await figma.clientStorage.deleteAsync(storageKey);
        }
    }
    catch (error) {
        console.error('Error cleaning up stored interactions:', error);
    }
}
// Clean up existing variables for this interaction
async function cleanupExistingInteraction(interactionId) {
    if (!variableCollection)
        return;
    try {
        const existingVariables = await figma.variables.getLocalVariablesAsync();
        for (const variable of existingVariables) {
            if (variable.variableCollectionId === variableCollection.id &&
                variable.name.startsWith(interactionId)) {
                variable.remove();
            }
        }
        // Remove from interactions array
        const existingIndex = interactions.findIndex(i => i.id === interactionId);
        if (existingIndex !== -1) {
            interactions.splice(existingIndex, 1);
        }
    }
    catch (error) {
        console.error('Error during cleanup:', error);
    }
}
// Create interaction and corresponding variables
async function createInteraction(interactionData) {
    var _a;
    try {
        if (!variableCollection) {
            await setupVariableCollection();
        }
        if (!variableCollection) {
            throw new Error('Failed to create variable collection');
        }
        // Clean up any existing interaction with the same ID
        await cleanupExistingInteraction(interactionData.id);
        // Create variables for this interaction
        const interactionId = interactionData.id;
        const primaryVarName = `${interactionId}_primary`;
        // Create boolean variable for primary action
        const primaryVar = figma.variables.createVariable(primaryVarName, variableCollection, 'BOOLEAN');
        // Set default value
        primaryVar.setValueForMode(variableCollection.defaultModeId, false);
        // Create variables for conditional rules
        const conditionalVars = [];
        for (let i = 0; i < interactionData.conditionalRules.length; i++) {
            const conditionalVarName = `${interactionId}_conditional_${i}`;
            const conditionalVar = figma.variables.createVariable(conditionalVarName, variableCollection, 'BOOLEAN');
            conditionalVar.setValueForMode(variableCollection.defaultModeId, false);
            conditionalVars.push(conditionalVar);
        }
        // Store the interaction
        interactions.push(interactionData);
        // Store interaction data in client storage for persistence
        await storeInteractionData(interactionData);
        // Apply variables and prototype links to instances
        await applyInteractionToInstances(interactionData, primaryVar, conditionalVars);
        figma.ui.postMessage({
            type: 'interaction-created',
            message: `Interaction created successfully for ${(_a = componentData.find(c => c.id === interactionData.component)) === null || _a === void 0 ? void 0 : _a.name}`
        });
    }
    catch (error) {
        figma.ui.postMessage({
            type: 'error',
            message: `Failed to create interaction: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
    }
}
// Store interaction data in client storage
async function storeInteractionData(interactionData) {
    try {
        const storageKey = `interaction_${interactionData.component}`;
        await figma.clientStorage.setAsync(storageKey, JSON.stringify(interactionData));
    }
    catch (error) {
        console.error('Error storing interaction data:', error);
    }
}
// Retrieve interaction data from client storage
async function retrieveInteractionData(componentId) {
    try {
        const storageKey = `interaction_${componentId}`;
        const storedData = await figma.clientStorage.getAsync(storageKey);
        if (storedData) {
            const interactionData = JSON.parse(storedData);
            return interactionData;
        }
    }
    catch (error) {
        console.error('Error retrieving interaction data:', error);
    }
    return null;
}
// Find the actual VARIANT property name for a component
async function findVariantProperty(primaryProp, instances) {
    if (instances.length === 0) {
        return { actualPropertyName: null, isVariantProperty: false };
    }
    const firstInstance = instances[0];
    const mainComponent = await firstInstance.getMainComponentAsync();
    const componentSet = mainComponent === null || mainComponent === void 0 ? void 0 : mainComponent.parent;
    // Check the component set for VARIANT properties
    if (componentSet && componentSet.type === 'COMPONENT_SET') {
        const componentSetNode = componentSet;
        if (componentSetNode.componentPropertyDefinitions) {
            for (const [propName, propDef] of Object.entries(componentSetNode.componentPropertyDefinitions)) {
                // Only match VARIANT type properties
                if (propDef.type === 'VARIANT' &&
                    (propName === primaryProp || propName.toLowerCase() === primaryProp.toLowerCase())) {
                    return { actualPropertyName: propName, isVariantProperty: true };
                }
            }
        }
    }
    return { actualPropertyName: null, isVariantProperty: false };
}
// Create and bind variables for component instances
async function createAndBindVariables(interaction, component, actualPropertyName, primaryProp) {
    const instanceVars = [];
    const originalStates = [];
    for (let i = 0; i < component.instances.length; i++) {
        const instance = component.instances[i];
        // Create a unique variable for this instance
        const instanceVar = figma.variables.createVariable(`${interaction.id}_instance_${i}_${primaryProp}`, variableCollection, 'STRING');
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
            const properties = {};
            properties[actualPropertyName] = variableAlias;
            instance.setProperties(properties);
        }
        catch (bindError) {
            console.error(`Failed to bind variable to instance ${i + 1}:`, bindError);
        }
    }
    return { instanceVars, originalStates };
}
// Apply interaction to component instances
async function applyInteractionToInstances(interaction, primaryVar, conditionalVars) {
    try {
        // Find the component
        const component = componentData.find(c => c.id === interaction.component);
        if (!component)
            return;
        // Parse the primary action to get property and value  
        const [primaryProp, primaryValue] = interaction.primaryAction.split('=');
        // Find the actual VARIANT property name for the component
        const { actualPropertyName, isVariantProperty } = await findVariantProperty(primaryProp, component.instances);
        // Create and bind variables for this interaction (only if we have a valid variant property)
        let instanceVars = [];
        let originalStates = [];
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
            }
            catch (error) {
                console.error(`Failed to clear reactions on instance ${i + 1}:`, error);
            }
        }
        // Apply reactions to each instance
        for (let i = 0; i < component.instances.length; i++) {
            const instance = component.instances[i];
            try {
                if (actualPropertyName && isVariantProperty && instanceVars.length > 0) {
                    // Create variable-based actions for state management
                    const actions = [
                        // Action 1: Set this instance to primary action value
                        {
                            type: 'SET_VARIABLE',
                            variableId: instanceVars[i].id,
                            variableValue: {
                                resolvedType: 'STRING',
                                type: 'STRING',
                                value: String(primaryValue)
                            }
                        }
                    ];
                    // Action 2: Process conditional rules for other instances
                    const ruleMap = new Map();
                    let mainResetValue = null;
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
                        if (i === j)
                            continue; // Skip the clicked instance
                        const otherInstance = component.instances[j];
                        // Get current value of other instance
                        let currentInstanceValue = '';
                        if (otherInstance.componentProperties && otherInstance.componentProperties[actualPropertyName]) {
                            const propValue = otherInstance.componentProperties[actualPropertyName];
                            currentInstanceValue = extractPropertyValue(propValue);
                        }
                        // Determine target value based on rules
                        let targetValue = originalStates[j]; // Default to original state
                        let ruleApplied = false;
                        // Check if there's a specific rule for this instance's current state
                        if (ruleMap.has(currentInstanceValue)) {
                            const ruleAction = ruleMap.get(currentInstanceValue);
                            if (ruleAction === RESET_TO_INITIAL) {
                                targetValue = originalStates[j];
                                ruleApplied = true;
                            }
                            else if (ruleAction.includes('=')) {
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
                            }
                            else if (mainResetValue.includes('=')) {
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
                            type: 'SET_VARIABLE',
                            variableId: instanceVars[j].id,
                            variableValue: {
                                resolvedType: 'STRING',
                                type: 'STRING',
                                value: String(targetValue)
                            }
                        });
                    }
                    // Create the reaction for this instance
                    const reaction = {
                        trigger: { type: 'ON_CLICK' },
                        actions: actions
                    };
                    // Apply the reaction to this instance
                    await instance.setReactionsAsync([reaction]);
                }
                else {
                    // Create basic click interaction without state management
                    const reaction = {
                        trigger: { type: 'ON_CLICK' },
                        actions: []
                    };
                    await instance.setReactionsAsync([reaction]);
                }
            }
            catch (reactionError) {
                console.error(`Failed to apply reaction to ${instance.name}:`, reactionError);
            }
        }
    }
    catch (error) {
        console.error('Error applying interaction to instances:', error);
    }
}
